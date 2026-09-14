import {
	debounce,
	ItemView,
	MarkdownView,
	Menu,
	Notice,
	sanitizeHTMLToDom,
	SearchComponent,
	setIcon,
	setTooltip,
	TFile,
	WorkspaceLeaf,
} from "obsidian";
import { t } from "lang/helpers";
import { citedKeys, mentionsOf } from "src/citation";
import { noteCitations } from "src/noteCitations";
import { NoteRenderer } from "src/noteRendering";
import { CitationRenderer, RenderedBibliography } from "src/render";
import { matchesTerms, queryTerms } from "src/search";
import { spinner, Spinner } from "src/spinner";
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
export const BIBLIOGRAPHY_VIEW = "citation-suite-bibliography";

/**
 * How long typing is waited out before the list is drawn again. Nothing is
 * asked of Zotero for a key it has already answered for, so the wait is for
 * citeproc, which writes the whole list over on every pass.
 */
const TYPING_DELAY = 500;

/**
 * How often Zotero is asked again while it has not answered for the note's
 * sources. A closed Zotero refuses the connection at once, so this costs
 * nothing, and it is what takes the notice down once Zotero is started.
 */
const RETRY_DELAY = 5000;

/**
 * What hides an element of the pane: a button with nothing to act on, or an
 * entry the search does not match. A class rather than
 * the `hidden` attribute, which loses to the `display` the entries and
 * Obsidian's icon buttons are given.
 */
const HIDDEN_CLASS = "citation-suite-bibliography-hidden";

/**
 * Puts the bibliography on the clipboard as Zotero's "Copy bibliography" does:
 * as HTML with its layout written in, for a word processor to paste with the
 * italics and the indents, and as text for everywhere else. The whole list, or
 * the one entry at `index`, numbered as the list numbers it.
 */
async function copyBibliography(
	bibliography: RenderedBibliography,
	index?: number
): Promise<void> {
	const one = index !== undefined;
	const entries = one
		? bibliography.entries.slice(index, index + 1)
		: bibliography.entries;
	const lines = one
		? bibliography.text.slice(index, index + 1)
		: bibliography.text;
	const html = formattedBibliography(bibliography.params, entries);
	const text = lines.join("");
	try {
		await navigator.clipboard.write([
			new ClipboardItem({
				"text/html": new Blob([html], { type: "text/html" }),
				"text/plain": new Blob([text], { type: "text/plain" }),
			}),
		]);
		new Notice(one ? t.BIBLIOGRAPHY_ENTRY_COPIED : t.BIBLIOGRAPHY_COPIED);
	} catch {
		new Notice(
			one ? t.BIBLIOGRAPHY_ENTRY_COPY_FAILED : t.BIBLIOGRAPHY_COPY_FAILED
		);
	}
}

/**
 * The source whose mentions in the note are being gone through: the keys its
 * entry was written for, the note they are looked for in, which mention was
 * shown last and how many there are — and what the bar said when it was last
 * drawn, or `null` before it has been.
 */
interface Finding {
	keys: string[];
	file: TFile;
	index: number;
	count: number;
	drawn: { index: number; count: number } | null;
}

/** The bar under the entry being found, drawn once and then only relabelled. */
interface MentionBar {
	el: HTMLElement;
	count: HTMLElement;
	previous: HTMLElement;
	next: HTMLElement;
}

/** The ways the bar's count rolls to a new number, one class each. */
const COUNT_ROLLS = ["is-stepping-next", "is-stepping-previous", "is-changing"];

/**
 * Plays the one-off animation a class gives an element and its children —
 * from the start, if it was already playing — and takes the class off once it
 * has finished or been cut short. styles.css gives the class no animation for
 * a reader who asked for less motion, and then this settles at once.
 *
 * An animation that leaves its element changed (`forwards`) keeps it so until
 * the class comes off, which is after whatever is chained on here has run:
 * no frame is drawn in between.
 */
