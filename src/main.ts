import {
	Editor,
	MarkdownFileInfo,
	MarkdownView,
	Notice,
	Plugin,
} from "obsidian";
import { getChangelogContent, getUserGuideContent, t } from "lang/helpers";
import {
	CaywError,
	citable,
	PickOptions,
	pickCitations,
	pickedNotes,
	probeZotero,
} from "src/cayw";
import { BIBLIOGRAPHY_VIEW, BibliographyView } from "src/bibliography";
import {
	footnoteEdit,
	FootnoteEdit,
	FootnoteOptions,
	inFootnoteText,
	renumberFootnotes,
} from "src/footnote";
import { openFootnotePopover } from "src/footnotePopover";
import { citationExtension } from "src/live";
import { applyLook, clearLook } from "src/look";
import { MarkdownModal } from "src/markdownModal";
import { formatCitations } from "src/pandoc";
import { CitationTooltip, renderCitations } from "src/reading";
import { CitationRenderer } from "src/render";
import { CitationSuiteSettingTab } from "src/settings";
import { installedStyles, readStyleFile, zoteroCitePrefs } from "src/styles";
import { asBlock, noteMarkdown } from "src/zoteroNote";
import {
	CitationStyle,
	DEFAULT_SETTINGS,
	CitationSuiteSettings,
} from "src/types";

/**
 * The vault's local-storage key that says the bibliography pane has been put
 * in this device's sidebar once already.
 */
const BIBLIOGRAPHY_PLACED_KEY = "citation-suite-bibliography-placed";

/** What one pick in the citation window puts into the note. */
interface Pick {
	/** The pandoc citation of every source picked, or empty. */
	citation: string;
	/** The Markdown of every Zotero note picked, or empty. */
	notes: string;
}

export default class CitationSuitePlugin extends Plugin {
	settings: CitationSuiteSettings = { ...DEFAULT_SETTINGS };
	/**
	 * The styles Zotero has, for the settings dropdown to offer. Read once, off
	 * disk, because nothing about them changes while Obsidian is open unless
	 * the reader installs a style in Zotero — and reopening Obsidian is a fair
	 * price for that.
	 */
	styles: CitationStyle[] = [];
	/** Renders what the note says into what the style would say. */
	renderer = new CitationRenderer(
		DEFAULT_SETTINGS.port,
		[],
		readStyleFile,
		{ locale: "", citePaperArticleURLs: false }
	);

	async onload(): Promise<void> {
		await this.loadSettings();
		this.applyLook();
		// A pop-out window has a body of its own, and a note in it is drawn
		// there. Windows already open when the plugin loads are reached once
		// the layout is, which is when their leaves exist.
		this.app.workspace.onLayoutReady(() => this.applyLook());
		this.registerEvent(
			this.app.workspace.on("window-open", (_workspaceWindow, win) => {
				applyLook(win.document.body, this.settings);
			})
		);
		this.styles = await installedStyles();
		this.renderer.reset(
			this.settings.port,
			this.styles,
			await zoteroCitePrefs()
		);
		await this.renderer.prepare(this.settings.citationStyle);
		this.addSettingTab(new CitationSuiteSettingTab(this.app, this));

		// Reading view and live preview are two different machines drawing the
		// same thing, and Obsidian has no one place to say it once.
		this.registerMarkdownPostProcessor((el) => {
			return renderCitations(
				el,
				this.renderer,
				this.settings.citationStyle,
				this.citationTooltip()
			);
		});
		this.registerEditorExtension(
			citationExtension({
				renderer: this.renderer,
				styleId: () => this.settings.citationStyle,
				tooltip: () => this.citationTooltip(),
			})
		);

		this.registerView(
			BIBLIOGRAPHY_VIEW,
			(leaf) =>
				new BibliographyView(leaf, {
					renderer: this.renderer,
					styleId: () => this.settings.citationStyle,
					redrawCitations: () => this.redrawCitations(),
				})
		);
		this.app.workspace.onLayoutReady(() => {
			void this.openBibliographyOnce();
		});

		// The command IDs are persisted with whatever hotkey is bound to them,
		// so they are fixed: a rename would silently unbind it.
		this.addCommand({
			id: "insert-citation",
			name: t.COMMAND_INSERT_CITATION,
			editorCallback: (editor: Editor, ctx: MarkdownView | MarkdownFileInfo) => {
				void this.insertCitation(editor, ctx);
			},
		});

		this.addCommand({
			id: "insert-footnote",
			name: t.COMMAND_INSERT_FOOTNOTE,
			editorCallback: (editor: Editor, ctx: MarkdownView | MarkdownFileInfo) => {
				void this.insertBlankFootnote(editor, ctx);
			},
		});

		this.addCommand({
			id: "renumber-footnotes",
			name: t.COMMAND_RENUMBER_FOOTNOTES,
			editorCallback: (editor: Editor) => {
				this.renumberFootnotes(editor);
			},
		});

		this.addCommand({
			id: "show-bibliography",
			name: t.COMMAND_SHOW_BIBLIOGRAPHY,
			callback: () => {
				void this.app.workspace.ensureSideLeaf(
					BIBLIOGRAPHY_VIEW,
					"right",
					{ active: true, reveal: true }
				);
			},
		});

		this.addCommand({
			id: "show-changelog",
			name: t.COMMAND_SHOW_CHANGELOG,
			callback: () => {
				new MarkdownModal(this.app, getChangelogContent()).open();
			},
		});

		this.addCommand({
			id: "open-user-guide",
			name: t.COMMAND_OPEN_USER_GUIDE,
			callback: () => {
				new MarkdownModal(this.app, getUserGuideContent()).open();
			},
		});
	}

