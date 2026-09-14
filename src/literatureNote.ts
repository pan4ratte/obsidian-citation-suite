/**
 * Finding the note a reader keeps about a source.
 *
 * There is no one way such a note is made, so the common ones are all read.
 * The plugins that write literature notes out of Zotero name them after the
 * citation key, most with an `@` before it as pandoc writes the key — Zotero
 * Integration's templates and the Citations plugin — and many put the key in
 * the note's front matter as well, which is also where a note named otherwise
 * can say what it is about. So, in this order:
 *
 * 1. a note named `@key`,
 * 2. a note named `key`,
 * 3. a note whose front matter has `citekey`, `citationKey` or `citation-key`
 *    holding the key, with or without its `@`, on its own or in a list.
 *
 * Several notes of one kind are told apart by the shortest path, then by
 * path, so the same one is found every time. Pure: the vault's notes are
 * handed in.
 */

/** A note that could be the one: what it is named, where it is, and its front matter. */
export interface NoteCandidate<T> {
	file: T;
	basename: string;
	path: string;
	frontmatter?: Record<string, unknown> | null;
}

/** The front matter fields a note gives its source's citation key in. */
const KEY_FIELDS = ["citekey", "citationKey", "citation-key"];

/** Whether the front matter says the note is about the key. */
function namesKey(frontmatter: Record<string, unknown>, citekey: string): boolean {
	return KEY_FIELDS.some((field) => {
		const value = frontmatter[field];
		const values: unknown[] = Array.isArray(value) ? value : [value];
		return values.some(
			(entry) =>
				typeof entry === "string" &&
				entry.trim().replace(/^@/, "") === citekey
		);
	});
}

/** The note kept about the source with the key, or `null` when there is none. */
export function literatureNote<T>(
	citekey: string,
	candidates: NoteCandidate<T>[]
): T | null {
	const rank = (candidate: NoteCandidate<T>): number => {
		if (candidate.basename === `@${citekey}`) {
			return 0;
		}
		if (candidate.basename === citekey) {
			return 1;
		}
		return candidate.frontmatter && namesKey(candidate.frontmatter, citekey)
			? 2
			: -1;
	};
	let best: { candidate: NoteCandidate<T>; rank: number } | null = null;
	for (const candidate of candidates) {
		const found = rank(candidate);
		if (found === -1) {
			continue;
		}
		if (
			!best ||
			found < best.rank ||
			(found === best.rank &&
				(candidate.path.length < best.candidate.path.length ||
					(candidate.path.length === best.candidate.path.length &&
						candidate.path < best.candidate.path)))
		) {
			best = { candidate, rank: found };
		}
	}
	return best?.candidate.file ?? null;
}
