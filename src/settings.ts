import {
	App,
	PluginSettingTab,
	Setting,
	SettingDefinitionItem,
	SettingDefinitionRender,
	setIcon,
} from "obsidian";
import { getChangelogContent, t } from "lang/helpers";
import ZoterikPlugin from "src/main";
import { ChangelogModal } from "src/changelogModal";
import { asIndexable } from "src/types";

const MIN_PORT = 1;
const MAX_PORT = 65535;

/**
 * The settings tab, declared through Obsidian 1.13's `getSettingDefinitions()`.
 * `display()` is gone: a non-empty array of definitions renders the tab instead
 * of it, and `minAppVersion` is 1.13.0, so there is no version left that would
 * reach it.
 *
 * Every setting here is a control the API already describes — two toggles and a
 * number — so each one is declared as a `control` and the framework draws it,
 * indexes it for the settings search, and asks this tab to store the new value.
 * `render` is used for the changelog banner alone, which is not a setting.
 */
export class ZoterikSettingTab extends PluginSettingTab {
	plugin: ZoterikPlugin;

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
