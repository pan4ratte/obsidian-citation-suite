import { CitationStyle, StyleSource } from "src/types";

/**
 * A citation style, as its CSL file declares itself — read, and taken apart.
 *
 * Nothing here touches a file: it is handed the text of one. What finds the
 * files is `src/zoteroStyles.ts` for the ones Zotero has, which is a desktop
 * of its own, and `src/vaultStyles.ts` for the ones in the vault, which works
 * wherever Obsidian does.
 */

/** The text of the first `<tag>` in the style's `<info>` block. */
function element(xml: string, tag: string): string {
	const match = new RegExp("<" + tag + ">([^<]*)</" + tag + ">").exec(xml);
	return match ? decodeEntities(match[1]).trim() : "";
}

/** The five entities XML defines, which is all a style title uses. */
function decodeEntities(text: string): string {
	return text
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/&quot;/g, '"')
		.replace(/&apos;/g, "'")
		// Last, so that an escaped entity is not decoded twice.
		.replace(/&amp;/g, "&");
}

/**
 * A style's id and title, as its CSL file declares them. The id is what Zotero
 * is asked for the style by — a `zotero.org/styles/…` URL for a style it
 * distributes, and a bare UUID for one written by hand.
 */
export function parseStyle(
	csl: string,
	path = "",
	source: StyleSource = "zotero"
): CitationStyle | null {
	const id = element(csl, "id");
	const title = element(csl, "title");
	return id && title ? { id, title, path, source } : null;
}

/**
 * What marks a stored choice as a file of the vault rather than a style id.
 * No style id starts with it: Zotero's are `http://…` URLs and bare UUIDs.
 */
const VAULT_CHOICE = "vault:";

/**
 * What the settings write down when a style is chosen in them.
 *
 * An id alone will not do. The vault can hold a copy of a style Zotero also
 * has — the same file, put there so a phone has it — and then two entries of
 * the picker carry one id, and an id cannot say which of the two the reader
 * clicked. A style of the vault is written down by its path instead, marked as
 * a path; Zotero's are written down by id, as they always were, so a setting
 * written before this still reads.
 */
export function styleChoice(style: CitationStyle): string {
	return style.source === "vault" ? VAULT_CHOICE + style.path : style.id;
}

/** The vault path a choice names, or `null` for a choice that names an id. */
export function choiceVaultPath(choice: string): string | null {
	return choice.startsWith(VAULT_CHOICE)
		? choice.slice(VAULT_CHOICE.length)
		: null;
}

/**
 * The style a written-down choice stands for, or `undefined` for one that
 * stands for nothing: a vault file since deleted, or a style uninstalled from
 * Zotero.
 *
 * An id is looked for among Zotero's styles first and the vault's second. Both
 * only ever happens for a setting written before the path was written down
 * with it, and Zotero's is the one that was being offered then.
 */
export function chosenStyle(
	styles: CitationStyle[],
	choice: string
): CitationStyle | undefined {
	const path = choiceVaultPath(choice);
	if (path !== null) {
		return styles.find(
			(style) => style.source === "vault" && style.path === path
		);
	}
	return (
		styles.find((style) => style.source === "zotero" && style.id === choice) ??
		styles.find((style) => style.id === choice)
	);
}

/**
 * The elements that write a numbered style's number: `citation-number` printed
 * as text or as a number, with the affixes that frame it — `[1]`, `1.` — which
 * are attributes of the same element and go with it. A CSL `<text>` or
 * `<number>` holds nothing, so it is closed where it opens, or closed at once.
 * Sorting by the number (`<key>`) and testing for it (`<if>`) are left alone:
 * neither writes anything.
 */
const CITATION_NUMBER =
	/<(text|number)\b[^>]*\bvariable\s*=\s*(["'])citation-number\2[^>]*?(?:\/>|>\s*<\/\1\s*>)/g;

/**
 * The style with its numbers taken out, for writing a bibliography entry that
 * stands on its own. `second-field-align` goes too: it sets the number apart
 * from the rest of the entry, and with the number gone it would set apart the
 * author instead.
 */
export function withoutCitationNumbers(csl: string): string {
	return csl
		.replace(CITATION_NUMBER, "")
		.replace(
			/(<bibliography\b[^>]*?)\s+second-field-align\s*=\s*(["'])[^"']*\2/,
			"$1"
		);
}

/** What of Zotero's preferences decides how it writes a citation. */
export interface ZoteroCitePrefs {
	/** The language citations are written in; see `localeFromPrefs`. */
	locale: string;
	/**
	 * "Include URLs of paper articles in references": off by default, which
	 * drops the URL of an article that has pages.
	 */
	citePaperArticleURLs: boolean;
}

/** What Zotero writes citations by, for a phone that cannot ask Zotero. */
export const DEFAULT_CITE_PREFS: ZoteroCitePrefs = {
	locale: "",
	citePaperArticleURLs: false,
};
