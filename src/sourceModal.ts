import { App, SuggestModal } from "obsidian";
import { t } from "lang/helpers";
import {
	rankSources,
	sourceMatches,
	SuggestedSource,
} from "src/suggestion";

/**
 * Picking a source from the note's own library file.
 *
 * Zotero's citation window is what cites with a page and a prefix, and it wants
 * a Zotero on the same machine. Where there is none — on a phone, or with
 * Zotero closed — the sources are in a file of the vault and already read, so
 * this offers them: the same list the editor offers after `@`, in the same
 * order, opened as a command instead of by typing.
 *
 * It is the whole library rather than a search of it: a file library is read
 * whole and held, so there is nothing to ask and nothing to wait for.
 */
class SourceModal extends SuggestModal<SuggestedSource> {
	/** What was picked, while the window is open; `null` if nothing was. */
	private chosen: SuggestedSource | null = null;

	constructor(
		app: App,
		/** Every source the note's library holds. */
		private sources: SuggestedSource[],
		/** The keys the note already cites, which are offered first. */
		private cited: string[],
		/** Answered as the window shuts, with the pick or with nothing. */
		private answer: (source: SuggestedSource | null) => void
	) {
		super(app);
		this.limit = 50;
		this.setPlaceholder(t.SOURCE_MODAL_PLACEHOLDER);
		this.emptyStateText = t.SOURCE_MODAL_EMPTY;
		this.setInstructions([
			{ command: "↑↓", purpose: t.SUGGEST_NAVIGATE },
			{ command: "↵", purpose: t.SUGGEST_INSERT },
			{ command: "esc", purpose: t.SUGGEST_DISMISS },
		]);
	}

	getSuggestions(query: string): SuggestedSource[] {
		const matching = this.sources.filter((source) => sourceMatches(source, query));
		return rankSources(matching, query, this.cited);
	}

	/** As the list after `@` draws a source, so that the two read alike. */
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

	onChooseSuggestion(source: SuggestedSource): void {
		this.chosen = source;
	}

	/**
	 * Answered here rather than as a source is chosen, so that the one answer
	 * covers both ways the window can end — a pick, and a reader who changed
	 * their mind — and covers each of them once.
	 */
	onClose(): void {
		super.onClose();
		this.answer(this.chosen);
	}
}

/** Opens the list and answers with what was picked, or `null` for nothing. */
export function pickSource(
	app: App,
	sources: SuggestedSource[],
	cited: string[]
): Promise<SuggestedSource | null> {
	return new Promise((resolve) => {
		new SourceModal(app, sources, cited, resolve).open();
	});
}
