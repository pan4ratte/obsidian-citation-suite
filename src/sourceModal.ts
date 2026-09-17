import { App, setIcon, SuggestModal } from "obsidian";
import { t } from "lang/helpers";
import {
	rankSources,
	sourceMatches,
	SuggestedSource,
} from "src/suggestion";

/** One source of the citation, and the page it is cited at. */
export interface PickedSource {
	source: SuggestedSource;
	/** What was typed after the source was picked, or empty for no page. */
	locator: string;
}

/** What the window is opened with. */
export interface SourcePick {
	/** Every source the note's library holds. */
	sources: SuggestedSource[];
	/** The keys the note already cites, which are offered first. */
	cited: string[];
	/**
	 * The citation of the whole group, as the note will hold it. The window
	 * writes it into the row that inserts it, so what the reader reads there
	 * is what they get; the caller writes the same citation with the same
	 * function.
	 */
	citation: (picked: PickedSource[]) => string;
	/** One source of the group, as its pill in the field reads. */
	label: (picked: PickedSource) => string;
}

/**
 * What the list holds, which is not the same thing at every point: the sources
 * to pick from, the row that takes the source in hand into the citation, and
 * the row that writes the citation into the note.
 */
type Entry =
	| { kind: "source"; source: SuggestedSource }
	| { kind: "keep"; citation: string }
	| { kind: "insert"; citation: string };

/**
 * Picking sources from the note's own library file.
 *
 * This is the citation window for a note whose sources are in the vault rather
 * than in Zotero, and it works the way Zotero's own window does. One field
 * does all of it: a source is searched for and chosen, the choice becomes a
 * pill in the field, and the field then takes the page — `33`, or a range.
 * Enter puts the page into the pill and hands the field back to searching, so
 * the next Enter writes the citation into the note and anything typed instead
 * adds another source to it. The row under the field shows the citation as it
 * stands throughout, which is what says which of the two the next Enter does.
 *
 * It is the whole library rather than a search of it: a file library is read
 * whole and held, so there is nothing to ask and nothing to wait for.
 */
class SourceModal extends SuggestModal<Entry> {
	/** The sources of the citation so far, in the order they were added. */
	private group: PickedSource[] = [];
	/** The source whose page is being typed, if one is; `null` while searching. */
	private pending: SuggestedSource | null = null;
	/** Where the pills are drawn: inside the field, before what is typed. */
	private pillsEl: HTMLElement | null = null;
	/**
	 * Whether the caller has been answered. Both ways the window can end run
	 * through `onClose`, so the answer is given once; see `answerOnce`.
	 */
	private answered = false;

	constructor(
		app: App,
		private pick: SourcePick,
		/** Answered once, with the citation's sources or with nothing. */
		private answer: (picked: PickedSource[] | null) => void
	) {
		super(app);
		this.limit = 50;
		this.setPlaceholder(t.SOURCE_MODAL_PLACEHOLDER);
		this.emptyStateText = t.SOURCE_MODAL_EMPTY;
		this.instruct();
		// Backspace is no part of the list's own keys, so the field keeps it:
		// an empty field has no page left to rub out, and what goes instead is
		// the last source — as it does in Zotero's window.
		this.inputEl.addEventListener("keydown", (event: KeyboardEvent) => {
			if (
				event.key === "Backspace" &&
				!event.isComposing &&
				this.inputEl.value === "" &&
				(this.pending || this.group.length > 0)
			) {
				event.preventDefault();
				this.drop();
			}
		});
	}

	/** What can be done where the window now stands. */
	private instruct(): void {
		const enter = this.pending
			? t.SOURCE_MODAL_KEEP
			: this.group.length > 0
				? t.SOURCE_MODAL_INSERT
				: t.SOURCE_MODAL_CHOOSE;
		this.setInstructions([
			...(this.pending
				? []
				: [{ command: "↑↓", purpose: t.SUGGEST_NAVIGATE }]),
			{ command: "↵", purpose: enter },
			...(this.pending || this.group.length > 0
				? [{ command: "⌫", purpose: t.SOURCE_MODAL_REMOVE }]
				: []),
			{ command: "esc", purpose: t.SUGGEST_DISMISS },
		]);
	}

	getSuggestions(query: string): Entry[] {
		if (this.pending) {
			// One row, and it is the citation itself: there is nothing to
			// search for while a page is being typed, and what the reader
			// wants to see then is what the page is making.
			return [
				{
					kind: "keep",
					citation: this.pick.citation(this.with(query.trim())),
				},
			];
		}
		const matching = this.pick.sources.filter((source) =>
			sourceMatches(source, query)
		);
		const sources = rankSources(matching, query, this.pick.cited).map(
			(source) => ({ kind: "source" as const, source })
		);
		// With sources in hand and nothing typed, the citation they make is
		// the first thing offered: Enter writes it, and typing goes on adding
		// to it.
		return this.group.length > 0 && query.trim() === ""
			? [
					{ kind: "insert", citation: this.pick.citation(this.group) },
					...sources,
				]
			: sources;
	}

	/** A source as the list after `@` draws one, so that the two read alike. */
	renderSuggestion(entry: Entry, el: HTMLElement): void {
		el.addClass("mod-complex");
		const content = el.createDiv({ cls: "suggestion-content" });
		if (entry.kind !== "source") {
			content.createDiv({
				cls: "suggestion-title citation-suite-source-citation",
				text: entry.citation,
			});
			content.createDiv({
				cls: "suggestion-note",
				text:
					entry.kind === "insert"
						? t.SOURCE_MODAL_INSERT
						: t.SOURCE_MODAL_KEEP,
			});
			return;
		}
		const { source } = entry;
		content.createDiv({ cls: "suggestion-title", text: `@${source.citekey}` });
		const note = [source.creators, source.year, source.title]
			.filter((part) => part)
			.join(" · ");
		if (note) {
			content.createDiv({ cls: "suggestion-note", text: note });
		}
	}