async function play(el: HTMLElement, cls: string): Promise<void> {
	el.removeClass(cls);
	// Asking for the animations brings the element's style up to date, which
	// ends the one taken off above before the class starts it again.
	el.getAnimations();
	el.addClass(cls);
	const running = el
		.getAnimations({ subtree: true })
		.filter((animation) => animation instanceof CSSAnimation);
	await Promise.allSettled(running.map((animation) => animation.finished));
	el.removeClass(cls);
}

/**
 * What the plugin hands the pane: the renderer, the notes' citations as they
 * are written together, the style to render in, a way to draw the notes'
 * citations again when a retry brings sources in, and the key being typed
 * while the list of suggested sources is open for it.
 */
export interface BibliographyContext {
	renderer: CitationRenderer;
	notes: NoteRenderer;
	styleId(): string;
	redrawCitations(): void;
	/** Where in `text` a key is being typed, while sources are suggested for it. */
	typedKey(file: TFile, text: string): { from: number; to: number } | null;
	/** Calls back when a key starts or stops being typed; answers the unsubscribe. */
	onTypingChange(listener: () => void): () => void;
}

/**
 * The note with a range written over in spaces, its line breaks and every
 * offset kept — which is what `proseOf` does to code, for the same reason.
 */
function blankRange(text: string, { from, to }: { from: number; to: number }): string {
	return text.slice(0, from) + text.slice(from, to).replace(/[^\n]/g, " ") + text.slice(to);
}

export class BibliographyView extends ItemView {
	/** The note whose bibliography is shown, or `null` when there is none. */
	private file: TFile | null = null;
	/**
	 * The text the latest pass read the note's keys from, or `null` before
	 * one has. A pass can read a note's view before the note has been loaded
	 * into it; this is what tells a later look that it read the wrong thing.
	 */
	private readText: string | null = null;
	/**
	 * Counts the passes, so that one overtaken by a later pass while it waited
	 * on Zotero draws nothing: the later one knows better.
	 */
	private pass = 0;
	/** The timer asking Zotero again while it has not answered, if one is set. */
	private retryTimer: number | null = null;
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
	/** The refresh button's icon, turning while a press of it is answered. */
	private refreshSpin!: Spinner;
	/** Counts the presses, so that only the latest one's answer stops the icon. */
	private refreshPresses = 0;
	private searchRow!: HTMLElement;
	private searchOpen = false;
	private search!: SearchComponent;
	private bodyEl!: HTMLElement;

