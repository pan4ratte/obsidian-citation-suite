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
