import {
	debounce,
	ItemView,
	MarkdownView,
	Notice,
	sanitizeHTMLToDom,
	SearchComponent,
	setIcon,
	setTooltip,
	TFile,
	WorkspaceLeaf,
} from "obsidian";
import { t } from "lang/helpers";
import { citedKeys } from "src/citation";
import { CitationRenderer, RenderedBibliography } from "src/render";
import { matchesTerms, queryTerms } from "src/search";
import { formattedBibliography } from "src/zoteroCite";

/**
 * The note's bibliography, in a pane of the right sidebar.
 *
 * It follows the note being worked on, the way Obsidian's outline and
 * backlinks do: every source the note cites, written as the chosen style
 * writes a reference list, and under it the keys Zotero had nothing for. A
 * view that is not a note — the pane itself, a PDF — leaves the last note's
 * list standing, since that is still the note the reader was in.
 *
 * The list is drawn from what the note holds, not from what is on screen, so a
 * citation scrolled out of view is in it too.
 */

/** The view type the pane is registered and looked up by. */
export const BIBLIOGRAPHY_VIEW = "zoterik-bibliography";

/**
 * How long typing is waited out before the list is drawn again. Nothing is
 * asked of Zotero for a key it has already answered for, so the wait is for
 * citeproc, which writes the whole list over on every pass.
 */
const TYPING_DELAY = 500;

/**
 * What hides an element of the pane: a button with nothing to act on, or an
 * entry the search does not match. A class rather than
 * the `hidden` attribute, which loses to the `display` the entries and
 * Obsidian's icon buttons are given.
 */
const HIDDEN_CLASS = "zoterik-bibliography-hidden";

/**
 * Puts the bibliography on the clipboard as Zotero's "Copy bibliography" does:
 * as HTML with its layout written in, for a word processor to paste with the
 * italics and the indents, and as text for everywhere else.
 */
async function copyBibliography(
	bibliography: RenderedBibliography
): Promise<void> {
	const html = formattedBibliography(
		bibliography.params,
		bibliography.entries
	);
	const text = bibliography.text.join("");
	try {
		await navigator.clipboard.write([
			new ClipboardItem({
				"text/html": new Blob([html], { type: "text/html" }),
				"text/plain": new Blob([text], { type: "text/plain" }),
			}),
		]);
		new Notice(t.BIBLIOGRAPHY_COPIED);
	} catch {
		new Notice(t.BIBLIOGRAPHY_COPY_FAILED);
	}
}

/** What the plugin hands the pane: the renderer, and the style to render in. */
export interface BibliographyContext {
	renderer: CitationRenderer;
	styleId(): string;
}

export class BibliographyView extends ItemView {
	/** The note whose bibliography is shown, or `null` when there is none. */
	private file: TFile | null = null;
	/**
	 * Counts the passes, so that one overtaken by a later pass while it waited
	 * on Zotero draws nothing: the later one knows better.
	 */
	private pass = 0;
	private refreshSoon = debounce(
		() => void this.refresh(),
		TYPING_DELAY,
		true
	);

	/**
	 * The bar and the search field are drawn once, when the pane opens, and
	 * only what is under them is drawn again. A pass comes round whenever the
	 * note is saved, which can be while the reader is typing into the search
	 * field; rebuilding the field would take the focus and the caret out of it.
	 */
	private countEl!: HTMLElement;
	private searchButton!: HTMLElement;
	private copyButton!: HTMLElement;
	private refreshButton!: HTMLElement;
	private searchRow!: HTMLElement;
	private searchOpen = false;
	private search!: SearchComponent;
	private bodyEl!: HTMLElement;

	/** The list on screen, for the copy button. */
	private bibliography: RenderedBibliography | null = null;
	/** Every entry and missing key on screen, with the text it is searched in. */
	private searchable: { el: HTMLElement; text: string }[] = [];

	constructor(
		leaf: WorkspaceLeaf,
		private context: BibliographyContext
	) {
		super(leaf);
	}

	getViewType(): string {
		return BIBLIOGRAPHY_VIEW;
	}

	getDisplayText(): string {
		return t.BIBLIOGRAPHY_TITLE;
	}

	getIcon(): string {
		return "library";
	}

