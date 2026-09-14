import {
	App,
	ExtraButtonComponent,
	Notice,
	PluginSettingTab,
	Setting,
	SettingDefinitionControl,
	SettingDefinitionItem,
	SettingDefinitionRender,
} from "obsidian";
import { lang, t } from "lang/helpers";
import CitationSuitePlugin from "src/main";
import {
	FootnoteNumbering,
	FootnotePlacement,
	isValidLabelText,
} from "src/footnote";
import { renderStylePreview, StylePreview } from "src/preview";
import { renderStylePicker, StyleChoice } from "src/stylePicker";
import { ZoteroCheck } from "src/cayw";
import { ConfirmModal } from "src/confirmModal";
import { renderStatusCard, StatusCard } from "src/statusCard";
import {
	asIndexable,
	DEFAULT_SETTINGS,
	DEFAULT_TOOLTIP_DELAY,
} from "src/types";

const MIN_PORT = 1;
const MAX_PORT = 65535;

/**
 * The range of the tooltip delay slider, in milliseconds. It starts at one step
 * rather than at zero: `setTooltip` leaves a falsy delay out, and a tooltip
 * without one waits Obsidian's full default instead of none.
 */
const MIN_TOOLTIP_DELAY = 100;
const MAX_TOOLTIP_DELAY = 2000;
const TOOLTIP_DELAY_STEP = 100;

/** The delay as the slider shows it — `500 мс`, `500 ms` — in the interface language. */
const tooltipDelayFormat = new Intl.NumberFormat(lang, {
	style: "unit",
	unit: "millisecond",
	unitDisplay: "short",
});

/** What the placement dropdown offers, in the order it offers it. */
export const PLACEMENT_OPTIONS: Record<FootnotePlacement, string> = {
	paragraph: t.FOOTNOTE_PLACEMENT_PARAGRAPH,
	section: t.FOOTNOTE_PLACEMENT_SECTION,
	document: t.FOOTNOTE_PLACEMENT_DOCUMENT,
};

/** What the numbering dropdown offers, in the order it offers it. */
export const NUMBERING_OPTIONS: Record<FootnoteNumbering, string> = {
	arabic: t.FOOTNOTE_NUMBERING_ARABIC,
	"roman-lower": t.FOOTNOTE_NUMBERING_ROMAN_LOWER,
	"roman-upper": t.FOOTNOTE_NUMBERING_ROMAN_UPPER,
};

/**
 * The settings the style preview is drawn from: the style, how a citation is
 * written without one, and whether it stands in a footnote, labelled how.
 */
const PREVIEW_KEYS = new Set([
	"citationStyle",
	"brackets",
	"footnotes",
	"footnoteNumbering",
	"footnotePrefix",
	"footnoteSuffix",
	"citationTooltips",
	"citationTooltipDelay",
]);

/** The settings that change how the citations already drawn look. */
const REDRAW_KEYS = new Set([
	"citationTooltips",
	"citationTooltipDelay",
	"markMissingKeys",
]);

/**
 * The settings tab, declared through Obsidian 1.13's `getSettingDefinitions()`.
 * `display()` is gone: a non-empty array of definitions renders the tab instead
 * of it, and `minAppVersion` is 1.13.0, so there is no version left that would
 * reach it.
 *
 * Almost every setting is a control the API already describes — toggles,
 * dropdowns, text fields and a slider — so each is declared as a `control` and
 * the framework draws it, indexes it for the settings search, and asks this tab
 * to store the new value. `render` is used for the status card, which is not a
 * setting; for the citation style, which is chosen from a list no control type
 * draws; and for the port, whose reset button the `number` control cannot
 * draw.
 */
export class CitationSuiteSettingTab extends PluginSettingTab {
	plugin: CitationSuitePlugin;
	/** The preview under the style list, while the tab is drawn. */
	private preview: StylePreview | null = null;
	/** The status card at the head of the tab, while the tab is drawn. */
	private statusCard: StatusCard | null = null;
	/**
	 * What Zotero said the last time the card asked, kept for as long as the
	 * tab is open: `update()` draws the card again whenever a row's
	 * visibility changes, and that is no reason to ask Zotero again.
	 */
	private lastCheck: ZoteroCheck | null = null;

