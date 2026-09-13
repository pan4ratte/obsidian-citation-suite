// Official Obsidian CSS ruleset: the rules the community plugin review scanner
// runs over styles.css, on top of stylelint-config-standard.
/** @type {import("stylelint").Config} */
export default {
	extends: ["stylelint-config-obsidianmd"],
	rules: {
		// The preset checks browser support against Electron 43 (Obsidian
		// 1.13.4), but the review scanner reported against Obsidian 1.11.4,
		// which is Electron 39. The older target is checked here so that
		// nothing the scanner flags passes locally. The options restate the
		// preset's own, since a rule's options are replaced rather than merged.
		"plugin/no-unsupported-browser-features": [
			true,
			{
				severity: "warning",
				browsers: ["electron >= 39"],
				ignore: ["css-nesting", "css-cascade-layers"],
			},
		],
	},
};