	protected onOpen(): Promise<void> {
		this.contentEl.empty();
		this.contentEl.addClass("zoterik-bibliography");
		this.drawFrame();
		const { workspace, vault } = this.app;

		this.registerEvent(workspace.on("active-leaf-change", () => this.follow()));
		this.registerEvent(workspace.on("file-open", () => this.follow()));
		this.registerEvent(
			workspace.on("editor-change", (_editor, info) => {
				if (info.file === this.file) {
					this.refreshSoon();
				}
			})
		);
		// A change made anywhere but this note's editor: another pane, another
		// program, a sync.
		this.registerEvent(
			vault.on("modify", (file) => {
				if (file === this.file) {
					this.refreshSoon();
				}
			})
		);
		this.registerEvent(
			vault.on("rename", (file) => {
				if (file === this.file) {
					void this.refresh();
				}
			})
		);
		this.registerEvent(
			vault.on("delete", (file) => {
				if (file === this.file) {
					this.file = null;
					void this.refresh();
				}
			})
		);

		this.file = this.noteFile();
		void this.refresh();
		return Promise.resolve();
	}

	protected onClose(): Promise<void> {
		this.refreshSoon.cancel();
		// Whatever pass is still waiting on Zotero has nowhere left to draw.
		this.pass++;
		return Promise.resolve();
	}

	/** The note being worked on, if the file being worked on is a note. */
	private noteFile(): TFile | null {
		const file = this.app.workspace.getActiveFile();
		return file?.extension === "md" ? file : null;
	}

	/** Takes up the note the reader has moved to, if they moved to one. */
	private follow(): void {
		const file = this.app.workspace.getActiveFile();
		if (file === null) {
			// Every note is closed.
			if (this.file !== null) {
				this.file = null;
				void this.refresh();
			}
			return;
		}
		if (file.extension === "md" && file !== this.file) {
			this.file = file;
			void this.refresh();
		}
	}

	/**
	 * The note as it stands: from its editor when it is open in one, since the
	 * editor holds what has been typed and not yet saved.
	 */
	private async noteText(file: TFile): Promise<string> {
		for (const leaf of this.app.workspace.getLeavesOfType("markdown")) {
			if (leaf.view instanceof MarkdownView && leaf.view.file === file) {
				return leaf.view.getViewData();
			}
		}
		return this.app.vault.cachedRead(file);
	}

	/**
	 * Draws the list again from the note, the style and the library. The
	 * plugin calls this when the style changes; the pane calls it when the
	 * note does.
	 */
	async refresh(): Promise<void> {
		const pass = ++this.pass;
		const file = this.file;
		const styleId = this.context.styleId();
		const renderer = this.context.renderer;

		if (!file) {
			this.showMessage(null, t.BIBLIOGRAPHY_NO_NOTE);
			return;
		}
		if (!styleId) {
			this.showMessage(file, t.BIBLIOGRAPHY_NO_STYLE);
			return;
		}

		const keys = citedKeys(await this.noteText(file));
		if (pass !== this.pass) {
			return;
		}
		if (keys.length === 0) {
			this.showMessage(file, t.BIBLIOGRAPHY_NO_CITATIONS);
			return;
		}

		await renderer.load(keys);
		const engines = await renderer.engineFor(styleId);
		if (pass !== this.pass) {
			return;
		}
		if (!engines) {
			this.showMessage(file, t.BIBLIOGRAPHY_STYLE_FAILED);
			return;
		}

		const missing = keys.filter((key) => !renderer.has(key));
		const bibliography =
			missing.length < keys.length
				? renderer.bibliographyOf(engines, keys)
				: null;

		this.startBody(file, bibliography, missing.length > 0);
		if (bibliography) {
			this.drawEntries(bibliography);
		} else if (missing.length < keys.length) {
			this.drawMessage(t.BIBLIOGRAPHY_NONE_IN_STYLE);
		}
		if (missing.length > 0) {
			this.drawMissing(missing);
		}
		this.applySearch();
	}

