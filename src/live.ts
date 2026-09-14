import { RangeSetBuilder, StateEffect, StateField, Text } from "@codemirror/state";
import {
	Decoration,
	DecorationSet,
	EditorView,
	PluginValue,
	ViewPlugin,
	ViewUpdate,
	WidgetType,
} from "@codemirror/view";
import { editorInfoField, editorLivePreviewField, MarkdownView } from "obsidian";
import { t } from "lang/helpers";
import { ENGLISH_LABELS, keyMentions, LocatorLabels } from "src/citation";
import { matchCitations, NoteCitation, noteCitations } from "src/noteCitations";
import { NoteRenderer } from "src/noteRendering";
import { CitationTooltip, citationEl, MISSING_CLASS } from "src/reading";
import { CitationRenderer, RenderedCitation, StyleRef } from "src/render";

/**
 * Showing citations in their style while the note is being written.
 *
 * The editor holds the pandoc citation — every keystroke goes into the text the
 * note is made of — and this draws something else over it. A citation the
 * cursor is inside is left alone and shows its own source, the way live preview
 * treats every other piece of markup: what is being edited has to be legible as
 * what it is.
 *
 * Source mode draws no citation in its style: a reader who switched to it asked
 * to see the note as it is written. A key Zotero has no source for is marked in
 * both, the way a misspelt word is, since that is about what is written.
 *
 * Every citation is written by the whole note (`src/noteRendering.ts`), which
 * the editor of a note's own tab holds. An editor holding a piece of a note —
 * a footnote's text in its popover — draws its citations as they were written
 * the last time the whole note was, and one holding text of no note draws each
 * on its own.
 *
 * Decorations are built as the editor asks for them, which is to say
 * synchronously, and citeproc will not wait for a library lookup. So a citation
 * whose item is not in hand yet is left as text, the lookup is started, and the
 * editor is asked to build its decorations again when the answer arrives — and
 * again when a note written in the background is done.
 */

/** Sent to the editor when there is more to draw than when it last drew. */
const REDRAW = StateEffect.define<null>();

/** What the plugin hands the extension: the renderer, the notes, and the settings read. */
export interface LiveContext {
	renderer: CitationRenderer;
	notes: NoteRenderer;
	/**
	 * The style the note at the path is rendered in — `null` for none, and
	 * `undefined` while it is still being worked out (`src/noteStyles.ts`).
	 * A path of `null` is text that belongs to no note.
	 */
	styleFor(path: string | null): StyleRef | null | undefined;
	/** Calls back with a note's path when its style changed; answers the unsubscribe. */
	onStyleChange(listener: (path: string) => void): () => void;
	tooltip(): CitationTooltip;
	/** Whether keys Zotero has no source for are marked. */
	markMissing(): boolean;
}

/**
 * The citations of the editor's text, read only when something asks: the text
 * changes on every keystroke, and most keystrokes redraw nothing that needs it.
 */
class ParsedText {
	/** The citations as read with each set of labels the note has been read with. */
	private read = new Map<LocatorLabels, { ordered: NoteCitation[]; sorted: NoteCitation[] }>();

	constructor(private doc: Text) {}

	/**
	 * The citations, read with the note's locator labels: in the order pandoc
	 * reads them, and in the order they stand in the text.
	 */
	citations(labels: LocatorLabels): { ordered: NoteCitation[]; sorted: NoteCitation[] } {
		let read = this.read.get(labels);
		if (!read) {
			const ordered = noteCitations(this.doc.toString(), labels);
			read = { ordered, sorted: [...ordered].sort((a, b) => a.from - b.from) };
			this.read.set(labels, read);
		}
		return read;
	}
}

const parsedText = StateField.define<ParsedText>({
	create: (state) => new ParsedText(state.doc),
	update: (value, transaction) =>
		transaction.docChanged ? new ParsedText(transaction.state.doc) : value,
});

class CitationWidget extends WidgetType {
	constructor(
		private rendered: RenderedCitation,
		private source: string,
		private tooltip: CitationTooltip
	) {
		super();
	}

	/**
	 * The tooltip is compared too: a widget found equal keeps the element it
	 * already drew, and that element carries the tooltip it was drawn with.
	 */
	eq(other: CitationWidget): boolean {
		return (
			other.rendered.html === this.rendered.html &&
			other.rendered.bibliography === this.rendered.bibliography &&
			other.source === this.source &&
			other.tooltip.enabled === this.tooltip.enabled &&
			other.tooltip.delay === this.tooltip.delay
		);
	}

	toDOM(): HTMLElement {
		return citationEl(this.rendered, this.source, this.tooltip);
	}

	/** Clicking it should put the cursor in the citation, not select a widget. */
	ignoreEvent(): boolean {
		return false;
	}
}

/**
 * Whether the cursor or a selection is inside the range, in which case the
 * citation is shown as it is written rather than as it will read.
 */
function beingEdited(view: EditorView, from: number, to: number): boolean {
	return view.state.selection.ranges.some(
		(range) => range.from <= to && range.to >= from
	);
}

function visible(view: EditorView, citation: NoteCitation): boolean {
	return view.visibleRanges.some(
		(range) => citation.from <= range.to && citation.to >= range.from
	);
}

