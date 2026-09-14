import {
	App,
	Editor,
	EditorPosition,
	EditorSuggest,
	EditorSuggestContext,
	EditorSuggestTriggerInfo,
	TFile,
} from "obsidian";
import { t } from "lang/helpers";
import { citedKeys, proseOf } from "src/citation";
import { CitationRenderer } from "src/render";
import {
	keyInsertion,
	keyTrigger,
	rankSources,
	sourceMatches,
	SuggestedSource,
	suggestedSource,
	typedKeyEnd,
} from "src/suggestion";

/**
 * The list of sources offered while a citation key is typed after `@`.
 *
 * There is no copy of the library to search: Zotero is asked, through Better
 * BibTeX's `item.search`, which runs Zotero's own quick search. Two things keep
 * that from being asked on every keystroke:
 *
 * - **Short queries are answered from what is in hand.** Zotero writes every
 *   source it finds out in full, so two letters can mean a thousand sources
 *   and several seconds; below `LIBRARY_QUERY` characters only the sources the
 *   plugin already knows — every one cited in a note read since Obsidian
 *   started — are offered, the note's own first.
 * - **A longer query narrows the last answer instead of asking again.** Every
 *   source holding `kuhns` holds `kuhn`, so once Zotero has answered for
 *   `kuhn`, typing on is filtered here.
 *
 * Obsidian draws whatever a slower answer brings when it arrives, even after
 * a later one, so an answer is always worked out for the query as it stands
 * when it is drawn, not for the one it was asked for.
 */

/** How many characters are typed before Zotero is asked. */
const LIBRARY_QUERY = 3;

/** How long typing is waited out before Zotero is asked, in ms. */
const TYPING_DELAY = 150;

/** What the plugin hands the list: the renderer, and the settings read. */
export interface CitationSuggestContext {
	renderer: CitationRenderer;
	enabled(): boolean;
	brackets(): boolean;
}

export class CitationSuggest extends EditorSuggest<SuggestedSource> {
	/** What Zotero last answered, and the query it answered. */
	private answer: { query: string; sources: SuggestedSource[] } | null = null;
	/** The keys the note cites, read once each time the list opens. */
	private cited: string[] | null = null;
	/** Whether the list is on screen, as `open` and `close` last left it. */
	private shown = false;
	private listeners = new Set<() => void>();

	constructor(
		app: App,
		private host: CitationSuggestContext
	) {
		super(app);
		this.limit = 20;
		this.setInstructions([
			{ command: "↑↓", purpose: t.SUGGEST_NAVIGATE },
			{ command: "↵", purpose: t.SUGGEST_INSERT },
			{ command: "esc", purpose: t.SUGGEST_DISMISS },
		]);
	}

	/**
	 * Calls back whenever the list opens or closes — which is when a key stops
	 * or starts counting as written. Answers a function that stops the calls.
	 */
	onTypingChange(listener: () => void): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	/**
	 * Obsidian opens the list again on every keystroke that finds sources, and
	 * closes it on Escape, on a pick, when the cursor leaves the key and when
	 * nothing matches (read out of 1.13.7's `EditorSuggest`), so these two
	 * are where a key starts and stops being typed.
	 */
	open(): void {
		super.open();
		this.setShown(true);
	}

	close(): void {
		super.close();
		this.setShown(false);
	}

	private setShown(shown: boolean): void {
		if (this.shown !== shown) {
			this.shown = shown;
			this.listeners.forEach((listener) => listener());
		}
	}

	/**
	 * Where the key being typed stands in the note, while the list of sources
	 * is open for it: from its `-@` or `@` to the end of its key characters, as
	 * offsets into `text`. `null` when no list is open, or when it is open in
	 * an editor that does not hold that text — another note, or a footnote's
	 * text in its popover — where its offsets would say nothing.
	 */
	typedKey(file: TFile, text: string): { from: number; to: number } | null {
		const context = this.context;
		if (!this.shown || !context || context.file !== file) {
			return null;
		}
		const { editor, start } = context;
		if (editor.getValue() !== text) {
			return null;
		}
		const from = editor.posToOffset(start);
		return { from, to: from - start.ch + typedKeyEnd(editor.getLine(start.line), start.ch) };
	}

