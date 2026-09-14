import {
	MarkdownPostProcessorContext,
	sanitizeHTMLToDom,
	setTooltip,
} from "obsidian";
import { t } from "lang/helpers";
import {
	CitationGroup,
	ENGLISH_LABELS,
	keyMentions,
	LocatorLabels,
	parseGroups,
} from "src/citation";
import {
	matchCitations,
	NoteCitation,
	noteCitations,
} from "src/noteCitations";
import { NoteRenderer } from "src/noteRendering";
import { CitationRenderer, RenderedCitation, StyleRef } from "src/render";

/**
 * Showing citations in their style in reading view.
 *
 * Obsidian has already turned the note into HTML by the time this runs, so the
 * pandoc citations are sitting in text nodes. Each one is replaced by the
 * citation the style writes, in a span whose tooltip is the bibliography entry
 * of every source it cites — `(Doe, 2020, p. 33)` names a source, and the entry
 * is what says which one.
 *
 * Obsidian hands over the note a block at a time, and a citation is written by
 * the whole note (`src/noteCitations.ts`), so each block's citations are found
 * among the note's: among those of the lines the block was drawn from, or —
 * for the list of footnotes Obsidian draws at the end of the note — among the
 * citations in footnotes, in the order the list has them.
 *
 * A key Zotero has no source for is marked where it stands, whether or not a
 * style is chosen, so that a typo does not wait for the export to show.
 *
 * What is not touched: code, maths, and anything already inside a link. A
 * citation key in a code block is being talked about rather than used.
 */

/** The class every rendered citation carries, for styles.css to reach. */
export const RENDERED_CLASS = "citation-suite-citation";

/** The class a key Zotero has no source for is marked with. */
export const MISSING_CLASS = "citation-suite-citation-missing";

/**
 * The class its tooltip carries. The tooltip is one element Obsidian shares
 * between everything that has one, so this is the only handle styles.css has
 * on it.
 */
const TOOLTIP_CLASS = "citation-suite-citation-tooltip";

/** Whether a rendered citation shows its sources on hover, and how soon. */
export interface CitationTooltip {
	enabled: boolean;
	/** Milliseconds the citation is hovered before the tooltip shows. */
	delay: number;
}

const SKIP = new Set(["CODE", "PRE", "A", "MJX-CONTAINER"]);

/** Every text node under the element that a citation could be written in. */
function citableTextNodes(root: HTMLElement): Text[] {
	const walker = root.doc.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
		acceptNode: (node: Node) => {
			if (!node.nodeValue?.includes("@")) {
				return NodeFilter.FILTER_REJECT;
			}
			for (
				let parent = node.parentElement;
				parent && parent !== root.parentElement;
				parent = parent.parentElement
			) {
				if (SKIP.has(parent.tagName)) {
					return NodeFilter.FILTER_REJECT;
				}
			}
			return NodeFilter.FILTER_ACCEPT;
		},
	});

	const nodes: Text[] = [];
	for (
		let node = walker.nextNode();
		node !== null;
		node = walker.nextNode()
	) {
		nodes.push(node as Text);
	}
	return nodes;
}

/**
 * The rendered citation, as an element to stand in the note's place. Live
 * preview draws its widgets with this too, so the two views cannot drift.
 */
export function citationEl(
	rendered: RenderedCitation,
	source: string,
	tooltip: CitationTooltip
): HTMLElement {
	const span = createSpan({ cls: RENDERED_CLASS });
	// The citation is the reader's own library talking, but it is still markup
	// from outside this file, so it goes through Obsidian's sanitizer.
	span.appendChild(sanitizeHTMLToDom(rendered.html));
	// The sources the citation stands for, one hover away. A style with no
	// bibliography has no entry to show, and what the note says is the next
	// best thing.
	if (tooltip.enabled) {
		setTooltip(span, rendered.bibliography || source, {
			classes: [TOOLTIP_CLASS],
			delay: tooltip.delay,
		});
	}
	return span;
}

/**
 * A key Zotero has no source for, as an element to stand where the key does,
 * saying so on hover. Live preview marks keys with the same class and tooltip.
 */
function missingKeyEl(text: string, tooltip: CitationTooltip): HTMLElement {
	const span = createSpan({ cls: MISSING_CLASS, text });
	setTooltip(span, t.CITATION_KEY_MISSING, { delay: tooltip.delay });
	return span;
}

/** What the plugin hands reading view: the renderer, the notes, and the settings read. */
export interface ReadingContext {
	renderer: CitationRenderer;
	notes: NoteRenderer;
	/** The style the note at the path is rendered in, or `null` for none. */
	styleFor(path: string): Promise<StyleRef | null>;
	tooltip(): CitationTooltip;
	/** Whether keys Zotero has no source for are marked. */
	markMissing(): boolean;
	/** The whole text of the note at the path, or `null` if it is not a note. */
	noteText(path: string): Promise<string | null>;
}

/** A text node that holds citations, and whether it is in the list of footnotes. */
interface CitingNode {
	node: Text;
	groups: CitationGroup[];
	inFootnotes: boolean;
}

/**
 * Replaces the citations in one text node, and marks the keys Zotero has no
 * source for in the ones left as they are written. The node is rebuilt as a
 * run of text and spans, because a text node cannot hold elements.
 */
