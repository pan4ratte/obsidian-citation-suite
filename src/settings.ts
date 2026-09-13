import {
	App,
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
import { renderStatusCard, StatusCard } from "src/statusCard";
import { asIndexable, DEFAULT_TOOLTIP_DELAY } from "src/types";

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
const PLACEMENT_OPTIONS: Record<FootnotePlacement, string> = {
	paragraph: t.FOOTNOTE_PLACEMENT_PARAGRAPH,
	section: t.FOOTNOTE_PLACEMENT_SECTION,
	document: t.FOOTNOTE_PLACEMENT_DOCUMENT,
};

/** What the numbering dropdown offers, in the order it offers it. */
const NUMBERING_OPTIONS: Record<FootnoteNumbering, string> = {
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

/** The settings that change the tooltip on the citations already drawn. */
const TOOLTIP_KEYS = new Set(["citationTooltips", "citationTooltipDelay"]);

/**
 * The settings tab, declared through Obsidian 1.13's `getSettingDefinitions()`.
 * `display()` is gone: a non-empty array of definitions renders the tab instead
 * of it, and `minAppVersion` is 1.13.0, so there is no version left that would
 * reach it.
 *
 * Every setting but one is a control the API already describes — toggles,
 * dropdowns, text fields and a number — so each is declared as a `control` and
 * the framework draws it, indexes it for the settings search, and asks this tab
 * to store the new value. `render` is used for the changelog banner, which is
 * not a setting, and for the citation style, which is chosen from a list no
 * control type draws.
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
		if (key === "citationStyle" || key === "port") {
			// Both change what the citations already on screen should look
			// like, and neither redraws them on its own.
			await this.plugin.restyle();
		}
		if (TOOLTIP_KEYS.has(key)) {
			this.plugin.redrawCitations();
		}
		if (key === "citationTooltips") {
			// The delay row is shown only while there is a tooltip to delay.
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
						name: t.SETTING_BRACKETS_NAME,
						desc: t.SETTING_BRACKETS_DESC,
						control: { type: "toggle", key: "brackets" },
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
				],
			},
			{
				type: "group",
				cls: "citation-suite-settings-rows",
				heading: t.SECTION_CONNECTION,
				items: [
					{
						name: t.SETTING_PORT_NAME,
						desc: t.SETTING_PORT_DESC,
						control: {
							type: "number",
							key: "port",
							min: MIN_PORT,
							max: MAX_PORT,
							step: 1,
							// A number input constrains the arrows, not what
							// can be typed into it, and a port that is out of
							// range fails as a connection refused rather than
							// as anything a reader could act on. So it is
							// refused here, with the range named.
							validate: (value: number) =>
								Number.isInteger(value) &&
								value >= MIN_PORT &&
								value <= MAX_PORT
									? undefined
									: t.SETTING_PORT_INVALID,
						},
					},
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
