import { LOCATOR_LABELS } from "src/pandoc";

/**
 * Reading pandoc citations back out of a note.
 *
 * `src/pandoc.ts` writes them; this undoes that, and rather more, because a
 * note holds whatever its author typed and not only what the plugin inserted.
 * What is recognised is the syntax pandoc's manual documents, in the shapes it
 * documents them: a bracketed group of citations separated by `;`, each with an
 * optional prefix, an optional `-` that suppresses the author, the key, a
 * locator and a suffix — and a citation standing outside brackets, `@doe2020
 * says`, which pandoc writes with the author in the text: "Doe (2020) says".
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

/** A whole `[…]` group, or a citation standing alone, and where in the text it sits. */
export interface CitationGroup {
	from: number;
	to: number;
	citations: ParsedCitation[];
	/**
	 * Whether it stands outside brackets: `@doe2020`, `@doe2020 [p. 33]`,
	 * `-@doe2020`. In a note that is as often a name or a handle as a
	 * citation, so it is written as one only when its sources are known, and
	 * a key nothing is known about is not marked as missing.
	 */
	bare?: boolean;
}

/**
 * Whether the group names its first source's author in the text, as pandoc
 * writes a citation standing outside brackets: "Doe (2020) says". A `-` before
 * the key makes it an ordinary citation with the author left out, "(2020)".
 */
export function authorInText(group: CitationGroup): boolean {
	return !!group.bare && !group.citations[0]?.suppressAuthor;
}

/**
 * The characters pandoc lets a citation key hold, as `src/pandoc.ts` states
 * them. A key in braces may hold anything, which is what the braces are for.
 */
export const KEY = "[a-zA-Z0-9_](?:[a-zA-Z0-9_]*[:.#$%&+?<>~/-]?[a-zA-Z0-9_]+)*";

/** `@key` or `@{key}`, with the `-` that suppresses the author before it. */
const CITATION = new RegExp("(-?)@(?:[{]([^}]*)[}]|(" + KEY + "))");

/**
 * A citation standing alone, as pandoc 3.12 reads one: `@key` or `-@key`,
 * after anything but a letter or a digit, which is an address, or a full stop.
 * One place is left alone that pandoc would read: after `/`, which is a link.
 * One inside a bracket — a group, Obsidian's `[[link]]` — is not one either,
 * which `parseGroups` sees to. What stands before is matched rather than
 * looked behind for, which iOS before 16.4 cannot do, and is not part of the
 * citation. The key ends where pandoc's would.
 */
const BARE = new RegExp(
	"(^|[^\\p{L}\\p{N}./@\\\\])(-?)@(?:[{]([^}]*)[}]|(" + KEY + "))(?![a-zA-Z0-9_])",
	"gu"
);

/**
 * A bracket after a citation standing alone, which pandoc reads as part of
 * it: after spaces, or on the next line.
 */