	onunload(): void {
		for (const doc of this.windowDocuments()) {
			clearLook(doc.body);
		}
	}

	/**
	 * Puts the chosen colour and underline on every window, which is how a
	 * rendered citation gets them — see `src/look.ts`. Cheap, and nothing has to
	 * be drawn again, so the settings call it on every change.
	 */
	applyLook(): void {
		for (const doc of this.windowDocuments()) {
			applyLook(doc.body, this.settings);
		}
	}

	/**
	 * Puts the bibliography pane in the right sidebar the first time the plugin
	 * runs in this vault on this device, without taking the focus or unfolding a
	 * collapsed sidebar. From then on it is the workspace layout that keeps it
	 * there, so a reader who closes it is not handed it back on every launch;
	 * the command reopens it.
	 *
	 * That it was put there is kept in the vault's local storage, which belongs
	 * to this device as the layout does — not in `data.json`, which is synced
	 * to every other device and would tell a second one, whose layout has never
	 * held the pane, that it already had.
	 */
	private async openBibliographyOnce(): Promise<void> {
		if (this.app.loadLocalStorage(BIBLIOGRAPHY_PLACED_KEY)) {
			return;
		}
		await this.app.workspace.ensureSideLeaf(BIBLIOGRAPHY_VIEW, "right", {
			active: false,
			reveal: false,
		});
		this.app.saveLocalStorage(BIBLIOGRAPHY_PLACED_KEY, true);
	}

	/** The tooltip a rendered citation carries, as the settings have it. */
	citationTooltip(): CitationTooltip {
		return {
			enabled: this.settings.citationTooltips,
			delay: this.settings.citationTooltipDelay,
		};
	}

	/** The main window's document, and that of every pop-out holding a leaf. */
	private windowDocuments(): Set<Document> {
		const docs = new Set<Document>([activeDocument]);
		this.app.workspace.iterateAllLeaves((leaf) => {
			docs.add(leaf.view.containerEl.doc);
		});
		return docs;
	}

	async loadSettings(): Promise<void> {
		// Every declared field is copied, so a data.json written by an earlier
		// version — or missing one of them — still starts from a complete
		// settings object.
		const stored: unknown = await this.loadData();
		this.settings = Object.assign({}, DEFAULT_SETTINGS, stored);
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}

