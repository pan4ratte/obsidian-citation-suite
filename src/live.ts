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
import { editorLivePreviewField } from "obsidian";
import { parseGroups } from "src/citation";
import { CitationTooltip, citationEl } from "src/reading";
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
 * Source mode is left alone entirely. The editor behind it is the same one, and
 * so is this extension, but a reader who switched to it asked to see the note
 * as it is written.
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
	tooltip(): CitationTooltip;
}

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
					loaded ||
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
				const styleId = context.styleId();
				const tooltip = context.tooltip();
				if (!styleId || !view.state.field(editorLivePreviewField, false)) {
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
									text.slice(group.from, group.to),
									tooltip
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
