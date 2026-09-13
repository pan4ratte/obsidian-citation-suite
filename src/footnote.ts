/**
 * Putting a citation into a footnote rather than into the sentence.
 *
 * The note gets two things: the footnote's anchor — `[^1]` — where the cursor
 * is, and its text — `[^1]: [@doe2020, p. 33]` — further down, after the
 * paragraph, at the end of the section or at the end of the note. Both are the
 * footnote syntax pandoc and Obsidian read alike, so the citation inside is
 * still a pandoc citation, drawn in its style like any other.
 *
 * Everything here works on the note's text and offsets into it, and knows
 * nothing of the editor, so every rule below is testable without one.
 */

/** How the number in a footnote's label is written. */
export type FootnoteNumbering = "arabic" | "roman-lower" | "roman-upper";

/** Where a footnote's text is put. */
export type FootnotePlacement = "paragraph" | "section" | "document";

/** Every numbering there is, in the order the settings offer them. */
export const FOOTNOTE_NUMBERINGS: FootnoteNumbering[] = [
	"arabic",
	"roman-lower",
	"roman-upper",
];

/** Every placement there is, in the order the settings offer them. */
export const FOOTNOTE_PLACEMENTS: FootnotePlacement[] = [
	"paragraph",
	"section",
	"document",
];

/** What a label is made of: the number, and the text around it. */
export interface FootnoteLabelOptions {
	numbering: FootnoteNumbering;
	prefix: string;
	suffix: string;
}

export interface FootnoteOptions extends FootnoteLabelOptions {
	placement: FootnotePlacement;
}

/**
 * What a label may not hold. Whitespace and the brackets end it, and a `^`
 * would read as the start of another; a backslash escapes whatever follows it,
 * and a `|` cuts a table cell the anchor stands in.
 */
const FORBIDDEN_IN_LABEL = /[\s[\]^\\|]/;

/** Whether text can stand around a footnote's number without breaking it. */
export function isValidLabelText(text: string): boolean {
	return !FORBIDDEN_IN_LABEL.test(text);
}

/**
 * The text with whatever a label may not hold taken out. The settings refuse
 * such text as it is typed, but `data.json` can be edited by hand, and a label
 * that breaks the footnote is worse than one missing a character.
 */
function cleanLabelText(text: string): string {
	return text.replace(new RegExp(FORBIDDEN_IN_LABEL.source, "g"), "");
}

const ROMAN: [number, string][] = [
	[1000, "M"],
	[900, "CM"],
	[500, "D"],
	[400, "CD"],
	[100, "C"],
	[90, "XC"],
	[50, "L"],
	[40, "XL"],
	[10, "X"],
	[9, "IX"],
	[5, "V"],
	[4, "IV"],
	[1, "I"],
];

/**
 * A roman numeral written the standard way. Past 3999 there is no standard,
 * and the thousands simply go on as `M`s: a note with that many footnotes is
 * not going to be read for its numerals.
 */
const ROMAN_NUMERAL = /^M*(CM|CD|D?C{0,3})(XC|XL|L?X{0,3})(IX|IV|V?I{0,3})$/;

/** `n` in roman numerals, upper case. */
export function toRoman(n: number): string {
	let rest = n;
	let roman = "";
	for (const [value, numeral] of ROMAN) {
		while (rest >= value) {
			roman += numeral;
			rest -= value;
		}
	}
	return roman;
}

/**
 * The number a roman numeral stands for, in either case but not in a mix of
 * the two, or `null` for anything that is not one.
 */
export function fromRoman(text: string): number | null {
	if (!text || (text !== text.toUpperCase() && text !== text.toLowerCase())) {
		return null;
	}
	const upper = text.toUpperCase();
	if (!ROMAN_NUMERAL.test(upper)) {
		return null;
	}
	let n = 0;
	let at = 0;
	for (const [value, numeral] of ROMAN) {
		while (upper.startsWith(numeral, at)) {
			n += value;
			at += numeral.length;
		}
	}
	return n;
}

/** The label of the `n`th footnote, without the `[^` and `]` around it. */
export function footnoteLabel(n: number, options: FootnoteLabelOptions): string {
	const number =
		options.numbering === "arabic"
			? String(n)
			: options.numbering === "roman-lower"
				? toRoman(n).toLowerCase()
				: toRoman(n);
	return `${cleanLabelText(options.prefix)}${number}${cleanLabelText(options.suffix)}`;
}

/** Every footnote label in the text, anchors and definitions alike. */
function labelsIn(text: string): string[] {
	return [...text.matchAll(/\[\^([^\]\s]+)\]/g)].map((match) => match[1]);
}

/**
 * The label the next footnote gets: one past the highest number already
 * written between this prefix and suffix, in whichever numbering it was
 * written — a note begun in arabic numerals and carried on in roman ones keeps
 * counting rather than starting again at `i`.
 *
 * The number is not the footnote's place in the note. Pandoc and Obsidian both
 * number footnotes by the order they appear in, whatever their labels say, so a
 * footnote added above the others reads as the first one all the same.
 */
export function nextFootnoteLabel(
	text: string,
	options: FootnoteLabelOptions
): string {
	const prefix = cleanLabelText(options.prefix);
	const suffix = cleanLabelText(options.suffix);
	const labels = labelsIn(text);

	let highest = 0;
	for (const label of labels) {
		if (
			label.length <= prefix.length + suffix.length ||
			!label.startsWith(prefix) ||
			!label.endsWith(suffix)
		) {
			continue;
		}
		const core = label.slice(prefix.length, label.length - suffix.length);
		const n = /^[0-9]+$/.test(core) ? Number(core) : fromRoman(core);
		if (n !== null) {
			highest = Math.max(highest, n);
		}
	}

	// A label of the note's own that happens to spell the next one — `[^ii]`
	// written by hand in a note numbered in arabic — is stepped over. Case is
	// ignored in that comparison, since not every reader of the note keeps it.
	const taken = new Set(labels.map((label) => label.toLowerCase()));
	let n = highest + 1;
	while (taken.has(footnoteLabel(n, options).toLowerCase())) {
		n++;
	}
	return footnoteLabel(n, options);
}

