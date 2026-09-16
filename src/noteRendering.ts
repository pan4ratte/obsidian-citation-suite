import { CitationSession, SessionCitation, SessionJob } from "src/citationSession";
import { citationSignature, NoteCitation } from "src/noteCitations";
import {
	citationItem,
	CitationRenderer,
	LibraryRef,
	RenderedBibliography,
	RenderedCitation,
	StyleEngines,
	StyleRef,
	ZOTERO_LIBRARY,
} from "src/render";

/**
 * A note's citations written together, for every view that shows them.
 *
 * Live preview, reading view and the bibliography pane each read a note and
 * each want its citations as the style writes them in that note. They share
 * one citation engine per style, which holds one note at a time
 * (`src/citationSession.ts`), so this is where the work is queued, kept and
 * handed out:
 *
 * - **What was written is kept per note**, by what the note cites. Typing
 *   anywhere but in a citation changes nothing that is cited, and is answered
 *   from what was kept without the engine being asked at all.
 * - **Work is done a step at a time.** A change of a citation or two is a
 *   step or two, and done at once; a note written from the start is one step
 *   per citation, and done a few milliseconds per frame, so that opening a
 *   long note does not stop the editor while it is written.
 * - **The editor never waits.** While a note is being written, it is given
 *   what the note was last written as, each citation matched to the one it
 *   was by what it cites, so nothing on screen flickers back to its source.
 *   It is told when the note is done, and draws it then.
 * - **A citation whose source is not in hand is left out** of what the engine
 *   is given: citeproc would write it as an untitled document, and it would
 *   take a number in a numbered style.
 * - **The reference list is read off the engine** right after the note is
 *   written, before any other note can be put in its place, since that is
 *   the only moment it describes that note.
 */

/** How long a frame's worth of work runs before the editor has its turn, in ms. */
const SLICE = 8;

/**
 * How long the editor waits for a note to be written before it draws what
 * there was, in ms: long enough for a change of a citation or two, which is
 * then drawn in the same frame.
 */
const IN_FRAME = 12;

/** How many notes are kept written. Enough for every note open at once. */
const KEPT_NOTES = 24;

/** A note's citations as the style writes them there. */
export interface NoteRendering {
	/** The note's citations, in the order pandoc reads them. */
	citations: NoteCitation[];
	/** What each of them is written as, or `null` for one that is not. */
	rendered: (RenderedCitation | null)[];
}

/** What the engine is given for a note, and what that is said to be. */
interface NoteInput {
	/** Which of the note's citations are given, by their place among them. */
	given: number[];
	citations: SessionCitation[];
	/** What each citation given cites, as `citationSignature` writes it. */
	signatures: string[];
	/** Everything that decides what the note is written as, as one string. */
	key: string;
}

/** What is kept of a note once it was written. */
interface NoteState {
	engines: StyleEngines;
	key: string;
	/** The note's citations when it was written. */
	citations: NoteCitation[];
	input: NoteInput;
	/** What each citation given was written as. */
	outputs: (RenderedCitation | null)[];
	/** The reference list, or `undefined` if nobody has asked for it yet. */
	bibliography: RenderedBibliography | null | undefined;
}

/** A note waiting to be written, or being written. */
interface Task {
	path: string;
	engines: StyleEngines;
	/** Where the note's sources come from, for when the task is written. */
	library: LibraryRef;
	citations: NoteCitation[];
	input: NoteInput;
	bibliography: boolean;
	job: SessionJob | null;
	waiters: ((state: NoteState | null) => void)[];
}

export class NoteRenderer {
	private states = new Map<string, NoteState>();
	private queue: Task[] = [];
	private timer: number | null = null;
	/** The note each style's engine holds, by the key it was written under. */
	private held = new WeakMap<CitationSession, string>();
	private listeners = new Set<(path: string) => void>();

	constructor(private renderer: CitationRenderer) {}

	/**
	 * Calls back whenever a note has been written, with its path. The editor
	 * draws again then. Answers a function that stops the calls.
	 */
	onRendered(listener: (path: string) => void): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	/** Forgets every note: the style, the port or the library changed. */
	clear(): void {
		this.states.clear();
		for (const task of this.queue) {
			task.waiters.forEach((resolve) => resolve(null));
		}
		this.queue = [];
		if (this.timer !== null) {
			window.clearTimeout(this.timer);
			this.timer = null;
		}
	}

	/** Every key the citations name that has not been looked up yet. */
	pendingKeys(citations: NoteCitation[], library: LibraryRef = ZOTERO_LIBRARY): string[] {
		return this.renderer.pending(
			citations.flatMap((group) => group.citations.map((citation) => citation.id)),
			library
		);
	}