	onTrigger(
		cursor: EditorPosition,
		editor: Editor,
		_file: TFile | null
	): EditorSuggestTriggerInfo | null {
		if (!this.host.enabled()) {
			return null;
		}
		const before = editor.getLine(cursor.line).slice(0, cursor.ch);
		const trigger = keyTrigger(before);
		if (!trigger) {
			return null;
		}
		// Not in code, a comment or the front matter, where a key is written
		// about rather than cited. Read only once an `@` has been found.
		const text = editor.getRange({ line: 0, ch: 0 }, cursor);
		const at = text.length - before.length + before.indexOf("@", trigger.start);
		if (proseOf(text)[at] !== "@") {
			return null;
		}
		if (!this.context) {
			// A list opening afresh: the note may cite other sources by now,
			// and Zotero may hold others.
			this.cited = null;
			this.answer = null;
		}
		return {
			start: { line: cursor.line, ch: trigger.start },
			end: cursor,
			query: trigger.query,
		};
	}

	async getSuggestions(context: EditorSuggestContext): Promise<SuggestedSource[]> {
		this.cited ??= citedKeys(context.editor.getValue());
		const query = context.query;
		if (query.length >= LIBRARY_QUERY && !this.answers(query)) {
			await sleep(TYPING_DELAY);
			const current = this.context?.query ?? query;
			if (current === query) {
				const found = await this.host.renderer.searchLibrary(query);
				if (found) {
					this.answer = {
						query,
						sources: found.map(({ citekey, item }) =>
							suggestedSource(citekey, item)
						),
					};
				}
			}
		}
		return this.suggestionsFor(this.context?.query ?? query);
	}

	/** Whether Zotero's last answer holds every source the query could find. */
	private answers(query: string): boolean {
		return (
			this.answer !== null &&
			query.toLowerCase().startsWith(this.answer.query.toLowerCase())
		);
	}

	/**
	 * The sources for the query from what is in hand: the ones the plugin knows,
	 * and Zotero's last answer when it covers the query. With nothing typed,
	 * the note's own sources alone.
	 */
	private suggestionsFor(query: string): SuggestedSource[] {
		const cited = this.cited ?? [];
		const sources = new Map<string, SuggestedSource>();
		for (const [citekey, item] of this.host.renderer.knownItems()) {
			if (query || cited.includes(citekey)) {
				sources.set(citekey, suggestedSource(citekey, item));
			}
		}
		if (query.length >= LIBRARY_QUERY && this.answers(query)) {
			for (const source of this.answer?.sources ?? []) {
				sources.set(source.citekey, source);
			}
		}
		const matching = [...sources.values()].filter((source) =>
			sourceMatches(source, query)
		);
		return rankSources(matching, query, cited);
	}

	renderSuggestion(source: SuggestedSource, el: HTMLElement): void {
		el.addClass("mod-complex");
		const content = el.createDiv({ cls: "suggestion-content" });
		content.createDiv({ cls: "suggestion-title", text: `@${source.citekey}` });
		const note = [source.creators, source.year, source.title]
			.filter((part) => part)
			.join(" · ");
		if (note) {
			content.createDiv({ cls: "suggestion-note", text: note });
		}
	}

	selectSuggestion(source: SuggestedSource, _event: MouseEvent | KeyboardEvent): void {
		const context = this.context;
		if (!context) {
			return;
		}
		const { editor, start, end } = context;
		const line = editor.getLine(start.line);
		const insertion = keyInsertion(
			line,
			{ start: start.ch, query: context.query },
			end.ch,
			source.citekey,
			this.host.brackets()
		);
		editor.replaceRange(
			insertion.text,
			{ line: start.line, ch: insertion.from },
			{ line: start.line, ch: insertion.to }
		);
		editor.setCursor({ line: start.line, ch: insertion.from + insertion.text.length });
		this.close();
	}
}