	/**
	 * The parts of the pane that stay: the bar — the heading, how many entries
	 * the list holds, and the buttons that search, copy and ask Zotero again —
	 * the search field under it, and the element the list is drawn into.
	 */
	private drawFrame(): void {
		const header = this.contentEl.createDiv({
			cls: "zoterik-bibliography-header",
		});
		const title = header.createDiv({ cls: "zoterik-bibliography-title" });
		title.createSpan({
			cls: "zoterik-bibliography-heading",
			text: t.BIBLIOGRAPHY_HEADING,
		});
		this.countEl = title.createSpan({ cls: "zoterik-bibliography-count" });

		const actions = header.createDiv({
			cls: "zoterik-bibliography-actions",
		});
		this.searchButton = this.iconButton(
			actions,
			"search",
			t.BIBLIOGRAPHY_SEARCH,
			() => this.toggleSearch()
		);
		this.searchButton.setAttr("aria-expanded", "false");
		this.copyButton = this.iconButton(actions, "copy", t.BIBLIOGRAPHY_COPY, () => {
			if (this.bibliography) {
				void copyBibliography(this.bibliography);
			}
		});
		this.refreshButton = this.iconButton(
			actions,
			"refresh-cw",
			t.BIBLIOGRAPHY_REFRESH,
			() => {
				// The keys missed while Zotero was closed are the ones a
				// reader presses this for.
				this.context.renderer.forgetUnknown();
				void this.refresh();
			}
		);

		// The row is always in the pane, collapsed to no height while closed,
		// so that opening and closing it can be animated; the field sits in
		// an inner element that the row's collapse clips.
		this.searchRow = this.contentEl.createDiv({
			cls: "zoterik-bibliography-search",
		});
		const searchField = this.searchRow.createDiv({
			cls: "zoterik-bibliography-search-field",
		});
		this.search = new SearchComponent(searchField)
			.setPlaceholder(t.BIBLIOGRAPHY_SEARCH_PLACEHOLDER)
			.onChange(() => this.applySearch());
		this.search.inputEl.addEventListener("keydown", (event) => {
			if (event.key === "Escape") {
				event.preventDefault();
				this.toggleSearch(false);
			}
		});

		this.bodyEl = this.contentEl.createDiv({
			cls: "zoterik-bibliography-body",
		});
	}

	/**
	 * Opens or closes the search field. Closing it clears what was typed, so
	 * that a list never stays filtered by a field no longer on screen.
	 *
	 * The field slides open and shut in styles.css. It can take the focus at
	 * once on opening: the row is made visible the moment it starts to open,
	 * and only on closing is that held back until the row has shut.
	 *
	 * The focus goes back to the button when the reader closed the field, and
	 * is left where it is when a pass closed it for having nothing to search.
	 */
	private toggleSearch(open = !this.searchOpen, returnFocus = true): void {
		this.searchOpen = open;
		this.searchRow.toggleClass("is-open", open);
		this.searchButton.toggleClass("is-active", open);
		this.searchButton.setAttr("aria-expanded", String(open));
		if (open) {
			this.search.inputEl.focus();
			this.search.inputEl.select();
		} else {
			this.search.setValue("");
			this.applySearch();
			if (returnFocus) {
				this.searchButton.focus();
			}
		}
	}

	/** One of the bar's buttons: an icon, its tooltip, and the keyboard too. */
	private iconButton(
		parent: HTMLElement,
		icon: string,
		label: string,
		action: () => void
	): HTMLElement {
		const button = parent.createDiv({
			cls: "clickable-icon",
			attr: { role: "button", tabindex: "0", "aria-label": label },
		});
		setIcon(button, icon);
		setTooltip(button, label);
		button.addEventListener("click", action);
		button.addEventListener("keydown", (event) => {
			if (event.key === "Enter" || event.key === " ") {
				event.preventDefault();
				action();
			}
		});
		return button;
	}

	/**
	 * Empties what is under the bar for a new pass, and sets the bar for what
	 * the pass found: copying needs a list, refreshing a note, and searching
	 * something to search in.
	 */
	private startBody(
		file: TFile | null,
		bibliography: RenderedBibliography | null,
		hasMissing: boolean
	): void {
		this.bodyEl.empty();
		this.bibliography = bibliography;
		this.searchable = [];

		const searchable = bibliography !== null || hasMissing;
		this.searchButton.toggleClass(HIDDEN_CLASS, !searchable);
		if (!searchable && this.searchOpen) {
			this.toggleSearch(false, false);
		}
		this.copyButton.toggleClass(HIDDEN_CLASS, bibliography === null);
		this.refreshButton.toggleClass(HIDDEN_CLASS, file === null);
		this.countEl.toggleClass(HIDDEN_CLASS, bibliography === null);
	}