	/** The list on screen, for the copy button. */
	private bibliography: RenderedBibliography | null = null;
	/** Every entry and missing key on screen, with the text it is searched in. */
	private searchable: { el: HTMLElement; text: string }[] = [];
	/** Every entry on screen, with the keys it was written for. */
	private entries: { el: HTMLElement; keys: string[] }[] = [];
	private finding: Finding | null = null;
	private mentionBar: MentionBar | null = null;

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
		return "scroll-text";
	}

	protected onOpen(): Promise<void> {
		this.contentEl.empty();
		this.contentEl.addClass("citation-suite-bibliography");
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

		// A key being typed is not cited yet, and is left out while sources
		// are suggested for it; once the list closes it counts, found or not.
		this.register(this.context.onTypingChange(() => this.refreshSoon()));

		this.file = this.noteFile();
		void this.refresh();
		return Promise.resolve();
	}

	protected onClose(): Promise<void> {
		this.refreshSoon.cancel();
		this.cancelRetry();
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
		if (file.extension !== "md") {
			return;
		}
		if (file !== this.file) {
			this.file = file;
			void this.refresh();
		} else {
			void this.refreshIfRead(file);
		}
	}

	/**
	 * Draws the list again if the note no longer reads as the latest pass read
	 * it.
	 *
	 * A view names its new note before the note is loaded into it: Obsidian
	 * sets the file, reads it off disk, and only then puts the text in the
	 * editor — which, when the note before had unsaved changes, is emptied in
	 * between. A tab restored at launch is loaded like that on first being
	 * shown. A pass that runs in that gap reads the previous note or nothing,
	 * and loading the text raises no event of its own, so the list would stay
	 * wrong until the note was typed in. Obsidian announces the active leaf
	 * again once the load is done, and this is what that announcement comes
	 * to for the note already followed.
	 */
	private async refreshIfRead(file: TFile): Promise<void> {
		const text = await this.noteText(file);
		if (file === this.file && text !== this.readText) {
			await this.refresh();
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
		this.cancelRetry();
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

		const read = await this.noteText(file);
		// The key being typed, while sources are suggested for it, is not yet
		// a citation: listing each half-typed key as not found in Zotero, and
		// asking Zotero about it, would be wrong on every keystroke.
		const typed = this.context.typedKey(file, read);
		const text = typed ? blankRange(read, typed) : read;
		const keys = citedKeys(text);
		if (pass !== this.pass) {
			return;
		}
		this.readText = read;
		if (keys.length === 0) {
			this.showMessage(file, t.BIBLIOGRAPHY_NO_CITATIONS);
			return;
		}

		const unanswered = keys.filter((key) => renderer.unreachable(key));
		await renderer.load(keys, true);
		const engines = await renderer.engineFor(styleId);
		if (unanswered.some((key) => renderer.has(key))) {
			this.context.redrawCitations();
		}
		if (pass !== this.pass) {
			return;
		}
		if (!engines) {
			this.showMessage(file, t.BIBLIOGRAPHY_STYLE_FAILED);
			return;
		}

		const missing = keys.filter((key) => !renderer.has(key));
		// A key Zotero was not there to be asked about is not missing from
		// it, and is not listed as though it were.
		const unreached = missing.some((key) => renderer.unreachable(key));
		const notFound = missing.filter((key) => !renderer.unreachable(key));
		// Written with the note's citations, so that its numbers and its
		// 2020a and 2020b are the ones the citations show.
		const bibliography =
			missing.length < keys.length
				? await this.context.notes.bibliography(
						styleId,
						file.path,
						noteCitations(text)
					)
				: null;
		if (pass !== this.pass) {
			return;
		}

		this.startBody(file, bibliography, notFound.length > 0);
		if (bibliography) {
			this.drawEntries(bibliography);
		} else if (missing.length < keys.length) {
			this.drawMessage(t.BIBLIOGRAPHY_NONE_IN_STYLE);
		}
		if (unreached) {
			this.drawUnreachable();
			this.scheduleRetry(pass, keys);
		}
		if (notFound.length > 0) {
			this.drawMissing(notFound);
		}
		this.redrawFinding(file, text);
		this.applySearch();
	}

	/**
	 * Asks Zotero again, after a while, for the keys it did not answer for, and
	 * draws the list again only once it answers — not on every try, which
	 * would redraw the pane every few seconds for as long as Zotero is closed.
	 */
	private scheduleRetry(pass: number, keys: string[]): void {
		this.retryTimer = window.setTimeout(() => {
			this.retryTimer = null;
			void this.retry(pass, keys);
		}, RETRY_DELAY);
	}

	private async retry(pass: number, keys: string[]): Promise<void> {
		const renderer = this.context.renderer;
		const unanswered = keys.filter((key) => renderer.unreachable(key));
		await renderer.load(keys, true);
		if (pass !== this.pass) {
			return;
		}
		if (keys.some((key) => renderer.unreachable(key))) {
			this.scheduleRetry(pass, keys);
			return;
		}
		if (unanswered.some((key) => renderer.has(key))) {
			this.context.redrawCitations();
		}
		await this.refresh();
	}

	private cancelRetry(): void {
		if (this.retryTimer !== null) {
			window.clearTimeout(this.retryTimer);
			this.retryTimer = null;
		}
	}

	/**
	 * The parts of the pane that stay: the bar — the heading, how many entries
	 * the list holds, and the buttons that search, copy and ask Zotero again —
	 * the search field under it, and the element the list is drawn into.
	 */
	private drawFrame(): void {
		const header = this.contentEl.createDiv({
			cls: "citation-suite-bibliography-header",
		});
		const title = header.createDiv({ cls: "citation-suite-bibliography-title" });
		title.createSpan({
			cls: "citation-suite-bibliography-heading",
			text: t.BIBLIOGRAPHY_HEADING,
		});
		this.countEl = title.createSpan({ cls: "citation-suite-bibliography-count" });

		const actions = header.createDiv({
			cls: "citation-suite-bibliography-actions",
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
				const press = ++this.refreshPresses;
				this.refreshSpin.start();
				void this.refresh().finally(() => {
					if (press === this.refreshPresses) {
						this.refreshSpin.stop();
					}
				});
			}
		);
		// The icon turns rather than the button, whose hover shape would
		// turn with it.
		const refreshIcon = this.refreshButton.querySelector<HTMLElement>(".svg-icon");
		this.refreshSpin = spinner(refreshIcon ?? this.refreshButton);

		// The row is always in the pane, collapsed to no height while closed,
		// so that opening and closing it can be animated; the field sits in
		// an inner element that the row's collapse clips.
		this.searchRow = this.contentEl.createDiv({
			cls: "citation-suite-bibliography-search",
		});
		const searchField = this.searchRow.createDiv({
			cls: "citation-suite-bibliography-search-field",
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
			cls: "citation-suite-bibliography-body",
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
		this.entries = [];
		this.mentionBar = null;

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
		this.finding = null;
		this.startBody(file, null, false);
		this.drawMessage(text);
	}

	private drawMessage(text: string): void {
		this.bodyEl.createDiv({ cls: "citation-suite-bibliography-message", text });
	}

	/**
	 * The entries, laid out as the style asks: a hanging indent, or the number
	 * set apart in a column as wide as the widest of them.
	 */
	private drawEntries(bibliography: RenderedBibliography): void {
		const list = this.bodyEl.createDiv({ cls: "citation-suite-bibliography-list" });
		if (bibliography.hangingIndent > 0) {
			list.addClass("citation-suite-bibliography-hanging");
			list.setCssProps({
				"--citation-suite-bibliography-indent": `${bibliography.hangingIndent}em`,
			});
		}
		if (bibliography.numberWidth > 0) {
			list.addClass("citation-suite-bibliography-numbered");
			list.setCssProps({
				"--citation-suite-bibliography-number-width": `${bibliography.numberWidth}ch`,
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
				const keys = (entryIds[index] ?? []).map((id) => String(id));
				const handles = keys.map((key) => `@${key}`).join(" ");
				this.searchable.push({
					el,
					text: `${handles} ${el.textContent ?? ""}`,
				});
				this.entries.push({ el, keys });
				el.addEventListener("contextmenu", (event) =>
					this.showEntryMenu(event, index, keys)
				);
			}
		});
	}

	/**
	 * Says Zotero did not answer when the note's sources were asked for, in
	 * place of listing them as not found. Not searched: it holds no source.
	 */
	private drawUnreachable(): void {
		const section = this.bodyEl.createDiv({
			cls: "citation-suite-bibliography-unreachable",
		});
		section.createDiv({
			cls: "citation-suite-bibliography-missing-title",
			text: t.BIBLIOGRAPHY_UNREACHABLE,
		});
		section.createDiv({
			cls: "citation-suite-bibliography-missing-desc",
			text: t.BIBLIOGRAPHY_UNREACHABLE_DESC,
		});
	}

	/** The keys the note cites that Zotero had no item for. */
	private drawMissing(keys: string[]): void {
		const section = this.bodyEl.createDiv({
			cls: "citation-suite-bibliography-missing",
		});
		section.createDiv({
			cls: "citation-suite-bibliography-missing-title",
			text: t.BIBLIOGRAPHY_MISSING,
		});
		section.createDiv({
			cls: "citation-suite-bibliography-missing-desc",
			text: t.BIBLIOGRAPHY_MISSING_DESC,
		});
		const list = section.createDiv({
			cls: "citation-suite-bibliography-missing-keys",
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

		// The mention bar goes with the entry it is under.
		if (this.mentionBar) {
			const entry = this.mentionBar.el.previousElementSibling;
			this.mentionBar.el.toggleClass(
				HIDDEN_CLASS,
				entry?.hasClass(HIDDEN_CLASS) ?? false
			);
		}

		// A missing-keys section with every key hidden is hidden with them.
		const missing = this.bodyEl.querySelector<HTMLElement>(
			".citation-suite-bibliography-missing"
		);
		if (missing) {
			const anyKey = missing.querySelector(`code:not(.${HIDDEN_CLASS})`);
			missing.toggleClass(HIDDEN_CLASS, anyKey === null);
		}

		this.bodyEl.querySelector(".citation-suite-bibliography-no-matches")?.remove();
		if (terms.length > 0 && this.searchable.length > 0 && shown === 0) {
			this.bodyEl.createDiv({
				cls: "citation-suite-bibliography-message citation-suite-bibliography-no-matches",
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

	/**
	 * The menu of one entry: show its item in Zotero, copy it, or go to where
	 * the note cites it.
	 */
	private showEntryMenu(
		event: MouseEvent,
		index: number,
		keys: string[]
	): void {
		const bibliography = this.bibliography;
		if (!bibliography || keys.length === 0) {
			return;
		}
		event.preventDefault();
		const menu = new Menu();
		menu.addItem((item) =>
			item
				.setTitle(t.BIBLIOGRAPHY_REVEAL)
				.setIcon("arrow-up-right")
				.onClick(() => void this.revealInZotero(keys[0]))
		);
		menu.addItem((item) =>
			item
				.setTitle(t.BIBLIOGRAPHY_COPY_ENTRY)
				.setIcon("copy")
				.onClick(() => void copyBibliography(bibliography, index))
		);
		menu.addItem((item) =>
			item
				.setTitle(t.BIBLIOGRAPHY_FIND)
				.setIcon("search")
				.onClick(() => void this.findInNote(keys))
		);
		menu.showAtMouseEvent(event);
	}

	/**
	 * Selects the key's item in Zotero's window, through the `zotero://select`
	 * link the system hands over to Zotero.
	 */
	private async revealInZotero(key: string): Promise<void> {
		const found = await this.context.renderer.itemLink(key);
		if ("link" in found) {
			window.open(found.link);
		} else {
			new Notice(
				found.error === "unreachable"
					? t.NOTICE_ZOTERO_UNREACHABLE
					: t.BIBLIOGRAPHY_REVEAL_NOT_FOUND
			);
		}
	}

	/**
	 * Goes to the first place the note cites the source, and puts a bar under
	 * its entry that steps through the rest. A source is often cited many
	 * times over, and a menu has no room to list every mention in a way that
	 * tells them apart; the bar says which mention is shown out of how many,
	 * and stays until it is closed, the note is left, or the note stops citing
	 * the source.
	 */
	private async findInNote(keys: string[]): Promise<void> {
		const file = this.file;
		if (!file) {
			return;
		}
		// Found again, the source keeps the bar it has rather than one closing
		// and another opening in the same place.
		const current = this.finding;
		const same =
			current?.file === file &&
			current.keys.length === keys.length &&
			current.keys.every((key) => keys.includes(key));
		if (!same) {
			this.stopFinding();
		}
		this.finding = {
			keys,
			file,
			index: 0,
			count: 0,
			drawn: same ? current.drawn : null,
		};
		await this.showMention(0, true);
	}

	/**
	 * Selects a mention in the note's editor and scrolls to it: the first when
	 * `step` is 0, and otherwise the next or the previous one from the cursor —
	 * the mention last shown, unless the reader has moved it since — going
	 * round at either end.
	 *
	 * The editor takes the focus only when asked to. The bar's buttons leave it
	 * where it is, so that they can be pressed from the keyboard again and
	 * again without a keystroke landing in the note.
	 */
	private async showMention(step: -1 | 0 | 1, focus: boolean): Promise<void> {
		const finding = this.finding;
		if (!finding) {
			return;
		}
		const mentions = mentionsOf(
			await this.noteText(finding.file),
			finding.keys
		);
		if (this.finding !== finding) {
			return;
		}
		if (mentions.length === 0) {
			new Notice(t.BIBLIOGRAPHY_FIND_NONE);
			this.stopFinding();
			return;
		}

		const view = await this.noteView(finding.file);
		if (!view || this.finding !== finding) {
			return;
		}
		const { editor } = view;
		if (step === 0) {
			finding.index = 0;
		} else if (step === 1) {
			const cursor = editor.posToOffset(editor.getCursor("to"));
			const next = mentions.findIndex((mention) => mention.from >= cursor);
			finding.index = next === -1 ? 0 : next;
		} else {
			const cursor = editor.posToOffset(editor.getCursor("from"));
			const before = mentions.filter((mention) => mention.to <= cursor);
			finding.index =
				before.length === 0 ? mentions.length - 1 : before.length - 1;
		}
		finding.count = mentions.length;
		this.drawMentionBar(step);

		const mention = mentions[finding.index];
		const range = {
			from: editor.offsetToPos(mention.from),
			to: editor.offsetToPos(mention.to),
		};
		editor.setSelection(range.from, range.to);
		editor.scrollIntoView(range, true);
		if (view.getMode() === "preview") {
			view.previewMode.applyScroll(range.from.line);
		}
		if (focus) {
			this.app.workspace.setActiveLeaf(view.leaf, { focus: true });
			editor.focus();
		}
	}

	/**
	 * The view the note is open in, brought to the front: the most recent
	 * one when it is open in several, and a new tab when it is open in none.
	 */
	private async noteView(file: TFile): Promise<MarkdownView | null> {
		const { workspace } = this.app;
		const holds = (leaf: WorkspaceLeaf): boolean =>
			leaf.view instanceof MarkdownView
				? leaf.view.file === file
				: // A tab not shown since launch has no view loaded yet.
					leaf.getViewState().state?.file === file.path;
		const recent = workspace.getMostRecentLeaf();
		let leaf =
			recent && holds(recent)
				? recent
				: workspace.getLeavesOfType("markdown").find(holds);
		if (!leaf) {
			leaf = workspace.getLeaf("tab");
			await leaf.openFile(file);
		}
		await workspace.revealLeaf(leaf);
		return leaf.view instanceof MarkdownView ? leaf.view : null;
	}

	/**
	 * Puts the bar under the entry being found, or relabels the one already
	 * there — relabelled rather than drawn again, so that the button just
	 * pressed keeps the focus. The finding ends when its entry has left the
	 * list.
	 *
	 * What changed since the bar was last drawn is animated, and nothing else:
	 * a pass draws the bar anew on every save, and one that looks as it did
	 * must not open again or roll its count. The count rolls the way the step
	 * went — `step` — or only fades when a pass changed it.
	 */
	private drawMentionBar(step: -1 | 0 | 1 = 0): void {
		const finding = this.finding;
		const entry = finding
			? this.entries.find((candidate) =>
					candidate.keys.some((key) => finding.keys.includes(key))
				)
			: undefined;
		if (!finding || !entry) {
			this.stopFinding();
			return;
		}
		const drawn = finding.drawn;

		let bar = this.mentionBar;
		if (!bar || bar.el.previousElementSibling !== entry.el) {
			this.clearMentionBar();
			bar = this.createMentionBar(entry.el);
			this.mentionBar = bar;
			if (!drawn) {
				void play(bar.el, "is-opening");
			}
		}
		bar.el.toggleClass(HIDDEN_CLASS, entry.el.hasClass(HIDDEN_CLASS));

		bar.count.setText(`${finding.index + 1} / ${finding.count}`);
		const changed =
			drawn !== null &&
			(drawn.index !== finding.index || drawn.count !== finding.count);
		if (drawn && (step !== 0 || changed)) {
			const roll =
				step === 1
					? "is-stepping-next"
					: step === -1
						? "is-stepping-previous"
						: "is-changing";
			bar.count.removeClass(...COUNT_ROLLS);
			void play(bar.count, roll);
		}

		// With one mention there is nowhere to step to.
		const steppable = finding.count > 1;
		const wasSteppable = drawn ? drawn.count > 1 : steppable;
		for (const button of [bar.previous, bar.next]) {
			if (steppable === wasSteppable) {
				button.toggleClass(HIDDEN_CLASS, !steppable);
			} else if (steppable) {
				button.removeClass(HIDDEN_CLASS, "is-disappearing");
				void play(button, "is-appearing");
			} else {
				void play(button, "is-disappearing").then(() => {
					// Unless a mention came back while it went.
					if (finding.count < 2) {
						button.addClass(HIDDEN_CLASS);
					}
				});
			}
		}
		finding.drawn = { index: finding.index, count: finding.count };
	}

	/** A mention bar under the entry, its count still to be written. */
	private createMentionBar(entryEl: HTMLElement): MentionBar {
		// The bar is a one-track grid, which opens and shuts by its track as
		// the search row does; its content sits in an element the track clips.
		const el = createDiv({ cls: "citation-suite-bibliography-mentions" });
		entryEl.after(el);
		entryEl.addClass("is-finding");
		const content = el.createDiv({
			cls: "citation-suite-bibliography-mentions-content",
		});
		const label = content.createSpan({
			cls: "citation-suite-bibliography-mentions-label",
			// Read out as the reader steps, since the note is where they look.
			attr: { "aria-live": "polite" },
		});
		label.appendText(`${t.BIBLIOGRAPHY_MENTION} `);
		const count = label.createSpan({
			cls: "citation-suite-bibliography-mentions-count",
		});
		const previous = this.iconButton(
			content,
			"chevron-up",
			t.BIBLIOGRAPHY_MENTION_PREVIOUS,
			() => void this.showMention(-1, false)
		);
		const next = this.iconButton(
			content,
			"chevron-down",
			t.BIBLIOGRAPHY_MENTION_NEXT,
			() => void this.showMention(1, false)
		);
		this.iconButton(content, "x", t.BIBLIOGRAPHY_MENTION_CLOSE, () =>
			this.stopFinding()
		);
		el.addEventListener("keydown", (event) => {
			if (event.key === "Escape") {
				event.preventDefault();
				this.stopFinding();
			}
		});
		return { el, count, previous, next };
	}

	/**
	 * Draws the bar again after a pass, with the mentions counted afresh in the
	 * text the pass read, so that citing the source once more or once less
	 * shows in the count at once. A pass for another note, or one in which the
	 * note no longer cites the source, ends the finding.
	 */
	private redrawFinding(file: TFile, text: string): void {
		const finding = this.finding;
		if (!finding) {
			return;
		}
		finding.count =
			finding.file === file ? mentionsOf(text, finding.keys).length : 0;
		if (finding.count === 0) {
			this.stopFinding();
			return;
		}
		finding.index = Math.min(finding.index, finding.count - 1);
		this.drawMentionBar();
	}

	private stopFinding(): void {
		this.finding = null;
		this.clearMentionBar();
	}

	/**
	 * Shuts the bar and takes it out once it has shut. It stops answering at
	 * once: a click on a bar on its way out would act on a finding that has
	 * ended.
	 */
	private clearMentionBar(): void {
		const bar = this.mentionBar;
		if (!bar) {
			return;
		}
		this.mentionBar = null;
		bar.el.previousElementSibling?.removeClass("is-finding");
		bar.el.setAttr("inert", "");
		void play(bar.el, "is-closing").then(() => bar.el.remove());
	}
}
