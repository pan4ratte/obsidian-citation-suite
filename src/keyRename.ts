import { keyMentions, parseGroups, proseOf } from "src/citation";
import { citationKeyToken } from "src/pandoc";

/**
 * A note's old citation keys written over with the keys Better BibTeX has
 * since given their sources (`src/keyIndex.ts` says which item a key stood
 * for, Better BibTeX what that item's key is now). Pure: text and keys in, a
 * list of changes out.
 *
 * A key is rewritten wherever pandoc reads it as a citation: in a bracketed
 * group, as every view reads one, and standing alone, `@doe2020 says`, which
 * is how the plugin writes a citation with brackets off. Code, comments and
 * the front matter are left alone, as `proseOf` empties them. The `-` that
 * suppresses the author is kept, and a new key pandoc would cut short is
 * braced, as the citation window would have written it.
 */

/** One change to the text: what stands from `from` to `to` becomes `text`. */
export interface TextEdit {
	from: number;
	to: number;
	text: string;
}

/**
 * Where every key the text cites stands, bracketed or alone, in order and once
 * each place — read as every view reads the note (`parseGroups`).
 */
function keyPlaces(text: string): { from: number; to: number; id: string; suppress: boolean }[] {
	const prose = proseOf(text);
	return parseGroups(prose).flatMap((group) =>
		keyMentions(prose, group).map((mention) => ({
			...mention,
			suppress: prose[mention.from] === "-",
		}))
	);
}

/** Every key the text cites, bracketed or alone, once each. */
export function citationKeysIn(text: string): string[] {
	return [...new Set(keyPlaces(text).map((place) => place.id))];
}

/**
 * The changes that write each old key the text cites over with its new one,
 * in order, none overlapping. Empty when the text cites none of them.
 */
export function keyRenameEdits(
	text: string,
	renames: ReadonlyMap<string, string>
): TextEdit[] {
	const edits: TextEdit[] = [];
	for (const place of keyPlaces(text)) {
		const renamed = renames.get(place.id);
		if (renamed !== undefined && renamed !== place.id) {
			edits.push({
				from: place.from,
				to: place.to,
				text: (place.suppress ? "-" : "") + citationKeyToken(renamed),
			});
		}
	}
	return edits;
}

/** The text with the changes made, which are in order and do not overlap. */
export function applyEdits(text: string, edits: TextEdit[]): string {
	let result = "";
	let at = 0;
	for (const edit of edits) {
		result += text.slice(at, edit.from) + edit.text;
		at = edit.to;
	}
	return result + text.slice(at);
}