	/**
	 * The whole flow: ask Zotero whether it is there, open its citation window,
	 * and write what came back at the cursor.
	 *
	 * The probe is what turns "nothing happened" into something a reader can
	 * act on. Without it, Zotero being closed and Better BibTeX still loading
	 * its database look identical from here — a request that fails — and the
	 * citation window would be asked for in a moment when it cannot be drawn.
	 */
	private async insertCitation(
		editor: Editor,
		ctx: MarkdownView | MarkdownFileInfo
	): Promise<void> {
		const status = await probeZotero(this.settings.port);
		if (status === "unreachable") {
			new Notice(t.NOTICE_ZOTERO_UNREACHABLE);
			return;
		}
		if (status === "starting") {
			new Notice(t.NOTICE_ZOTERO_STARTING);
			return;
		}

		const options: PickOptions = {
			port: this.settings.port,
			minimize: this.settings.minimizeZotero,
		};

		let pick: Pick;
		try {
			// This waits for as long as the citation window is open, which is
			// as long as the reader takes.
			pick = await this.pick(options);
		} catch (error) {
			const detail = error instanceof CaywError ? error.message : "";
			new Notice(
				detail
					? `${t.NOTICE_PICK_FAILED} ${detail}`
					: t.NOTICE_PICK_FAILED
			);
			return;
		}

		// A closed window with nothing chosen is not a failure and says
		// nothing: the reader changed their mind.
		let footnote: FootnoteEdit | null = null;
		if (pick.citation) {
			if (this.settings.footnotes) {
				footnote = this.insertFootnote(editor, pick.citation);
			} else {
				editor.replaceSelection(pick.citation);
			}
		}
		if (pick.notes) {
			this.insertNotes(editor, pick.notes);
		}
		// Last, once the notes are in: the popover takes the focus.
		if (footnote) {
			await this.openFootnoteText(editor, ctx, footnote, false);
		}
	}

	/**
	 * The text of the Zotero notes picked, at the cursor — after the citation
	 * when one was picked with them — as paragraphs of their own, with the
	 * cursor left at the end of the text.
	 */
	private insertNotes(editor: Editor, markdown: string): void {
		const text = editor.getValue();
		const from = editor.posToOffset(editor.getCursor("from"));
		const to = editor.posToOffset(editor.getCursor("to"));
		const block = asBlock(text.slice(0, from), text.slice(to), markdown);
		editor.replaceRange(
			block.text,
			editor.offsetToPos(from),
			editor.offsetToPos(to)
		);
		editor.setCursor(editor.offsetToPos(from + block.end));
	}

	/**
	 * How a footnote is written, as the settings say. The insertion, the
	 * settings' example and the style preview all read it from here, so none of
	 * them can label a footnote differently from the others.
	 */
	footnoteOptions(): FootnoteOptions {
		return {
			placement: this.settings.footnotePlacement,
			numbering: this.settings.footnoteNumbering,
			prefix: this.settings.footnotePrefix,
			suffix: this.settings.footnoteSuffix,
		};
	}

	/**
	 * A citation, or nothing, as a footnote: its anchor in place of the
	 * selection, and its text where the settings put it. Both go in as one
	 * transaction, so a single undo takes the whole footnote back out.
	 *
	 * The cursor is left after the anchor. It is set afterwards rather than in
	 * the transaction, because the transaction reads positions against the note
	 * as it was before the edit.
	 */
	private insertFootnote(editor: Editor, content: string): FootnoteEdit {
		const edit = footnoteEdit(
			editor.getValue(),
			editor.posToOffset(editor.getCursor("from")),
			editor.posToOffset(editor.getCursor("to")),
			content,
			this.footnoteOptions()
		);
		editor.transaction({
			changes: edit.changes.map((change) => ({
				from: editor.offsetToPos(change.from),
				to: editor.offsetToPos(change.to),
				text: change.text,
			})),
		});
		editor.setCursor(editor.offsetToPos(edit.cursor));
		return edit;
	}

	/**
	 * Takes the reader to a new footnote's text, to write it or to go on after
	 * the citation in it: in Obsidian's footnote popover when the settings say
	 * so, with the cursor in the note left after the anchor, as Obsidian's own
	 * command leaves it.
	 *
	 * Without the popover, an empty footnote has the cursor put at its text in
	 * the note, since there is nothing else to do with it; a citation leaves the
	 * cursor after the anchor, to write on in the sentence. When the popover
	 * was asked for and could not be opened, the same goes — unless the note was
	 * typed in while it was waited for, when moving the cursor would pull it out
	 * from under the reader. A citation written into a footnote's text made no
	 * footnote, and has nothing to open.
	 */
	private async openFootnoteText(
		editor: Editor,
		ctx: MarkdownView | MarkdownFileInfo,
		edit: FootnoteEdit,
		blank: boolean
	): Promise<void> {
		if (edit.label === null) {
			return;
		}
		if (!this.settings.footnotePopover || !(ctx instanceof MarkdownView)) {
			if (blank) {
				this.goToFootnoteText(editor, edit);
			}
			return;
		}
		const written = editor.getValue();
		const anchorFrom = edit.cursor - `[^${edit.label}]`.length;
		const opened = await openFootnotePopover(ctx, editor, anchorFrom, edit.label);
		if (!opened && blank && editor.getValue() === written) {
			this.goToFootnoteText(editor, edit);
		}
	}

