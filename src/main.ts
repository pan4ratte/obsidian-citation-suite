import { Editor, Notice, Plugin } from "obsidian";
import { getChangelogContent, t } from "lang/helpers";
import {
	CaywError,
	citable,
	pickCitations,
	probeZotero,
} from "src/cayw";
import { ChangelogModal } from "src/changelogModal";
import { formatCitations } from "src/pandoc";
import { ZoterikSettingTab } from "src/settings";
import {
	Citation,
	CitationForm,
	DEFAULT_SETTINGS,
	ZoterikSettings,
} from "src/types";

export default class ZoterikPlugin extends Plugin {
	settings: ZoterikSettings = { ...DEFAULT_SETTINGS };

	async onload(): Promise<void> {
		await this.loadSettings();
		this.addSettingTab(new ZoterikSettingTab(this.app, this));

		// The command IDs are persisted with whatever hotkey is bound to them,
		// so they are fixed: a rename would silently unbind it.
		this.addCommand({
			id: "insert-citation",
			name: t.COMMAND_INSERT_CITATION,
			editorCallback: (editor: Editor) => {
				void this.insertCitation(editor, CitationForm.Parenthetical);
			},
		});

		this.addCommand({
			id: "insert-in-text-citation",
			name: t.COMMAND_INSERT_IN_TEXT_CITATION,
			editorCallback: (editor: Editor) => {
				void this.insertCitation(editor, CitationForm.InText);
			},
		});

		this.addCommand({
			id: "insert-selected-citation",
			name: t.COMMAND_INSERT_SELECTED_CITATION,
			editorCallback: (editor: Editor) => {
				void this.insertCitation(
					editor,
					CitationForm.Parenthetical,
					true
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
		form: CitationForm,
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

		let picked: Citation[];
		try {
			// This waits for as long as the citation window is open, which is
			// as long as the reader takes.
			picked = await pickCitations({
				port: this.settings.port,
				selected: fromSelection,
				minimize: this.settings.minimizeZotero,
			});
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
		if (picked.length === 0) {
			return;
		}

		const citations = citable(picked);
		if (citations.length === 0) {
			new Notice(t.NOTICE_NOTHING_TO_CITE);
			return;
		}
		if (citations.length < picked.length) {
			new Notice(t.NOTICE_ITEMS_WITHOUT_KEYS);
		}

		editor.replaceSelection(
			formatCitations(citations, {
				form,
				brackets: this.settings.brackets,
			})
		);
	}
}
