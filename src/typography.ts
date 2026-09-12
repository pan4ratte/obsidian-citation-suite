/**
 * Where a bibliography entry may break when it wraps in a tooltip.
 *
 * An entry is set in a box a few hundred pixels wide, so it wraps, and it wraps
 * at whichever space comes last on a line. Some of those spaces hold together
 * things a reader takes as one: a page count and its abbreviation (`231 с.`),
 * a locator and its number (`с. 1`, `Vol. 3`), the dash that opens the next
 * field and what that field says. Those spaces are made non-breaking here, and
 * so is the last one in the entry, so that a line never ends the entry holding
 * a single word on its own.
 */

/** Written by its code point, being invisible in the source. */
const NBSP = String.fromCharCode(0xa0);

/**
 * A number followed by an abbreviation — `231 с.`, `3 vols.`. The abbreviation
 * is a word of up to four letters closed by a period, which is how CSL writes
 * every term it shortens, in any script.
 */
const NUMBER_THEN_ABBREVIATION = /(\d) (?=\p{L}{1,4}\.)/gu;

/** An abbreviation followed by a number — `с. 1`, `pp. 1–9`, `Vol. 3`. */
const ABBREVIATION_THEN_NUMBER = /(?<!\p{L})(\p{L}{1,4}\.) (?=\d)/gu;

/**
 * The space before a dash. A dash separates fields and belongs to the end of
 * the one before it: a line that opens with one reads as a list item.
 */
const BEFORE_DASH = / (?=[–—])/g;

/** The space before the entry's last word. */
const BEFORE_LAST_WORD = / (?=\S+$)/;

/**
 * One entry, on one line, with the spaces it must not break at made
 * non-breaking. The entry is collapsed first: a `display="block"` or an indent
 * comes out of citeproc as a line break inside it, and one line per source is
 * what keeps several sources apart.
 */
export function tooltipEntry(entry: string): string {
	return entry
		.replace(/\s+/g, " ")
		.trim()
		.replace(NUMBER_THEN_ABBREVIATION, `$1${NBSP}`)
		.replace(ABBREVIATION_THEN_NUMBER, `$1${NBSP}`)
		.replace(BEFORE_DASH, NBSP)
		.replace(BEFORE_LAST_WORD, NBSP);
}