	constructor(app: App, plugin: CitationSuitePlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	/**
	 * Where a `control` definition reads its value from, and where it writes
	 * one back. The base class already points both at `plugin.settings`; they
	 * are stated here so that saving goes through the plugin's own
	 * `saveSettings()` — the one place that writes `data.json` — rather than
	 * through a second path that would have to be kept in step with it.
	 */
	getControlValue(key: string): unknown {
		return asIndexable(this.plugin.settings)[key];
	}

	async setControlValue(key: string, value: unknown): Promise<void> {
		asIndexable(this.plugin.settings)[key] = value;
		await this.plugin.saveSettings();
		if (key === "port") {
			// The card was answering for the port the settings pointed at.
			this.statusCard?.refresh();
		}
		if (
			key === "citationStyle" ||
			key === "port" ||
			key === "noteStyleProperties"
		) {
			// Each changes what the citations already on screen should look
			// like — the style, the library behind them, or whether a note's
			// own style is read — and none redraws them on its own.
			await this.plugin.restyle();
		}
		if (REDRAW_KEYS.has(key)) {
			this.plugin.redrawCitations();
		}
		if (key === "citationTooltips" || key === "footnotePopover") {
			// The delay row is shown only while there is a tooltip to delay,
			// and the cursor row only while there is no popover to write in.
			this.update();
		}
		if (PREVIEW_KEYS.has(key)) {
			// The preview shows the sample in the style, or as a note would
			// hold it — with or without its brackets — when there is none, and
			// in a footnote labelled as a new one would be when they are on.
			this.preview?.refresh();
		}
	}

	/**
	 * A field for the text on one side of a footnote's number. What would break
	 * the footnote is refused as it is typed, with the characters named.
	 */
	private labelTextSetting(
		key: "footnotePrefix" | "footnoteSuffix",
		name: string,
		desc: string
	): SettingDefinitionControl {
		return {
			name,
			desc,
			control: {
				type: "text",
				key,
				validate: (value: string) =>
					isValidLabelText(value)
						? undefined
						: t.SETTING_FOOTNOTE_LABEL_INVALID,
			},
		};
	}

	/**
	 * The port row: a number field with a button before it that puts the
	 * default port back, as Obsidian draws a slider with a default.
	 *
	 * A `render` definition, because the `number` control draws no such
	 * button — 1.13 gives one to sliders and colours only — and a control
	 * cannot be given one. So the field is drawn here, and it behaves as the
	 * control's does: the port is saved when the field loses the focus or
	 * Enter is pressed, an empty field takes the default, Escape puts back the
	 * port in force, and a port that will not do is refused under the row. The
	 * button is dimmed while the default is already in force.
	 *
	 * `update()` runs a render again on the row it already drew, so what the
	 * last run put in the control block is removed first.
	 */
	private portSetting(): SettingDefinitionRender {
		return {
			name: t.SETTING_PORT_NAME,
			desc: t.SETTING_PORT_DESC,
			render: (setting: Setting) => {
				setting.controlEl.empty();
				const defaultPort = DEFAULT_SETTINGS.port;
				let reset: ExtraButtonComponent | null = null;
				const markDefault = (port: number): void => {
					reset?.extraSettingsEl.setAttr(
						"aria-disabled",
						String(port === defaultPort)
					);
				};

				setting.addExtraButton((button) => {
					reset = button
						.setIcon("rotate-ccw")
						.setTooltip(t.SETTING_PORT_RESET)
						.onClick(() => {
							if (this.plugin.settings.port !== defaultPort) {
								input.value = String(defaultPort);
								void commit();
							}
						});
				});
				let input!: HTMLInputElement;
				setting.addText((text) => {
					input = text.inputEl;
				});
				input.type = "number";
				input.inputMode = "numeric";
				input.min = String(MIN_PORT);
				input.max = String(MAX_PORT);
				input.step = "1";
				input.value = String(this.plugin.settings.port);
				markDefault(this.plugin.settings.port);

				/**
				 * Saves what the field holds, and says whether it could. A
				 * number input constrains the arrows, not what can be typed
				 * into it, and a port out of range fails as a connection
				 * refused rather than as anything a reader could act on, so it
				 * is refused here with the range named.
				 */
				const commit = async (): Promise<boolean> => {
					if (input.value.trim() === "") {
						input.value = String(defaultPort);
					}
					const port = Number(input.value);
					if (
						!Number.isInteger(port) ||
						port < MIN_PORT ||
						port > MAX_PORT
					) {
						setting.setErrorMessage(t.SETTING_PORT_INVALID);
						return false;
					}
					setting.setErrorMessage(null);
					markDefault(port);
					if (port !== this.plugin.settings.port) {
						await this.setControlValue("port", port);
					}
					return true;
				};

				input.addEventListener("blur", () => void commit());
				input.addEventListener("keydown", (event) => {
					if (event.isComposing) {
						return;
					}
					if (event.key === "Enter") {
						event.preventDefault();
						void commit().then((saved) => {
							if (saved) {
								input.blur();
							}
						});
					} else if (event.key === "Escape") {
						event.preventDefault();
						input.value = String(this.plugin.settings.port);
						setting.setErrorMessage(null);
						input.blur();
					}
				});
			},
		};
	}

	/**
	 * The row that takes every note's own footnote settings away at once,
	 * after asking — the answer cannot be taken back.
	 *
	 * A `render` definition, because what it needs is a button in the warning
	 * colour. The declarative `action` row, read out of Obsidian 1.13.7's
	 * `app.js`, makes the whole row clickable and draws nothing to click, which
	 * does not say that pressing it deletes anything. The button is disabled
	 * while no note has settings of its own; `update()` redraws the row after a
	 * reset, so what the last run drew is removed first.
	 */
	private resetNoteFootnotesSetting(): SettingDefinitionRender {
		return {
			name: t.SETTING_NOTE_FOOTNOTES_RESET_NAME,
			desc: t.SETTING_NOTE_FOOTNOTES_RESET_DESC,
			render: (setting: Setting) => {
				setting.controlEl.empty();
				const count = Object.keys(this.plugin.settings.noteFootnotes).length;
				setting.addButton((button) =>
					button
						.setButtonText(t.SETTING_NOTE_FOOTNOTES_RESET_BUTTON)
						.setDestructive()
						.setDisabled(count === 0)
						.onClick(() => {
							new ConfirmModal(this.app, {
								title: t.NOTE_FOOTNOTES_RESET_ALL_TITLE,
								paragraphs: [
									t.NOTE_FOOTNOTES_RESET_ALL_TEXT,
									`${t.NOTE_FOOTNOTES_RESET_ALL_COUNT} ${count}`,
								],
								confirm: t.SETTING_NOTE_FOOTNOTES_RESET_BUTTON,
								onConfirm: async () => {
									await this.plugin.resetNoteFootnotes();
									new Notice(t.NOTICE_NOTE_FOOTNOTES_RESET);
									this.update();
								},
							}).open();
						})
				);
			},
		};
	}

	/**
	 * What the style picker offers: not rendering at all first, because that is
	 * the default and the only entry that is not a style, then every style
	 * Zotero has, by title.
	 *
	 * A style that was chosen and has since been uninstalled from Zotero is
	 * kept in the list under its bare id. It reads badly, which is the point:
	 * the alternative is a picker that quietly shows the reader a setting they
	 * never chose.
	 */
	private styleChoices(): StyleChoice[] {
		const choices: StyleChoice[] = [
			{ id: "", title: t.SETTING_STYLE_PANDOC },
			...this.plugin.styles.map(({ id, title }) => ({ id, title })),
		];
		const chosen = this.plugin.settings.citationStyle;
		if (chosen && !choices.some((choice) => choice.id === chosen)) {
			choices.push({ id: chosen, title: chosen });
		}
		return choices;
	}

	/**
	 * The citation style row: its name and description as any setting has
	 * them, and under them, across the whole width of the row, the list the
	 * style is chosen from and the preview of what it makes of a citation. The
	 * row's control block is left empty, and styles.css hides it.
	 *
	 * A choice goes through `setControlValue`, the same path a control's change
	 * takes, so saving and redrawing the citations happen in one place
	 * whichever way a setting was changed.
	 *
	 * `update()` runs a render again on the row it already drew, so a list and
	 * a preview left from the last run are removed before the new ones go in.
	 */
	private styleSetting(): SettingDefinitionRender {
		return {
			name: t.SETTING_STYLE_NAME,
			desc: t.SETTING_STYLE_DESC,
			render: (setting: Setting) => {
				setting.settingEl.addClass("citation-suite-style-setting");
				setting.settingEl
					.querySelectorAll(
						":scope > .citation-suite-style-picker, :scope > .citation-suite-style-preview"
					)
					.forEach((el) => el.remove());
				const closePicker = renderStylePicker(
					setting.settingEl,
					this.styleChoices(),
					this.plugin.settings.citationStyle,
					(id) => void this.setControlValue("citationStyle", id)
				);
				const preview = renderStylePreview(
					setting.settingEl,
					this.plugin
				);
				this.preview = preview;
				return () => {
					closePicker();
					preview.destroy();
					if (this.preview === preview) {
						this.preview = null;
					}
				};
			},
		};
	}

	/**
	 * What the release the reader is now running brought, one click away from
	 * the first thing the settings show. It is drawn only until it is closed:
	 * closing it writes the running version down, and the banner comes back on
	 * the next one, which is a version that no longer matches.
	 *
	 * There is nothing in it to search the settings for, hence `searchable:
	 * false`; and `update()` redraws the row it already owns, so the root is
	 * looked up before it is created rather than appended a second time.
	 */
	private statusSetting(): SettingDefinitionRender {
		return {
			name: t.PLUGIN_NAME,
			desc: t.PLUGIN_DESCRIPTION,
			searchable: false,
			render: (setting: Setting) => {
				// The anchor idiom the sibling plugins use: the row is a host
				// for the plugin's own DOM rather than a setting, and
				// styles.css blanks the chrome 1.13 gives it.
				setting.settingEl.addClass("citation-suite-settings-anchor");
				const root =
					setting.settingEl.querySelector<HTMLElement>(
						":scope > .citation-suite-settings-root"
					) ?? setting.settingEl.createDiv("citation-suite-settings-root");
				root.empty();
				this.renderStatus(root);
			},
		};
	}

	/**
	 * The status card, first in the tab and across its full width. The row it
	 * stands in keeps the plugin's name and description as its stock label,
	 * which styles.css does not draw: the tab opens straight onto the card.
	 */
	private renderStatus(root: HTMLElement): void {
		const version = this.plugin.manifest.version;
		this.statusCard = renderStatusCard(root, {
			app: this.app,
			version,
			dismissedVersion: this.plugin.settings.dismissedChangelogVersion,
			onDismiss: () => {
				this.plugin.settings.dismissedChangelogVersion = version;
				void this.plugin.saveSettings();
			},
			port: () => this.plugin.settings.port,
			lastCheck: this.lastCheck,
			onChecked: (check) => {
				this.lastCheck = check;
			},
		});
	}

	/** A tab opened again asks Zotero again: it may have started or quit since. */
	hide(): void {
		super.hide();
		this.lastCheck = null;
		this.statusCard = null;
	}

	getSettingDefinitions(): SettingDefinitionItem[] {
		return [
			// The status card stands in a group of its own whose card styles.css
			// blanks: it is a card of its own, and putting it inside the first
			// section's card would make it read as a setting of that section.
			{
				type: "group",
				cls: "citation-suite-settings-group",
				items: [this.statusSetting()],
			},
			// Every setting below is a control 1.13 draws itself, so these
			// groups keep the card Obsidian gives them. `citation-suite-settings-rows`
			// is what styles.css corrects the row layout through — see the
			// note on it there.
			{
				type: "group",
				cls: "citation-suite-settings-rows",
				heading: t.SECTION_CITATION,
				items: [
					this.styleSetting(),
					{
						name: t.SETTING_NOTE_STYLE_NAME,
						desc: t.SETTING_NOTE_STYLE_DESC,
						control: { type: "toggle", key: "noteStyleProperties" },
					},
					{
						name: t.SETTING_TOOLTIPS_NAME,
						desc: t.SETTING_TOOLTIPS_DESC,
						control: { type: "toggle", key: "citationTooltips" },
					},
					{
						name: t.SETTING_TOOLTIP_DELAY_NAME,
						desc: t.SETTING_TOOLTIP_DELAY_DESC,
						visible: () => this.plugin.settings.citationTooltips,
						control: {
							type: "slider",
							key: "citationTooltipDelay",
							min: MIN_TOOLTIP_DELAY,
							max: MAX_TOOLTIP_DELAY,
							step: TOOLTIP_DELAY_STEP,
							defaultValue: DEFAULT_TOOLTIP_DELAY,
							displayFormat: (value: number) =>
								tooltipDelayFormat.format(value),
						},
					},
					{
						name: t.SETTING_MARK_MISSING_NAME,
						desc: t.SETTING_MARK_MISSING_DESC,
						control: { type: "toggle", key: "markMissingKeys" },
					},
					{
						name: t.SETTING_BRACKETS_NAME,
						desc: t.SETTING_BRACKETS_DESC,
						control: { type: "toggle", key: "brackets" },
					},
					{
						name: t.SETTING_SUGGEST_NAME,
						desc: t.SETTING_SUGGEST_DESC,
						control: { type: "toggle", key: "citationSuggestions" },
					},
				],
			},
			{
				type: "group",
				cls: "citation-suite-settings-rows",
				heading: t.SECTION_FOOTNOTES,
				items: [
					{
						name: t.SETTING_FOOTNOTES_NAME,
						desc: t.SETTING_FOOTNOTES_DESC,
						control: { type: "toggle", key: "footnotes" },
					},
					{
						name: t.SETTING_FOOTNOTE_PLACEMENT_NAME,
						desc: t.SETTING_FOOTNOTE_PLACEMENT_DESC,
						control: {
							type: "dropdown",
							key: "footnotePlacement",
							options: PLACEMENT_OPTIONS,
						},
					},
					{
						name: t.SETTING_FOOTNOTE_NUMBERING_NAME,
						desc: t.SETTING_FOOTNOTE_NUMBERING_DESC,
						control: {
							type: "dropdown",
							key: "footnoteNumbering",
							options: NUMBERING_OPTIONS,
						},
					},
					this.labelTextSetting(
						"footnotePrefix",
						t.SETTING_FOOTNOTE_PREFIX_NAME,
						t.SETTING_FOOTNOTE_PREFIX_DESC
					),
					this.labelTextSetting(
						"footnoteSuffix",
						t.SETTING_FOOTNOTE_SUFFIX_NAME,
						t.SETTING_FOOTNOTE_SUFFIX_DESC
					),
					{
						name: t.SETTING_FOOTNOTE_KEEP_NAMED_NAME,
						desc: t.SETTING_FOOTNOTE_KEEP_NAMED_DESC,
						control: { type: "toggle", key: "footnoteKeepNamed" },
					},
					{
						name: t.SETTING_FOOTNOTE_POPOVER_NAME,
						desc: t.SETTING_FOOTNOTE_POPOVER_DESC,
						control: { type: "toggle", key: "footnotePopover" },
					},
					{
						name: t.SETTING_FOOTNOTE_CURSOR_NAME,
						desc: t.SETTING_FOOTNOTE_CURSOR_DESC,
						visible: () => !this.plugin.settings.footnotePopover,
						control: { type: "toggle", key: "footnoteCursorToText" },
					},
					this.resetNoteFootnotesSetting(),
				],
			},
			{
				type: "group",
				cls: "citation-suite-settings-rows",
				heading: t.SECTION_CONNECTION,
				items: [
					this.portSetting(),
					{
						name: t.SETTING_MINIMIZE_NAME,
						desc: t.SETTING_MINIMIZE_DESC,
						control: { type: "toggle", key: "minimizeZotero" },
					},
				],
			},
		];
	}
}
