import {
	App,
	PluginSettingTab,
	Setting,
	SettingDefinitionControl,
	SettingDefinitionItem,
	SettingDefinitionRender,
	setIcon,
} from "obsidian";
import { getChangelogContent, t } from "lang/helpers";
import ZoterikPlugin from "src/main";
import { ChangelogModal } from "src/changelogModal";
import {
	FootnoteNumbering,
	FootnotePlacement,
	isValidLabelText,
} from "src/footnote";
import { renderStylePreview, StylePreview } from "src/preview";
import { renderStylePicker, StyleChoice } from "src/stylePicker";
import { asIndexable } from "src/types";

const MIN_PORT = 1;
const MAX_PORT = 65535;

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
]);

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
export class ZoterikSettingTab extends PluginSettingTab {
	plugin: ZoterikPlugin;
	/** The preview under the style list, while the tab is drawn. */
	private preview: StylePreview | null = null;

	constructor(app: App, plugin: ZoterikPlugin) {
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
		if (key === "citationStyle" || key === "port") {
			// Both change what the citations already on screen should look
			// like, and neither redraws them on its own.
			await this.plugin.restyle();
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
				setting.settingEl.addClass("zoterik-style-setting");
				setting.settingEl
					.querySelectorAll(
						":scope > .zoterik-style-picker, :scope > .zoterik-style-preview"
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
	private changelogBanner(): SettingDefinitionRender {
		return {
			name: t.PLUGIN_NAME,
			desc: t.PLUGIN_DESCRIPTION,
			searchable: false,
			render: (setting: Setting) => {
				// The anchor idiom the sibling plugins use: the row is a host
				// for the plugin's own DOM rather than a setting, and
				// styles.css blanks the chrome 1.13 gives it.
				setting.settingEl.addClass("zoterik-settings-anchor");
				const root =
					setting.settingEl.querySelector<HTMLElement>(
						":scope > .zoterik-settings-root"
					) ?? setting.settingEl.createDiv("zoterik-settings-root");
				root.empty();
				this.renderHeader(root);
			},
		};
	}

	/**
	 * The tab's own header: the plugin's name and what it does, with the
	 * changelog banner under them. It is drawn rather than left to the row's
	 * stock label so that the name reads as a heading and the banner has the
	 * full width of the tab to stand across.
	 */
	private renderHeader(root: HTMLElement): void {
		const header = root.createDiv({ cls: "zoterik-settings-header" });
		header.createDiv({
			cls: "zoterik-settings-title",
			text: t.PLUGIN_NAME,
		});
		header.createDiv({
			cls: "zoterik-settings-description",
			text: t.PLUGIN_DESCRIPTION,
		});
		this.renderChangelogBanner(root);
	}

	private renderChangelogBanner(root: HTMLElement): void {
		const currentVersion = this.plugin.manifest.version;
		if (this.plugin.settings.dismissedChangelogVersion === currentVersion) {
			return;
		}

		const banner = root.createDiv({ cls: "zoterik-changelog-banner" });
		const text = banner.createSpan({ cls: "zoterik-changelog-banner-text" });
		text.appendText(t.CHANGELOG_BANNER_PREFIX);
		// A button rather than a link: it opens a modal, it does not go
		// anywhere.
		const versionButton = text.createEl("button", {
			text: currentVersion,
			cls: "zoterik-changelog-version",
		});
		versionButton.addEventListener("click", () => {
			new ChangelogModal(this.app, getChangelogContent()).open();
		});

		const closeButton = banner.createEl("button", {
			cls: "clickable-icon zoterik-changelog-close",
			attr: { "aria-label": t.CHANGELOG_BANNER_DISMISS },
		});
		setIcon(closeButton, "x");
		closeButton.addEventListener("click", () => {
			this.plugin.settings.dismissedChangelogVersion = currentVersion;
			void this.plugin.saveSettings();
			banner.remove();
		});
	}

	getSettingDefinitions(): SettingDefinitionItem[] {
		return [
			// The header stands in a group of its own whose card styles.css
			// blanks: it brings its own look, and putting it inside the first
			// section's card would make the plugin's name read as a setting of
			// that section.
			{
				type: "group",
				cls: "zoterik-settings-group",
				items: [this.changelogBanner()],
			},
			// Every setting below is a control 1.13 draws itself, so these
			// groups keep the card Obsidian gives them. `zoterik-settings-rows`
			// is what styles.css corrects the row layout through — see the
			// note on it there.
			{
				type: "group",
				cls: "zoterik-settings-rows",
				heading: t.SECTION_CITATION,
				items: [
					this.styleSetting(),
					{
						name: t.SETTING_BRACKETS_NAME,
						desc: t.SETTING_BRACKETS_DESC,
						control: { type: "toggle", key: "brackets" },
					},
				],
			},
			{
				type: "group",
				cls: "zoterik-settings-rows",
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
				cls: "zoterik-settings-rows",
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
