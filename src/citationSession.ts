import { CslCitation, CslCitationItem, CslCitationPosition, Engine } from "citeproc";

/**
 * Keeping citeproc in step with a note, one citation at a time.
 *
 * citeproc writes a citation by what came before it in the document, and it
 * keeps the document itself: every citation it has been given, in order, with
 * the note each stands in. It is built for a word processor, where the author
 * changes one citation at a time and the processor is told only that — which is
 * `processCitationCluster`, given the citation and the ids of everything before
 * and after it. It answers with every citation whose text that changed: the
 * one given, and any later one that became "Ibid." or stopped being, or was
 * renumbered.
 *
 * A note is the same. Between two readings of it, a citation or two has
 * changed, and the rest stand as they stood. So the session remembers the
 * citations it last gave the engine, works out which ones differ — whatever
 * the two readings share at the start and at the end is left alone — and hands
 * over only the ones between. That costs a millisecond or two where writing
 * the whole note again costs half a second for a chapter in a note style.
 * Checked against writing the note from scratch after every edit, for
 * inserted, changed and removed citations and renumbered notes, in note,
 * author-date and numbered styles: the text came out the same every time.
 *
 * One thing citeproc does not take back when it is told a citation at a time:
 * the letter that tells two sources of an author and a year apart, where the
 * style does not sort them, goes by the order the sources were first given to
 * it, not the order the note now first cites them in. So a change that brings
 * a source forward past another — or a new source in before one already
 * cited — is written by giving the engine everything again. That was found by
 * checking random edits against a fresh engine; numbers and "Ibid." follow a
 * change a citation at a time, and a source cited for the first time after
 * all the others does too.
 *
 * When most of the note changed — another note, a paste — the engine is given
 * everything again from the start as well, which is `rebuildProcessorState`
 * taken apart into steps, so that the caller can spread the work over several
 * frames rather than stop the editor for it.
 *
 * A citation with the author in the text, `@doe2020 says`, is written as
 * pandoc writes one: the engine is given the citation with the first source's
 * author left out and its sources in the order written — "(2020, p. 33; also
 * Roe, 2021)" — and the author is the first source's alone, written where the
 * citation stands without changing what the engine holds — "Doe", or "Jane
 * Doe" where a note style names an author in full the first time. citeproc's
 * own `composite` mode does both at once, and gets three things wrong that
 * pandoc does not: it sorts the sources and takes the first author of the
 * sorted ones, prints `[NO_PRINTED_FORM]` for a style that cites by number,
 * and writes the author twice in a note style.
 */

/** citeproc's flag saying every item of the citations is registered already. */
const ASSUME_ALL_ITEMS_REGISTERED = 2;

/**
 * The share of the note, and the least number of citations, past which a
 * change is written by giving the engine everything again: each citation
 * handed over on its own is checked against the whole note, so past this it is
 * cheaper to start from nothing.
 */
const REBUILD_SHARE = 0.5;
const REBUILD_MINIMUM = 20;

/** One citation as the engine is given it. */
export interface SessionCitation {
	items: CslCitationItem[];
	/** The note it stands in, or 0 for a citation in the text of an in-text style. */
	noteIndex: number;
	/** Whether the first source's author is named in the text: `@doe2020 says`. */
	inText?: boolean;
}

/** A citation the engine holds: the id it knows it by, and what it holds. */
interface Entry {
	id: string;
	signature: string;
	noteIndex: number;
	/** The sources it cites. */
	items: string[];
}

/**
 * The citation as the engine is given it: with the author in the text, the
 * first source's author left out and the sources kept in the order written.
 * Fresh objects every time, since citeproc writes onto what it is given.
 */
export function clusterOf(citation: SessionCitation, citationID?: string): CslCitation {
	const items = citation.items.map((item) => ({ ...item }));
	if (citation.inText && items[0]) {
		items[0]["suppress-author"] = true;
	}
	const cluster: CslCitation = {
		citationItems: items,
		properties: citation.inText
			? { noteIndex: citation.noteIndex, unsorted: true }
			: { noteIndex: citation.noteIndex },
	};
	if (citationID !== undefined) {
		cluster.citationID = citationID;
	}
	return cluster;
}

/** The author the text names for a citation with the author in the text. */
export function authorOf(citation: SessionCitation): CslCitation {
	return {
		citationItems: [{ id: citation.items[0]?.id ?? "", "author-only": true }],
		properties: { noteIndex: citation.noteIndex },
	};
}

/** What citeproc writes for a source with no author where a style has none to give. */
const NO_PRINTED_FORM = /\[(?:NO_PRINTED_FORM|CSL STYLE ERROR[^\]]*)\]/;