	private showMessage(file: TFile | null, text: string): void {
		this.startBody(file, null, false);
		this.drawMessage(text);
	}

	private drawMessage(text: string): void {
		this.bodyEl.createDiv({ cls: "zoterik-bibliography-message", text });
	}

	/**
	 * The entries, laid out as the style asks: a hanging indent, or the number
	 * set apart in a column as wide as the widest of them.
	 */
	private drawEntries(bibliography: RenderedBibliography): void {
		const list = this.bodyEl.createDiv({ cls: "zoterik-bibliography-list" });
		if (bibliography.hangingIndent > 0) {
			list.addClass("zoterik-bibliography-hanging");
			list.setCssProps({
				"--zoterik-bibliography-indent": `${bibliography.hangingIndent}em`,
			});
		}
		if (bibliography.numberWidth > 0) {
			list.addClass("zoterik-bibliography-numbered");
			list.setCssProps({
				"--zoterik-bibliography-number-width": `${bibliography.numberWidth}ch`,
			});
		}
		// The keys each entry was written for, in the entries' order, so an
		// entry can be found by the key the note cites it by.
		const entryIds = Array.isArray(bibliography.params.entry_ids)
			? (bibliography.params.entry_ids as unknown[][])
			: [];
		bibliography.entries.forEach((entry, index) => {
			// The entries are the reader's own library talking, but still
			// markup from outside this file.
			const fragment = sanitizeHTMLToDom(entry);
			const el = fragment.querySelector<HTMLElement>(".csl-entry");
			list.appendChild(fragment);
			if (el) {
				const keys = (entryIds[index] ?? []).map((id) => `@${String(id)}`);
				this.searchable.push({
					el,
					text: `${keys.join(" ")} ${el.textContent ?? ""}`,
				});
			}
		});
	}

	/** The keys the note cites that Zotero had no item for. */
	private drawMissing(keys: string[]): void {
		const section = this.bodyEl.createDiv({
			cls: "zoterik-bibliography-missing",
		});
		section.createDiv({
			cls: "zoterik-bibliography-missing-title",
			text: t.BIBLIOGRAPHY_MISSING,
		});
		section.createDiv({
			cls: "zoterik-bibliography-missing-desc",
			text: t.BIBLIOGRAPHY_MISSING_DESC,
		});
		const list = section.createDiv({
			cls: "zoterik-bibliography-missing-keys",
		});
		for (const key of keys) {
			const el = list.createEl("code", { text: `@${key}` });
			this.searchable.push({ el, text: `@${key}` });
		}
	}

	/**
	 * Hides every entry and missing key the search field's words are not all
	 * found in, and says so when that is all of them. The count follows: all
	 * the entries while nothing is typed, the ones shown out of all while
	 * something is.
	 */
	private applySearch(): void {
		const terms = queryTerms(this.search.getValue());
		let shownEntries = 0;
		let shown = 0;
		for (const item of this.searchable) {
			const match = matchesTerms(item.text, terms);
			item.el.toggleClass(HIDDEN_CLASS, !match);
			if (match) {
				shown++;
				if (item.el.hasClass("csl-entry")) {
					shownEntries++;
				}
			}
		}

		// A missing-keys section with every key hidden is hidden with them.
		const missing = this.bodyEl.querySelector<HTMLElement>(
			".zoterik-bibliography-missing"
		);
		if (missing) {
			const anyKey = missing.querySelector(`code:not(.${HIDDEN_CLASS})`);
			missing.toggleClass(HIDDEN_CLASS, anyKey === null);
		}

		this.bodyEl.querySelector(".zoterik-bibliography-no-matches")?.remove();
		if (terms.length > 0 && this.searchable.length > 0 && shown === 0) {
			this.bodyEl.createDiv({
				cls: "zoterik-bibliography-message zoterik-bibliography-no-matches",
				text: t.BIBLIOGRAPHY_NO_MATCHES,
			});
		}

		const total = this.bibliography?.entries.length ?? 0;
		const filtered = terms.length > 0;
		const count = filtered ? `${shownEntries} / ${total}` : String(total);
		this.countEl.setText(count);
		this.countEl.setAttr(
			"aria-label",
			`${filtered ? t.BIBLIOGRAPHY_SHOWN : t.BIBLIOGRAPHY_COUNT} ${count}`
		);
	}
}
