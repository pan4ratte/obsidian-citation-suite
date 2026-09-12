import { sanitizeHTMLToDom } from "obsidian";
import { Engine } from "citeproc";
import { parseGroups } from "src/citation";
import { CitationRenderer } from "src/render";

/**
 * Showing citations in their style in reading view.
 *
 * Obsidian has already turned the note into HTML by the time this runs, so the
 * pandoc citations are sitting in text nodes. Each one is replaced by the
 * citation the style writes, in a span that carries the original text as its
 * tooltip — the note still says `[@doe2020, p. 33]`, and this is the only place
 * to see that while reading.
 *
 * What is not touched: code, maths, and anything already inside a link. A
 * citation key in a code block is being talked about rather than used.
 */

/** The class every rendered citation carries, for styles.css to reach. */
export const RENDERED_CLASS = "zoterik-citation";

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

/** The rendered citation, as an element to stand in the note's place. */
function citationEl(doc: Document, html: string, source: string): HTMLElement {
	const span = createSpan({ cls: RENDERED_CLASS });
	// The citation is the reader's own library talking, but it is still markup
	// from outside this file, so it goes through Obsidian's sanitizer.
	span.appendChild(sanitizeHTMLToDom(html));
	// What the note actually says, one hover away.
	span.setAttribute("aria-label", source);
	return span;
}

/**
 * Replaces the citations in one text node. The node is rebuilt as a run of
 * text and spans, because a text node cannot hold elements.
 */
function decorateNode(
	node: Text,
	engine: Engine,
	renderer: CitationRenderer
): void {
	const text = node.nodeValue ?? "";
	const groups = parseGroups(text);
	if (groups.length === 0) {
		return;
	}

	const doc = node.ownerDocument;
	const fragment = createFragment();
	let at = 0;
	let replaced = false;

	for (const group of groups) {
		const html = renderer.render(engine, group);
		if (!html) {
			// An unknown key or a style that would not load: leave this one as
			// the note wrote it.
			continue;
		}
		fragment.appendChild(doc.createTextNode(text.slice(at, group.from)));
		fragment.appendChild(
			citationEl(doc, html, text.slice(group.from, group.to))
		);
		at = group.to;
		replaced = true;
	}

	if (!replaced) {
		return;
	}
	fragment.appendChild(doc.createTextNode(text.slice(at)));
	node.parentNode?.replaceChild(fragment, node);
}

/**
 * The post processor Obsidian runs over every rendered block. It is given the
 * style to render in and the renderer holding the library; both come from the
 * plugin, which rebuilds them when the setting changes.
 */
export async function renderCitations(
	el: HTMLElement,
	renderer: CitationRenderer,
	styleId: string
): Promise<void> {
	if (!styleId) {
		return;
	}
	const nodes = citableTextNodes(el);
	if (nodes.length === 0) {
		return;
	}

	const groups = nodes.flatMap((node) => parseGroups(node.nodeValue ?? ""));
	if (groups.length === 0) {
		return;
	}

	// One request for everything this block cites, before anything is drawn:
	// citeproc is handed its items synchronously or not at all.
	await renderer.load(
		groups.flatMap((group) =>
			group.citations.map((citation) => citation.id)
		)
	);
	const engine = await renderer.engineFor(styleId);
	if (!engine) {
		return;
	}

	for (const node of nodes) {
		decorateNode(node, engine, renderer);
	}
}
