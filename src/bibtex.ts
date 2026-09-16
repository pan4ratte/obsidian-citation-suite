import { Creator, Entry, parse } from "@retorquere/bibtex-parser";
import type { CslItem } from "src/render";

/**
 * A `.bib` file read as CSL, the way pandoc reads one.
 *
 * With Zotero out of reach — on a phone, or simply not running — the sources a
 * note cites have to come from somewhere else, and the file pandoc itself is
 * pointed at is the obvious somewhere: the note already names it in
 * `bibliography`, and it is the file the export will be written from.
 *
 * So this is not a general BibTeX reader. It is an attempt at the one pandoc
 * has, because the plugin's promise is that the preview is the export. Every
 * rule below was read off pandoc 3.11 rather than remembered: a `.bib` holding
 * the case in question was put through `pandoc --from biblatex --to csljson`,
 * and what came back is what the code is written to produce and what
 * `tests/bibtex.test.ts` holds it to.
 *
 * The parsing itself is `@retorquere/bibtex-parser`, Better BibTeX's own, which
 * is the part that has to know about `@string`, `crossref`, brace depth, LaTeX
 * escapes and the shapes a name comes in. It hands back fields already resolved
 * and already sentence-cased the way bib(la)tex means them; what is left here
 * is the mapping onto CSL, which is where pandoc's choices live.
 *
 * Two differences from pandoc are known, both found by the same testing:
 *
 * - A title in capitals throughout — `AN ENTIRELY UPPERCASE TITLE` — is left
 *   as it stands by pandoc and sentence-cased here. Which is right is a matter
 *   of taste; Zotero would sentence-case it too.
 * - `month = {March}` is dropped by pandoc, which keeps only the year, and read
 *   here as March. This one is simply better.
 */

/**
 * The CSL type each entry type is rendered as, as pandoc maps them. An entry
 * type not named here is rendered with no type at all, which is what pandoc
 * does with `@misc` and `@conference`: citeproc then styles it as the style's
 * fallback, and a style that asks about the type finds nothing.
 */
const TYPES: Record<string, string> = {
	article: "article-journal",
	audio: "song",
	book: "book",
	booklet: "pamphlet",
	collection: "book",
	dataset: "dataset",
	electronic: "webpage",
	inbook: "chapter",
	incollection: "chapter",
	inproceedings: "paper-conference",
	inreference: "entry-encyclopedia",
	letter: "personal_communication",
	manual: "book",
	mastersthesis: "thesis",
	movie: "motion_picture",
	mvbook: "book",
	mvcollection: "book",
	online: "webpage",
	patent: "patent",
	performance: "speech",
	periodical: "article-journal",
	phdthesis: "thesis",
	proceedings: "book",
	report: "report",
	review: "review",
	software: "software",
	standard: "legislation",
	suppbook: "chapter",
	techreport: "report",
	thesis: "thesis",
	unpublished: "manuscript",
	video: "motion_picture",
	www: "webpage",
};

/** The creator fields, and the CSL name each is written to. */
const CREATORS: Record<string, string> = {
	author: "author",
	bookauthor: "container-author",
	editor: "editor",
	translator: "translator",
};

/** The fields that are carried over as they are, under a CSL name. */
const FIELDS: Record<string, string> = {
	abstract: "abstract",
	annote: "annote",
	chapter: "chapter-number",
	doi: "DOI",
	edition: "edition",
	isbn: "ISBN",
	issn: "ISSN",
	language: "language",
	note: "note",
	series: "collection-title",
	type: "genre",
	url: "URL",
	version: "version",
	volume: "volume",
};

/**
 * What a source was published by, in pandoc's order. A `.bib` entry can carry
 * several of these at once — a thesis has a `school`, a report an `institution`
 * — and pandoc writes every one it finds, joined, rather than choosing.
 */
const PUBLISHERS = ["school", "institution", "organization", "howpublished", "publisher"];

/** The container's title, whatever kind of container the entry names. */
const CONTAINERS = ["journaltitle", "journal", "booktitle", "maintitle"];

/** Where a source was published: biblatex's name for it, and BibTeX's. */
const PLACES = ["address", "location"];

/** A field's value as one string, whichever shape the parser answered with. */
function text(value: unknown): string {
	if (typeof value === "string") {
		return value;
	}
	if (Array.isArray(value)) {
		return value.filter((part): part is string => typeof part === "string").join("; ");
	}
	return "";
}

/** The first of the fields the entry has anything under. */
function firstOf(entry: Entry, names: string[]): string {
	for (const field of names) {
		const value = text(entry.fields[field]);
		if (value) {
			return value;
		}
	}
	return "";
}

/**
 * One name as CSL has it. A name given in braces — `{Institute of Physics}` —
 * is an organisation, which CSL writes as one `literal` rather than as a person
 * who happens to have no first name. A `von`, `van der` or `de la` is a
 * dropping particle, as pandoc reads it.
 */
function name(creator: Creator): Record<string, string> {
	if (creator.name) {
		return { literal: creator.name };
	}
	const written: Record<string, string> = {};
	if (creator.lastName) {
		written.family = creator.lastName;
	}
	if (creator.firstName) {
		written.given = creator.firstName;
	}
	if (creator.prefix) {
		written["dropping-particle"] = creator.prefix;
	}
	if (creator.suffix) {
		written.suffix = creator.suffix;
	}
	return written;
}