	/** Puts the cursor at the end of the footnote's text, and the text in view. */
	private goToFootnoteText(editor: Editor, edit: FootnoteEdit): void {
		const cursor = editor.offsetToPos(edit.textEnd);
		editor.setCursor(cursor);
		editor.scrollIntoView({ from: cursor, to: cursor }, true);
	}

	/**
	 * A footnote with no citation in it, labelled and placed as the settings
	 * say whether or not citations go into footnotes, for the reader to write.
	 * Inside a footnote's text there is nowhere for one to go.
	 */
	private async insertBlankFootnote(
		editor: Editor,
		ctx: MarkdownView | MarkdownFileInfo
	): Promise<void> {
		const from = editor.posToOffset(editor.getCursor("from"));
		if (inFootnoteText(editor.getValue(), from)) {
			new Notice(t.NOTICE_FOOTNOTE_IN_FOOTNOTE);
			return;
		}
		const edit = this.insertFootnote(editor, "");
		await this.openFootnoteText(editor, ctx, edit, true);
	}

	/**
	 * Numbers the note's footnotes in the order they come, as the settings
	 * write labels — leaving named ones alone if the settings say so — in one
	 * transaction: one undo puts the old labels back.
	 */
	private renumberFootnotes(editor: Editor): void {
		const { changes, count } = renumberFootnotes(
			editor.getValue(),
			this.footnoteOptions(),
			this.settings.footnoteKeepNamed
		);
		if (count === 0) {
			new Notice(t.NOTICE_NO_FOOTNOTES);
			return;
		}
		if (changes.length === 0) {
			new Notice(t.NOTICE_FOOTNOTES_IN_ORDER);
			return;
		}
		editor.transaction({
			changes: changes.map((change) => ({
				from: editor.offsetToPos(change.from),
				to: editor.offsetToPos(change.to),
				text: change.text,
			})),
		});
		new Notice(t.NOTICE_FOOTNOTES_RENUMBERED);
	}

	/**
	 * Rebuilds what the rendering needs after a setting changed it: the style
	 * to render in, or the port the library is behind.
	 */
	async restyle(): Promise<void> {
		this.renderer.reset(
			this.settings.port,
			this.styles,
			await zoteroCitePrefs()
		);
		await this.renderer.prepare(this.settings.citationStyle);
		this.redrawCitations();
		for (const leaf of this.app.workspace.getLeavesOfType(
			BIBLIOGRAPHY_VIEW
		)) {
			const view = leaf.view;
			if (view instanceof BibliographyView) {
				void view.refresh();
			}
		}
	}

	/**
	 * Draws the citations in every open note again. The editors are holding
	 * decorations built under the old settings, and the reading views HTML
	 * built under them. Both have to be told.
	 */
	redrawCitations(): void {
		this.app.workspace.updateOptions();
		for (const leaf of this.app.workspace.getLeavesOfType("markdown")) {
			const view = leaf.view;
			if (view instanceof MarkdownView) {
				view.previewMode.rerender(true);
			}
		}
	}

	/**
	 * The pick, written for the note. Sources become a pandoc citation — always,
	 * whatever style is chosen to read it in — because it is the only form that
	 * names the source rather than describing it, and so the only one pandoc
	 * can render later from the bibliography. Zotero notes become their text,
	 * as Zotero's word-processor plugins insert them.
	 */
	private async pick(options: PickOptions): Promise<Pick> {
		const picked = await pickCitations(options);
		if (picked.length === 0) {
			return { citation: "", notes: "" };
		}

		const citations = citable(picked);
		const notes = pickedNotes(picked);
		if (citations.length === 0 && notes.length === 0) {
			new Notice(t.NOTICE_NOTHING_TO_CITE);
			return { citation: "", notes: "" };
		}
		if (citations.length + notes.length < picked.length) {
			new Notice(t.NOTICE_ITEMS_WITHOUT_KEYS);
		}

		return {
			citation:
				citations.length > 0
					? formatCitations(citations, {
							brackets: this.settings.brackets,
						})
					: "",
			notes: notes
				.map(noteMarkdown)
				.filter((markdown) => markdown)
				.join("\n\n"),
		};
	}
}