const BRACKET_AFTER = /[ \t]*(?:\r?\n[ \t]*)?\[/y;

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

/** A pair of brackets with no brackets inside, and what it holds. */
interface Bracket {
	from: number;
	to: number;
	inner: string;
}

/**
 * What a bracket after a citation standing alone adds to it, as pandoc 3.12
 * reads one: its first part, when it names no key, is the citation's locator
 * and suffix (`@doe2020 [p. 33]`, `[33]`, `[and more]`); every part naming a
 * key is a citation of its own in the same group (`[p. 33; also @roe2021]`,
 * `[@roe2021]`). A bracket with a later part naming no key is no part of the
 * citation at all, and `null`.
 */
function bracketAfter(
	inner: string,
	labels: LocatorLabels
): { locator: string; suffix: string; citations: ParsedCitation[] } | null {
	const parts = inner.split(";");
	const cited = parts.map((part) => parseCitation(part, labels));
	if (cited.slice(1).some((citation) => citation === null)) {
		return null;
	}
	const first = cited[0] ? "" : parts[0].trim().replace(/^,\s*/, "");
	// Read as the text after a comma is, so a suffix with no locator keeps
	// the comma pandoc writes: `[and more]` reads "(2020, and more)".
	const { locator, suffix } = first ? splitTail(`, ${first}`, labels) : { locator: "", suffix: "" };
	return {
		locator,
		suffix,
		citations: cited.filter((citation): citation is ParsedCitation => citation !== null),
	};
}

/**
 * Every citation group in the text, in the order they appear: the bracketed
 * ones, and the citations standing alone.
 *
 * A citation standing alone takes the bracket straight after it, as pandoc
 * does — `@doe2020 [p. 33]` is one citation of page 33 — unless that bracket
 * is Obsidian's `[[link]]`. One inside a bracket is not one: that bracket is a
 * group of its own, or Obsidian's.
 *
 * Locators are read with `labels`: English, unless the note's language says
 * otherwise.
 */
export function parseGroups(
	text: string,
	labels: LocatorLabels = ENGLISH_LABELS
): CitationGroup[] {
	const brackets: Bracket[] = [];
	for (const match of text.matchAll(/\[([^[\]]*)\]/g)) {
		// `^[…]` is an inline note, whose text may cite: `^[As @doe2020
		// says.]` is "As Doe (2020) says." in a note, not a citation group.
		if (text[match.index - 1] !== "^") {
			brackets.push({ from: match.index, to: match.index + match[0].length, inner: match[1] });
		}
	}
	const bracketAt = new Map(brackets.map((bracket) => [bracket.from, bracket]));

	const groups: CitationGroup[] = [];
	const taken = new Set<Bracket>();
	if (text.includes("@")) {
		let next = 0;
		for (const match of text.matchAll(BARE)) {
			const id = match[3] ?? match[4];
			const from = match.index + match[1].length;
			while (next < brackets.length && brackets[next].to <= from) {
				next++;
			}
			if (!id || (next < brackets.length && brackets[next].from < from)) {
				continue;
			}
			let to = match.index + match[0].length;
			const citation: ParsedCitation = {
				id,
				locator: "",
				label: "",
				prefix: "",
				suffix: "",
				suppressAuthor: match[2] === "-",
			};
			const citations = [citation];
			BRACKET_AFTER.lastIndex = to;
			const opening = BRACKET_AFTER.exec(text);
			const bracket = opening ? bracketAt.get(BRACKET_AFTER.lastIndex - 1) : undefined;
			const added = bracket ? bracketAfter(bracket.inner, labels) : null;
			if (bracket && added) {
				const { label, locator } = splitLocator(added.locator, labels);
				citation.label = label;
				citation.locator = locator;
				citation.suffix = added.suffix;
				citations.push(...added.citations);
				taken.add(bracket);
				to = bracket.to;
			}
			groups.push({ from, to, citations, bare: true });
		}
	}

	for (const bracket of brackets) {
		// `[[note]]` and `[text](link)` are Obsidian's, not pandoc's.
		if (taken.has(bracket) || !bracket.inner.includes("@")) {
			continue;
		}
		const citations = bracket.inner
			.split(";")
			.map((part) => parseCitation(part, labels))
			.filter((citation): citation is ParsedCitation => citation !== null);
		if (citations.length > 0) {
			groups.push({ from: bracket.from, to: bracket.to, citations });
		}
	}
	return groups.sort((a, b) => a.from - b.from);
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
 *
 * With `bracketed`, only the keys the note cites in brackets somewhere: a key
 * only ever standing alone may be a name or a handle, and is a citation only
 * once its source is known.
 */
export function citedKeys(text: string, options: { bracketed?: boolean } = {}): string[] {
	const keys = new Set<string>();
	for (const group of parseGroups(proseOf(text))) {
		group.citations.forEach((citation, index) => {
			// A bare group's first key is the one standing alone.
			if (!options.bracketed || !group.bare || index > 0) {
				keys.add(citation.id);
			}
		});
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
 * key of the citation at the same place in `group.citations`. A citation
 * standing alone has its own key first, then those of the bracket after it.
 */
export function keyMentions(text: string, group: CitationGroup): KeyMention[] {
	if (!group.bare) {
		return bracketMentions(text, group.from + 1, group.to - 1);
	}
	const match = CITATION.exec(text.slice(group.from, group.to));
	const id = match ? (match[2] ?? match[3]) : undefined;
	if (!match || !id) {
		return [];
	}
	const from = group.from + match.index;
	const to = from + match[0].length;
	const open = text.indexOf("[", to);
	return [
		{ id, from, to },
		...(open !== -1 && open < group.to ? bracketMentions(text, open + 1, group.to - 1) : []),
	];
}

/** The keys cited between two offsets, the text between a group's brackets. */
function bracketMentions(text: string, from: number, to: number): KeyMention[] {
	const mentions: KeyMention[] = [];
	let start = from;
	for (const part of text.slice(from, to).split(";")) {
		const match = CITATION.exec(part);
		const id = match ? (match[2] ?? match[3]) : undefined;
		if (match && id) {
			const at = start + match.index;
			mentions.push({ id, from: at, to: at + match[0].length });
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