/** The numbers in a date as CSL counts them, from `2020-05-04` and its like. */
function dateParts(written: string): number[] | null {
	const match = /^(\d{4})(?:-(\d{1,2}))?(?:-(\d{1,2}))?$/.exec(written.trim());
	if (!match) {
		return null;
	}
	return match
		.slice(1)
		.filter((part): part is string => part !== undefined)
		.map((part) => Number(part));
}

/**
 * When the source came out, as CSL's `date-parts`: from `date`, which biblatex
 * writes as `2020-05-04` and can write as a range — `2019-05/2020-06`, which
 * becomes the two ends — or else from `year`, `month` and `day`. The parser has
 * already turned a month written as `jan` or as a word into its number.
 *
 * A date in neither shape — `forthcoming`, a century — is handed over as
 * citeproc's literal date, which it prints as it stands.
 */
function issued(entry: Entry): Record<string, unknown> | null {
	const written = text(entry.fields.date);
	if (written) {
		const ends = written.split("/").map((end) => dateParts(end));
		if (ends.every((end) => end !== null)) {
			return { "date-parts": ends };
		}
		return { literal: written };
	}
	const year = text(entry.fields.year).trim();
	if (!year) {
		return null;
	}
	const numbers = dateParts(
		[year, text(entry.fields.month), text(entry.fields.day)]
			.filter((part) => part.trim())
			.join("-")
	);
	return numbers ? { "date-parts": [numbers] } : { literal: year };
}

/**
 * The title, and the short one a style may ask for. A `subtitle` is joined to
 * the title with a colon, as pandoc joins them, and the title on its own is
 * then what stands as `title-short` — unless the entry gives a `shorttitle` of
 * its own, which wins.
 */
function titles(entry: Entry): Record<string, string> {
	const title = text(entry.fields.title);
	const subtitle = text(entry.fields.subtitle);
	const short = text(entry.fields.shorttitle);
	const written: Record<string, string> = {};
	if (title && subtitle) {
		written.title = `${title}: ${subtitle}`;
	} else if (title) {
		written.title = title;
	}
	if (short) {
		written["title-short"] = short;
	} else if (title && subtitle) {
		written["title-short"] = title;
	}
	return written;
}

/**
 * A page range as CSL writes one. bib(la)tex's `--` has been read as an en dash
 * by the parser; citeproc prints whatever it is handed, and pandoc hands it a
 * hyphen.
 */
function pages(written: string): string {
	return written.replace(/\s*[–—]\s*/g, "-");
}

/** One entry as citeproc wants it, under the key it is cited by. */
export function bibtexItem(entry: Entry): CslItem {
	const item: CslItem = { id: entry.key };
	// Written even when the type is one pandoc has no CSL type for, as pandoc
	// writes it, so that a style asking about the type is answered the same.
	item.type = TYPES[entry.type.toLowerCase()] ?? "";

	for (const [field, csl] of Object.entries(CREATORS)) {
		const creators = entry.fields[field];
		if (Array.isArray(creators) && creators.length > 0) {
			item[csl] = (creators as Creator[]).map(name);
		}
	}

	for (const [field, csl] of Object.entries(FIELDS)) {
		const value = text(entry.fields[field]);
		if (value) {
			item[csl] = value;
		}
	}
	Object.assign(item, titles(entry));

	const container = firstOf(entry, CONTAINERS);
	if (container) {
		item["container-title"] = container;
	}
	const place = firstOf(entry, PLACES);
	if (place) {
		item["publisher-place"] = place;
	}
	const publisher = PUBLISHERS.map((field) => text(entry.fields[field]))
		.filter((written) => written)
		.join("; ");
	if (publisher) {
		item.publisher = publisher;
	}
	// A number is the issue of a journal, unless the entry is in a series —
	// and then it is the source's number within that.
	const number = text(entry.fields.number);
	if (number) {
		item[entry.fields.series ? "collection-number" : "issue"] = number;
	}
	const page = pages(text(entry.fields.pages));
	if (page) {
		item.page = page;
	}
	const keywords = entry.fields.keywords;
	if (Array.isArray(keywords) && keywords.length > 0) {
		item.keyword = keywords.join(", ");
	}
	const when = issued(entry);
	if (when) {
		item.issued = when;
	}
	const accessed = dateParts(text(entry.fields.urldate));
	if (accessed) {
		item.accessed = { "date-parts": [accessed] };
	}
	return item;
}

/** What reading a `.bib` came to: its sources, and what could not be read. */
export interface BibtexLibrary {
	items: CslItem[];
	/** One line per entry the parser could make nothing of. */
	errors: string[];
}

/**
 * Every source a `.bib` holds, as citeproc wants them.
 *
 * The parser is asked for bib(la)tex's own reading of the file: titles
 * sentence-cased as bib(la)tex means them, with the parts held in braces marked
 * `nocase` so that a style which titlecases leaves them alone, and an entry
 * whose `crossref` names another taking from it what it does not have of its
 * own. A TeX command the parser does not know is left standing rather than
 * refused, so that one odd macro costs the reader a field and not the file.
 */
export function bibtexLibrary(bib: string): BibtexLibrary {
	let parsed;
	try {
		parsed = parse(bib, { unsupported: "ignore" });
	} catch (error) {
		return { items: [], errors: [String(error)] };
	}
	return {
		items: parsed.entries.filter((entry) => entry.key).map(bibtexItem),
		errors: parsed.errors.map((error) => JSON.stringify(error)),
	};
}
