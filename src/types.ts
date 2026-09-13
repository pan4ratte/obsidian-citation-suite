import { FootnoteNumbering, FootnotePlacement } from "src/footnote";

/**
 * One picked citation, as Better BibTeX's CAYW endpoint reports it.
 *
 * The shape is BBT's own (`content/cayw.ts`, `citationItems()`): every field is
 * always present, `locator`/`prefix`/`suffix`/`label` as empty strings when the
 * picker's fields were left blank. `label` is filled in as `"page"` whenever a
 * locator was typed without a label of its own, so a locator practically always
 * arrives labelled — except through `selected=true`, which picks items straight
 * out of Zotero's pane and has no locator to label.
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

/**
 * One citation style Zotero has installed, as its CSL file declares itself.
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
}

/**
 * Which of a note's views the settings preview shows the sample in: reading
 * view, source mode, or live preview.
 */
export type PreviewMode = "reading" | "source" | "live";

/** How a rendered citation is underlined in a note. */
export type CitationUnderline = "dotted" | "solid" | "wavy" | "none";

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
	 * The `id` of the style Zotero renders the citation in, or the empty string
	 * — the default — for a pandoc citation written by the plugin itself.
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
	/** Minimize Zotero's window once the pick is done, handing focus back. */
	minimizeZotero: boolean;
	/** The version whose changelog banner has been dismissed. Never drawn as a setting. */
	dismissedChangelogVersion: string;
	/**
	 * Whether the bibliography pane has been put in the sidebar once already,
	 * after which the workspace layout keeps it. Never drawn as a setting.
	 */
	bibliographyPaneOpened: boolean;
}

export const DEFAULT_SETTINGS: CitationSuiteSettings = {
	port: 23119,
	brackets: true,
	citationStyle: "",
	citationColor: "accent",
	citationUnderline: "dotted",
	citationBold: false,
	citationItalic: false,
	// The view a note is written in, which is where most citations are read.
	previewMode: "live",
	footnotes: false,
	// Where Obsidian's own "Insert footnote" command puts it.
	footnotePlacement: "document",
	footnoteNumbering: "arabic",
	footnotePrefix: "",
	footnoteSuffix: "",
	footnoteKeepNamed: false,
	minimizeZotero: false,
	dismissedChangelogVersion: "",
	bibliographyPaneOpened: false,
};

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
