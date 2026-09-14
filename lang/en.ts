// Translated from ru.ts, which is the original — every string here follows the
// Russian one. Change ru.ts first, then sync this file to it.
export default {
	// ─── Plugin ──────────────────────────────────────────────────────────────
	// Also in manifest.json, which the plugin browser reads and no translation
	// can reach. Change both together.
	PLUGIN_NAME: "Citation Suite settings",
	PLUGIN_DESCRIPTION: "Cite literature in Pandoc style from your Zotero library, view literature list in the sidebar, preview citations with citation styles, automate footnotes creation, and more.",

	// ─── Commands ────────────────────────────────────────────────────────────
	// The command IDs are not translated: they are persisted alongside the
	// hotkeys bound to them, and renaming one would break that binding.
	COMMAND_INSERT_CITATION: "Insert citation",
	COMMAND_INSERT_FOOTNOTE: "Insert footnote without a citation",
	COMMAND_RENUMBER_FOOTNOTES: "Renumber footnotes in order",
	COMMAND_NOTE_FOOTNOTE_SETTINGS: "Footnote settings for the current note",
	COMMAND_SHOW_BIBLIOGRAPHY: "Show bibliography",
	COMMAND_SHOW_CHANGELOG: "View changelog",
	COMMAND_OPEN_USER_GUIDE: "Open user guide",

	// ─── Notices ─────────────────────────────────────────────────────────────
	NOTICE_ZOTERO_UNREACHABLE: "Zotero is not answering. Check that it is running, that Better BibTeX is installed in it, and that the port in the settings matches its own.",
	NOTICE_ZOTERO_STARTING: "Better BibTeX is still starting up. Try again in a few seconds.",
	NOTICE_PICK_FAILED: "Zotero could not finish picking the source.",
	NOTICE_NOTHING_TO_CITE: "None of the picked items has a citation key, so there is nothing to insert.",
	NOTICE_ITEMS_WITHOUT_KEYS: "Some of the picked items have no citation key and were left out of the citation.",
	NOTICE_FOOTNOTE_IN_FOOTNOTE: "The cursor is in a footnote's text, and a footnote cannot hold a footnote.",
	NOTICE_NO_FOOTNOTES: "This note has no footnotes.",
	NOTICE_FOOTNOTES_IN_ORDER: "The footnotes are already numbered in order.",
	NOTICE_FOOTNOTES_RENUMBERED: "Footnotes renumbered in order.",
	NOTICE_NOTE_FOOTNOTES_RESET: "The footnote settings of every note were reset to the general settings.",

	// ─── Settings ────────────────────────────────────────────────────────────
	SECTION_CITATION: "Citation format",
	SETTING_STYLE_NAME: "Choose a citation display style",
	SETTING_STYLE_DESC: "Citations stay in Pandoc format, but for easier reading you can choose a citation style from your Zotero library to preview them in. The preview does not affect how the note is exported.",
	SETTING_STYLE_PANDOC: "Do not style the preview",
	SETTING_TOOLTIPS_NAME: "Show the source's bibliography entry on hover",
	SETTING_TOOLTIPS_DESC: "Hovering over a citation will show its formatted bibliography entry.",
	SETTING_TOOLTIP_DELAY_NAME: "Tooltip delay",
	SETTING_TOOLTIP_DELAY_DESC: "Adjust how soon the source's bibliography entry appears in the tooltip.",
	SETTING_NOTE_STYLE_NAME: "Style the citation preview in the style and language from the note's properties",
	SETTING_NOTE_STYLE_DESC: "When the csl, citation-style or lang properties are filled in, the preview will be styled according to them.",
	SETTING_MARK_MISSING_NAME: "Mark citation keys Zotero does not have",
	SETTING_MARK_MISSING_DESC: "The key of a source not found in your Zotero library will be underlined with a wavy line.",
	SETTING_BRACKETS_NAME: "Put citations in square brackets",
	SETTING_BRACKETS_DESC: "Citations are inserted as [@doe2020, p. 33] for a correct export with Pandoc.",
	SETTING_SUGGEST_NAME: "Offer autocomplete while a citation key is typed",
	SETTING_SUGGEST_DESC: "Typing the at sign opens a list of sources, filtered by various fields, that lets you pick a source without opening Zotero's citation window.",

	SECTION_FOOTNOTES: "Footnotes",
	SETTING_FOOTNOTES_NAME: "Automatically put citations in footnotes",
	SETTING_FOOTNOTES_DESC: "A footnote anchor appears at the cursor, and the citation goes into the footnote's body. Inside an existing footnote the citation is inserted as usual.",
	SETTING_FOOTNOTE_PLACEMENT_NAME: "Where the footnote text appears",
	SETTING_FOOTNOTE_PLACEMENT_DESC: "Where the footnote text goes makes no difference to Pandoc and Obsidian, so choose whichever suits you.",
	FOOTNOTE_PLACEMENT_PARAGRAPH: "After the current paragraph",
	FOOTNOTE_PLACEMENT_SECTION: "At the end of the current section",
	FOOTNOTE_PLACEMENT_DOCUMENT: "At the end of the note",
	SETTING_FOOTNOTE_NUMBERING_NAME: "Footnote numbering",
	SETTING_FOOTNOTE_NUMBERING_DESC: "Choose the automatic numbering that suits you.",
	FOOTNOTE_NUMBERING_ARABIC: "Arabic numerals",
	FOOTNOTE_NUMBERING_ROMAN_LOWER: "Lowercase roman numerals",
	FOOTNOTE_NUMBERING_ROMAN_UPPER: "Uppercase roman numerals",
	SETTING_FOOTNOTE_PREFIX_NAME: "Text before the footnote number",
	SETTING_FOOTNOTE_PREFIX_DESC: "Added to the footnote label before the number: for example, n turns [^1] into [^n1].",
	SETTING_FOOTNOTE_SUFFIX_NAME: "Text after the footnote number",
	SETTING_FOOTNOTE_SUFFIX_DESC: "Added to the footnote label after the number: for example, -cite turns [^1] into [^1-cite].",
	SETTING_FOOTNOTE_KEEP_NAMED_NAME: "Do not edit named footnotes when renumbering",
	SETTING_FOOTNOTE_KEEP_NAMED_DESC: "The command that fixes footnote numbering will not edit named footnotes. For example, the footnote [^kuhn] will be left as it is.",
	SETTING_FOOTNOTE_POPOVER_NAME: "Open the new footnote's text in a popup",
	SETTING_FOOTNOTE_POPOVER_DESC: "You can fill in the footnote's text in a popup next to its anchor, without scrolling to the footnote's body.",
	SETTING_FOOTNOTE_CURSOR_NAME: "Move the cursor to the footnote text once the citation is inserted",
	SETTING_FOOTNOTE_CURSOR_DESC: "The cursor will be placed at the end of the footnote's body, so you can keep typing right after the citation. When turned off, the cursor stays after the footnote anchor.",
	SETTING_NOTE_FOOTNOTES_RESET_NAME: "Reset the individual footnote settings of every note",
	SETTING_NOTE_FOOTNOTES_RESET_DESC: "After the reset, every note with individual footnote settings will use the global settings again.",
	SETTING_NOTE_FOOTNOTES_RESET_BUTTON: "Reset",
	SETTING_FOOTNOTE_LABEL_INVALID: "Error: a footnote label cannot hold spaces or the characters [ ] ^ \\ |.",

	SECTION_CONNECTION: "Connection to Zotero",
	SETTING_PORT_NAME: "Zotero port",
	SETTING_PORT_DESC: "The port Zotero's local server runs on.",
	SETTING_PORT_INVALID: "Error: enter a port number between 1 and 65535.",
	// As the same button reads in Obsidian's own settings.
	SETTING_PORT_RESET: "Restore default",
	SETTING_MINIMIZE_NAME: "Minimize Zotero after picking a source",
	SETTING_MINIMIZE_DESC: "Zotero's window is minimized once a source is picked, and focus returns to Obsidian.",

	// ─── Citations in a note ─────────────────────────────────────────────────
	CITATION_KEY_MISSING: "Zotero has no source with this citation key",
	// The hints under the list of sources offered while a key is typed.
	SUGGEST_NAVIGATE: "Move through the list",
	SUGGEST_INSERT: "Insert the key",
	SUGGEST_DISMISS: "Close",

	// ─── Note footnote settings ──────────────────────────────────────────────
	NOTE_FOOTNOTES_TITLE: "Footnote settings for this note",
	// The note's name goes between them, which is why the quotation marks are
	// in the strings themselves and the first has no punctuation at its end.
	NOTE_FOOTNOTES_DESC_BEFORE: "These settings apply only to the note “",
	NOTE_FOOTNOTES_DESC_AFTER: "”, and footnotes in other notes are created by the plugin's general settings.",
	NOTE_FOOTNOTES_RESET: "Reset to general settings",
	NOTE_FOOTNOTES_RESET_ALL_TITLE: "Reset the footnote settings of every note?",
	NOTE_FOOTNOTES_RESET_ALL_TEXT: "The footnote settings set for single notes will be removed, and every note will use the plugin's general settings. This cannot be undone.",
	// Followed by the number of notes.
	NOTE_FOOTNOTES_RESET_ALL_COUNT: "Notes with footnote settings of their own:",
	CONFIRM_CANCEL: "Cancel",

	// ─── Style list ──────────────────────────────────────────────────────────
	STYLE_PICKER_EMPTY: "No Zotero styles were found: Zotero's data folder is either empty or could not be found.",

	// ─── Preview ─────────────────────────────────────────────────────────────
	PREVIEW_TITLE: "Citation preview",
	// The modes are named as Obsidian itself names them.
	PREVIEW_MODE: "Preview mode",
	PREVIEW_MODE_READING: "Reading view",
	PREVIEW_MODE_SOURCE: "Source mode",
	PREVIEW_MODE_LIVE: "Live preview",
	// Followed by a space, a citation of Kuhn's "The Structure of Scientific
	// Revolutions" and a full stop, which is why it has no punctuation of its
	// own at the end. Nor does it name Kuhn: the citation does.
	PREVIEW_SENTENCE: "Normal science is interrupted by scientific revolutions, in which one paradigm replaces another",
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

	// ─── Bibliography ────────────────────────────────────────────────────────
	BIBLIOGRAPHY_TITLE: "Bibliography",
	BIBLIOGRAPHY_HEADING: "Bibliography",
	// Followed by the number of entries in the list.
	BIBLIOGRAPHY_COUNT: "Sources in the note:",
	// Followed by "shown / total".
	BIBLIOGRAPHY_SHOWN: "Entries shown:",
	BIBLIOGRAPHY_SEARCH: "Search the bibliography",
	BIBLIOGRAPHY_SEARCH_PLACEHOLDER: "Author, title, year, key…",
	BIBLIOGRAPHY_NO_MATCHES: "Nothing in the list matches.",
	BIBLIOGRAPHY_COPY: "Copy bibliography",
	BIBLIOGRAPHY_COPIED: "Bibliography copied.",
	BIBLIOGRAPHY_COPY_FAILED: "Could not copy the bibliography.",
	BIBLIOGRAPHY_REFRESH: "Refresh bibliography",
	BIBLIOGRAPHY_NO_NOTE: "Open a note to see the sources cited in it.",
	BIBLIOGRAPHY_NO_STYLE: "Choose a preview style in the Citation Suite settings to see the note's bibliography written in that style.",
	BIBLIOGRAPHY_NO_CITATIONS: "This note cites no sources.",
	BIBLIOGRAPHY_STYLE_FAILED: "Could not load the chosen preview style.",
	BIBLIOGRAPHY_NONE_IN_STYLE: "The chosen preview style writes no bibliography.",
	// The style's title and the language, the style file, or the language follows.
	BIBLIOGRAPHY_NOTE_STYLE: "Style and language from the note's properties:",
	BIBLIOGRAPHY_CSL_NOT_FOUND: "The style in the csl property was not found, so the style from the settings is used:",
	BIBLIOGRAPHY_LOCALE_NOT_CARRIED: "The preview does not support this language, so citations are styled in the default language:",
	BIBLIOGRAPHY_MISSING: "Sources not found in Zotero",
	BIBLIOGRAPHY_MISSING_DESC: "Better BibTeX has no items for these citation keys. If you have already added the sources to Zotero, refresh the bibliography.",
	BIBLIOGRAPHY_UNREACHABLE: "Zotero is not responding",
	BIBLIOGRAPHY_UNREACHABLE_DESC: "Could not get the note's sources. Make sure Zotero is running, Better BibTeX is installed in it and the port in the settings matches its own. The bibliography will update as soon as Zotero responds.",
	// The menu of an entry in the list.
	BIBLIOGRAPHY_OPEN_NOTE: "Open literature note",
	BIBLIOGRAPHY_OPEN_PDF: "Open PDF",
	BIBLIOGRAPHY_OPEN_PDF_NONE: "This source has no PDF attached in Zotero.",
	BIBLIOGRAPHY_REVEAL: "Reveal in Zotero",
	BIBLIOGRAPHY_REVEAL_NOT_FOUND: "Zotero no longer has this source.",
	BIBLIOGRAPHY_COPY_ENTRY: "Copy entry",
	BIBLIOGRAPHY_ENTRY_COPIED: "Entry copied.",
	BIBLIOGRAPHY_ENTRY_COPY_FAILED: "Could not copy the entry.",
	BIBLIOGRAPHY_FIND: "Find in note",
	BIBLIOGRAPHY_FIND_NONE: "The note no longer cites this source.",
	// Followed by "number / total".
	BIBLIOGRAPHY_MENTION: "Mention",
	BIBLIOGRAPHY_MENTION_PREVIOUS: "Previous mention",
	BIBLIOGRAPHY_MENTION_NEXT: "Next mention",
	BIBLIOGRAPHY_MENTION_CLOSE: "Close",

	// ─── Status ──────────────────────────────────────────────────────────────
	STATUS_TITLE: "Zotero:",
	STATUS_CHECKING: "Checking…",
	STATUS_ZOTERO_RUNNING: "Running",
	STATUS_ZOTERO_NOT_RUNNING: "Not responding…",
	STATUS_RECHECK: "Check again",
	STATUS_BETTER_BIBTEX_MISSING: "Better BibTeX is not installed in Zotero: without it the plugin cannot open the citation window or format citations.",
	STATUS_BETTER_BIBTEX_INSTALL: "How to install it",
	STATUS_CHANGELOG: "Changelog",
	STATUS_USER_GUIDE: "User guide",

	// ─── Changelog ───────────────────────────────────────────────────────────
	// The version number is appended as a link right after this string, which
	// is why it ends in a space and carries no punctuation of its own.
	CHANGELOG_BANNER_PREFIX: "What's new in version ",
	CHANGELOG_BANNER_DISMISS: "Dismiss until the next update",
};