/** Whether citeproc wrote a name for the author, rather than nothing. */
function named(author: string): boolean {
	const name = author.trim();
	return !!name && !NO_PRINTED_FORM.test(name);
}

/**
 * The author and the citation as one, as pandoc writes them: "Doe (2020)". A
 * style with no author to name, one that cites by number, gives the citation
 * alone: "[1]".
 */
export function withAuthor(author: string, cluster: string): string {
	const rest = cluster.trim();
	if (!named(author)) {
		return rest;
	}
	return rest ? `${author.trim()} ${rest}` : author.trim();
}

/** A citation the engine holds, as a preview is told of it: where it stands, and what it cites. */
export interface HeldCitation {
	position: CslCitationPosition;
	ids: string[];
}

/**
 * The author the text names for a citation with the author in the text,
 * written where the citation stands among the ones the engine holds, without
 * changing them: "Jane Doe" the first time in a note style, "Doe" after.
 *
 * Right after a citation of the same source the style may write "Ibid.",
 * which names no one; pandoc names the author there all the same, as a later
 * citation names it. So the preview is asked again without the citations of
 * that source just before — "Kuhn (Ibid., p. 33)", as pandoc 3.12 writes it.
 */
export function authorAt(
	engine: Engine,
	citation: SessionCitation,
	pre: HeldCitation[],
	post: CslCitationPosition[]
): string {
	const preview = (before: HeldCitation[]): string =>
		engine.previewCitationCluster(
			authorOf(citation),
			before.map((held) => held.position),
			post,
			"html"
		);
	const author = preview(pre);
	const id = citation.items[0]?.id;
	let start = pre.length;
	while (start > 0 && id !== undefined && pre[start - 1].ids.includes(id)) {
		start--;
	}
	return named(author) || start === pre.length ? author : preview(pre.slice(0, start));
}

/** Work towards a note, done a step at a time. */
export interface SessionJob {
	/** Does the next piece of work, and says whether that was the last. */
	step(): boolean;
	/**
	 * What every citation comes to, in the order the note was given — once
	 * `step` has said it is done. An empty string for one the engine wrote as
	 * nothing.
	 */
	outputs(): string[];
}

function signatureOf(citation: SessionCitation): string {
	return JSON.stringify([citation.inText ? 1 : 0, citation.items]);
}

/** Every source the citations cite, once each, in the order they are first cited. */
function firstCited(entries: { items: string[] }[]): string[] {
	return [...new Set(entries.flatMap((entry) => entry.items))];
}

/**
 * Whether the sources the citations cite are first cited in the order they
 * were before, but for the sources no longer cited and new ones after all the
 * rest — which is what a change a citation at a time keeps right.
 */
function sameFirstCitations(before: string[], after: string[]): boolean {
	const kept = new Set(after);
	const was = before.filter((id) => kept.has(id));
	return was.every((id, index) => after[index] === id);
}

export class CitationSession {
	/** What the engine holds, in the order it holds it. */
	private entries: Entry[] = [];
	/** What each citation the engine holds was last written as, by id. */
	private written = new Map<string, string>();
	/** The author the text names, for each citation with the author in the text, by id. */
	private authors = new Map<string, string>();
	private counter = 0;
	/** The job last started. An older one is abandoned and does nothing more. */
	private current: object | null = null;

	constructor(private engine: Engine) {}

