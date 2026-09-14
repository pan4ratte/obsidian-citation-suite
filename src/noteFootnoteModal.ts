import { App, ButtonComponent, Modal, Setting, TFile } from "obsidian";
import { t } from "lang/helpers";
import CitationSuitePlugin from "src/main";
import { isValidLabelText } from "src/footnote";
import {
	hasNoteFootnoteSettings,
	noteFootnoteSettings,
} from "src/noteFootnotes";
import { NUMBERING_OPTIONS, PLACEMENT_OPTIONS } from "src/settings";
import { NoteFootnoteKey, NoteFootnoteSettings } from "src/types";

/**
 * The footnote settings of one note: the rows the settings tab has for whether
 * a citation goes into a footnote and how a new one is placed and labelled,
 * named and described as there, holding what is in force in the note. A change
 * is saved at once, for that note alone, as the tab saves a setting; the button
 * under the rows gives the note the plugin's settings back.
 *
 * The note is held as its `TFile`, whose path follows a rename, so a change
 * made while the note is renamed under the modal still lands on its entry.
 */
export class NoteFootnoteModal extends Modal {
	private readonly plugin: CitationSuitePlugin;
	private readonly file: TFile;
	private reset: ButtonComponent | null = null;

	constructor(app: App, plugin: CitationSuitePlugin, file: TFile) {
		super(app);
		this.plugin = plugin;
		this.file = file;
	}

	onOpen(): void {
		this.setTitle(t.NOTE_FOOTNOTES_TITLE);
		this.contentEl.addClass("citation-suite-note-footnotes");
		this.draw();
	}

	onClose(): void {
		this.reset = null;
		this.contentEl.empty();
	}

	/**
	 * Draws the rows from what is in force in the note. Drawn again only by the
	 * reset, which changes every value at once: a row redrawn while it is typed
	 * in would take the focus out of it.
	 */
	private draw(): void {
		const { contentEl } = this;
		contentEl.empty();
		const current = noteFootnoteSettings(this.plugin.settings, this.file.path);

		const desc = contentEl.createDiv("citation-suite-note-footnotes-desc");
		desc.appendText(t.NOTE_FOOTNOTES_DESC_BEFORE);
		desc.createSpan({
			cls: "citation-suite-note-footnotes-file",
			text: this.file.basename,
		});
		desc.appendText(t.NOTE_FOOTNOTES_DESC_AFTER);

		new Setting(contentEl)
			.setName(t.SETTING_FOOTNOTES_NAME)
			.setDesc(t.SETTING_FOOTNOTES_DESC)
			.addToggle((toggle) =>
				toggle
					.setValue(current.footnotes)
					.onChange((value) => void this.set("footnotes", value))
			);
		new Setting(contentEl)
			.setName(t.SETTING_FOOTNOTE_PLACEMENT_NAME)
			.setDesc(t.SETTING_FOOTNOTE_PLACEMENT_DESC)
			.addDropdown((dropdown) =>
				dropdown
					.addOptions(PLACEMENT_OPTIONS)
					.setValue(current.footnotePlacement)
					.onChange(
						(value) =>
							void this.set(
								"footnotePlacement",
								value as NoteFootnoteSettings["footnotePlacement"]
							)
					)
			);
		new Setting(contentEl)
			.setName(t.SETTING_FOOTNOTE_NUMBERING_NAME)
			.setDesc(t.SETTING_FOOTNOTE_NUMBERING_DESC)
			.addDropdown((dropdown) =>
				dropdown
					.addOptions(NUMBERING_OPTIONS)
					.setValue(current.footnoteNumbering)
					.onChange(
						(value) =>
							void this.set(
								"footnoteNumbering",
								value as NoteFootnoteSettings["footnoteNumbering"]
							)
					)
			);
		this.labelTextSetting(
			"footnotePrefix",
			t.SETTING_FOOTNOTE_PREFIX_NAME,
			t.SETTING_FOOTNOTE_PREFIX_DESC,
			current.footnotePrefix
		);
		this.labelTextSetting(
			"footnoteSuffix",
			t.SETTING_FOOTNOTE_SUFFIX_NAME,
			t.SETTING_FOOTNOTE_SUFFIX_DESC,
			current.footnoteSuffix
		);

		const buttons = contentEl.createDiv("modal-button-container");
		this.reset = new ButtonComponent(buttons)
			.setButtonText(t.NOTE_FOOTNOTES_RESET)
			.onClick(() => void this.resetToGeneral());
		this.markReset();
	}

	/**
	 * A field for the text on one side of a footnote's number. What would break
	 * the footnote is refused as it is typed, with the characters named, and
	 * not saved — as the settings tab refuses it.
	 */
	private labelTextSetting(
		key: "footnotePrefix" | "footnoteSuffix",
		name: string,
		desc: string,
		value: string
	): void {
		const setting = new Setting(this.contentEl).setName(name).setDesc(desc);
		setting.addText((text) =>
			text.setValue(value).onChange((typed) => {
				if (!isValidLabelText(typed)) {
					setting.setErrorMessage(t.SETTING_FOOTNOTE_LABEL_INVALID);
					return;
				}
				setting.setErrorMessage(null);
				void this.set(key, typed);
			})
		);
	}

	/** Sets one field for the note alone, and saves it. */
	private async set<K extends NoteFootnoteKey>(
		key: K,
		value: NoteFootnoteSettings[K]
	): Promise<void> {
		const overrides = this.plugin.settings.noteFootnotes;
		const path = this.file.path;
		overrides[path] = { ...overrides[path], [key]: value };
		this.markReset();
		await this.plugin.saveSettings();
	}

	/** Drops everything the note set for itself, and shows what is in force now. */
	private async resetToGeneral(): Promise<void> {
		delete this.plugin.settings.noteFootnotes[this.file.path];
		this.draw();
		await this.plugin.saveSettings();
	}

	/** The reset is offered only while the note has something to reset. */
	private markReset(): void {
		this.reset?.setDisabled(
			!hasNoteFootnoteSettings(
				this.plugin.settings.noteFootnotes,
				this.file.path
			)
		);
	}
}
