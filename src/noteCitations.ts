import {
	CitationGroup,
	ENGLISH_LABELS,
	LocatorLabels,
	parseGroups,
	proseOf,
} from "src/citation";
import { footnoteLayout } from "src/footnote";

/**
 * A note's citations in the order pandoc reads them, and the note each stands
 * in.
 *
 * A style writes a citation by what came before it in the document: the second
 * citation of a source is shortened, one straight after another of the same
 * source is "Ibid.", a numbered style numbers sources by when they are first
 * cited, and two sources by one author in one year become 2020a and 2020b. So
 * every citation has to be written knowing the whole note, and knowing it in
 * the order pandoc will hand the citations to the style — which is not quite
 * the order of the text.
 *
 * Pandoc reads a footnote's text where the footnote is anchored, not where the
 * text stands: `[^1]: [@doe2020]` at the end of the note is cited at `[^1]`. An
 * inline note, `^[…]`, is read where it stands. A footnote whose text nothing
 * anchors is not in the document pandoc writes at all; it is put after
 * everything else here, as the renumbering puts it, so that it is still drawn.
 *
 * And a note style puts every citation in a note: the ones already in a
 * footnote in that footnote, and every citation in the body text in a note of
 * its own, numbered among the footnotes. That number is what "Ibid." is worked
 * out from, and it is carried on every citation; an in-text style ignores it.
 *
 * Pure, like the rest of the parsing: text in, citations out.
 */

export interface NoteCitation extends CitationGroup {
	/** Whether it stands in a footnote's text or an inline note. */
	inNote: boolean;
	/**
	 * The note it stands in, counting from 1, as a note style numbers them:
	 * its footnote's number, or — in the body text — the number of the note
	 * a note style makes of it.
	 */
	noteNumber: number;
}

/** A span of the note, from one offset to another. */
interface Span {
	from: number;
	to: number;
}

/**
 * The span of the list that holds the other one, or `null`. The list is in
 * order and its spans do not overlap, so it is searched by halves: a long
 * note has hundreds of footnotes and thousands of citations.
 */
function holder(spans: Span[], span: Span): Span | null {
	let low = 0;
	let high = spans.length - 1;
	while (low <= high) {
		const middle = (low + high) >> 1;
		if (spans[middle].from <= span.from) {
			low = middle + 1;
		} else {
			high = middle - 1;
		}
	}
	const candidate = spans[high];
	return candidate && span.to <= candidate.to ? candidate : null;
}

/** The groups inside the span, from a list of groups in order. */
function groupsIn(groups: CitationGroup[], span: Span): CitationGroup[] {
	let low = 0;
	let high = groups.length;
	while (low < high) {
		const middle = (low + high) >> 1;
		if (groups[middle].from < span.from) {
			low = middle + 1;
		} else {
			high = middle;
		}
	}
	const inside: CitationGroup[] = [];
	for (let i = low; i < groups.length && groups[i].from < span.to; i++) {
		if (groups[i].to <= span.to) {
			inside.push(groups[i]);
		}
	}
	return inside;
}

/**
 * Every inline note in the prose, `^[…]`, from the caret to its closing
 * bracket. Brackets inside it are counted, since the citations in one have
 * brackets of their own; a note never closed is not one.
 */
function inlineNotes(prose: string): Span[] {
	const notes: Span[] = [];
	for (let at = prose.indexOf("^["); at !== -1; at = prose.indexOf("^[", at + 1)) {
		let depth = 0;
		for (let i = at + 1; i < prose.length; i++) {
			if (prose[i] === "[") {
				depth++;
			} else if (prose[i] === "]" && --depth === 0) {
				notes.push({ from: at, to: i + 1 });
				at = i;
				break;
			}
		}
	}
	return notes;
}

/**
 * Every citation in the note, in the order pandoc reads them, each with the
 * note it stands in. Code, comments and front matter hold none (`proseOf`).
 */
