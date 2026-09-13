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

/** The label a locator was written with, back from `p.` to `page`. */
const LABELS: Record<string, string> = Object.fromEntries(
	Object.entries(LOCATOR_LABELS).map(([label, short]) => [short, label])
);

/**
 * A locator as it was written — `p. 33`, `ch. 2`, `33` — split into the CSL
 * label and the locator itself. An unlabelled locator keeps its label empty:
 * the style decides what an unqualified number means, and for every style that
 * has an opinion it means a page.
 */
export function splitLocator(text: string): { label: string; locator: string } {
	const trimmed = text.trim();
	const space = trimmed.indexOf(" ");
	if (space === -1) {
		return { label: "", locator: trimmed };
	}
	const head = trimmed.slice(0, space);
	const label = LABELS[head] ?? (head in LOCATOR_LABELS ? head : "");
	return label
		? { label, locator: trimmed.slice(space + 1).trim() }
		: { label: "", locator: trimmed };
}

/** Whether a word opens a locator by naming what it counts: `p.`, `ch.`. */
function isLabel(word: string): boolean {
	const bare = word.replace(/[.,]+$/, "");
	return (
		bare in LOCATOR_LABELS ||
		word in LABELS ||
		bare + "." in LABELS ||
		bare in LABELS
	);
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
function splitLocatorSuffix(text: string): { locator: string; suffix: string } {
	const words = text.split(/[ ]+/).filter((word) => word);
	let taken = words.length > 0 && isLabel(words[0]) ? 1 : 0;
	while (taken < words.length && isLocatorWord(words[taken])) {
		taken++;
	}
	// A label with nothing counted after it is not a locator at all.
	if (taken === 1 && isLabel(words[0])) {
		taken = 0;
	}
	return {
		locator: words.slice(0, taken).join(" "),
		suffix: words.slice(taken).join(" "),
	};
}

/**
 * What follows the key: the locator, then the suffix.
 *
 * Braces are pandoc's explicit locator and hold anything, so they are taken
 * whole. Otherwise a leading comma introduces a locator, which runs to the end
 * of the citation — pandoc ends it at the first thing that cannot be part of
 * one, and the plugin's own writer never puts a suffix after a bare locator
 * without a comma of its own.
 */
function splitTail(tail: string): { locator: string; suffix: string } {
	if (tail.startsWith("{")) {
		const close = tail.indexOf("}");
		if (close !== -1) {
			return {
				locator: tail.slice(1, close),
				suffix: tail.slice(close + 1).trim(),
			};
		}
	}
	if (tail.startsWith(",")) {
		return splitLocatorSuffix(tail.slice(1).trim());
	}
	return { locator: "", suffix: tail.trim() };
}

/** One `prefix -@key, locator suffix`, as it stands between two semicolons. */
export function parseCitation(text: string): ParsedCitation | null {
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
	const { locator, suffix } = splitTail(tail);
	const { label, locator: bare } = splitLocator(locator);

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
 */
export function parseGroups(text: string): CitationGroup[] {
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
			.map(parseCitation)
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

/**
 * The note with everything that is not prose emptied out: the front matter,
 * fenced code, inline code, and both kinds of comment. A citation key in any
 * of them is stored or talked about rather than cited — reading view does not
 * draw one in code either, and pandoc renders none of them.
 *
 * Lines are emptied rather than dropped, so a bracket never meets another one
 * across the gap a block left.
 */
export function proseOf(text: string): string {
	const lines = text.split("\n");
	let i = 0;
	if (lines[0]?.trimEnd() === "---") {
		lines[0] = "";
		for (i = 1; i < lines.length; i++) {
			const end = ["---", "..."].includes(lines[i].trimEnd());
			lines[i] = "";
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
			lines[i] = "";
		} else if (opening) {
			fence = opening[1];
			lines[i] = "";
		}
	}

	return (
		lines
			.join("\n")
			// A code span closes on a run of as many backticks as opened it,
			// and never runs on past the end of its paragraph.
			.replace(/(`+)(?:(?!\n[ \t]*\n)[\s\S])*?[^`]\1(?!`)/g, "")
			.replace(/%%[\s\S]*?(?:%%|$)/g, "")
			.replace(/<!--[\s\S]*?(?:-->|$)/g, "")
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
