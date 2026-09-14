import { proseOf } from "src/citation";

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

/**
 * What stands between the settings' prefix and suffix in a label, or `null`
 * when the label is not written between them.
 */
function labelCore(label: string, options: FootnoteLabelOptions): string | null {
	const prefix = cleanLabelText(options.prefix);
	const suffix = cleanLabelText(options.suffix);
	if (
		label.length <= prefix.length + suffix.length ||
		!label.startsWith(prefix) ||
		!label.endsWith(suffix)
	) {
		return null;
	}
	return label.slice(prefix.length, label.length - suffix.length);
}

/**
 * The number a label is written with — arabic, or roman in either case,
 * between this prefix and suffix — or `null`.
 */
function labelNumber(label: string, options: FootnoteLabelOptions): number | null {
	const core = labelCore(label, options);
	if (core === null) {
		return null;
	}
	return /^[0-9]+$/.test(core) ? Number(core) : fromRoman(core);
}

/**
 * Whether a label is a name rather than a number, for renumbering with named
 * footnotes kept. A number here is narrower than `labelNumber`'s: arabic
 * digits, or a roman numeral only when the settings write roman numerals, and
 * only in their case. Any word made of `i v x l c d m` reads as a numeral, and
 * a footnote named `[^x]` or `[^mix]` in a note numbered in arabic is far more
 * likely a name than a leftover numeral; wrongly renumbered, a name is lost,
 * while a leftover numeral wrongly kept is only left as it was. A label written
 * under a prefix or suffix the settings no longer have is a name too.
 */
export function isNamedLabel(
	label: string,
	options: FootnoteLabelOptions
): boolean {
	const core = labelCore(label, options);
	if (core === null) {
		return true;
	}
	if (/^[0-9]+$/.test(core)) {
		return false;
	}
	const inCase =
		(options.numbering === "roman-lower" && core === core.toLowerCase()) ||
		(options.numbering === "roman-upper" && core === core.toUpperCase());
	return !inCase || fromRoman(core) === null;
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
	const labels = labelsIn(text);

	let highest = 0;
	for (const label of labels) {
		const n = labelNumber(label, options);
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
	/**
	 * The end of the footnote's text, in the text as it is after the changes —
	 * where a footnote written by hand is typed into.
	 */
	textEnd: number;
}

/**
 * Whether the offset stands in a footnote's text: in a paragraph that opens
 * with `[^label]:`.
 */
export function inFootnoteText(text: string, offset: number): boolean {
	const lines = text.split("\n");
	const line = text.slice(0, offset).split("\n").length - 1;
	return DEFINITION.test(lines[blockStart(lines, line)]);
}

/**
 * The edits that put `content` in a footnote, for a note holding `text` whose
 * selection runs from `from` to `to`: the selection is replaced by the anchor,
 * and the footnote's text goes where the placement puts it. The content is a
 * citation, or nothing at all for a footnote to be written by hand.
 *
 * A footnote cannot hold a footnote, so a citation made inside one — with the
 * cursor in a footnote's text — is written there as it is.
 */
export function footnoteEdit(
	text: string,
	from: number,
	to: number,
	content: string,
	options: FootnoteOptions
): FootnoteEdit {
	if (inFootnoteText(text, from)) {
		const end = from + content.length;
		return {
			changes: [{ from, to, text: content }],
			cursor: end,
			textEnd: end,
		};
	}
	const cursorLine = text.slice(0, from).split("\n").length - 1;

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

	// The footnote is kept a blank line away from whatever is above it — the
	// text, or the footnotes already there — and from a heading right under it.
	const crowded =
		line + 1 < anchoredLines.length && !BLANK.test(anchoredLines[line + 1]);
	const opening = `\n\n[^${label}]: `;
	const definition = `${opening}${content}${crowded ? "\n" : ""}`;

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
		// The anchored note is the note after the first change, and the
		// second goes in at `at` in it.
		textEnd: at + opening.length + content.length,
	};
}

/** A `[^label]` in the note: where the label inside it is, and its role. */
interface LabelMark {
	from: number;
	to: number;
	label: string;
	/** Whether it opens a footnote's text, `[^label]:`, rather than anchoring one. */
	definition: boolean;
}

/**
 * Every `[^label]` in the prose, anchors and definitions alike. The prose is
 * the note with code and comments blanked out (`proseOf`), so a label written
 * about in code is not taken for one.
 */
function labelMarks(prose: string): LabelMark[] {
	const marks: LabelMark[] = [];
	for (const match of prose.matchAll(/\[\^([^\]\s]+)\]/g)) {
		const start = match.index;
		const lineStart = prose.lastIndexOf("\n", start - 1) + 1;
		marks.push({
			from: start + 2,
			to: start + 2 + match[1].length,
			label: match[1],
			definition:
				/^ {0,3}$/.test(prose.slice(lineStart, start)) &&
				prose[start + match[0].length] === ":",
		});
	}
	return marks;
}

/** A footnote's text: the lines it runs over, inclusive, and its label. */
interface DefinitionBlock {
	start: number;
	end: number;
	label: string;
}

/** A line that goes on a footnote's text past a blank line: indented. */
const CONTINUATION = /^( {4}|\t)/;

/**
 * Every footnote's text, as pandoc reads how far one runs: its first line, the
 * lines straight under it up to a blank line, a heading or the next footnote,
 * and after a blank line any further paragraph indented under it.
 */