function decorateNode(
	{ node, groups }: CitingNode,
	rendered: Map<CitationGroup, RenderedCitation | null>,
	context: ReadingContext
): void {
	const text = node.nodeValue ?? "";
	const tooltip = context.tooltip();
	const doc = node.ownerDocument;
	const fragment = createFragment();
	let at = 0;
	let replaced = false;
	const upTo = (to: number): void => {
		fragment.appendChild(doc.createTextNode(text.slice(at, to)));
	};

	for (const group of groups) {
		const citation = rendered.get(group);
		if (citation) {
			upTo(group.from);
			fragment.appendChild(
				citationEl(citation, text.slice(group.from, group.to), tooltip)
			);
			at = group.to;
			replaced = true;
			continue;
		}
		if (!context.markMissing()) {
			continue;
		}
		for (const mention of keyMentions(text, group)) {
			if (context.renderer.missing(mention.id)) {
				upTo(mention.from);
				fragment.appendChild(
					missingKeyEl(text.slice(mention.from, mention.to), tooltip)
				);
				at = mention.to;
				replaced = true;
			}
		}
	}

	if (!replaced) {
		return;
	}
	fragment.appendChild(doc.createTextNode(text.slice(at)));
	node.parentNode?.replaceChild(fragment, node);
}

/** The note last read, since every block of it asks for the same one. */
let lastNote: {
	text: string;
	labels: LocatorLabels;
	citations: NoteCitation[];
} | null = null;

function citationsOf(text: string, labels: LocatorLabels): NoteCitation[] {
	if (lastNote?.text !== text || lastNote.labels !== labels) {
		lastNote = { text, labels, citations: noteCitations(text, labels) };
	}
	return lastNote.citations;
}

/** The offset the line starts at in the text, or the text's end past its last line. */
function lineOffset(text: string, line: number): number {
	let offset = 0;
	for (let i = 0; i < line; i++) {
		const end = text.indexOf("\n", offset);
		if (end === -1) {
			return text.length;
		}
		offset = end + 1;
	}
	return offset;
}

/**
 * The post processor Obsidian runs over every rendered block. Everything it
 * needs comes from the plugin through the context, read afresh on every run,
 * since the plugin redraws the views when a setting changes.
 */
export async function renderCitations(
	el: HTMLElement,
	ctx: MarkdownPostProcessorContext,
	context: ReadingContext
): Promise<void> {
	const textNodes = citableTextNodes(el);
	if (textNodes.length === 0) {
		return;
	}
	const style = await context.styleFor(ctx.sourcePath);
	if (!style && !context.markMissing()) {
		return;
	}
	// Locators are read in the note's language when it gives one; with no
	// style, only the keys matter, and those read the same in any language.
	const labels = style?.labels ?? ENGLISH_LABELS;
	const nodes: CitingNode[] = textNodes.map((node) => ({
		node,
		groups: parseGroups(node.nodeValue ?? "", labels),
		inFootnotes: node.parentElement?.closest(".footnotes") != null,
	}));
	const groups = nodes.flatMap((entry) => entry.groups);
	if (groups.length === 0) {
		return;
	}

	// One request for everything this block cites, before anything is drawn:
	// citeproc is handed its items synchronously or not at all.
	await context.renderer.load(
		groups.flatMap((group) => group.citations.map((citation) => citation.id))
	);

	const rendered = new Map<CitationGroup, RenderedCitation | null>();
	if (style) {
		await renderInNote(el, ctx, context, style, nodes, rendered);
	}
	for (const entry of nodes) {
		decorateNode(entry, rendered, context);
	}
}

/**
 * Writes the block's citations as the note's, into `rendered`. A block that
 * belongs to no note, or to one that cannot be read, has its citations written
 * each on its own, as they would read with nothing around them.
 */
async function renderInNote(
	el: HTMLElement,
	ctx: MarkdownPostProcessorContext,
	context: ReadingContext,
	style: StyleRef,
	nodes: CitingNode[],
	rendered: Map<CitationGroup, RenderedCitation | null>
): Promise<void> {
	const section = ctx.getSectionInfo(el);
	const text = section?.text ?? (await context.noteText(ctx.sourcePath));
	const note =
		text !== null
			? await context.notes.render(style, ctx.sourcePath, citationsOf(text, style.labels))
			: null;
	if (text === null || !note) {
		const engines = await context.renderer.engineFor(style);
		for (const group of nodes.flatMap((entry) => entry.groups)) {
			rendered.set(group, engines ? context.renderer.render(engines, group) : null);
		}
		return;
	}

	const written = new Map(
		note.citations.map((citation, index) => [citation, note.rendered[index]])
	);
	const byPosition = [...note.citations].sort((a, b) => a.from - b.from);
	let body: NoteCitation[];
	if (section) {
		const from = lineOffset(text, section.lineStart);
		const to = lineOffset(text, section.lineEnd + 1);
		body = byPosition.filter(
			(citation) => citation.from >= from && citation.to <= to
		);
	} else {
		// The whole note in one block — an embed, a print — with its
		// footnotes drawn apart from its body.
		body = byPosition.filter((citation) => !citation.inNote);
	}
	// Obsidian lists the footnotes in the order they are anchored, which is
	// the order their citations are read in.
	const footnotes = note.citations.filter((citation) => citation.inNote);

	for (const inFootnotes of [false, true]) {
		const groups = nodes
			.filter((entry) => entry.inFootnotes === inFootnotes)
			.flatMap((entry) => entry.groups);
		const matches = matchCitations(groups, inFootnotes ? footnotes : body);
		groups.forEach((group, index) => {
			const match = matches[index];
			rendered.set(group, match ? (written.get(match) ?? null) : null);
		});
	}
}