	/**
	 * Only the row that writes the citation ends the window, so the
	 * framework's own handling — which shuts it — is kept for that one.
	 */
	selectSuggestion(entry: Entry, event: MouseEvent | KeyboardEvent): void {
		if (entry.kind === "source") {
			this.take(entry.source);
			return;
		}
		if (entry.kind === "keep") {
			this.keep();
			return;
		}
		super.selectSuggestion(entry, event);
	}

	onChooseSuggestion(entry: Entry): void {
		if (entry.kind === "insert" && this.group.length > 0) {
			this.answerOnce(this.group);
		}
	}

	/** The citation's sources with the one in hand at the end of them. */
	private with(locator: string): PickedSource[] {
		return this.pending
			? [...this.group, { source: this.pending, locator }]
			: this.group;
	}

	/** A source is taken into the field, and the field turns into its page's. */
	private take(source: SuggestedSource): void {
		this.pending = source;
		this.restart(t.SOURCE_MODAL_LOCATOR_PLACEHOLDER);
	}

	/** The page goes into the pill, and the field is a search field again. */
	private keep(): void {
		this.group = this.with(this.inputEl.value.trim());
		this.pending = null;
		this.restart(t.SOURCE_MODAL_PLACEHOLDER);
	}

	/** Backspace on an empty field: the source in hand, or the last pill. */
	private drop(): void {
		if (this.pending) {
			this.pending = null;
		} else {
			this.group = this.group.slice(0, -1);
		}
		this.restart(t.SOURCE_MODAL_PLACEHOLDER);
	}

	/**
	 * One pill taken back out of the citation, by its ×. What is in the field
	 * is left there: it is the page of another source, or the beginnings of a
	 * search, and neither has anything to do with the pill that went.
	 */
	private remove(at: number): void {
		this.group = this.group.filter((_, index) => index !== at);
		this.restart(
			this.pending
				? t.SOURCE_MODAL_LOCATOR_PLACEHOLDER
				: t.SOURCE_MODAL_PLACEHOLDER,
			this.inputEl.value
		);
	}

	/** The window drawn for where it now stands, with the field set to `text`. */
	private restart(placeholder: string, text = ""): void {
		this.drawPills();
		this.inputEl.value = text;
		this.setPlaceholder(placeholder);
		if (this.pending) {
			this.inputEl.setAttribute("aria-label", t.SOURCE_MODAL_LOCATOR_LABEL);
		} else {
			this.inputEl.removeAttribute("aria-label");
		}
		this.instruct();
		this.inputEl.focus();
		// What redraws the list: the framework listens for the field's own
		// input event, and `updateSuggestions` is not ours to call.
		this.inputEl.trigger("input");
	}

	/**
	 * The citation's sources, in the field itself and before the text:
	 * Obsidian lays the field's container out as a row, so the pills stand
	 * beside what is typed rather than over it. The source in hand is a pill
	 * too, marked as the one being worked on, and it carries no page: the page
	 * is in the field until Enter puts it there.
	 */
	private drawPills(): void {
		const container = this.inputEl.parentElement;
		if (!container) {
			return;
		}
		const any = this.pending !== null || this.group.length > 0;
		container.toggleClass("citation-suite-source-picked", any);
		this.pillsEl?.remove();
		this.pillsEl = null;
		if (!any) {
			return;
		}
		const pills = container.createDiv({ cls: "citation-suite-source-pills" });
		container.insertBefore(pills, this.inputEl);
		this.pillsEl = pills;
		this.group.forEach((picked, at) => {
			this.drawPill(pills, this.pick.label(picked), () => this.remove(at));
		});
		if (this.pending) {
			const pill = this.drawPill(
				pills,
				`@${this.pending.citekey}`,
				() => this.drop()
			);
			pill.addClass("is-active");
		}
	}

	/** One pill: what it cites, and the × that takes it out again. */
	private drawPill(
		pills: HTMLElement,
		text: string,
		off: () => void
	): HTMLElement {
		const pill = pills.createDiv({ cls: "citation-suite-source-pill" });
		pill.createSpan({ text });
		const remove = pill.createDiv({
			cls: "citation-suite-source-pill-remove",
			attr: { "aria-label": t.SOURCE_MODAL_REMOVE },
		});
		setIcon(remove, "x");
		remove.addEventListener("click", off);
		return pill;
	}

	/**
	 * A window shut with nothing picked is an answer of its own — but a window
	 * shut *because* the citation was written may still have that pick coming.
	 *
	 * `SuggestModal.selectSuggestion` shuts the window and only then says what
	 * was chosen: `this.close(), this.isOpen = false, this.onChooseSuggestion(…)`,
	 * all in one turn. Answering here and then would answer "nothing picked"
	 * every time, and nothing would ever be written into the note. So the
	 * empty answer waits a turn, and stands only if no pick has arrived by
	 * then.
	 */
	onClose(): void {
		super.onClose();
		window.queueMicrotask(() => this.answerOnce(null));
	}

	/** The one answer the caller gets: the citation, or nothing, never both. */
	private answerOnce(picked: PickedSource[] | null): void {
		if (this.answered) {
			return;
		}
		this.answered = true;
		this.answer(picked);
	}
}

/**
 * Opens the window and answers with the sources of the citation, or `null` for
 * a window shut without one.
 */
export function pickSource(
	app: App,
	pick: SourcePick
): Promise<PickedSource[] | null> {
	return new Promise((resolve) => {
		new SourceModal(app, pick, resolve).open();
	});
}
