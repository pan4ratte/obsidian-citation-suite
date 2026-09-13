import { Editor, MarkdownView, Notice, Plugin } from "obsidian";
import { getChangelogContent, t } from "lang/helpers";
import {
	CaywError,
	citable,
	PickOptions,
	pickCitations,
	probeZotero,
} from "src/cayw";
import { BIBLIOGRAPHY_VIEW, BibliographyView } from "src/bibliography";
import { ChangelogModal } from "src/changelogModal";
import {
	footnoteEdit,
	FootnoteOptions,
	inFootnoteText,
	renumberFootnotes,
} from "src/footnote";
import { citationExtension } from "src/live";
import { applyLook, clearLook } from "src/look";
import { formatCitations } from "src/pandoc";
import { renderCitations } from "src/reading";
import { CitationRenderer } from "src/render";
import { CitationSuiteSettingTab } from "src/settings";
import { installedStyles, readStyleFile, zoteroCitePrefs } from "src/styles";
import {
	CitationStyle,
	DEFAULT_SETTINGS,
	CitationSuiteSettings,
} from "src/types";

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
				this.settings.citationStyle
			);
		});
		this.registerEditorExtension(
			citationExtension({
				renderer: this.renderer,
				styleId: () => this.settings.citationStyle,
			})
		);

		this.registerView(
			BIBLIOGRAPHY_VIEW,
			(leaf) =>
				new BibliographyView(leaf, {
					renderer: this.renderer,
					styleId: () => this.settings.citationStyle,
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
			editorCallback: (editor: Editor) => {
				void this.insertCitation(editor);
			},
		});

		this.addCommand({
			id: "insert-selected-citation",
			name: t.COMMAND_INSERT_SELECTED_CITATION,
			editorCallback: (editor: Editor) => {
				void this.insertCitation(editor, true);
			},
		});

		this.addCommand({
			id: "insert-footnote",
			name: t.COMMAND_INSERT_FOOTNOTE,
			editorCallback: (editor: Editor) => {
				this.insertBlankFootnote(editor);
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
				new ChangelogModal(this.app, getChangelogContent()).open();
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
	 * runs, without taking the focus or unfolding a collapsed sidebar. From
	 * then on it is the workspace layout that keeps it there, so a reader who
	 * closes it is not handed it back on every launch; the command reopens it.
	 */
	private async openBibliographyOnce(): Promise<void> {
		if (this.settings.bibliographyPaneOpened) {
			return;
		}
		await this.app.workspace.ensureSideLeaf(BIBLIOGRAPHY_VIEW, "right", {
			active: false,
			reveal: false,
		});
		this.settings.bibliographyPaneOpened = true;
		await this.saveSettings();
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
		fromSelection = false
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
			selected: fromSelection,
			minimize: this.settings.minimizeZotero,
		};

		let citation: string;
		try {
			// This waits for as long as the citation window is open, which is
			// as long as the reader takes.
			citation = await this.pandocCitation(options);
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
		if (!citation) {
			return;
		}
		if (this.settings.footnotes) {
			this.insertFootnote(editor, citation, false);
		} else {
			editor.replaceSelection(citation);
		}
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
	 * The cursor stays after the anchor for a citation, which is written, and
	 * goes into the footnote's text for an empty footnote, which is there to be
	 * written in. It is set afterwards rather than in the transaction, because
	 * the transaction reads positions against the note as it was before the
	 * edit.
	 */
	private insertFootnote(
		editor: Editor,
		content: string,
		toText: boolean
	): void {
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
		const cursor = editor.offsetToPos(toText ? edit.textEnd : edit.cursor);
		editor.setCursor(cursor);
		if (toText) {
			editor.scrollIntoView({ from: cursor, to: cursor }, true);
		}
	}

	/**
	 * A footnote with no citation in it, labelled and placed as the settings
	 * say whether or not citations go into footnotes, for the reader to write.
	 * Inside a footnote's text there is nowhere for one to go.
	 */
	private insertBlankFootnote(editor: Editor): void {
		const from = editor.posToOffset(editor.getCursor("from"));
		if (inFootnoteText(editor.getValue(), from)) {
			new Notice(t.NOTICE_FOOTNOTE_IN_FOOTNOTE);
			return;
		}
		this.insertFootnote(editor, "", true);
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
		// The editors are holding decorations built under the old style, and
		// the reading views HTML built under it. Both have to be told.
		this.app.workspace.updateOptions();
		for (const leaf of this.app.workspace.getLeavesOfType("markdown")) {
			const view = leaf.view;
			if (view instanceof MarkdownView) {
				view.previewMode.rerender(true);
			}
		}
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
	 * The pick written as a pandoc citation. This is what goes into the note —
	 * always, whatever style is chosen to read it in — because it is the only
	 * form that names the source rather than describing it, and so the only one
	 * pandoc can render later from the bibliography.
	 */
	private async pandocCitation(options: PickOptions): Promise<string> {
		const picked = await pickCitations(options);
		if (picked.length === 0) {
			return "";
		}

		const citations = citable(picked);
		if (citations.length === 0) {
			new Notice(t.NOTICE_NOTHING_TO_CITE);
			return "";
		}
		if (citations.length < picked.length) {
			new Notice(t.NOTICE_ITEMS_WITHOUT_KEYS);
		}

		return formatCitations(citations, { brackets: this.settings.brackets });
	}
}
