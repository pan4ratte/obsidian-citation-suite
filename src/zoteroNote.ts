import { htmlToMarkdown, sanitizeHTMLToDom } from "obsidian";

/**
 * Putting a Zotero note picked in the citation window into the note.
 *
 * Zotero's word-processor plugins insert a picked note as its text, and so does
 * this. What Better BibTeX hands back for a note without citations of its own
 * is the note's HTML — the same HTML Zotero's note editor saves, wrapped in a
 * `data-schema-version` div. A note that does hold citations never reaches
 * here: Better BibTeX turns it into those citations and drops its text.
 */

/**
 * The note's HTML as Markdown. It is Zotero's HTML, but still markup from
 * outside the vault, so it goes through Obsidian's sanitizer before it is
 * converted.
 */
export function noteMarkdown(html: string): string {
	return htmlToMarkdown(sanitizeHTMLToDom(html)).trim();
}

/** Blank lines enough to make `text`'s edge a paragraph break. */
function breakAfter(text: string): string {
	if (text.trim() === "" || text.endsWith("\n\n")) {
		return "";
	}
	return text.endsWith("\n") ? "\n" : "\n\n";
}

/**
 * The Markdown as it has to be inserted between `before` and `after` to stand
 * as paragraphs of its own: a note is headings, lists and paragraphs, and
 * dropped into the middle of a line it would run into the sentence around it.
 * The blank lines go only where the text does not already have them, and none
 * go at the very start or the very end of the note.
 *
 * `start` and `end` are where the Markdown itself sits in `text`, for the
 * cursor to be put after it rather than after the blank lines that follow.
 */
export function asBlock(
	before: string,
	after: string,
	markdown: string
): { text: string; start: number; end: number } {
	const prefix = breakAfter(before);
	const reversed = after.split("").reverse().join("");
	const suffix = after.trim() === "" ? "" : breakAfter(reversed);
	return {
		text: prefix + markdown + suffix,
		start: prefix.length,
		end: prefix.length + markdown.length,
	};
}
