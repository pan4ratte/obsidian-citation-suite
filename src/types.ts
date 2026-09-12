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

/** How a citation is written into the note. */
export enum CitationForm {
	/**
	 * The parenthetical citation: `[@doe2020, p. 33]`, or `@doe2020, p. 33`
	 * when the `brackets` setting is off.
	 */
	Parenthetical = "parenthetical",
	/**
	 * The narrative (in-text) citation, whose author is part of the sentence:
	 * `@doe2020 [p. 33]`. Brackets here hold the locator, not the citation, so
	 * the `brackets` setting does not apply to it.
	 */
	InText = "in-text",
}

export interface ZoterikSettings {
	/**
	 * The port Zotero's local HTTP server listens on. 23119 for Zotero, 24119
	 * for the beta, which runs its server one port up so that both can be open
	 * at once.
	 */
	port: number;
	/** Wrap a parenthetical citation in `[ ]`, which is what pandoc reads as one. */
	brackets: boolean;
	/** Minimize Zotero's window once the pick is done, handing focus back. */
	minimizeZotero: boolean;
	/** The version whose changelog banner has been dismissed. Never drawn as a setting. */
	dismissedChangelogVersion: string;
}

export const DEFAULT_SETTINGS: ZoterikSettings = {
	port: 23119,
	brackets: true,
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
