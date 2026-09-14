import { LOCATOR_LABELS } from "src/pandoc";

/**
 * Reading pandoc citations back out of a note.
 *
 * `src/pandoc.ts` writes them; this undoes that, and rather more, because a
 * note holds whatever its author typed and not only what the plugin inserted.
 * What is recognised is the syntax pandoc's manual documents, in the shapes it
 * documents them: a bracketed group of citations separated by `;`, each with an
 * optional prefix, an optional `-` that suppresses the author, the key, a
 * locator and a suffix.
 *
 * Every match carries the offsets it was found at, because the live editor
 * decorates ranges of the document rather than text.
 */

/** One citation inside a group, in the shape citeproc reads. */
export interface ParsedCitation {
	id: string;
	locator: string;
	/** The CSL label — `page`, `chapter` — or empty for the style's default. */
	label: string;
	prefix: string;
	suffix: string;
	suppressAuthor: boolean;
}

/** A whole `[…]` group, and where in the text it sits. */
export interface CitationGroup {
	from: number;
	to: number;
	citations: ParsedCitation[];
}

/**
 * The characters pandoc lets a citation key hold, as `src/pandoc.ts` states
 * them. A key in braces may hold anything, which is what the braces are for.
 */
const KEY = "[a-zA-Z0-9_](?:[a-zA-Z0-9_]*[:.#$%&+?<>~/-]?[a-zA-Z0-9_]+)*";

/** `@key` or `@{key}`, with the `-` that suppresses the author before it. */
const CITATION = new RegExp("(-?)@(?:[{]([^}]*)[}]|(" + KEY + "))");

/**
 * The words a locator can be labelled with, in the singular and the plural, as
 * CSL's `en-US` locale spells them — the long form, the short and the symbol.
 * Pandoc reads a label by the locale's terms, so `pp. 4–5` is a page range to
 * it just as `p. 4` is a page, and a note written by hand or by another tool
 * uses either. Multi-word terms (`sub verbo`) cannot open a locator that is
 * split on spaces, and are left out.
 */
const LOCALE_LABELS: Record<string, string[]> = {
	appendix: ["appendix", "appendices", "app.", "apps."],
	book: ["book", "books", "bk.", "bks."],
	canon: ["canon", "canons", "can.", "cann."],
	chapter: ["chapter", "chapters", "chap.", "chaps."],
	column: ["column", "columns", "col.", "cols."],
	elocation: ["location", "locations", "loc.", "locs."],
	equation: ["equation", "equations", "eq.", "eqq."],
	figure: ["figure", "figures", "fig.", "figs."],
	folio: ["folio", "folios", "fol.", "fols."],
	issue: ["issue", "issues", "no.", "nos."],
	line: ["line", "lines", "l.", "ll."],
	note: ["note", "notes", "n.", "nn."],
	opus: ["opus", "opera", "op.", "opp."],
	page: ["page", "pages", "p.", "pp."],
	paragraph: ["paragraph", "paragraphs", "para.", "paras.", "¶", "¶¶"],
	part: ["part", "parts", "pt.", "pts."],
	rule: ["rule", "rules", "r.", "rr."],
	scene: ["scene", "scenes", "sc.", "scs."],
	section: ["section", "sections", "sec.", "secs.", "§", "§§"],
	"sub-verbo": ["s.v.", "s.vv."],
	supplement: ["supplement", "supplements", "supp.", "supps."],
	table: ["table", "tables", "tbl.", "tbls."],
	verse: ["verse", "verses", "v.", "vv."],
	volume: ["volume", "volumes", "vol.", "vols."],
};

/** Label words, lowercased, each mapped to the CSL locator it names. */
export type LocatorLabels = Record<string, string>;

/**
 * The labels a note is read with unless it says what language it is in: the
 * English terms above, the CSL label names themselves, and the abbreviations
 * the plugin writes (`src/pandoc.ts`). A note with pandoc's `lang` is read
 * with its language's labels instead (`src/localeTerms.ts`).
 */
export const ENGLISH_LABELS: LocatorLabels = Object.fromEntries(
	[
		...Object.entries(LOCALE_LABELS).flatMap(([label, words]) =>
			words.map((word): [string, string] => [word, label])
		),
		...Object.keys(LOCATOR_LABELS).map((label): [string, string] => [
			label.toLowerCase(),
			label,
		]),
		...Object.entries(LOCATOR_LABELS).map(
			([label, short]): [string, string] => [short.toLowerCase(), label]
		),
	]
);

/**
 * The CSL label a word names — `p.`, `pp.`, `Pages` and `p` all name `page` —
 * or empty for a word that is not a label. Case does not matter to pandoc.
 *
 * A note read in its own language is read as pandoc reads it, word for word:
 * en-GB's `bk` is a book and `bk.` is not. A note without one is read with
 * the English labels, more forgivingly — a missing full stop or a comma left
 * after the label — as the plugin always read it.
 */