const BLANK = /^\s*$/;
const HEADING = /^ {0,3}#{1,6}(\s|$)/;
const DEFINITION = /^ {0,3}\[\^[^\]\s]+\]:/;
const FENCE = /^ {0,3}(`{3,}|~{3,})/;

/**
 * Which lines are headings. A `#` inside a code block or in the front matter
 * is not one, so both are stepped over.
 */
function headingLines(lines: string[]): boolean[] {
	const headings = lines.map(() => false);
	let i = 0;
	if (lines[0] === "---") {
		i = 1;
		while (i < lines.length && lines[i] !== "---" && lines[i] !== "...") {
			i++;
		}
		i++;
	}
	let fence: string | null = null;
	for (; i < lines.length; i++) {
		const line = lines[i];
		const opening = FENCE.exec(line);
		if (fence) {
			if (
				opening &&
				opening[1][0] === fence[0] &&
				opening[1].length >= fence.length &&
				BLANK.test(line.slice(opening[0].length))
			) {
				fence = null;
			}
			continue;
		}
		if (opening) {
			fence = opening[1];
			continue;
		}
		headings[i] = HEADING.test(line);
	}
	return headings;
}

/** The first line of the run of non-blank lines the given one is in. */
function blockStart(lines: string[], line: number): number {
	let start = line;
	while (start > 0 && !BLANK.test(lines[start - 1])) {
		start--;
	}
	return start;
}

/** The last line of the run of non-blank lines the given one is in. */
function blockEnd(lines: string[], line: number): number {
	let end = line;
	while (end + 1 < lines.length && !BLANK.test(lines[end + 1])) {
		end++;
	}
	return end;
}

/**
 * The line the footnote's text goes after, in a note whose anchor is already
 * on `line`.
 *
 * After the paragraph, it goes past any footnotes already standing under that
 * paragraph, so that they stay in the order they were added. At the end of the
 * section or the note, it goes after the last line that holds anything — which
 * is past the footnotes already gathered there, for the same reason.
 */
function definitionLine(
	lines: string[],
	line: number,
	placement: FootnotePlacement
): number {
	if (placement === "paragraph") {
		let end = blockEnd(lines, line);
		for (;;) {
			let next = end + 1;
			while (next < lines.length && BLANK.test(lines[next])) {
				next++;
			}
			if (next >= lines.length || !DEFINITION.test(lines[next])) {
				return end;
			}
			end = blockEnd(lines, next);
		}
	}

	let limit = lines.length;
	if (placement === "section") {
		const headings = headingLines(lines);
		for (let i = line + 1; i < lines.length; i++) {
			if (headings[i]) {
				limit = i;
				break;
			}
		}
	}
	let last = limit - 1;
	while (last > line && BLANK.test(lines[last])) {
		last--;
	}
	return last;
}

/** An edit to the note, in offsets into the text as it was before any of them. */
export interface TextChange {
	from: number;
	to: number;
	text: string;
}

export interface FootnoteEdit {
	changes: TextChange[];
	/** Where the cursor goes afterwards, in the text as it is after them. */
	cursor: number;
}

/**
 * The edits that cite `citation` in a footnote, for a note holding `text` whose
 * selection runs from `from` to `to`: the selection is replaced by the anchor,
 * and the footnote's text goes where the placement puts it.
 *
 * A footnote cannot hold a footnote, so a citation made inside one — with the
 * cursor in a footnote's text — is written there as it is.
 */
export function footnoteEdit(
	text: string,
	from: number,
	to: number,
	citation: string,
	options: FootnoteOptions
): FootnoteEdit {
	const lines = text.split("\n");
	const cursorLine = text.slice(0, from).split("\n").length - 1;
	if (DEFINITION.test(lines[blockStart(lines, cursorLine)])) {
		return {
			changes: [{ from, to, text: citation }],
			cursor: from + citation.length,
		};
	}

	const label = nextFootnoteLabel(text.slice(0, from) + text.slice(to), options);
	const anchor = `[^${label}]`;

	// The text's place is worked out on the note as it will read once the
	// anchor is in: the selection gone, and the line it stood on no longer
	// blank.
	const anchored = text.slice(0, from) + anchor + text.slice(to);
	const anchoredLines = anchored.split("\n");
	const line = definitionLine(anchoredLines, cursorLine, options.placement);

	let at = 0;
	for (let i = 0; i <= line; i++) {
		at += anchoredLines[i].length + 1;
	}
	at -= 1;

	// A footnote joining others is written straight under them; one standing
	// on its own is kept a blank line away from the text above it, and from a
	// heading right under it.
	const joins = DEFINITION.test(anchoredLines[blockStart(anchoredLines, line)]);
	const crowded =
		line + 1 < anchoredLines.length && !BLANK.test(anchoredLines[line + 1]);
	const definition = `${joins ? "\n" : "\n\n"}[^${label}]: ${citation}${crowded ? "\n" : ""}`;

	// Back from the anchored note to the one the edits are made against. The
	// text always goes after the anchor, so only the anchor's length stands
	// between the two.
	const original = at - anchor.length + (to - from);
	return {
		changes: [
			{ from, to, text: anchor },
			{ from: original, to: original, text: definition },
		],
		cursor: from + anchor.length,
	};
}