function definitionBlocks(
	lines: string[],
	proseLines: string[]
): DefinitionBlock[] {
	const opens = (i: number): RegExpExecArray | null =>
		/^ {0,3}\[\^([^\]\s]+)\]:/.exec(proseLines[i]);
	const blocks: DefinitionBlock[] = [];
	for (let i = 0; i < lines.length; i++) {
		const opening = opens(i);
		if (!opening) {
			continue;
		}
		let end = i;
		while (end + 1 < lines.length && !opens(end + 1)) {
			const next = end + 1;
			if (!BLANK.test(lines[next])) {
				if (HEADING.test(lines[next])) {
					break;
				}
				end = next;
				continue;
			}
			let after = next;
			while (after < lines.length && BLANK.test(lines[after])) {
				after++;
			}
			if (
				after < lines.length &&
				CONTINUATION.test(lines[after]) &&
				!opens(after)
			) {
				end = after;
				continue;
			}
			break;
		}
		blocks.push({ start: i, end, label: opening[1] });
		i = end;
	}
	return blocks;
}

export interface FootnoteRenumbering {
	/** The edits, in offsets into the text as it was before any of them. */
	changes: TextChange[];
	/** How many footnotes the note has, told apart by label. */
	count: number;
}

/**
 * The edits that number the note's footnotes in order: the footnote whose
 * anchor comes first gets the first label, as the settings write labels, the
 * next one the second, and so on — the order pandoc and Obsidian number them in
 * anyway, so the note reads the same and only its source is put straight. A
 * footnote whose text is never anchored comes after all the others.
 *
 * Every label is rewritten, a hand-named `[^kuhn]` too — the settings are what
 * a label should look like — unless `keepNamed` is set. Then a named label
 * (see `isNamedLabel`) is left as it is and takes no number, and the numbered
 * ones are counted past it: `A[^3] B[^kuhn] C[^1]` becomes
 * `A[^1] B[^kuhn] C[^2]`. A new label cannot meet an old one, since every
 * label spelling a number is renumbered too; one differing from a kept label
 * only in case is stepped over, as `nextFootnoteLabel` steps over it. Labels
 * are otherwise told apart by case, as Obsidian and pandoc tell them.
 *
 * Footnote texts standing together — under a paragraph, at the end of a
 * section or of the note — are put in the order of their new numbers, each
 * keeping the blank lines between them where they were. None is moved out of
 * where it stands.
 */
export function renumberFootnotes(
	text: string,
	options: FootnoteLabelOptions,
	keepNamed = false
): FootnoteRenumbering {
	const prose = proseOf(text);
	const marks = labelMarks(prose);

	const order: string[] = [];
	const numbered = new Set<string>();
	const take = (label: string): void => {
		if (!numbered.has(label)) {
			numbered.add(label);
			order.push(label);
		}
	};
	marks.filter((mark) => !mark.definition).forEach((mark) => take(mark.label));
	marks.filter((mark) => mark.definition).forEach((mark) => take(mark.label));
	const kept = keepNamed
		? order.filter((label) => isNamedLabel(label, options))
		: [];
	const taken = new Set(kept.map((label) => label.toLowerCase()));
	const renamed = new Map(kept.map((label) => [label, label]));
	let n = 0;
	for (const label of order) {
		if (renamed.has(label)) {
			continue;
		}
		do {
			n++;
		} while (taken.has(footnoteLabel(n, options).toLowerCase()));
		renamed.set(label, footnoteLabel(n, options));
	}
	// The footnote texts are put in the order of their anchors, a kept one's
	// among the rest.
	const number = new Map(order.map((label, index) => [label, index]));

	const lines = text.split("\n");
	const lineStarts: number[] = [];
	let offset = 0;
	for (const line of lines) {
		lineStarts.push(offset);
		offset += line.length + 1;
	}
	const lineEnd = (line: number): number => lineStarts[line] + lines[line].length;

	/** The text from `from` to `to` with its labels renamed. */
	const renamedText = (from: number, to: number): string => {
		let result = "";
		let at = from;
		for (const mark of marks) {
			if (mark.from >= from && mark.to <= to) {
				result += text.slice(at, mark.from) + renamed.get(mark.label);
				at = mark.to;
			}
		}
		return result + text.slice(at, to);
	};

	// Footnote texts with nothing but blank lines between them stand together.
	const runs: DefinitionBlock[][] = [];
	for (const block of definitionBlocks(lines, prose.split("\n"))) {
		const run = runs[runs.length - 1];
		const last = run?.[run.length - 1];
		const between = last ? lines.slice(last.end + 1, block.start) : null;
		if (between?.every((line) => BLANK.test(line))) {
			run.push(block);
		} else {
			runs.push([block]);
		}
	}

	const changes: TextChange[] = [];
	const rewritten: [number, number][] = [];
	for (const run of runs) {
		const sorted = [...run].sort(
			(a, b) => (number.get(a.label) ?? 0) - (number.get(b.label) ?? 0)
		);
		if (sorted.every((block, index) => block === run[index])) {
			continue;
		}
		const from = lineStarts[run[0].start];
		const to = lineEnd(run[run.length - 1].end);
		let written = "";
		sorted.forEach((block, index) => {
			if (index > 0) {
				// The gap that stood in this place, kept where it was.
				written += text.slice(
					lineEnd(run[index - 1].end),
					lineStarts[run[index].start]
				);
			}
			written += renamedText(lineStarts[block.start], lineEnd(block.end));
		});
		changes.push({ from, to, text: written });
		rewritten.push([from, to]);
	}

	for (const mark of marks) {
		const label = renamed.get(mark.label) ?? mark.label;
		const inRewritten = rewritten.some(
			([from, to]) => mark.from >= from && mark.to <= to
		);
		if (label !== mark.label && !inRewritten) {
			changes.push({ from: mark.from, to: mark.to, text: label });
		}
	}
	changes.sort((a, b) => a.from - b.from);
	return { changes, count: order.length };
}
