import {
	Editor,
	MarkdownFileInfo,
	MarkdownView,
	Menu,
	Notice,
	Platform,
	Plugin,
	TFile,
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
import { CitationSuggest } from "src/citationSuggest";
import {
	footnoteEdit,
	FootnoteEdit,
	FootnoteOptions,
	inFootnoteText,
	renumberFootnotes,
} from "src/footnote";
import { openFootnotePopover } from "src/footnotePopover";
import { citedKeys } from "src/citation";
import { citationExtension } from "src/live";
import { applyLook, clearLook } from "src/look";
import { MarkdownModal } from "src/markdownModal";
import { NoteFootnoteModal } from "src/noteFootnoteModal";
import { NoteRenderer } from "src/noteRendering";
import { NoteStyles, StyleFiles } from "src/noteStyles";
import {
	forgetNoteFootnotes,
	moveNoteFootnotes,
	noteFootnoteSettings,
	readNoteFootnotes,
} from "src/noteFootnotes";
import { formatCitations } from "src/pandoc";
import { CitationTooltip, renderCitations } from "src/reading";
import { CitationRenderer, LibraryRef, ZOTERO_LIBRARY } from "src/render";
import { CitationSuiteSettingTab } from "src/settings";
import { PickedSource, pickSource } from "src/sourceModal";
import { suggestedSource } from "src/suggestion";
import { DEFAULT_CITE_PREFS, ZoteroCitePrefs } from "src/styles";
import { readVaultStyle, vaultStyles } from "src/vaultStyles";
import { VaultLibraries } from "src/vaultLibrary";
import { asBlock, noteMarkdown } from "src/zoteroNote";
import {
	Citation,
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

/** Whether a file of the vault is a note, which is what has footnote settings. */
function isNote(file: unknown): file is TFile {
	return file instanceof TFile && file.extension === "md";
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
	/**
	 * The library files of the vault, for the notes whose sources are read
	 * from one rather than from Zotero.
	 */
	libraries = new VaultLibraries(this.app);
	/** Renders what the note says into what the style would say. */
	renderer = new CitationRenderer(
		DEFAULT_SETTINGS.port,
		[],
		(style) => this.readStyle(style),
		DEFAULT_CITE_PREFS,
		this.libraries
	);
	/** Writes a note's citations together, for every view that shows them. */
	notes = new NoteRenderer(this.renderer);
	/** The style each note is previewed in: the settings', or its own pandoc `csl` and `lang`. */
	noteStyles = new NoteStyles(this.app, {
		renderer: this.renderer,
		libraries: this.libraries,
		readStyle: (style) => this.readStyle(style),
		styleFiles: () => this.styleFiles,
		styleChoice: () => this.settings.citationStyle,
		settingsLibrary: () => this.settings.libraryFile,
	});
	/**
	 * What the desktop can read off its disk: Zotero's styles and preferences,
	 * and the style files pandoc keeps outside the vault. `null` on a phone,
	 * where the module behind it is never loaded — it imports Node's `fs`,
	 * which a phone has nothing to answer with.
	 */
	private desktop: typeof import("src/zoteroStyles") | null = null;
	/** Where style files outside the vault are looked for; `null` on a phone. */
	private styleFiles: StyleFiles | null = null;

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
		await this.loadDesktop();
		this.styles = await this.allStyles();
		this.renderer.reset(this.settings.port, this.styles, await this.citePrefs());
		this.applyLibrary();
		// A library file written over — by the reader, or by a reference
		// manager exporting into the vault — is read again, and every note
		// showing its sources is drawn again.
		this.registerEvent(
			this.app.vault.on("modify", (file) => this.libraries.changed(file.path))
		);
		this.registerEvent(
			this.app.vault.on("delete", (file) => this.libraries.changed(file.path))
		);
		this.registerEvent(
			this.app.vault.on("rename", (file, oldPath) => {
				this.libraries.changed(oldPath);
				this.libraries.changed(file.path);
			})
		);
		this.register(
			this.libraries.onChange(() => {
				this.renderer.forgetFiles();
				this.notes.clear();
				this.redrawCitations();
				this.refreshBibliographyPanes();
			})
		);
		await this.renderer.prepare(this.settings.citationStyle);
		this.addSettingTab(new CitationSuiteSettingTab(this.app, this));

		// Reading view and live preview are two different machines drawing the
		// same thing, and Obsidian has no one place to say it once. What they
		// draw with is.
		const citations = {
			renderer: this.renderer,
			notes: this.notes,
			tooltip: () => this.citationTooltip(),
			markMissing: () => this.settings.markMissingKeys,
			libraryFor: (path: string | null): LibraryRef =>
				this.noteStyles.libraryOf(path),
		};
		const onStyleChange = (listener: (path: string) => void): (() => void) =>
			this.noteStyles.onChange(listener);
		this.registerMarkdownPostProcessor((el, ctx) => {
			return renderCitations(el, ctx, {
				...citations,
				styleFor: async (path) => (await this.noteStyles.resolve(path)).ref,
				noteText: (path) => this.noteText(path),
			});
		});
		this.registerEditorExtension(
			citationExtension({
				...citations,
				styleFor: (path) => this.noteStyles.current(path)?.ref,
				onStyleChange,
			})
		);
		// A note's `csl` or `lang` is read from its metadata, which Obsidian
		// reads again after the note is saved.
		this.registerEvent(
			this.app.metadataCache.on("changed", (file) => {
				this.noteStyles.metadataChanged(file);
			})
		);
		// Reading view draws a note once, so one whose style changed is drawn
		// again; editors and the pane listen for themselves.
		this.register(
			this.noteStyles.onChange((path) => {
				for (const leaf of this.app.workspace.getLeavesOfType("markdown")) {
					const view = leaf.view;
					if (
						view instanceof MarkdownView &&
						view.file?.path === path &&
						view.getMode() === "preview"
					) {
						view.previewMode.rerender(true);
					}
				}
			})
		);
		const suggest = new CitationSuggest(this.app, {
			renderer: this.renderer,
			enabled: () => this.settings.citationSuggestions,
			brackets: () => this.settings.brackets,
			libraryFor: (path) => this.noteStyles.libraryOf(path),
		});
		this.registerEditorSuggest(suggest);

		this.registerView(
			BIBLIOGRAPHY_VIEW,
			(leaf) =>
				new BibliographyView(leaf, {
					renderer: this.renderer,
					notes: this.notes,
					noteStyle: (path) => this.noteStyles.resolve(path),
					onStyleChange,
					redrawCitations: () => this.redrawCitations(),
					typedKey: (file, text) => suggest.typedKey(file, text),
					onTypingChange: (listener) => suggest.onTypingChange(listener),
				})
		);
		this.app.workspace.onLayoutReady(() => {
			void this.openBibliographyOnce();
		});

		// The command IDs are persisted with whatever hotkey is bound to them,
		// so they are fixed: a rename would silently unbind it.
		//
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
			editorCallback: (editor: Editor, ctx: MarkdownView | MarkdownFileInfo) => {
				this.renumberFootnotes(editor, ctx.file);
			},
		});

		this.addCommand({
			id: "note-footnote-settings",
			name: t.COMMAND_NOTE_FOOTNOTE_SETTINGS,
			checkCallback: (checking: boolean) => {
				const file = this.app.workspace.getActiveFile();
				if (!isNote(file)) {
					return false;
				}
				if (!checking) {
					new NoteFootnoteModal(this.app, this, file).open();
				}
				return true;
			},
		});

		// The same modal from a note's menus: the file explorer's and the
		// tab's, which Obsidian raises as `file-menu`, and the editor's own.
		this.registerEvent(
			this.app.workspace.on("file-menu", (menu, file) => {
				this.addNoteFootnoteItem(menu, file);
			})
		);
		this.registerEvent(
			this.app.workspace.on("editor-menu", (menu, _editor, info) => {
				this.addNoteFootnoteItem(menu, info.file);
			})
		);

		// A note's own footnote settings are kept by its path, and follow it.
		this.registerEvent(
			this.app.vault.on("rename", (file, oldPath) => {
				if (moveNoteFootnotes(this.settings.noteFootnotes, oldPath, file.path)) {
					void this.saveSettings();
				}
			})
		);
		this.registerEvent(
			this.app.vault.on("delete", (file) => {
				if (forgetNoteFootnotes(this.settings.noteFootnotes, file.path)) {
					void this.saveSettings();
				}
			})
		);

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

	/** The item opening a note's footnote settings, in a menu raised on a note. */
	private addNoteFootnoteItem(menu: Menu, file: unknown): void {
		if (!isNote(file)) {
			return;
		}
		menu.addItem((item) =>
			item
				.setTitle(t.NOTE_FOOTNOTES_TITLE)
				.setIcon("superscript")
				.onClick(() => {
					new NoteFootnoteModal(this.app, this, file).open();
				})
		);
	}

	onunload(): void {
		this.notes.clear();
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

	/**
	 * The whole text of the note at the path, as it stands — from its editor
	 * when it is open in one, since that holds what has not been saved yet — or
	 * `null` for anything that is not a note.
	 */
	private async noteText(path: string): Promise<string | null> {
		const file = this.app.vault.getFileByPath(path);
		if (!isNote(file)) {
			return null;
		}
		for (const leaf of this.app.workspace.getLeavesOfType("markdown")) {
			if (leaf.view instanceof MarkdownView && leaf.view.file === file) {
				return leaf.view.getViewData();
			}
		}
		return this.app.vault.cachedRead(file);
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
		// The one nested field: read afresh, so that it is never the defaults'
		// own object, and cleaned of what no footnote can be written with.
		this.settings.noteFootnotes = readNoteFootnotes(
			this.settings.noteFootnotes
		);
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
		// What the note reads its sources from decides which window opens. A
		// note whose library is a file of the vault is cited from that file,
		// Zotero running or not: the reader chose that library, and Zotero's
		// window would offer them sources their note cannot resolve — a key
		// picked there is a key the file has never heard of.
		//
		// Everything else is Zotero's window, which is what this command has
		// always opened: it is the one that cites with a page, a prefix and
		// several sources at once.
		const library = this.noteStyles.libraryOf(ctx.file?.path ?? null);
		if (library !== ZOTERO_LIBRARY) {
			await this.pickFromLibrary(editor, ctx, library);
			return;
		}
		const status = Platform.isDesktopApp
			? await probeZotero(this.settings.port)
			: "unreachable";
		if (status !== "ready") {
			// Nothing to cite from: no Zotero answering, and no file chosen.
			new Notice(
				!Platform.isDesktopApp
					? t.NOTICE_NO_LIBRARY
					: status === "starting"
						? t.NOTICE_ZOTERO_STARTING
						: t.NOTICE_ZOTERO_UNREACHABLE
			);
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
			pick = await this.pick(options, ctx.file);
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
		await this.writePick(editor, ctx, pick);
	}

	/**
	 * Cites a source from the note's own library file: the list of everything
	 * in it, and whatever is picked written where the cursor is, with the page
	 * typed beside it.
	 *
	 * The citation is written the way a pick from Zotero's window is — by
	 * `formatCitations`, with the locator labelled in the words pandoc reads
	 * in the note's language — so the two windows put the same text into a
	 * note. A prefix, a suffix and several sources at once are still Zotero's
	 * window alone.
	 */
	private async pickFromLibrary(
		editor: Editor,
		ctx: MarkdownView | MarkdownFileInfo,
		library: LibraryRef
	): Promise<void> {
		const items = await this.renderer.allItems(library);
		if (items.size === 0) {
			new Notice(t.NOTICE_LIBRARY_EMPTY);
			return;
		}
		const sources = [...items].map(([citekey, item]) =>
			suggestedSource(citekey, item)
		);
		const cited = citedKeys(editor.getValue());
		// Locators are written in the words pandoc will read them in, which is
		// the note's language — the same rule Zotero's window is held to. The
		// window writes the citation with this too, in the row that inserts
		// it, so what the reader is shown is what the note gets.
		const locale = await this.noteStyles.pandocLocale(ctx.file?.path ?? null);
		const labels = this.renderer.labelWriter(locale);
		// `page` is the label of a locator typed there, as it is the one
		// Zotero's window fills in for a locator typed without one of its own.
		const cite = (picked: PickedSource): Citation => ({
			id: 0,
			citationKey: picked.source.citekey,
			locator: picked.locator,
			label: picked.locator ? "page" : "",
			prefix: "",
			suffix: "",
			suppressAuthor: false,
		});
		const citation = (group: PickedSource[]): string =>
			formatCitations(group.map(cite), {
				brackets: this.settings.brackets,
				labels,
			});
		// A pill stands for one source of the citation, so it is written
		// without the brackets that would enclose the whole of it.
		const label = (picked: PickedSource): string =>
			formatCitations([cite(picked)], { brackets: false, labels });
		const picked = await pickSource(this.app, {
			sources,
			cited,
			citation,
			label,
		});
		if (!picked || picked.length === 0) {
			return;
		}
		await this.writePick(editor, ctx, {
			citation: citation(picked),
			notes: "",
		});
	}

	/**
	 * Writes what was picked into the note: the citation where the cursor is
	 * or in a footnote, then any Zotero notes, and the cursor last of all.
	 */
	private async writePick(
		editor: Editor,
		ctx: MarkdownView | MarkdownFileInfo,
		pick: Pick
	): Promise<void> {
		let footnote: FootnoteEdit | null = null;
		if (pick.citation) {
			if (noteFootnoteSettings(this.settings, ctx.file?.path).footnotes) {
				footnote = this.insertFootnote(editor, pick.citation, ctx.file);
			} else {
				editor.replaceSelection(pick.citation);
			}
		}
		if (pick.notes) {
			const length = editor.getValue().length;
			this.insertNotes(editor, pick.notes);
			// The notes go in at the anchor, before the footnote's text, and
			// push it down by what they added.
			if (footnote) {
				const added = editor.getValue().length - length;
				footnote = { ...footnote, textEnd: footnote.textEnd + added };
			}
		}
		// Last, once the notes are in: the footnote's text takes the cursor.
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
	 * How a footnote is written, as the settings say — in `file`, as that note's
	 * own footnote settings say where it has any. The insertion, the
	 * renumbering and the style preview all read it from here, so none of them
	 * can label a footnote differently from the others; the preview, which
	 * stands in no note, passes none.
	 */
	footnoteOptions(file: TFile | null = null): FootnoteOptions {
		const settings = noteFootnoteSettings(this.settings, file?.path);
		return {
			placement: settings.footnotePlacement,
			numbering: settings.footnoteNumbering,
			prefix: settings.footnotePrefix,
			suffix: settings.footnoteSuffix,
		};
	}

	/** Takes every note's own footnote settings away: each follows the settings again. */
	async resetNoteFootnotes(): Promise<void> {
		this.settings.noteFootnotes = {};
		await this.saveSettings();
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
	private insertFootnote(
		editor: Editor,
		content: string,
		file: TFile | null
	): FootnoteEdit {
		const edit = footnoteEdit(
			editor.getValue(),
			editor.posToOffset(editor.getCursor("from")),
			editor.posToOffset(editor.getCursor("to")),
			content,
			this.footnoteOptions(file)
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
	 * Without the popover, the cursor goes to the end of the footnote's text in
	 * the note: always into an empty one, which is there to be written, and
	 * past a citation when the settings say so — otherwise it stays after the
	 * anchor, to write on in the sentence. When the popover was asked for and
	 * could not be opened, the same goes, unless the note was typed in while it
	 * was waited for, when moving the cursor would pull it out from under the
	 * reader. A citation written into a footnote's text made no footnote, and
	 * has nothing to open.
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
		const toText = blank || this.settings.footnoteCursorToText;
		if (!this.settings.footnotePopover || !(ctx instanceof MarkdownView)) {
			if (toText) {
				this.goToFootnoteText(editor, edit);
			}
			return;
		}
		const written = editor.getValue();
		const anchorFrom = edit.cursor - `[^${edit.label}]`.length;
		const opened = await openFootnotePopover(ctx, editor, anchorFrom, edit.label);
		if (!opened && toText && editor.getValue() === written) {
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
		const edit = this.insertFootnote(editor, "", ctx.file);
		await this.openFootnoteText(editor, ctx, edit, true);
	}

	/**
	 * Numbers the note's footnotes in the order they come, as the settings
	 * write labels in that note — leaving named ones alone if the settings say
	 * so — in one transaction: one undo puts the old labels back.
	 */
	private renumberFootnotes(editor: Editor, file: TFile | null): void {
		const { changes, count } = renumberFootnotes(
			editor.getValue(),
			this.footnoteOptions(file),
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
		this.notes.clear();
		this.noteStyles.clear();
		this.libraries.clear();
		this.styles = await this.allStyles();
		this.renderer.reset(this.settings.port, this.styles, await this.citePrefs());
		this.applyLibrary();
		await this.renderer.prepare(this.settings.citationStyle);
		this.redrawCitations();
		this.refreshBibliographyPanes();
	}

	/**
	 * Loads what only a desktop can run: the module that reads Zotero's styles
	 * and preferences off the disk. It imports Node's `fs`, `os` and `path`,
	 * which a phone has nothing behind, so it is loaded here rather than at the
	 * top of the file — and on a phone it is never loaded at all.
	 */
	private async loadDesktop(): Promise<void> {
		if (!Platform.isDesktopApp) {
			return;
		}
		try {
			this.desktop = await import("src/zoteroStyles");
			this.styleFiles = this.desktop.styleFiles(this.app);
		} catch (error) {
			// A desktop that will not load it is a desktop without Zotero's
			// styles, which is the same as having none installed.
			console.error("Citation Suite: the desktop styles could not be loaded", error);
		}
	}

	/**
	 * Every style to choose from: the ones Zotero has, on a desktop, and the
	 * ones the vault holds, everywhere. A vault style of the same id as one of
	 * Zotero's is listed as well — they are two files, and the note that names
	 * one names it by path.
	 */
	private async allStyles(): Promise<CitationStyle[]> {
		const installed = (await this.desktop?.installedStyles()) ?? [];
		const inVault = await vaultStyles(this.app);
		return [...installed, ...inVault].sort((a, b) => a.title.localeCompare(b.title));
	}

	/** What Zotero writes citations by, or the defaults where it cannot be read. */
	private async citePrefs(): Promise<ZoteroCitePrefs> {
		return (await this.desktop?.zoteroCitePrefs()) ?? DEFAULT_CITE_PREFS;
	}

	/** The whole of a style's file, read wherever that style's file is. */
	private readStyle(style: CitationStyle): Promise<string> {
		if (style.source === "vault") {
			return readVaultStyle(this.app, style);
		}
		const desktop = this.desktop;
		if (!desktop) {
			return Promise.reject(new Error("no styles outside the vault on this device"));
		}
		return desktop.readStyleFile(style);
	}

	/**
	 * Where the notes that name no library of their own read their sources
	 * from: the file the settings name, found from the vault's root. A note is
	 * answered for itself when it is rendered, since a name in the settings can
	 * stand for a file beside the note as well.
	 */
	private applyLibrary(): void {
		this.renderer.setFallbackLibrary(this.noteStyles.libraryOf(null));
	}

	/** Draws the bibliography pane again, in every window it is open in. */
	private refreshBibliographyPanes(): void {
		for (const leaf of this.app.workspace.getLeavesOfType(BIBLIOGRAPHY_VIEW)) {
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
	private async pick(options: PickOptions, file: TFile | null): Promise<Pick> {
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

		// Locators are written in the words pandoc will read them in, which is
		// the note's language: `p. 33` in English, `с. 33` with `lang: ru-RU`.
		const locale = await this.noteStyles.pandocLocale(file?.path ?? null);
		return {
			citation:
				citations.length > 0
					? formatCitations(citations, {
							brackets: this.settings.brackets,
							labels: this.renderer.labelWriter(locale),
						})
					: "",
			notes: notes
				.map(noteMarkdown)
				.filter((markdown) => markdown)
				.join("\n\n"),
		};
	}
}
