import { Citation } from "src/types";

/**
 * Turning what the picker handed back into pandoc's citation syntax.
 *
 * Better BibTeX can format the pick itself (`format=pandoc`), and this plugin
 * deliberately does not ask it to: whether the citation is bracketed is a
 * setting here, and the locator rule below is not BBT's. So the pick is fetched
 * raw (`format=pick`) and written here, which also makes every rule below
 * testable without Zotero running.
 *
 * The shapes follow pandoc's manual, section "Citation syntax", and BBT's own
 * `pandoc` formatter (`content/cayw/formatter.ts`, 9.0.64) — with one departure
 * from the latter, noted at `locatorSuffix`.
 */

/**
 * CSL locator labels, abbreviated as Better BibTeX's `shortLabel` spells them.
 *
 * These were once what every locator was written with, and pandoc does not
 * read several of them — `ch.` in no language, `p.` in a note whose `lang` is
 * Russian — so a chapter was exported as the text "ch. 2". A locator is now
 * written in the words pandoc reads in the note's language
 * (`src/localeTerms.ts`), and these are left for two things: the labels
 * pandoc reads in no form at all (sub verbo, appendix, Juris-M's), where one
 * abbreviation is as good as another, and reading back the notes written
 * with them (`ENGLISH_LABELS`).
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
 *
 * Written as runs of alphanumerics joined by single punctuation marks, so that
 * a key can be matched only one way. A pattern that lets a run of alphanumerics
 * be split between repetitions backtracks exponentially on a long run followed
 * by a character it rejects: 26 alphanumerics and a `!` took about three
 * minutes, with the editor frozen.
 */
const PLAIN_CITATION_KEY = /^[a-zA-Z0-9_]+(?:[:.#$%&\-+?<>~/][a-zA-Z0-9_]+)*$/;

/** `@key`, or `@{key}` for a key pandoc would otherwise cut short. */
export function citationKeyToken(citationKey: string): string {
	return PLAIN_CITATION_KEY.test(citationKey)
		? `@${citationKey}`
		: `@{${citationKey}}`;
}

/**
 * How a locator's label is written: the word for a CSL label, for one locator
 * or several. The plugin's own writes the words pandoc reads in the note's
 * language (`labelWriter` in `src/localeTerms.ts`).
 */
export type LabelWriter = (label: string, plural: boolean) => string;

/**
 * Whether a locator names more than one — `33–35`, `33, 35`, `3 & 5` — which
 * is when a label is written in the plural: `pp.`, `сс.`.
 */
export function pluralLocator(locator: string): boolean {
	return /[-–—,;&]|\band\b/.test(locator);
}

/** The locator as it is written after a key: `p. 33`, `chap. 2`, `33`. */
export function locatorText(citation: Citation, labels: LabelWriter): string {
	const locator = citation.locator.trim();
	if (!locator) {
		return "";
	}
	// Zotero's window names a locator as CSL 1.0.1 did, `sub verbo` with a
	// space; CSL now writes `sub-verbo`.
	const name = citation.label.trim().replace(/\s+/g, "-");
	const label = name ? labels(name, pluralLocator(locator)).trim() : "";
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
export function locatorSuffix(citation: Citation, labels: LabelWriter): string {
	const text = locatorText(citation, labels);
	if (!text) {
		return "";
	}
	return /[,;[\]]/.test(text) ? `{${text}}` : `, ${text}`;
}

/**
 * One citation, without the brackets that would enclose the whole group:
 * `Doe says -@doe2020, p. 33 and so on`.
 */
function parenthetical(citation: Citation, labels: LabelWriter): string {
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
	cite += locatorSuffix(citation, labels);
	if (citation.suffix) {
		cite += ` ${citation.suffix}`;
	}
	return cite;
}

export interface FormatOptions {
	/** Wrap the group in `[ ]`, which is what pandoc reads as one citation. */
	brackets: boolean;
	/** How locator labels are written: in the words pandoc reads in the note. */
	labels: LabelWriter;
}

/**
 * The picked citations as one pandoc citation. Several citations make one
 * citation group, separated by `;` the way pandoc reads a group.
 */
export function formatCitations(
	citations: Citation[],
	options: FormatOptions
): string {
	if (citations.length === 0) {
		return "";
	}
	const formatted = citations
		.map((citation) => parenthetical(citation, options.labels))
		.join("; ");
	return options.brackets ? `[${formatted}]` : formatted;
}
