/**
 * Filtering the bibliography pane's entries by what the reader types.
 *
 * Every word of the query has to be found somewhere in an entry, in any order
 * and in any case — `kuhn 1962` finds the entry by Kuhn from 1962 — which is
 * how Obsidian's own search reads several words. What an entry is searched in
 * is its text as the style writes it, and the citation key the note cites it
 * by, so a key typed with or without its `@` finds its entry too.
 */

/**
 * Text brought to the form it is compared in: lower case, every run of
 * whitespace — the style's non-breaking spaces included — as one space, and
 * `ё` as `е`, since Russian is typed without the dots far more often than
 * with them.
 */
export function normalizeForSearch(text: string): string {
	return text
		.toLocaleLowerCase()
		.replace(/ё/g, "е")
		.replace(/\s+/g, " ")
		.trim();
}

/** The words of a query, each of which an entry must hold. */
export function queryTerms(query: string): string[] {
	const normalized = normalizeForSearch(query);
	return normalized ? normalized.split(" ") : [];
}

/** Whether text holds every term. With no terms, everything matches. */
export function matchesTerms(text: string, terms: string[]): boolean {
	if (terms.length === 0) {
		return true;
	}
	const haystack = normalizeForSearch(text);
	return terms.every((term) => haystack.includes(term));
}