	/**
	 * The note as it is written now, synchronously, for the editor: the
	 * answer kept for exactly these citations if there is one, and otherwise
	 * whatever can be written within the frame — or, failing that, what the
	 * note was last written as. `null` when there is nothing to show yet: the
	 * style is not prepared, or the note has never been written.
	 *
	 * Nothing is started while `ready` is false — a source is still being
	 * looked up — since the note would only have to be written again when it
	 * arrives. The caller says, because a key being typed is not looked up
	 * until it is typed, and should not hold the rest of the note back.
	 */
	current(
		style: StyleRef,
		path: string,
		citations: NoteCitation[],
		ready: boolean
	): NoteRendering | null {
		const engines = this.renderer.preparedEngines(style);
		if (!engines) {
			return null;
		}
		const input = this.inputOf(engines, citations, style.library);
		const state = this.states.get(path);
		if (state && state.engines === engines && state.key === input.key) {
			return compose(citations, input, state.outputs);
		}
		if (ready) {
			this.enqueue(path, engines, style.library, citations, input, false, true);
			this.run(IN_FRAME);
			const written = this.states.get(path);
			if (written && written.engines === engines && written.key === input.key) {
				return compose(citations, input, written.outputs);
			}
		}
		return state && state.engines === engines ? stale(citations, input, state) : null;
	}

	/**
	 * The note as it is written, once it is: for reading view and the pane,
	 * which can wait. Sources not looked up yet are looked up first. `null`
	 * when the style will not load.
	 */
	async render(
		style: StyleRef,
		path: string,
		citations: NoteCitation[]
	): Promise<NoteRendering | null> {
		const state = await this.written(style, path, citations, false);
		return state ? compose(citations, state.input, state.outputs) : null;
	}

	/**
	 * The reference list of the note, written with its citations, or `null`
	 * for a style that writes none or will not load.
	 */
	async bibliography(
		style: StyleRef,
		path: string,
		citations: NoteCitation[]
	): Promise<RenderedBibliography | null> {
		const state = await this.written(style, path, citations, true);
		return state?.bibliography ?? null;
	}

	/**
	 * What the note at the path was last written as, whatever it cited then —
	 * for a piece of the note shown on its own, which is matched against it.
	 */
	latest(style: StyleRef, path: string): NoteRendering | null {
		const state = this.states.get(path);
		if (!state || state.engines !== this.renderer.preparedEngines(style)) {
			return null;
		}
		return compose(state.citations, state.input, state.outputs);
	}

	private async written(
		style: StyleRef,
		path: string,
		citations: NoteCitation[],
		bibliography: boolean
	): Promise<NoteState | null> {
		await this.renderer.load(
			citations.flatMap((group) => group.citations.map((citation) => citation.id)),
			false,
			style.library
		);
		const engines = await this.renderer.engineFor(style);
		if (!engines) {
			return null;
		}
		const input = this.inputOf(engines, citations, style.library);
		const state = this.states.get(path);
		if (state && state.engines === engines && state.key === input.key) {
			if (!bibliography || state.bibliography !== undefined) {
				return state;
			}
			if (this.held.get(engines.session) === input.key) {
				// The engine still holds this note: the list can be read now.
				state.bibliography = this.renderer.bibliographyOf(engines, style.library);
				return state;
			}
		}
		return new Promise((resolve) => {
			this.enqueue(
				path,
				engines,
				style.library,
				citations,
				input,
				bibliography,
				false,
				resolve
			);
			this.schedule();
		});
	}

	/**
	 * What the engine is given for the citations: the ones whose every
	 * source is in hand, each in the note it stands in when the style cites
	 * in notes.
	 */
	private inputOf(
		engines: StyleEngines,
		citations: NoteCitation[],
		library: LibraryRef
	): NoteInput {
		const given: number[] = [];
		const input: SessionCitation[] = [];
		const signatures: string[] = [];
		// The library is part of the key: the same note read from another
		// library is another note, and what was written for the one must not
		// be handed out for the other.
		const keyParts: string[] = [library];
		citations.forEach((group, index) => {
			if (!this.renderer.known(group, library)) {
				return;
			}
			const noteIndex = engines.notes ? group.noteNumber : 0;
			const signature = citationSignature(group);
			given.push(index);
			input.push({ items: group.citations.map(citationItem), noteIndex });
			signatures.push(signature);
			keyParts.push(`${noteIndex} ${signature}`);
		});
		return { given, citations: input, signatures, key: keyParts.join("\n") };
	}

