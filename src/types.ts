import { FootnoteNumbering, FootnotePlacement } from "src/footnote";

/**
 * One picked citation, as Better BibTeX's CAYW endpoint reports it.
 *
 * The shape is BBT's own (`content/cayw.ts`, `citationItems()`): every field is
 * always present, `locator`/`prefix`/`suffix`/`label` as empty strings when the
 * picker's fields were left blank. `label` is filled in as `"page"` whenever a
 * locator was typed without a label of its own, so a locator practically always
 * arrives labelled.
 *
 * `itemType`, `title` and `note` are only there for standalone notes, which the
 * picker can return and which carry no citation key.
 */
export interface Citation {
	/** Zotero's numeric item id. */
	id: number;
	citationKey: string;
	locator: string;
	/** CSL locator label — `page`, `chapter`, `section`, … */
	label: string;
	prefix: string;
	suffix: string;
	suppressAuthor: boolean;
	uri?: string;
	itemType?: string;
	title?: string;
	note?: string;
}

/** Where a style's file is: Zotero's styles folder, or the vault itself. */
export type StyleSource = "zotero" | "vault";

/**
 * One citation style, as its CSL file declares itself: one Zotero has
 * installed, or one kept in the vault — which is the only kind a phone has.
 */
export interface CitationStyle {
	/**
	 * What Zotero is asked for the style by: a `zotero.org/styles/…` URL for a
	 * style Zotero distributes, a bare UUID for one written by hand.
	 */
	id: string;
	/** The style's own name, as Zotero's settings list it. */
	title: string;
	/** The CSL file it was read from, for citeproc to be given the whole of. */
	path: string;
	/**
	 * Which file system `path` is in: Zotero's data folder, read with Node, or
	 * the vault, read through Obsidian. A style is read by whichever of the two
	 * it came from, and only the vault's can be read on a phone.
	 */
	source: StyleSource;
}

/**
 * Which of a note's views the settings preview shows the sample in: reading
 * view, source mode, or live preview.
 */
export type PreviewMode = "reading" | "source" | "live";

/** How a rendered citation is underlined in a note. */
export type CitationUnderline = "dotted" | "solid" | "wavy" | "none";

/**
 * How long a citation is hovered before its tooltip shows, unless set
 * otherwise: Obsidian's own delay for every tooltip, as 1.13.7 has it.
 */
export const DEFAULT_TOOLTIP_DELAY = 1000;