function labelOf(word: string, labels: LocatorLabels): string {
	if (labels !== ENGLISH_LABELS) {
		return labels[word.toLocaleLowerCase()] ?? "";
	}
	const lower = word.toLocaleLowerCase().replace(/,+$/, "");
	const bare = lower.replace(/[.]+$/, "");
	return labels[lower] ?? labels[bare] ?? labels[`${bare}.`] ?? "";
}

/**
 * A locator as it was written — `p. 33`, `pp. 33–35`, `ch. 2`, `33` — split
 * into the CSL label and the locator itself. An unlabelled locator keeps its
 * label empty: the style decides what an unqualified number means, and for
 * every style that has an opinion it means a page.
 */
export function splitLocator(
	text: string,
	labels: LocatorLabels = ENGLISH_LABELS
): { label: string; locator: string } {
	const trimmed = text.trim();
	const space = trimmed.indexOf(" ");
	if (space === -1) {
		return { label: "", locator: trimmed };
	}
	const label = labelOf(trimmed.slice(0, space), labels);
	return label
		? { label, locator: trimmed.slice(space + 1).trim() }
		: { label: "", locator: trimmed };
}

/** Whether a word opens a locator by naming what it counts: `p.`, `pp.`. */
function isLabel(word: string, labels: LocatorLabels): boolean {
	return labelOf(word, labels) !== "";
}

/**
 * Whether a word can still be part of a locator. Pandoc ends a locator at the
 * first word that cannot be one — anything holding a digit can, and so can a
 * roman numeral, which is how the front matter of a book is paginated.
 */
function isLocatorWord(word: string): boolean {
	const bare = word.replace(/[,;:.–—-]+$/, "");
	if (!bare) {
		return true;
	}
	return /[0-9]/.test(bare) || /^[ivxlcdm]+$/i.test(bare);
}

/**
 * How far the locator runs, and what is left over as the suffix.
 *
 * `[@doe2020, p. 33 and following]` cites page 33 and says "and following"
 * afterwards; the locator is not the whole of the text after the comma. Pandoc
 * reads the locator as a label and a run of numbers and stops there, and so
 * does this.
 */
function splitLocatorSuffix(
	text: string,
	labels: LocatorLabels
): { locator: string; suffix: string } {
	const words = text.split(/[ ]+/).filter((word) => word);
	let taken = words.length > 0 && isLabel(words[0], labels) ? 1 : 0;
	while (taken < words.length && isLocatorWord(words[taken])) {
		taken++;
	}
	// A label with nothing counted after it is not a locator at all.
	if (taken === 1 && isLabel(words[0], labels)) {
		taken = 0;
	}
	return {
		locator: words.slice(0, taken).join(" "),
		suffix: words.slice(taken).join(" "),
	};
}

/** A locator in braces at the start of the text, and what follows it. */
function bracedLocator(
	text: string
): { locator: string; suffix: string } | null {
	if (!text.startsWith("{")) {
		return null;
	}
	const close = text.indexOf("}");
	if (close === -1) {
		return null;
	}
	return {
		locator: text.slice(1, close),
		suffix: text.slice(close + 1).trim(),
	};
}

/**
 * What follows the key: the locator, then the suffix.
 *
 * Braces are pandoc's explicit locator and hold anything, so they are taken
 * whole — straight after the key (`@doe2020{pp. 33, 35}`) or after the comma
 * (`@doe2020, {pp. 33, 35}`). The pandoc manual shows both, and the second is
 * what Better BibTeX's own pandoc formatter writes. Otherwise a leading comma
 * introduces a locator, which runs to the end of the citation — pandoc ends it
 * at the first thing that cannot be part of one, and the plugin's own writer
 * never puts a suffix after a bare locator without a comma of its own.
 */
function splitTail(
	tail: string,
	labels: LocatorLabels
): { locator: string; suffix: string } {
	const braced = bracedLocator(tail);
	if (braced) {
		return braced;
	}
	if (tail.startsWith(",")) {
		const rest = tail.slice(1).trim();
		const split = bracedLocator(rest) ?? splitLocatorSuffix(rest, labels);
		// No locator after all: the comma belongs to the suffix, and pandoc
		// writes it — `[@doe2020, and more]` reads "(Doe 2020, and more)".
		return split.locator || !rest ? split : { locator: "", suffix: `, ${rest}` };
	}
	return { locator: "", suffix: tail.trim() };
}

/** One `prefix -@key, locator suffix`, as it stands between two semicolons. */
export function parseCitation(
	text: string,
	labels: LocatorLabels = ENGLISH_LABELS
): ParsedCitation | null {
	const match = CITATION.exec(text);
	if (!match) {
		return null;
	}
	const id = match[2] ?? match[3];
	if (!id) {
		return null;
	}

	const prefix = text.slice(0, match.index).trim();
	const tail = text.slice(match.index + match[0].length).trim();
	const { locator, suffix } = splitTail(tail, labels);
	const { label, locator: bare } = splitLocator(locator, labels);

	return {
		id,
		locator: bare,
		label,
		prefix,
		suffix,
		suppressAuthor: match[1] === "-",
	};
}

