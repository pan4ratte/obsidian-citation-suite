import { bibtexLibrary } from "src/bibtex";
import type { CslItem } from "src/render";

/**
 * The file a note's sources are read from when they do not come from Zotero.
 *
 * Two formats, because the reader will already have one of them to hand. A
 * `.bib` is what pandoc is pointed at and what every reference manager exports;
 * CSL JSON is what Zotero and Better BibTeX export, and what citeproc wants
 * anyway, so nothing stands between the file and the rendering — no parsing to
 * go wrong, no mapping to disagree with pandoc about. Where the reader has a
 * choice, CSL JSON is the one to keep.
 *
 * Nothing here touches the vault: it is handed the text of a file and answers
 * with the sources in it, so that both the phone and the desktop can read a
 * file the way each of them reads files.
 */

/** The formats a library file can be in, told apart by the file's extension. */
export type LibraryFormat = "bibtex" | "csl-json";

/** The extensions each format is written under. */
const FORMATS: Record<string, LibraryFormat> = {
	bib: "bibtex",
	bibtex: "bibtex",
	json: "csl-json",
};

/** What a library file came to: its sources by key, and what could not be read. */
export interface LibraryContents {
	/** Every source in the file, by the key it is cited under. */
	items: Map<string, CslItem>;
	/**
	 * What the file cost the reader: entries that could not be parsed, or the
	 * one line saying the file itself could not be. Empty when all was well.
	 */
	errors: string[];
}

/** The format a path is in, or `null` for a file that is not a library. */
export function libraryFormat(path: string): LibraryFormat | null {
	const extension = path.slice(path.lastIndexOf(".") + 1).toLowerCase();
	return FORMATS[extension] ?? null;
}

/**
 * The sources in a CSL JSON export: the array Zotero and Better BibTeX write,
 * every item already in citeproc's own shape. Only the `id` is looked at, which
 * is the citation key the note cites the source by; the rest is handed to
 * citeproc as it stands, since it is what citeproc asked for.
 */
function cslJsonLibrary(json: string): { items: CslItem[]; errors: string[] } {
	let parsed: unknown;
	try {
		parsed = JSON.parse(json);
	} catch (error) {
		return { items: [], errors: [String(error)] };
	}
	if (!Array.isArray(parsed)) {
		return { items: [], errors: ["not a CSL JSON array"] };
	}
	const items: CslItem[] = [];
	const errors: string[] = [];
	for (const [index, item] of parsed.entries()) {
		if (item && typeof item === "object" && typeof (item as CslItem).id === "string") {
			items.push(item as CslItem);
		} else {
			errors.push(`item ${index + 1} has no citation key`);
		}
	}
	return { items, errors };
}

/**
 * Every source the file holds, by citation key.
 *
 * A key standing for two sources — two entries written under one key, or a
 * file pasted into itself — is taken as the last of them, which is what pandoc
 * takes it as, so that the preview cites what the export will cite. It is
 * reported all the same: a key that quietly stands for one of two sources is
 * worth a line even when the choice is the right one.
 */
export function libraryContents(text: string, format: LibraryFormat): LibraryContents {
	const read = format === "bibtex" ? bibtexLibrary(text) : cslJsonLibrary(text);
	const items = new Map<string, CslItem>();
	const errors = [...read.errors];
	for (const item of read.items) {
		if (items.has(item.id)) {
			errors.push(`${item.id} is in the file more than once`);
		}
		items.set(item.id, item);
	}
	return { items, errors };
}
