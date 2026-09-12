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

/** How a rendered citation is underlined in a note. */
export type CitationUnderline = "dotted" | "solid" | "wavy" | "none";

export interface ZoterikSettings {
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
	/** Minimize Zotero's window once the pick is done, handing focus back. */
	minimizeZotero: boolean;
	/** The version whose changelog banner has been dismissed. Never drawn as a setting. */
	dismissedChangelogVersion: string;
}

export const DEFAULT_SETTINGS: ZoterikSettings = {
	port: 23119,
	brackets: true,
	citationStyle: "",
	citationColor: "accent",
	citationUnderline: "dotted",
	citationBold: false,
	citationItalic: false,
	minimizeZotero: false,
	dismissedChangelogVersion: "",
};

/**
 * The settings object, read by the key a setting definition names. The
 * declarative settings API addresses a field by string, and this is the one
 * place that view of the object is taken.
 */
export function asIndexable(
	settings: ZoterikSettings
): Record<string, unknown> {
	return settings as unknown as Record<string, unknown>;
}
