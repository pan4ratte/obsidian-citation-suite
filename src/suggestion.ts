import { citationKeyToken } from "src/pandoc";
import { matchesTerms, normalizeForSearch } from "src/search";

/**
 * Suggesting a source while its citation key is typed.
 *
 * Typing `@` where a citation can start — at the start of a line, after a
 * space, an opening bracket or the `;` between two citations — offers the
 * sources whose key, title, creators or year hold what follows it, and picking
 * one writes its key there. The citation window is still the way to cite with
 * a page or a prefix; this is the way to cite a source whose name is already
 * in mind, without leaving the sentence.
 *
 * This file is the part that needs no editor and no Zotero: where a key is
 * being typed, what a pick is written as, and how the sources are put in
 * order. `src/citationSuggest.ts` asks Zotero and draws the list.
 */

/** A citation key being typed: where its `@` (or `-@`) starts, and what follows. */
export interface KeyTrigger {
	/** Where the citation starts in the line: its `-` if it has one, else its `@`. */
	start: number;
	/** What has been typed after the `@`. */
	query: string;
}

/**
 * The characters a key can be typed with: pandoc's, and letters of any
 * alphabet, since a query may be a word of a Cyrillic title as well as a key.
 */
const TRIGGER = /(^|[\s[;(])(-?@)([\p{L}\p{N}_:.#$%&+?<>~/-]*)$/u;

/**
 * The key being typed at the end of the text before the cursor, or `null` when
 * the cursor is not in one. An `@` after a letter is an address, and one
 * after `[[` names a note, so neither is taken for a citation.
 */
export function keyTrigger(before: string): KeyTrigger | null {
	const match = TRIGGER.exec(before);
	if (!match) {
		return null;
	}
	const start = match.index + match[1].length;
	if (before.slice(start - 2, start) === "[[") {
		return null;
	}
	return { start, query: match[3] };
}

/**
 * Whether the position is inside a pandoc citation's brackets on the line: a
 * `[` stands before it that nothing has closed, and it is not a link's `[[`
 * or a footnote's `[^`.
 */
export function insideBrackets(line: string, at: number): boolean {
	const open = line.lastIndexOf("[", at - 1);
	if (open === -1 || line.lastIndexOf("]", at - 1) > open) {
		return false;
	}
	return line[open + 1] !== "^" && line[open + 1] !== "[" && line[open - 1] !== "[";
}

/** Characters that go on a key typed up to the cursor, past the cursor. */
const KEY_TAIL = /^[\p{L}\p{N}_:.#$%&+?<>~/-]*/u;

/**
 * Where the key being typed ends in the line: past its `-@` or `@` and every
 * key character after it, the ones after the cursor included.
 */
export function typedKeyEnd(line: string, start: number): number {
	const at = line[start] === "-" ? start + 2 : start + 1;
	return at + (KEY_TAIL.exec(line.slice(at))?.[0].length ?? 0);
}

/** What picking a source writes, and over which part of the line. */
export interface KeyInsertion {
	from: number;
	to: number;
	text: string;
}

/**
 * The citation a picked key is written as, in place of what was typed for it —
 * including any of the key that stands after the cursor, so that picking in
 * the middle of a key replaces the whole of it.
 *
 * Inside a citation's brackets it is the key alone, with the `-` that
 * suppresses the author kept. Outside them it is a citation of its own, in
 * brackets when the settings put citations in brackets.
 */
export function keyInsertion(
	line: string,
	trigger: KeyTrigger,
	cursor: number,
	citekey: string,
	brackets: boolean
): KeyInsertion {
	const tail = KEY_TAIL.exec(line.slice(cursor))?.[0] ?? "";
	const dash = line[trigger.start] === "-" ? "-" : "";
	const key = `${dash}${citationKeyToken(citekey)}`;
	const text =
		brackets && !insideBrackets(line, trigger.start) ? `[${key}]` : key;
	return { from: trigger.start, to: cursor + tail.length, text };
}

/** A source as the list shows it. */
export interface SuggestedSource {
	citekey: string;
	title: string;
	/** Who wrote it, shortened: one or two surnames, and an ellipsis for more. */
	creators: string;
	year: string;
}

/** The surname a CSL name is shown by: its family name, or the name as written. */
function surname(name: unknown): string {
	if (!name || typeof name !== "object") {
		return "";
	}
	const { family, literal } = name as { family?: unknown; literal?: unknown };
	if (typeof family === "string") {
		return family;
	}
	return typeof literal === "string" ? literal : "";
}

/** The year of a CSL date, from its parts or as it was written. */
function yearOf(date: unknown): string {
	if (!date || typeof date !== "object") {
		return "";
	}
	const { "date-parts": parts, raw, literal } = date as Record<string, unknown>;
	const first: unknown = Array.isArray(parts) ? parts[0] : undefined;
	const year: unknown = Array.isArray(first) ? first[0] : undefined;
	if (typeof year === "number" || (typeof year === "string" && year)) {
		return String(year);
	}
	const written = typeof raw === "string" ? raw : typeof literal === "string" ? literal : "";
	return /\d{4}/.exec(written)?.[0] ?? "";
}

/**
 * A citation of one source, standing on its own, as the settings write one: in
 * brackets when citations are written in brackets, and with the key braced
 * where pandoc needs it braced. What the list after `@` writes is
 * `keyInsertion`, which has a half-typed key to replace and may be standing
 * inside a citation already; this is for citing where there is nothing yet.
 */
export function citationOf(citekey: string, brackets: boolean): string {
	// `citationKeyToken` writes the `@` itself, and the braces around a key
	// that needs them.
	const key = citationKeyToken(citekey);
	return brackets ? `[${key}]` : key;
}

/** A source as the list shows it, from its key and its CSL. */
export function suggestedSource(
	citekey: string,
	item: Record<string, unknown>
): SuggestedSource {
	const names = [item.author, item.editor].find(
		(list): list is unknown[] => Array.isArray(list) && list.length > 0
	);
	const surnames = (names ?? []).map(surname).filter((name) => name);
	return {
		citekey,
		title: typeof item.title === "string" ? item.title : "",
		creators:
			surnames.length > 2
				? `${surnames[0]}…`
				: surnames.join(", "),
		year: yearOf(item.issued),
	};
}

/** Whether a source holds what was typed, in its key, title, creators or year. */
export function sourceMatches(source: SuggestedSource, query: string): boolean {
	return matchesTerms(
		[source.citekey, source.title, source.creators, source.year].join(" "),
		[normalizeForSearch(query)].filter((term) => term)
	);
}

/**
 * The sources in the order they are offered: the ones the note already cites
 * first, in the order it first cites them — they are the likeliest to be cited
 * again — then those whose key starts with what was typed, then those whose
 * creator does, then the rest, each by key.
 */
export function rankSources(
	sources: SuggestedSource[],
	query: string,
	cited: string[]
): SuggestedSource[] {
	const typed = normalizeForSearch(query);
	const citedAt = new Map(cited.map((key, index) => [key, index]));
	const rank = (source: SuggestedSource): number => {
		if (citedAt.has(source.citekey)) {
			return 0;
		}
		if (typed && normalizeForSearch(source.citekey).startsWith(typed)) {
			return 1;
		}
		if (typed && normalizeForSearch(source.creators).startsWith(typed)) {
			return 2;
		}
		return 3;
	};
	return [...sources].sort(
		(a, b) =>
			rank(a) - rank(b) ||
			(citedAt.get(a.citekey) ?? 0) - (citedAt.get(b.citekey) ?? 0) ||
			a.citekey.localeCompare(b.citekey)
	);
}
