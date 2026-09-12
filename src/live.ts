import { RangeSetBuilder, StateEffect } from "@codemirror/state";
import {
	Decoration,
	DecorationSet,
	EditorView,
	PluginValue,
	ViewPlugin,
	ViewUpdate,
	WidgetType,
} from "@codemirror/view";
import { parseGroups } from "src/citation";
import { citationEl } from "src/reading";
import { CitationRenderer, RenderedCitation } from "src/render";

/**
 * Showing citations in their style while the note is being written.
 *
 * The editor holds the pandoc citation — every keystroke goes into the text the
 * note is made of — and this draws something else over it. A citation the
 * cursor is inside is left alone and shows its own source, the way live preview
 * treats every other piece of markup: what is being edited has to be legible as
 * what it is.
 *
 * Decorations are built as the editor asks for them, which is to say
 * synchronously, and citeproc will not wait for a library lookup. So a citation
 * whose item is not in hand yet is left as text, the lookup is started, and the
 * editor is asked to build its decorations again when the answer arrives.
 */

/** Sent to the editor when a lookup has finished and more can now be drawn. */
const LOADED = StateEffect.define<null>();

/** What the plugin hands the extension: the renderer, and what to render with. */
export interface LiveContext {
	renderer: CitationRenderer;
	styleId(): string;
}

class CitationWidget extends WidgetType {
	constructor(
		private rendered: RenderedCitation,
		private source: string
	) {
		super();
	}

	eq(other: CitationWidget): boolean {
		return (
			other.rendered.html === this.rendered.html &&
			other.rendered.bibliography === this.rendered.bibliography &&
			other.source === this.source
		);
	}

	toDOM(): HTMLElement {
		return citationEl(this.rendered, this.source);
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

export function citationExtension(context: LiveContext) {
	return ViewPlugin.fromClass(
		class implements PluginValue {
			decorations: DecorationSet;

			constructor(view: EditorView) {
				this.decorations = this.build(view);
			}

			update(update: ViewUpdate): void {
				const loaded = update.transactions.some((transaction) =>
					transaction.effects.some((effect) => effect.is(LOADED))
				);
				if (
					loaded ||
					update.docChanged ||
					update.viewportChanged ||
					update.selectionSet
				) {
					this.decorations = this.build(update.view);
				}
			}

			private build(view: EditorView): DecorationSet {
				const builder = new RangeSetBuilder<Decoration>();
				const styleId = context.styleId();
				if (!styleId) {
					return builder.finish();
				}

				const missing: string[] = [];
				for (const { from, to } of view.visibleRanges) {
					const text = view.state.doc.sliceString(from, to);
					for (const group of parseGroups(text)) {
						const start = from + group.from;
						const end = from + group.to;
						if (beingEdited(view, start, end)) {
							continue;
						}
						if (!context.renderer.known(group)) {
							missing.push(
								...group.citations.map(
									(citation) => citation.id
								)
							);
							continue;
						}
						const rendered = context.renderer.renderWith(
							styleId,
							group
						);
						if (!rendered) {
							continue;
						}
						builder.add(
							start,
							end,
							Decoration.replace({
								widget: new CitationWidget(
									rendered,
									text.slice(group.from, group.to)
								),
							})
						);
					}
				}

				const pending = context.renderer.pending(missing);
				if (pending.length > 0) {
					this.fetch(view, pending);
				}
				return builder.finish();
			}

			/**
			 * Asks for what is missing and tells the editor when it arrives.
			 * Nothing is drawn from here: the effect brings `build` round again
			 * with the answer already in the renderer's hands.
			 */
			private fetch(view: EditorView, citekeys: string[]): void {
				void context.renderer.load(citekeys).then(() => {
					view.dispatch({ effects: LOADED.of(null) });
				});
			}
		},
		{ decorations: (value) => value.decorations }
	);
}
