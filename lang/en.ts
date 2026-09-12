// Translated from ru.ts, which is the original — every string here follows the
// Russian one. Change ru.ts first, then sync this file to it.
export default {
	// ─── Plugin ──────────────────────────────────────────────────────────────
	// Also in manifest.json, which the plugin browser reads and no translation
	// can reach. Change both together.
	PLUGIN_NAME: "Zoterik settings",
	PLUGIN_DESCRIPTION:
		"Cite your Zotero library from a note: a hotkey opens Zotero's citation window, and the pick is inserted as a pandoc citation.",

	// ─── Commands ────────────────────────────────────────────────────────────
	// The command IDs are not translated: they are persisted alongside the
	// hotkeys bound to them, and renaming one would break that binding.
	COMMAND_INSERT_CITATION: "Insert citation",
	COMMAND_INSERT_SELECTED_CITATION:
		"Insert a citation for the items selected in Zotero",
	COMMAND_SHOW_CHANGELOG: "View changelog",

	// ─── Notices ─────────────────────────────────────────────────────────────
	NOTICE_ZOTERO_UNREACHABLE:
		"Zotero is not answering. Check that it is running, that Better BibTeX is installed in it, and that the port in the settings matches its own.",
	NOTICE_ZOTERO_STARTING:
		"Better BibTeX is still starting up. Try again in a few seconds.",
	NOTICE_PICK_FAILED: "Zotero could not finish picking the source.",
	NOTICE_NOTHING_TO_CITE:
		"None of the picked items has a citation key, so there is nothing to insert.",
	NOTICE_ITEMS_WITHOUT_KEYS:
		"Some of the picked items have no citation key and were left out of the citation.",

	// ─── Settings ────────────────────────────────────────────────────────────
	SECTION_CITATION: "Citation format",
	SETTING_BRACKETS_NAME: "Wrap citations in brackets",
	SETTING_BRACKETS_DESC:
		"A citation is inserted as [@doe2020, p. 33], which is how pandoc reads a citation in parentheses. Turn this off to insert the same citation without its brackets.",

	SECTION_CONNECTION: "Connection to Zotero",
	SETTING_PORT_NAME: "Zotero port",
	SETTING_PORT_DESC:
		"The port Zotero's local server listens on. Use 24119 for the Zotero beta.",
	SETTING_PORT_INVALID: "Enter a port number between 1 and 65535.",
	SETTING_MINIMIZE_NAME: "Minimize Zotero after picking",
	SETTING_MINIMIZE_DESC:
		"Zotero's window is sent away as soon as the citation window closes, so focus lands back in Obsidian.",

	// ─── Changelog ───────────────────────────────────────────────────────────
	// The version number is appended as a link right after this string, which
	// is why it ends in a space and carries no punctuation of its own.
	CHANGELOG_BANNER_PREFIX: "What's new in version ",
	CHANGELOG_BANNER_DISMISS: "Dismiss until the next update",
};