export function noteCitations(
	text: string,
	labels: LocatorLabels = ENGLISH_LABELS
): NoteCitation[] {
	const prose = proseOf(text);
	const groups = parseGroups(prose, labels);
	if (groups.length === 0) {
		return [];
	}
	const { anchors, definitions } = footnoteLayout(text, prose);

	// The first text of a label is the one pandoc reads; a second one of the
	// same label is anchored by nothing.
	const definitionOf = new Map<string, Span>();
	for (const definition of definitions) {
		if (!definitionOf.has(definition.label)) {
			definitionOf.set(definition.label, definition);
		}
	}
	const inDefinition = (span: Span): boolean => holder(definitions, span) !== null;
	// A note inside a note is not one: pandoc has no nested notes, so an
	// anchor or an inline note in a footnote's text belongs to that text.
	const bodyInline = inlineNotes(prose).filter((note) => !inDefinition(note));

	/** Something in the body text that makes a note, where it stands. */
	type Event =
		| { at: number; kind: "anchor"; definition: Span }
		| { at: number; kind: "inline"; note: Span }
		| { at: number; kind: "citation"; group: CitationGroup };
	const events: Event[] = [];
	const anchored = new Set<string>();
	for (const anchor of anchors) {
		const definition = definitionOf.get(anchor.label);
		if (definition && !anchored.has(anchor.label) && !inDefinition(anchor)) {
			anchored.add(anchor.label);
			events.push({ at: anchor.from, kind: "anchor", definition });
		}
	}
	for (const note of bodyInline) {
		events.push({ at: note.from, kind: "inline", note });
	}
	for (const group of groups) {
		if (!inDefinition(group) && !holder(bodyInline, group)) {
			events.push({ at: group.from, kind: "citation", group });
		}
	}
	events.sort((a, b) => a.at - b.at);

	const ordered: NoteCitation[] = [];
	let noteNumber = 0;
	const takeAll = (span: Span): void => {
		noteNumber++;
		for (const group of groupsIn(groups, span)) {
			ordered.push({ ...group, inNote: true, noteNumber });
		}
	};
	for (const event of events) {
		if (event.kind === "anchor") {
			takeAll(event.definition);
		} else if (event.kind === "inline") {
			takeAll(event.note);
		} else {
			noteNumber++;
			ordered.push({ ...event.group, inNote: false, noteNumber });
		}
	}
	// Footnote texts nothing anchors, after everything else, in the order
	// they stand.
	for (const definition of definitions) {
		if (
			!anchored.has(definition.label) ||
			definitionOf.get(definition.label) !== definition
		) {
			takeAll(definition);
		}
	}
	return ordered;
}

/**
 * What a group cites, as one string: two groups with the same signature are
 * written alike in the same place. Where the group stands is not part of it.
 */
export function citationSignature(group: CitationGroup): string {
	return JSON.stringify(
		group.citations.map((citation) => [
			citation.id,
			citation.locator,
			citation.label,
			citation.prefix,
			citation.suffix,
			citation.suppressAuthor,
		])
	);
}

/**
 * Which of the note's citations each of the groups is, for groups read from a
 * piece of the note rather than the note — a block of reading view, the text of
 * a footnote in its popover — whose offsets say nothing about where in the
 * note they stand.
 *
 * The groups are taken in order and each is matched to the next candidate
 * written the same way, so a citation repeated word for word is told apart by
 * how many times it came before. The candidates are the note's citations the
 * piece could hold, in the order the piece holds them. A group with no match
 * is `null`.
 */
export function matchCitations(
	groups: CitationGroup[],
	candidates: NoteCitation[]
): (NoteCitation | null)[] {
	const signatures = candidates.map(citationSignature);
	let at = 0;
	return groups.map((group) => {
		const signature = citationSignature(group);
		const index = signatures.indexOf(signature, at);
		if (index === -1) {
			return null;
		}
		at = index + 1;
		return candidates[index];
	});
}