	/**
	 * Puts the note in the queue, or brings the note already there up to
	 * date. A note the editor is waiting on goes first, unless the first is
	 * already half written: the engine holds only one, and taking another in
	 * between would throw that work away.
	 */
	private enqueue(
		path: string,
		engines: StyleEngines,
		library: LibraryRef,
		citations: NoteCitation[],
		input: NoteInput,
		bibliography: boolean,
		urgent: boolean,
		waiter?: (state: NoteState | null) => void
	): void {
		let task = this.queue.find((queued) => queued.path === path);
		if (task && (task.engines !== engines || task.input.key !== input.key)) {
			// The note changed while it waited: it is written as it now is.
			task.engines = engines;
			task.input = input;
			task.job = null;
		}
		if (!task) {
			task = {
				path,
				engines,
				library,
				citations,
				input,
				bibliography,
				job: null,
				waiters: [],
			};
			const first = this.queue[0];
			if (urgent && !first?.job) {
				this.queue.unshift(task);
			} else if (urgent) {
				this.queue.splice(1, 0, task);
			} else {
				this.queue.push(task);
			}
		}
		task.citations = citations;
		task.library = library;
		task.bibliography ||= bibliography;
		if (waiter) {
			task.waiters.push(waiter);
		}
	}

	private schedule(): void {
		if (this.timer === null && this.queue.length > 0) {
			this.timer = window.setTimeout(() => {
				this.timer = null;
				this.run(SLICE);
			}, 0);
		}
	}

	/** Works through the queue for as long as the budget lasts, and goes on later. */
	private run(budget: number): void {
		const start = performance.now();
		while (this.queue.length > 0) {
			const task = this.queue[0];
			let done: boolean;
			let failed = false;
			try {
				if (!task.job) {
					// Whatever note the engine held, it is about to hold this one.
					this.held.delete(task.engines.session);
					task.job = task.engines.session.update(task.input.citations);
				}
				done = task.job.step();
			} catch {
				done = true;
				failed = true;
			}
			if (done) {
				this.queue.shift();
				this.finish(task, failed);
			}
			if (performance.now() - start >= budget) {
				break;
			}
		}
		this.schedule();
	}

	/**
	 * Keeps what the note was written as, reads its reference list if anyone
	 * asked while the engine still holds it, and tells whoever is waiting.
	 */
	private finish(task: Task, failed: boolean): void {
		const { engines, input, citations, library } = task;
		const ids = (given: number): string[] =>
			citations[input.given[given]].citations.map((citation) => citation.id);
		let outputs: (RenderedCitation | null)[];
		let bibliography: RenderedBibliography | null | undefined;
		if (failed || !task.job) {
			// The engine would not write the note: each citation is written
			// on its own, as it would be with no note around it.
			this.held.delete(engines.session);
			engines.session.reset();
			outputs = input.given.map((index) =>
				this.renderer.render(engines, citations[index], library)
			);
			bibliography = task.bibliography ? null : undefined;
		} else {
			const job = task.job;
			outputs = job
				.outputs()
				.map((html, given) =>
					this.renderer.renderedCitation(engines, ids(given), html, library)
				);
			this.held.set(engines.session, input.key);
			bibliography = task.bibliography
				? this.renderer.bibliographyOf(engines, library)
				: undefined;
		}
		const previous = this.states.get(task.path);
		if (
			bibliography === undefined &&
			previous?.engines === engines &&
			previous.key === input.key
		) {
			bibliography = previous.bibliography;
		}
		const state: NoteState = { engines, key: input.key, citations, input, outputs, bibliography };
		this.states.delete(task.path);
		this.states.set(task.path, state);
		while (this.states.size > KEPT_NOTES) {
			const oldest = this.states.keys().next().value;
			if (oldest === undefined) {
				break;
			}
			this.states.delete(oldest);
		}
		task.waiters.forEach((resolve) => resolve(state));
		// Not from inside the editor's own update, which may be what is
		// running this.
		window.setTimeout(() => {
			this.listeners.forEach((listener) => listener(task.path));
		}, 0);
	}
}

/** The written citations laid out over the note's citations, `null` where one was not given. */
function compose(
	citations: NoteCitation[],
	input: NoteInput,
	outputs: (RenderedCitation | null)[]
): NoteRendering {
	const rendered: (RenderedCitation | null)[] = citations.map(() => null);
	input.given.forEach((index, given) => {
		rendered[index] = outputs[given] ?? null;
	});
	return { citations, rendered };
}

/**
 * The citations as the note was last written, while it is written again: each
 * citation takes what the one citing the same thing in the same note was
 * written as, the first such citation the first, and so on.
 */
function stale(
	citations: NoteCitation[],
	input: NoteInput,
	state: NoteState
): NoteRendering {
	const previous = new Map<string, (RenderedCitation | null)[]>();
	state.input.signatures.forEach((signature, given) => {
		const list = previous.get(signature) ?? [];
		list.push(state.outputs[given] ?? null);
		previous.set(signature, list);
	});
	const outputs = input.signatures.map(
		(signature) => previous.get(signature)?.shift() ?? null
	);
	return compose(citations, input, outputs);
}