	/**
	 * Starts bringing the engine to the citations. The job has to be stepped to
	 * the end for the answer; starting another abandons it, and the next one
	 * starts from wherever the engine was left.
	 */
	update(citations: SessionCitation[]): SessionJob {
		const token = {};
		this.current = token;
		const signatures = citations.map(signatureOf);
		const old = this.entries;

		let prefix = 0;
		while (
			prefix < old.length &&
			prefix < citations.length &&
			old[prefix].signature === signatures[prefix]
		) {
			prefix++;
		}
		let suffix = 0;
		while (
			suffix < old.length - prefix &&
			suffix < citations.length - prefix &&
			old[old.length - 1 - suffix].signature ===
				signatures[citations.length - 1 - suffix]
		) {
			suffix++;
		}
		const changed = citations.length - prefix - suffix;
		const items = citations.map((citation) => citation.items.map((item) => item.id));
		const rebuild =
			old.length === 0 ||
			changed > Math.max(REBUILD_MINIMUM, citations.length * REBUILD_SHARE) ||
			!sameFirstCitations(firstCited(old), firstCited(items.map((ids) => ({ items: ids }))));
		if (rebuild) {
			prefix = 0;
			suffix = 0;
		}

		// A citation keeps the id it had where it stands where it stood, which is
		// how the engine is told it changed rather than that one went and another
		// came.
		const oldMiddle = old.slice(prefix, old.length - suffix);
		const target: Entry[] = citations.map((citation, index) => {
			let id: string;
			if (!rebuild && index < prefix) {
				id = old[index].id;
			} else if (!rebuild && index >= citations.length - suffix) {
				id = old[old.length - (citations.length - index)].id;
			} else if (!rebuild && index - prefix < oldMiddle.length) {
				id = oldMiddle[index - prefix].id;
			} else {
				id = `c${this.counter++}`;
			}
			return {
				id,
				signature: signatures[index],
				noteIndex: citation.noteIndex,
				items: items[index],
			};
		});

		const steps: (() => void)[] = [];
		const hand = (index: number, pre: Entry[], post: Entry[], flag?: number): void => {
			const entry = target[index];
			const [, changedTexts] = this.engine.processCitationCluster(
				clusterOf(citations[index], entry.id),
				pre.map((other) => [other.id, other.noteIndex]),
				post.map((other) => [other.id, other.noteIndex]),
				flag
			);
			const order = [...pre, entry, ...post];
			for (const [position, text] of changedTexts) {
				const written = order[position];
				if (written) {
					this.written.set(written.id, text);
				}
			}
			this.entries = order;
		};

		if (rebuild) {
			if (citations.length > 0) {
				steps.push(() => {
					// Emptied first: the engine keeps what it worked out about
					// a source for as long as the source is registered, the
					// letter after a year among it, and a note written from
					// the start has to be worked out from the start.
					this.engine.updateItems([]);
					this.engine.updateItems(firstCited(target));
				});
			}
			citations.forEach((_citation, index) => {
				steps.push(() =>
					hand(index, target.slice(0, index), [], ASSUME_ALL_ITEMS_REGISTERED)
				);
			});
		} else {
			const tail = target.slice(citations.length - suffix);
			for (let index = prefix; index < citations.length - suffix; index++) {
				steps.push(() => hand(index, target.slice(0, index), tail));
			}
			// Nothing changed in what is cited, but a citation went, or a note
			// was added or taken away before some: one citation handed over
			// with the whole note around it tells the engine.
			const renumbered = target.some(
				(entry, index) =>
					index < old.length &&
					old[index].id === entry.id &&
					old[index].noteIndex !== entry.noteIndex
			);
			if (
				steps.length === 0 &&
				target.length > 0 &&
				(old.length !== target.length || renumbered)
			) {
				let index = target.findIndex(
					(entry, at) =>
						old[at]?.id !== entry.id ||
						old[at]?.noteIndex !== entry.noteIndex
				);
				if (index === -1) {
					index = target.length - 1;
				}
				steps.push(() =>
					hand(index, target.slice(0, index), target.slice(index + 1))
				);
			}
		}
		// The authors the text names, once the engine holds the whole note. How
		// one is written goes by everything around it — named in full the
		// first time, a given name added where two authors share a surname —
		// so when anything was handed over, every one is written again.
		const handedOver = steps.length > 0;
		citations.forEach((citation, index) => {
			if (citation.inText && (handedOver || !this.authors.has(target[index].id))) {
				steps.push(() => {
					const held = (other: Entry): HeldCitation => ({
						position: [other.id, other.noteIndex],
						ids: other.items,
					});
					this.authors.set(
						target[index].id,
						authorAt(
							this.engine,
							citation,
							target.slice(0, index).map(held),
							target.slice(index + 1).map((other) => held(other).position)
						)
					);
				});
			}
		});
		if (target.length === 0) {
			// There is no citation to hand over, and with none the engine cannot
			// be told the others went. The next one it is given will tell it.
			steps.push(() => {
				this.entries = [];
			});
		}

		let next = 0;
		return {
			step: (): boolean => {
				if (this.current !== token) {
					return true;
				}
				if (next < steps.length) {
					try {
						steps[next++]();
					} catch (error) {
						// Whatever the engine holds now is not known: start
						// from nothing next time.
						this.reset();
						throw error;
					}
				}
				if (next < steps.length) {
					return false;
				}
				const kept = new Set(target.map((entry) => entry.id));
				for (const written of [this.written, this.authors]) {
					for (const id of written.keys()) {
						if (!kept.has(id)) {
							written.delete(id);
						}
					}
				}
				return true;
			},
			outputs: (): string[] =>
				target.map((entry, index) => {
					const cluster = this.written.get(entry.id) ?? "";
					return citations[index].inText && cluster
						? withAuthor(this.authors.get(entry.id) ?? "", cluster)
						: cluster;
				}),
		};
	}

	/** Forgets what the engine holds, so the next update starts from nothing. */
	reset(): void {
		this.entries = [];
		this.written.clear();
		this.authors.clear();
		this.current = null;
	}
}