export interface CitationSuiteSettings {
	/**
	 * The port Zotero's local HTTP server listens on. 23119 for Zotero, 24119
	 * for the beta, which runs its server one port up so that both can be open
	 * at once.
	 */
	port: number;
	/** Wrap a parenthetical citation in `[ ]`, which is what pandoc reads as one. */
	brackets: boolean;
	/**
	 * The style the citation is rendered in, as the settings write it down:
	 * the `id` of one Zotero has, `vault:` and its path for one of the vault's,
	 * or the empty string — the default — for a pandoc citation written by the
	 * plugin itself. `styleChoice` in `src/styles.ts` writes it, `chosenStyle`
	 * reads it, and it says which file was chosen where an id alone would not.
	 */
	citationStyle: string;
	/**
	 * The colour a rendered citation and its underline are set in: `accent` —
	 * the default — for the theme's accent, the empty string for the colour of
	 * body text, or a `#rrggbb` of the reader's own choosing.
	 */
	citationColor: string;
	/** The line under a rendered citation, which is what marks it as one. */
	citationUnderline: CitationUnderline;
	/** Set a rendered citation in bold. */
	citationBold: boolean;
	/** Set a rendered citation in italics. */
	citationItalic: boolean;
	/** Show the bibliography entry of a rendered citation's sources on hover. */
	citationTooltips: boolean;
	/** How long, in milliseconds, a citation is hovered before its tooltip shows. */
	citationTooltipDelay: number;
	/**
	 * The library file a note's sources are read from when it names none of its
	 * own: a `.bib` or a CSL JSON export, by its path in the vault. Empty — the
	 * default — for Zotero, which is where they come from on the desktop.
	 */
	libraryFile: string;
	/**
	 * Mark a citation key Zotero has no source for, in every view of a note,
	 * whether or not a style is chosen.
	 */
	markMissingKeys: boolean;
	/** Offer sources while a citation key is typed after `@`. */
	citationSuggestions: boolean;
	/** The view the settings preview shows the sample in. */
	previewMode: PreviewMode;
	/**
	 * Put a citation into a footnote: its anchor at the cursor, and the
	 * citation itself as the footnote's text.
	 */
	footnotes: boolean;
	/** Where the footnote's text goes: after the paragraph, the section or the note. */
	footnotePlacement: FootnotePlacement;
	/** How the number in a footnote's label is written. */
	footnoteNumbering: FootnoteNumbering;
	/** Text before the number in a footnote's label: the `n` of `[^n1]`. */
	footnotePrefix: string;
	/** Text after the number in a footnote's label. */
	footnoteSuffix: string;
	/** Leave named footnotes, such as `[^kuhn]`, as they are when renumbering. */
	footnoteKeepNamed: boolean;
	/**
	 * Write an empty footnote's text in Obsidian's footnote popover, rather
	 * than in the note where the text stands.
	 */
	footnotePopover: boolean;
	/**
	 * Without the popover, put the cursor at the end of a citation's footnote
	 * text in the note, rather than leaving it after the anchor. An empty
	 * footnote's text takes the cursor whatever this says.
	 */
	footnoteCursorToText: boolean;
	/**
	 * The footnote settings a note has of its own, by the note's path: only the
	 * fields set for it, the rest following the settings above. See
	 * `src/noteFootnotes.ts`.
	 */
	noteFootnotes: NoteFootnoteOverrides;
	/** Minimize Zotero's window once the pick is done, handing focus back. */
	minimizeZotero: boolean;
	/** The version whose changelog banner has been dismissed. Never drawn as a setting. */
	dismissedChangelogVersion: string;
}

export const DEFAULT_SETTINGS: CitationSuiteSettings = {
	port: 23119,
	brackets: true,
	citationStyle: "",
	citationColor: "accent",
	citationUnderline: "dotted",
	citationBold: false,
	citationItalic: false,
	citationTooltips: true,
	citationTooltipDelay: DEFAULT_TOOLTIP_DELAY,
	// Zotero, until the reader names a file: it is what the plugin was for.
	libraryFile: "",
	markMissingKeys: true,
	citationSuggestions: true,
	// The view a note is written in, which is where most citations are read.
	previewMode: "live",
	footnotes: false,
	// Where Obsidian's own "Insert footnote" command puts it.
	footnotePlacement: "document",
	footnoteNumbering: "arabic",
	footnotePrefix: "",
	footnoteSuffix: "",
	footnoteKeepNamed: false,
	// What Obsidian's own "Insert footnote" command does.
	footnotePopover: true,
	footnoteCursorToText: true,
	noteFootnotes: {},
	minimizeZotero: false,
	dismissedChangelogVersion: "",
};

/**
 * The footnote settings a note can have of its own, which are the ones that say
 * what a new footnote looks like and whether a citation goes into one. How the
 * text is opened, and what renumbering leaves alone, are the reader's habits
 * rather than a note's, and stay in the settings alone.
 */
export const NOTE_FOOTNOTE_KEYS = [
	"footnotes",
	"footnotePlacement",
	"footnoteNumbering",
	"footnotePrefix",
	"footnoteSuffix",
] as const;

export type NoteFootnoteKey = (typeof NOTE_FOOTNOTE_KEYS)[number];

/** One note's footnote settings, in full. */
export type NoteFootnoteSettings = Pick<CitationSuiteSettings, NoteFootnoteKey>;

/** What notes set for themselves, by path: each only the fields it set. */
export type NoteFootnoteOverrides = Record<
	string,
	Partial<NoteFootnoteSettings>
>;

/**
 * The settings object, read by the key a setting definition names. The
 * declarative settings API addresses a field by string, and this is the one
 * place that view of the object is taken.
 */
export function asIndexable(
	settings: CitationSuiteSettings
): Record<string, unknown> {
	return settings as unknown as Record<string, unknown>;
}
