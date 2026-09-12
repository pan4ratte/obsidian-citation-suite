import { Citation, CitationForm } from "src/types";

/**
 * Turning what the picker handed back into pandoc's citation syntax.
 *
 * Better BibTeX can format the pick itself (`format=pandoc`), and this plugin
 * deliberately does not ask it to: the endpoint formats one way per request,
 * and both of this plugin's forms — with brackets and without, parenthetical
 * and narrative — have to come out of a single pick. So the pick is fetched raw
 * (`format=pick`) and written here, which also makes every rule below testable
 * without Zotero running.
 *
 * The shapes follow pandoc's manual, section "Citation syntax", and BBT's own
 * `pandoc` formatter (`content/cayw/formatter.ts`, 9.0.64) — with one departure
 * from the latter, noted at `locatorSuffix`.
 */

/**
 * CSL locator labels, abbreviated as a citation spells them. Copied from BBT's
 * `shortLabel` so a locator reads the same whichever tool wrote it.
 */
export const LOCATOR_LABELS: Record<string, string> = {
	article: "art.",
	chapter: "ch.",
	subchapter: "subch.",
	column: "col.",
	figure: "fig.",
	line: "l.",
	note: "n.",
	issue: "no.",
	opus: "op.",
	page: "p.",
	paragraph: "para.",
	subparagraph: "subpara.",
	part: "pt.",
	rule: "r.",
	section: "sec.",
	subsection: "subsec.",
	Section: "Sec.",
	"sub-verbo": "sv.",
	schedule: "sch.",
	title: "tit.",
	verse: "vrs.",
	volume: "vol.",
};

/** A locator label, abbreviated; anything unrecognised is left as it came. */
export function shortLabel(label: string): string {
	return LOCATOR_LABELS[label] ?? label;
}

/**
 * The characters a citation key may hold unescaped, per pandoc: it starts with
 * a letter, digit or `_`, and internal punctuation has to be followed by
 * another alphanumeric. Anything else has to go in `@{…}`, or pandoc reads the
 * key as ending at the first character it does not accept.
 */
const PLAIN_CITATION_KEY =
	/^[a-zA-Z0-9_](?:[a-zA-Z0-9_]*[:.#$%&\-+?<>~/]?[a-zA-Z0-9_]+)*$/;

/** `@key`, or `@{key}` for a key pandoc would otherwise cut short. */
export function citationKeyToken(citationKey: string): string {
	return PLAIN_CITATION_KEY.test(citationKey)
		? `@${citationKey}`
		: `@{${citationKey}}`;
}

/** The locator as it is written after a key: `p. 33`, `ch. 2`, `33`. */
export function locatorText(citation: Citation): string {
	const locator = citation.locator.trim();
	if (!locator) {
		return "";
	}
	const label = shortLabel(citation.label).trim();
	return label ? `${label} ${locator}` : locator;
}

/**
 * The locator, attached to the key the way pandoc attaches one.
 *
 * Normally that is `, p. 33` — the form the pandoc manual documents and the one
 * a reader recognises. A locator holding a comma, a semicolon or a bracket
 * cannot be written that way: pandoc ends the citation at that character, and
 * `[@doe2020, pp. 33, 35]` silently becomes a citation of page 33 followed by
 * the stray text `35`. Those go in pandoc's explicit-locator braces instead,
 * which attach to the key with no comma between (`@doe2020{pp. 33, 35}`) and
 * hold anything.
 *
 * This is where the plugin departs from BBT's own `pandoc` formatter: BBT
 * writes the braces *after* the comma whenever brackets are on, which pandoc
 * does not document as a locator at all. The rule here is narrower — braces
 * only where the plain form would break — and the output is plain pandoc in
 * every other case.
 */
export function locatorSuffix(citation: Citation): string {
	const text = locatorText(citation);
	if (!text) {
		return "";
	}
	return /[,;[\]]/.test(text) ? `{${text}}` : `, ${text}`;
}

/**
 * One citation, without the brackets that would enclose the whole group:
 * `Doe says -@doe2020, p. 33 and so on`.
 */
function parenthetical(citation: Citation): string {
	let cite = "";
	if (citation.prefix) {
		cite += `${citation.prefix} `;
	}
	// `-@key` cites the year alone, for a sentence that has already named the
	// author. It is the picker's "suppress author" checkbox.
	if (citation.suppressAuthor) {
		cite += "-";
	}
	cite += citationKeyToken(citation.citationKey);
	cite += locatorSuffix(citation);
	if (citation.suffix) {
		cite += ` ${citation.suffix}`;
	}
	return cite;
}

/**
 * The narrative citation, whose author is read as part of the sentence:
 * `@doe2020 [p. 33]`. Everything that would follow the key in the parenthetical
 * form goes inside the brackets instead, which is where pandoc looks for a
 * locator in this position. A prefix stays outside them — it is sentence text,
 * not part of the citation.
 */
function inText(citation: Citation): string {
	let cite = "";
	if (citation.prefix) {
		cite += `${citation.prefix} `;
	}
	if (citation.suppressAuthor) {
		cite += "-";
	}
	cite += citationKeyToken(citation.citationKey);
	const inner = [locatorText(citation), citation.suffix]
		.filter((part) => part)
		.join(", ");
	if (inner) {
		cite += ` [${inner}]`;
	}
	return cite;
}

export interface FormatOptions {
	form: CitationForm;
	/** Applies to the parenthetical form only; the narrative form brackets its locator. */
	brackets: boolean;
}

/**
 * The picked citations as one pandoc citation. Several citations make one
 * citation group, separated by `;` the way pandoc reads a group — and in the
 * narrative form, which has no group of its own, the same separator keeps two
 * of them apart in the sentence.
 */
export function formatCitations(
	citations: Citation[],
	options: FormatOptions
): string {
	if (citations.length === 0) {
		return "";
	}
	if (options.form === CitationForm.InText) {
		return citations.map(inText).join("; ");
	}
	const formatted = citations.map(parenthetical).join("; ");
	return options.brackets ? `[${formatted}]` : formatted;
}
