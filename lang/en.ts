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
	SETTING_STYLE_NAME: "Show citations in style",
	SETTING_STYLE_DESC:
		"The note always keeps the pandoc citation, and that is what pandoc sees when the document is built. Choose one of the styles installed in Zotero and reading view and live preview will draw the citation as that style writes it instead. The note itself is unchanged: put the cursor inside one to see it as it is.",
	SETTING_STYLE_PANDOC: "Leave as written",
	SETTING_BRACKETS_NAME: "Wrap citations in brackets",
	SETTING_BRACKETS_DESC:
		"A citation is inserted as [@doe2020, p. 33], which is how pandoc reads a citation in parentheses. Turn this off to insert the same citation without its brackets.",

	SECTION_FOOTNOTES: "Footnotes",
	SETTING_FOOTNOTES_NAME: "Put citations in footnotes",
	SETTING_FOOTNOTES_DESC:
		"A footnote anchor is placed at the cursor, and the citation itself becomes the footnote's text. Inside an existing footnote the citation is inserted as usual, since a footnote cannot hold another.",
	SETTING_FOOTNOTE_PLACEMENT_NAME: "Where the footnote text goes",
	SETTING_FOOTNOTE_PLACEMENT_DESC:
		"To pandoc and Obsidian the place makes no difference: footnotes are numbered in the order their anchors appear. It only matters for how the note reads in source mode.",
	FOOTNOTE_PLACEMENT_PARAGRAPH: "After the current paragraph",
	FOOTNOTE_PLACEMENT_SECTION: "At the end of the current section",
	FOOTNOTE_PLACEMENT_DOCUMENT: "At the end of the note",
	SETTING_FOOTNOTE_NUMBERING_NAME: "Footnote numbering",
	SETTING_FOOTNOTE_NUMBERING_DESC:
		"Each new footnote gets a number one higher than the highest already in the note.",
	FOOTNOTE_NUMBERING_ARABIC: "Arabic numerals",
	FOOTNOTE_NUMBERING_ROMAN_LOWER: "Lowercase roman numerals",
	FOOTNOTE_NUMBERING_ROMAN_UPPER: "Uppercase roman numerals",
	SETTING_FOOTNOTE_PREFIX_NAME: "Text before the number",
	SETTING_FOOTNOTE_PREFIX_DESC:
		"Added to the footnote label before the number: for example, n turns [^1] into [^n1].",
	SETTING_FOOTNOTE_SUFFIX_NAME: "Text after the number",
	SETTING_FOOTNOTE_SUFFIX_DESC:
		"Added to the footnote label after the number: for example, -cite turns [^1] into [^1-cite].",
	SETTING_FOOTNOTE_LABEL_INVALID:
		"A footnote label cannot hold spaces or the characters [ ] ^ \\ |.",

	SECTION_CONNECTION: "Connection to Zotero",
	SETTING_PORT_NAME: "Zotero port",
	SETTING_PORT_DESC:
		"The port Zotero's local server listens on. Use 24119 for the Zotero beta.",
	SETTING_PORT_INVALID: "Enter a port number between 1 and 65535.",
	SETTING_MINIMIZE_NAME: "Minimize Zotero after picking",
	SETTING_MINIMIZE_DESC:
		"Zotero's window is sent away as soon as the citation window closes, so focus lands back in Obsidian.",

	// ─── Style list ──────────────────────────────────────────────────────────
	STYLE_PICKER_EMPTY:
		"No Zotero styles were found: either Zotero's data directory is not on this computer, or there are no styles in it.",

	// ─── Preview ─────────────────────────────────────────────────────────────
	PREVIEW_TITLE: "Preview",
	// The modes are named as Obsidian itself names them.
	PREVIEW_MODE: "Preview mode",
	PREVIEW_MODE_READING: "Reading view",
	PREVIEW_MODE_SOURCE: "Source mode",
	PREVIEW_MODE_LIVE: "Live preview",
	// Followed by a space, a citation of Kuhn's "The Structure of Scientific
	// Revolutions" and a full stop, which is why it has no punctuation of its
	// own at the end. Nor does it name Kuhn: the citation does.
	PREVIEW_SENTENCE:
		"Normal science is interrupted by scientific revolutions, in which one paradigm replaces another",
	LOOK_COLOR: "Citation color",
	LOOK_COLOR_TEXT: "Body text color",
	LOOK_COLOR_ACCENT: "Accent color",
	LOOK_COLOR_CUSTOM: "Custom color…",
	LOOK_UNDERLINE: "Citation underline",
	LOOK_UNDERLINE_DOTTED: "Dotted underline",
	LOOK_UNDERLINE_SOLID: "Solid underline",
	LOOK_UNDERLINE_WAVY: "Squiggly underline",
	LOOK_UNDERLINE_NONE: "No underline",
	LOOK_EMPHASIS: "Citation emphasis",
	LOOK_BOLD: "Bold",
	LOOK_ITALIC: "Italic",

	// ─── Changelog ───────────────────────────────────────────────────────────
	// The version number is appended as a link right after this string, which
	// is why it ends in a space and carries no punctuation of its own.
	CHANGELOG_BANNER_PREFIX: "What's new in version ",
	CHANGELOG_BANNER_DISMISS: "Dismiss until the next update",
};