/**
 * Every citation group in the text, in the order they appear.
 *
 * Only bracketed groups are read. A bare `@key` is a citation to pandoc too,
 * but in a note it is far more often an address or a name, and a rendering that
 * guesses wrong rewrites text that was never a citation.
 *
 * Locators are read with `labels`: English, unless the note's language says
 * otherwise.
 */
export function parseGroups(
	text: string,
	labels: LocatorLabels = ENGLISH_LABELS
): CitationGroup[] {
	const groups: CitationGroup[] = [];
	const brackets = /\[([^[\]]*)\]/g;
	let match: RegExpExecArray | null;

	while ((match = brackets.exec(text)) !== null) {
		const inner = match[1];
		// `[[note]]` and `[text](link)` are Obsidian's, not pandoc's.
		if (!inner.includes("@")) {
			continue;
		}
		const citations = inner
			.split(";")
			.map((part) => parseCitation(part, labels))
			.filter((citation): citation is ParsedCitation => citation !== null);
		if (citations.length === 0) {
			continue;
		}
		groups.push({
			from: match.index,
			to: match.index + match[0].length,
			citations,
		});
	}
	return groups;
}

const FENCE = /^ {0,3}(`{3,}|~{3,})/;

/** The text as spaces, its line breaks kept where they were. */
function blank(text: string): string {
	return text.replace(/[^\n]/g, " ");
}

/**
 * The note with everything that is not prose emptied out: the front matter,
 * fenced code, inline code, and both kinds of comment. A citation key in any
 * of them is stored or talked about rather than cited — reading view does not
 * draw one in code either, and pandoc renders none of them.
 *
 * Everything emptied out is overwritten with spaces, newlines kept, rather than
 * dropped: a bracket never meets another one across the gap a block left, and
 * an offset into the result is the same offset into the note.
 */
export function proseOf(text: string): string {
	const lines = text.split("\n");
	let i = 0;
	if (lines[0]?.trimEnd() === "---") {
		lines[0] = blank(lines[0]);
		for (i = 1; i < lines.length; i++) {
			const end = ["---", "..."].includes(lines[i].trimEnd());
			lines[i] = blank(lines[i]);
			if (end) {
				i++;
				break;
			}
		}
	}

	let fence: string | null = null;
	for (; i < lines.length; i++) {
		const opening = FENCE.exec(lines[i]);
		if (fence) {
			if (
				opening &&
				opening[1][0] === fence[0] &&
				opening[1].length >= fence.length &&
				lines[i].slice(opening[0].length).trim() === ""
			) {
				fence = null;
			}
			lines[i] = blank(lines[i]);
		} else if (opening) {
			fence = opening[1];
			lines[i] = blank(lines[i]);
		}
	}

	return (
		lines
			.join("\n")
			// A code span closes on a run of as many backticks as opened it,
			// and never runs on past the end of its paragraph.
			.replace(/(`+)(?:(?!\n[ \t]*\n)[\s\S])*?[^`]\1(?!`)/g, blank)
			.replace(/%%[\s\S]*?(?:%%|$)/g, blank)
			.replace(/<!--[\s\S]*?(?:-->|$)/g, blank)
	);
}

/**
 * Every key the note cites, once each, in the order the note first cites it —
 * which is the order a numbered style numbers its reference list in.
 */
export function citedKeys(text: string): string[] {
	const keys = new Set<string>();
	for (const group of parseGroups(proseOf(text))) {
		for (const citation of group.citations) {
			keys.add(citation.id);
		}
	}
	return [...keys];
}

/** Where a citation stands in the text: its `@key`, and the `-` before it. */
export interface Mention {
	from: number;
	to: number;
}

/** A key a group cites, and where its `@key` stands in the text. */
export interface KeyMention extends Mention {
	id: string;
}

/**
 * Every key the group cites, with where it stands in the text the group was
 * read from — cut between the brackets as `parseGroups` cuts it, so each is the
 * key of the citation at the same place in `group.citations`.
 */
export function keyMentions(text: string, group: CitationGroup): KeyMention[] {
	const mentions: KeyMention[] = [];
	let start = group.from + 1;
	for (const part of text.slice(start, group.to - 1).split(";")) {
		const match = CITATION.exec(part);
		const id = match ? (match[2] ?? match[3]) : undefined;
		if (match && id) {
			const from = start + match.index;
			mentions.push({ id, from, to: from + match[0].length });
		}
		start += part.length + 1;
	}
	return mentions;
}

/**
 * Every place the text cites any of the keys, in the order they come — read
 * exactly as `citedKeys` reads them, so a source is found wherever the list
 * counts it as cited and nowhere else.
 */
export function mentionsOf(text: string, citekeys: string[]): Mention[] {
	const wanted = new Set(citekeys);
	const prose = proseOf(text);
	return parseGroups(prose)
		.flatMap((group) => keyMentions(prose, group))
		.filter((mention) => wanted.has(mention.id))
		.map(({ from, to }) => ({ from, to }));
}