export function citationExtension(context: LiveContext) {
	const plugin = ViewPlugin.fromClass(
		class implements PluginValue {
			decorations: DecorationSet;
			private stopListening: (() => void)[];

			constructor(private view: EditorView) {
				this.decorations = this.build(view);
				const redraw = (path: string): void => {
					if (path === this.path()) {
						this.view.dispatch({ effects: REDRAW.of(null) });
					}
				};
				this.stopListening = [
					context.notes.onRendered(redraw),
					context.onStyleChange(redraw),
				];
			}

			destroy(): void {
				this.stopListening.forEach((stop) => stop());
			}

			private path(): string | null {
				return this.view.state.field(editorInfoField, false)?.file?.path ?? null;
			}

			update(update: ViewUpdate): void {
				const redraw = update.transactions.some((transaction) =>
					transaction.effects.some((effect) => effect.is(REDRAW))
				);
				// Switching between source mode and live preview changes nothing
				// else about the editor's state, so it is looked for itself.
				const switched =
					update.startState.field(editorLivePreviewField, false) !==
					update.state.field(editorLivePreviewField, false);
				// `workspace.updateOptions()` reconfigures every editor, which
				// is how the plugin says a setting changed what is drawn.
				const reconfigured = update.transactions.some(
					(transaction) => transaction.reconfigured
				);
				if (
					redraw ||
					switched ||
					reconfigured ||
					update.docChanged ||
					update.viewportChanged ||
					update.selectionSet
				) {
					this.decorations = this.build(update.view);
				}
			}

			private build(view: EditorView): DecorationSet {
				const builder = new RangeSetBuilder<Decoration>();
				// Nothing is drawn in a style that is still being worked out;
				// the editor is told when it is.
				const style = view.state.field(editorLivePreviewField, false)
					? context.styleFor(this.path())
					: null;
				const mark = context.markMissing();
				if (!style && !mark) {
					return builder.finish();
				}
				if (style && !context.renderer.built(style)) {
					this.prepare(view, style);
				}
				// A key is the same key whatever language its locator is in, so
				// with no style the note is read in English for its keys alone.
				const { ordered: citations, sorted: byPosition } = view.state
					.field(parsedText)
					.citations(style?.labels ?? ENGLISH_LABELS);
				if (byPosition.length === 0) {
					return builder.finish();
				}

				// Every key the text cites is looked up, not only the ones on
				// screen, since the whole note decides how each citation reads —
				// but not the one being typed, which would be looked up a
				// keystroke at a time.
				const settled = citations.filter(
					(citation) => !beingEdited(view, citation.from, citation.to)
				);
				const pending = context.notes.pendingKeys(settled);
				if (pending.length > 0) {
					this.fetch(view, pending);
				}

				const rendered = style
					? this.rendered(view, style, citations, byPosition, pending.length === 0)
					: new Map<NoteCitation, RenderedCitation | null>();
				const tooltip = context.tooltip();
				const missingMark = Decoration.mark({
					class: MISSING_CLASS,
					// Obsidian shows a tooltip for any element with a label.
					attributes: {
						"aria-label": t.CITATION_KEY_MISSING,
						"data-tooltip-delay": String(tooltip.delay),
					},
				});

				for (const citation of byPosition) {
					if (
						!visible(view, citation) ||
						beingEdited(view, citation.from, citation.to)
					) {
						continue;
					}
					const source = view.state.sliceDoc(citation.from, citation.to);
					const written = rendered.get(citation);
					if (written) {
						builder.add(
							citation.from,
							citation.to,
							Decoration.replace({
								widget: new CitationWidget(written, source, tooltip),
							})
						);
						continue;
					}
					if (!mark) {
						continue;
					}
					const local = { ...citation, from: 0, to: source.length };
					for (const mention of keyMentions(source, local)) {
						if (context.renderer.missing(mention.id)) {
							builder.add(
								citation.from + mention.from,
								citation.from + mention.to,
								missingMark
							);
						}
					}
				}
				return builder.finish();
			}

			/**
			 * What each citation is written as. The editor of a note's own tab
			 * holds the whole note and has it written; any other editor finds
			 * its citations among the note's as last written, and writes the
			 * ones it cannot find each on its own.
			 */
			private rendered(
				view: EditorView,
				style: StyleRef,
				citations: NoteCitation[],
				byPosition: NoteCitation[],
				ready: boolean
			): Map<NoteCitation, RenderedCitation | null> {
				const result = new Map<NoteCitation, RenderedCitation | null>();
				const info = view.state.field(editorInfoField, false);
				const path = info?.file?.path;
				if (path && info instanceof MarkdownView) {
					const note = context.notes.current(style, path, citations, ready);
					note?.citations.forEach((citation, index) => {
						result.set(citation, note.rendered[index]);
					});
					return result;
				}
				const note = path ? context.notes.latest(style, path) : null;
				const matches = note
					? matchCitations(
							byPosition,
							[...note.citations].sort((a, b) => a.from - b.from)
						)
					: [];
				const written = new Map(
					note?.citations.map((citation, index) => [
						citation,
						note.rendered[index],
					])
				);
				byPosition.forEach((citation, index) => {
					const match = matches[index];
					result.set(
						citation,
						match
							? (written.get(match) ?? null)
							: context.renderer.renderWith(style, citation)
					);
				});
				return result;
			}

			/**
			 * Builds a style's engines, which a note naming its own style may be
			 * the first to want, and tells the editor when they are built.
			 */
			private prepare(view: EditorView, style: StyleRef): void {
				void context.renderer.engineFor(style).then(() => {
					view.dispatch({ effects: REDRAW.of(null) });
				});
			}

			/**
			 * Asks for what is missing and tells the editor when it arrives.
			 * Nothing is drawn from here: the effect brings `build` round again
			 * with the answer already in the renderer's hands.
			 */
			private fetch(view: EditorView, citekeys: string[]): void {
				void context.renderer.load(citekeys).then(() => {
					view.dispatch({ effects: REDRAW.of(null) });
				});
			}
		},
		{ decorations: (value) => value.decorations }
	);
	return [parsedText, plugin];
}
