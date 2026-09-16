import { BibliographyParams, CslCitationItem, CslSys, Engine } from "citeproc";
import { requestUrl } from "obsidian";
import { REQUEST_HEADERS } from "src/cayw";
import {
	CitationGroup,
	ENGLISH_LABELS,
	LocatorLabels,
	ParsedCitation,
} from "src/citation";
import { CitationSession } from "src/citationSession";
import { labelWriter, localeLabels } from "src/localeTerms";
import { LabelWriter } from "src/pandoc";
import { withoutCitationNumbers, ZoteroCitePrefs } from "src/styles";
import { tooltipEntry } from "src/typography";
import { CitationStyle } from "src/types";
import {
	asZoteroCites,
	eventToEventTitle,
	PdfAttachment,
	pdfAttachments,
	selectLink,
	uppercasesSubtitles,
} from "src/zoteroCite";
import localeDeDe from "../locales/locales-de-DE.xml";
import localeEnGb from "../locales/locales-en-GB.xml";
import localeEnUs from "../locales/locales-en-US.xml";
import localeFrFr from "../locales/locales-fr-FR.xml";
import localeRuRu from "../locales/locales-ru-RU.xml";

/**
 * Rendering a pandoc citation the way the chosen style would write it.
 *
 * The note keeps the pandoc citation — that is the text, and nothing here
 * changes it. This turns `[@doe2020, p. 33]` into `(Doe, 2020, p. 33)` for the
 * reader to look at, and it is citeproc, the engine Zotero and pandoc both run,
 * that decides what that looks like.
 *
 * Asking Zotero to render instead was tried and cannot work: its API renders
 * one item at a time with nowhere to put a locator, so a page number would
 * vanish and a numbered style would call every source the first one.
 *
 * Three things have to be in hand before citeproc will say anything, and it
 * asks for all of them synchronously: the style, the locale and the items. The
 * first two are files; the third comes from Better BibTeX, the only thing that
 * knows what a citation key stands for. So the items are fetched first, and the
 * rendering is done afterwards against what was fetched.
 */

/**
 * The CSL locales the plugin carries, copied from Zotero's own, and why each:
 *
 * - `en-US` is CSL's fallback, which every engine loads.
 * - `ru-RU` is the language the plugin is written in first, and the one GOST
 *   styles are written in.
 * - `de-DE` and `fr-FR` are the other two languages of the multilingual GOST
 *   styles — "(ru, en, de, fr)" — which write each entry through a
 *   `<layout locale="de">` chosen by the source's own `language`; citeproc
 *   resolves `de` and `fr` to these two.
 * - `en-GB` is asked for by British styles such as MHRA, which would otherwise
 *   be written with American quotation marks.
 *
 * Any other language falls back to `en-US`, as CSL has it. Zotero carries 63;
 * a language is added here when a style in use needs it.
 */
const LOCALES: Record<string, string> = {
	// First among the English ones: a bare `en` is American, as in citeproc.
	"en-US": localeEnUs,
	"en-GB": localeEnGb,
	"ru-RU": localeRuRu,
	"de-DE": localeDeDe,
	"fr-FR": localeFrFr,
};

/** The style `item.pandoc_filter` falls back to, by the id Zotero keys it by. */
const APA_STYLE = "http://www.zotero.org/styles/apa";

/** CSL's own fallback, and the one every style can be rendered with. */
const FALLBACK_LOCALE = "en-US";

/**
 * The two engines one style is rendered with.
 *
 * The bibliography gets an engine of its own because it is shown on its own: a
 * tooltip over one citation is not a reference list, and the number a numbered
 * style starts each entry with would only be the source's place among the
 * handful this citation happens to name. citeproc has no switch to leave the
 * number out, so the second engine runs the style with the number taken out of
 * it — and, not being used for anything else, writes plain text for good.
 *
 * The citation engine holds a note — every citation in it, in order — through
 * its session (`src/citationSession.ts`), since that is what a citation is
 * written against, and the reference list is read off the same note.
 */
export interface StyleEngines {
	citation: Engine;
	/** The note the citation engine holds, kept in step citation by citation. */
	session: CitationSession;
	/** Whether the style cites in notes rather than in the text. */
	notes: boolean;
	/** `null` if the style would not run with its numbers taken out. */
	bibliography: Engine | null;
	/** The tooltip text of the sources a citation names, by their keys. */
	tooltips: Map<string, string>;
}

/**
 * A style to render in, and how — which is more than the style.
 *
 * A note is rendered the way Zotero renders unless it names pandoc's `csl` or
 * `lang` (`src/noteStyles.ts`); then it is rendered the way pandoc will export
 * it, in the style it names and in its language, forced over whatever the
 * style asks for, with its locators read in that language. So one style can be
 * running in two ways at once, and engines are kept by `key`.
 */
export interface StyleRef {
	/** Engines are kept and found by this. */
	key: string;
	/** A style Zotero has, or a CSL file a note names. */
	style: CitationStyle;
	/** The locale forced on the style, or empty for the one Zotero would choose. */
	locale: string;
	/** What the locators of the note's citations are read with. */
	labels: LocatorLabels;
	/**
	 * Where the note's sources come from: Zotero, or the vault's library files.
	 * It is no part of `key`, since the engines do not depend on it — only on
	 * the style and the locale — and one engine renders notes from either.
	 */
	library: LibraryRef;
}

/** How many styles are kept running: enough for the notes open side by side. */
const KEPT_ENGINES = 4;

/** A group as the style writes it: the citation, and the sources it cites. */
export interface RenderedCitation {
	/** The citation, in citeproc's HTML. */
	html: string;
	/**
	 * The bibliography entry of every source in the group, as plain text and
	 * one per line. Empty when the style has no bibliography to write.
	 */
	bibliography: string;
}

/**
 * A note's reference list as the style writes it, for the bibliography pane.
 * Unlike a tooltip's, it is the style's whole bibliography — numbers, markup
 * and layout — because it is read as one.
 */
export interface RenderedBibliography {
	/** One entry per source, in citeproc's HTML and in the style's order. */
	entries: string[];
	/** The same entries as citeproc writes them in text, each ending in a newline. */
	text: string[];
	/** The layout citeproc wrote the entries with, for the copy's markup. */
	params: BibliographyParams;
	/** How far every line of an entry but the first is indented, in em; or 0. */
	hangingIndent: number;
	/**
	 * The width of the column the entry's number is set apart in, in
	 * characters; or 0 when the style sets no number apart.
	 */
	numberWidth: number;
}

/** One item as Better BibTeX exports it, keyed by the citation key. */
export interface CslItem {
	id: string;
	[field: string]: unknown;
}

/**
 * A source Zotero found for what was typed after `@`: its key, and the CSL
 * it answered with — Zotero's own, with its URI as `id` — which is what the
 * suggestion shows.
 */
export interface LibraryItem {
	citekey: string;
	item: Record<string, unknown>;
	/** The name of the library it is in. */
	library: string;
}

/** An item, and the library it was taken from. */
interface FoundItem {
	item: CslItem;
	library: number;
}

/**
 * What asking Zotero for an item's `zotero://select` link comes to: the link,
 * or why there is none — Zotero not answering, or no longer holding the item.
 */
export type ItemLink = { link: string } | { error: "unreachable" | "not-found" };

/** What asking Zotero for a key's PDFs comes to: the PDFs, or why there are none to hand. */
export type ItemPdfs =
	| { pdfs: PdfAttachment[] }
	| { error: "unreachable" | "not-found" };

/**
 * One call to Better BibTeX's JSON-RPC endpoint: its result, or `null` when
 * there is none — Zotero closed, the method refused, an answer that is not JSON.
 */
async function rpc<T>(
	port: number,
	method: string,
	params: unknown[]
): Promise<T | null> {
	const response = await requestUrl({
		url: `http://127.0.0.1:${port}/better-bibtex/json-rpc`,
		method: "POST",
		headers: { ...REQUEST_HEADERS, "Content-Type": "application/json" },
		body: JSON.stringify({ jsonrpc: "2.0", method, params, id: 1 }),
		throw: false,
	}).catch(() => null);
	if (response?.status !== 200) {
		return null;
	}
	try {
		const body = response.json as { result?: T } | null;
		return body?.result ?? null;
	} catch {
		return null;
	}
}

/**
 * Every library Zotero has, by the numeric id Better BibTeX takes: My Library
 * first, the groups after it, in Zotero's own order. `null` when Zotero does
 * not answer.
 */
async function fetchLibraries(port: number): Promise<number[] | null> {
	const libraries = await rpc<{ id: unknown }[]>(port, "user.groups", []);
	if (!Array.isArray(libraries)) {
		return null;
	}
	return libraries
		.map((library) => library.id)
		.filter((id): id is number => typeof id === "number");
}

/** What `item.pandoc_filter` answers with when asked for CSL. */
interface PandocFilterAnswer {
	/** The items found, by citation key, as `Better CSL JSON` writes them. */
	items?: Record<string, CslItem>;
	/** How many items each key not handed over matched: none, or several. */
	errors?: Record<string, number>;
}

/**
 * The CSL data for a set of citation keys, from Better BibTeX, one library at a
 * time.
 *
 * A citation key is unique only inside its library, and a source is very often
 * in more than one — My Library and the group it was shared to, holding the
 * same key — so asking every library at once is answered with duplicates for
 * exactly the sources cited most. The libraries are asked in turn instead, each
 * for the keys the ones before it did not have, which is the same order a key
 * shared between them is taken in: My Library's copy first.
 *
 * `item.pandoc_filter` rather than `item.export`: the export refuses the whole
 * request when one key is missing from the library — and in all but one of
 * them some key always is — while this reports the keys it could not hand over
 * and hands over the rest. Both write `Better CSL JSON`, keyed by citation key.
 *
 * It also works out each item's author against a style, `apa` unless named,
 * and fails the request if that style is not installed; so a style Zotero
 * certainly has is named.
 *
 * What it hands over is only used to learn which keys the library has. The
 * items themselves are then exported again, those keys and no others, through
 * Zotero's own `CSL JSON` translator — `Zotero.Utilities.Item.itemToCSLJSON`,
 * which is what Zotero feeds citeproc with. `Better CSL JSON` is not quite
 * that: it turns the hyphen in an issue range into an en dash, for one, which
 * citeproc prints as it is given. Only if that export fails is Better BibTeX's
 * copy kept.
 *
 * `answered` is false when a library was asked and nothing came back because
 * Zotero was not there — closed while the keys were looked for — so a key not
 * found may yet be there. Nothing coming back is not proof of that on its own:
 * Better BibTeX can refuse one library's request while answering the rest. So
 * Zotero is asked for its libraries, which it answers whenever it is running,
 * and the request is sent once more if it does; only a Zotero that answers
 * neither counts as not there. A library refused twice is passed over, and its
 * keys are not found, as Better BibTeX said.
 */
async function fetchItems(
	port: number,
	citekeys: string[],
	libraries: number[],
	style: string | undefined
): Promise<{ found: FoundItem[]; answered: boolean }> {
	const found: FoundItem[] = [];
	let answered = true;
	let remaining = citekeys;
	for (const library of libraries) {
		if (remaining.length === 0) {
			break;
		}
		// An absent parameter takes Better BibTeX's default; a null one fails
		// its schema, so the style is left off rather than sent empty.
		const params = style
			? [remaining, true, library, style]
			: [remaining, true, library];
		let answer = await rpc<PandocFilterAnswer>(
			port,
			"item.pandoc_filter",
			params
		);
		if (answer === null) {
			if ((await fetchLibraries(port)) === null) {
				answered = false;
				continue;
			}
			// Zotero is there: a hiccup is answered the second time, and a
			// refusal is refused again.
			answer = await rpc<PandocFilterAnswer>(
				port,
				"item.pandoc_filter",
				params
			);
			if (answer === null) {
				continue;
			}
		}
		const better = new Map<string, CslItem>();
		for (const [key, item] of Object.entries(answer.items ?? {})) {
			if (item && typeof item === "object") {
				better.set(key, { ...item, id: key });
			}
		}
		if (better.size === 0) {
			continue;
		}

		const zotero = await exportZoteroCsl(port, [...better.keys()], library);
		for (const [key, item] of better) {
			found.push({ item: zotero.get(key) ?? item, library });
		}
		remaining = remaining.filter((key) => !better.has(key));
	}
	return { found, answered };
}

/** Zotero's own "CSL JSON" export translator, by the id Zotero ships it under. */
const CSL_JSON_TRANSLATOR = "bc03b4fe-436d-4a1f-ba59-de4d2d7a63f7";

/**
 * The keys' items as Zotero's own `CSL JSON` translator writes them, by
 * citation key — every key must be one the library holds exactly once, since
 * `item.export` refuses the whole request otherwise. Empty when it fails.
 */
async function exportZoteroCsl(
	port: number,
	citekeys: string[],
	library: number
): Promise<Map<string, CslItem>> {
	const items = new Map<string, CslItem>();
	// The translator writes a document, and the RPC hands that document over
	// as one string of JSON.
	const document = await rpc<string>(port, "item.export", [
		citekeys,
		CSL_JSON_TRANSLATOR,
		library,
	]);
	if (typeof document !== "string") {
		return items;
	}
	let parsed: unknown;
	try {
		parsed = JSON.parse(document);
	} catch {
		return items;
	}
	if (!Array.isArray(parsed)) {
		return items;
	}
	for (const item of parsed as Record<string, unknown>[]) {
		const key = item["citation-key"] ?? item.id;
		if (typeof key === "string") {
			items.set(key, { ...item, id: key });
		}
	}
	return items;
}

/**
 * The bibliography entries of the items, as plain text and one per line — or an
 * empty string for a style without a bibliography, or one citeproc fails to
 * write. Plain text because it is read in a tooltip, which shows an attribute's
 * text and nothing else; the engine is expected to be writing text already.
 */
function bibliography(engine: Engine, ids: string[]): string {
	try {
		engine.updateItems(ids);
		const written = engine.makeBibliography();
		if (!written) {
			return "";
		}
		return written[1]
			.map(tooltipEntry)
			.filter((entry) => entry.length > 0)
			.join("\n");
	} catch {
		return "";
	}
}

/** A citation the note holds, in CSL's spelling, with nothing left empty. */
export function citationItem(citation: ParsedCitation): CslCitationItem {
	return {
		id: citation.id,
		locator: citation.locator || undefined,
		label: citation.label || undefined,
		prefix: citation.prefix || undefined,
		suffix: citation.suffix || undefined,
		"suppress-author": citation.suppressAuthor || undefined,
	};
}

/**
 * The conditions `item.search` is asked for what was typed: Zotero's own
 * quick search in its "Title, Creator, Year" mode — each word somewhere in the
 * title, the creators or the year, which in Zotero 7 takes the citation key in
 * too — over sources only, and not over feeds.
 */
function searchConditions(query: string): unknown[] {
	return [
		["quicksearch-titleCreatorYear", "contains", query],
		["ignore_feeds"],
		["itemType", "isNot", "attachment", true],
		["itemType", "isNot", "note", true],
		["itemType", "isNot", "annotation", true],
	];
}

/**
 * A style that only names another one has no rules of its own to render with,
 * and the parent's are the ones Zotero would use. The href is the parent's id,
 * which is how every style is keyed.
 */
export function parentId(csl: string): string {
	const link = /<link[^>]*rel="independent-parent"[^>]*>/.exec(csl);
	const href = link ? /href="([^"]*)"/.exec(link[0]) : null;
	return href ? href[1] : "";
}

/**
 * The carried locale a language is written in: `ru-RU` for `ru-RU` and for a
 * bare `ru` alike, and `de-DE` for an Austrian `de-AT` the plugin does not
 * carry — closer than CSL's `en-US`. Empty for a language not carried at all.
 */
export function carriedLocale(lang: string): string {
	if (lang in LOCALES) {
		return lang;
	}
	const language = lang.split(/[-_]/)[0].toLowerCase();
	return (
		Object.keys(LOCALES).find(
			(locale) => locale.split("-")[0] === language
		) ?? ""
	);
}

/**
 * An engine set up the way Zotero's `getCiteProc` sets one up: URLs and DOIs
 * written as links — which is also what keeps a DOI stored as a whole URL from
 * being printed behind a second `https://doi.org/` — and author names taken as
 * Zotero stored them rather than parsed again.
 */
function zoteroEngine(
	sys: CslSys,
	csl: string,
	locale: string,
	forceLocale: boolean
): Engine {
	const engine = new Engine(sys, csl, locale, forceLocale);
	engine.opt.development_extensions.wrap_url_and_doi = true;
	engine.opt.development_extensions.parse_names = false;
	return engine;
}

/** The locale a style asks for, when it asks for one. */
export function styleLocale(csl: string): string {
	const match = /<style[^>]*default-locale="([^"]*)"/.exec(csl);
	return match ? match[1] : "";
}

/**
 * Where a note's sources come from.
 *
 * The empty string is Zotero, which is where they came from when there was
 * nowhere else. Anything else names library files of the vault — their paths,
 * joined by newlines, in the order the note named them — which is what a note
 * with pandoc's `bibliography` property is read from, and all there is to read
 * on a phone.
 */
export type LibraryRef = string;

/** Zotero, as a library is named. */
export const ZOTERO_LIBRARY: LibraryRef = "";

/** What joins the paths in a ref; no vault path holds one. */
const SEPARATOR = "\n";

/** The paths a library ref names, or none for Zotero's. */
export function libraryPaths(ref: LibraryRef): string[] {
	return ref ? ref.split(SEPARATOR) : [];
}

/** The ref the paths make, in the order they were named. */
export function libraryRefOf(paths: string[]): LibraryRef {
	return paths.join(SEPARATOR);
}

/**
 * The vault's library files, as the renderer needs them: read first, then read
 * off. `src/vaultLibrary.ts` is what does it; the renderer is handed this so
 * that it goes on knowing nothing about the vault.
 */
export interface FileLibraries {
	/** Reads the files, so that what is in them can be had synchronously after. */
	load(paths: string[]): Promise<void>;
	/** What is in them, and whether every one of them was read. */
	itemsOf(paths: string[]): { items: Map<string, CslItem>; complete: boolean };
}

/** What is known about the sources of one library. */
interface SourceState {
	/** CSL data by citation key, for everything asked about so far. */
	items: Map<string, CslItem>;
	/** The Zotero library each item was taken from; empty for a file's. */
	itemLibraries: Map<string, number>;
	/** Keys the library has no item for. Asked once, then left alone. */
	unknown: Set<string>;
	/** The keys in `unknown` that were missed because the library was not there. */
	unreached: Set<string>;
	/** The lookups under way, by each key they were started for. */
	lookups: Map<string, Promise<void>>;
}

function emptySource(): SourceState {
	return {
		items: new Map(),
		itemLibraries: new Map(),
		unknown: new Set(),
		unreached: new Set(),
		lookups: new Map(),
	};
}

export class CitationRenderer {
	/** What is known of each library's sources, by the ref that names it. */
	private sources = new Map<LibraryRef, SourceState>();
	/**
	 * The library the engines read items from while something is being
	 * rendered. citeproc asks for an item in the middle of writing a citation
	 * and cannot be handed anything with it, so the library is put here by
	 * whatever is about to render, and every render entry point does it. Safe
	 * because rendering is synchronous throughout: nothing else runs between
	 * the setting and the writing.
	 */
	private current: SourceState = emptySource();
	/** Zotero's libraries, in the order a key is looked for in them. */
	private libraries: number[] | null = null;
	/** Where a note that names no library of its own reads its sources from. */
	private fallbackLibrary: LibraryRef = ZOTERO_LIBRARY;
	/** The styles running, by `StyleRef.key`, the latest used last; `null` for one that would not. */
	private engines = new Map<string, StyleEngines | null>();
	/** Styles being built, so that two asking at once build one. */
	private building = new Map<string, Promise<StyleEngines | null>>();
	/** How locator labels are written, by carried locale (`""` for none carried). */
	private writers = new Map<string, LabelWriter>();
	/** Locator labels, by the key of the style and locale they are read in. */
	private labels = new Map<string, LocatorLabels>();

	constructor(
		private port: number,
		private styles: CitationStyle[],
		private readStyle: (style: CitationStyle) => Promise<string>,
		private zotero: ZoteroCitePrefs,
		/** The vault's library files, for the notes read from one. */
		private files: FileLibraries | null = null
	) {}

	/** Forget everything: the port, the styles or the library have changed. */
	reset(port: number, styles: CitationStyle[], zotero: ZoteroCitePrefs): void {
		this.port = port;
		this.styles = styles;
		this.zotero = zotero;
		this.sources.clear();
		this.current = emptySource();
		this.libraries = null;
		this.engines.clear();
		this.building.clear();
	}

	/**
	 * Where the notes that name no library of their own read from: the file the
	 * settings name, or Zotero. Every `StyleRef` made after this says so.
	 */
	setFallbackLibrary(ref: LibraryRef): void {
		this.fallbackLibrary = ref;
	}

	/** Forgets the sources read from the vault's files: one of them changed. */
	forgetFiles(): void {
		for (const ref of [...this.sources.keys()]) {
			if (ref !== ZOTERO_LIBRARY) {
				this.sources.delete(ref);
			}
		}
	}

	/**
	 * Says which library citeproc is to read items from for what is about to be
	 * written. Every render entry point calls this first: citeproc asks for its
	 * items in the middle of writing, with no way to be handed them.
	 */
	reading(ref: LibraryRef): void {
		this.current = this.source(ref);
	}

	/** What is known of a library's sources, made ready if it is new. */
	private source(ref: LibraryRef): SourceState {
		let state = this.sources.get(ref);
		if (!state) {
			state = emptySource();
			this.sources.set(ref, state);
		}
		return state;
	}

	/**
	 * Make sure every key named is either known or known to be unknown. Only
	 * this is asynchronous; rendering afterwards is not, because citeproc asks
	 * for its data with no way to wait for an answer.
	 *
	 * With `retryUnreached`, the keys missed because Zotero did not answer are
	 * asked about again too. The bibliography pane asks that; the editor does
	 * not, since it would send a request on every keystroke while Zotero is
	 * closed.
	 */
	async load(
		citekeys: string[],
		retryUnreached = false,
		ref: LibraryRef = ZOTERO_LIBRARY
	): Promise<void> {
		// A key already being looked up is waited for rather than asked about
		// twice: the editor asks on every redraw, and a note asks for all of
		// its keys at once.
		const source = this.source(ref);
		const underway = new Set<Promise<void>>();
		const wanted: string[] = [];
		for (const key of new Set(citekeys)) {
			const lookup = source.lookups.get(key);
			if (lookup) {
				underway.add(lookup);
			} else if (
				!source.items.has(key) &&
				(!source.unknown.has(key) ||
					(retryUnreached && source.unreached.has(key)))
			) {
				wanted.push(key);
			}
		}
		if (wanted.length > 0) {
			const lookup = this.lookUp(wanted, ref).finally(() => {
				for (const key of wanted) {
					if (source.lookups.get(key) === lookup) {
						source.lookups.delete(key);
					}
				}
			});
			for (const key of wanted) {
				source.lookups.set(key, lookup);
			}
			underway.add(lookup);
		}
		await Promise.all(underway);
	}

	/** Asks the note's library for the keys and keeps what it says about each. */
	private async lookUp(wanted: string[], ref: LibraryRef): Promise<void> {
		const source = this.source(ref);
		const { found, answered } =
			ref === ZOTERO_LIBRARY
				? await this.fromZotero(wanted)
				: await this.fromFiles(wanted, ref);
		for (const { item, library } of found) {
			if (typeof item.id === "string") {
				source.items.set(item.id, item);
				if (library >= 0) {
					source.itemLibraries.set(item.id, library);
				}
			}
		}
		for (const key of wanted) {
			if (source.items.has(key)) {
				source.unknown.delete(key);
				source.unreached.delete(key);
			} else {
				// The library does not know it: a key typed by hand, or one
				// whose item has gone — or the library was not there to ask.
				// Asking again on every keystroke would only be told the same.
				source.unknown.add(key);
				if (answered) {
					source.unreached.delete(key);
				} else {
					source.unreached.add(key);
				}
			}
		}
	}

	/** The keys as Zotero has them, through Better BibTeX. */
	private async fromZotero(
		wanted: string[]
	): Promise<{ found: FoundItem[]; answered: boolean }> {
		// Asked once and kept: a library is added in Zotero far less often
		// than a note is read, and the refresh button asks again.
		this.libraries ??= await fetchLibraries(this.port);
		const answer = this.libraries
			? await fetchItems(this.port, wanted, this.libraries, this.installedStyle())
			: { found: [], answered: false };
		if (!answer.answered) {
			// Read again once Zotero answers: a group may have been joined
			// while it was closed.
			this.libraries = null;
		}
		return answer;
	}

	/**
	 * The keys as the note's own library files have them. A file that could not
	 * be read leaves its keys unanswered rather than missing, the way a closed
	 * Zotero does: the file may be one a reference manager is writing over, and
	 * the next pass will find it.
	 */
	private async fromFiles(
		wanted: string[],
		ref: LibraryRef
	): Promise<{ found: FoundItem[]; answered: boolean }> {
		const files = this.files;
		if (!files) {
			return { found: [], answered: false };
		}
		const paths = libraryPaths(ref);
		await files.load(paths);
		const { items, complete } = files.itemsOf(paths);
		const found: FoundItem[] = [];
		for (const key of wanted) {
			const item = items.get(key);
			if (item) {
				found.push({ item, library: -1 });
			}
		}
		return { found, answered: complete };
	}

	/** Whether the key was missed because the library did not answer when asked. */
	unreachable(citekey: string, ref: LibraryRef = ZOTERO_LIBRARY): boolean {
		return this.source(ref).unreached.has(citekey);
	}

	/**
	 * Whether the library answered and has no item for the key — a typo, or a
	 * source since deleted. A key not asked about yet is not missing, and
	 * neither is one the library was not there to answer for.
	 */
	missing(citekey: string, ref: LibraryRef = ZOTERO_LIBRARY): boolean {
		const source = this.source(ref);
		return source.unknown.has(citekey) && !source.unreached.has(citekey);
	}

	/** Every source asked about and found so far, by citation key. */
	knownItems(ref: LibraryRef = ZOTERO_LIBRARY): ReadonlyMap<string, CslItem> {
		return this.source(ref).items;
	}

	/**
	 * Every source a library holds, for offering one while a key is typed.
	 *
	 * A file library is read whole and is all in hand, so every source in it
	 * can be offered — which is more than Zotero's own search is asked for, and
	 * it needs nothing to be running. Zotero's is another matter: it is asked
	 * about a query rather than read, so only what has been looked up already
	 * is here, and `searchLibrary` is what finds the rest.
	 */
	async allItems(ref: LibraryRef): Promise<ReadonlyMap<string, CslItem>> {
		if (ref === ZOTERO_LIBRARY || !this.files) {
			return this.knownItems(ref);
		}
		const paths = libraryPaths(ref);
		await this.files.load(paths);
		return this.files.itemsOf(paths).items;
	}

	/**
	 * The sources Zotero finds for what was typed, in every library it has, or
	 * `null` when it does not answer. A source in several libraries under one
	 * key is listed once, from the first library Zotero names.
	 */
	async searchLibrary(query: string): Promise<LibraryItem[] | null> {
		const found = await rpc<Record<string, unknown>[]>(
			this.port,
			"item.search",
			[searchConditions(query)]
		);
		if (!Array.isArray(found)) {
			return null;
		}
		const items = new Map<string, LibraryItem>();
		for (const item of found) {
			const citekey = item.citekey;
			if (typeof citekey === "string" && citekey && !items.has(citekey)) {
				items.set(citekey, {
					citekey,
					item,
					library: typeof item.library === "string" ? item.library : "",
				});
			}
		}
		return [...items.values()];
	}

	/**
	 * A style Zotero has for certain, for `item.pandoc_filter` to work the
	 * author out in: APA, which Zotero ships and is the method's default, or
	 * failing that any style it has.
	 */
	private installedStyle(): string | undefined {
		const apa = this.styles.find((style) => style.id === APA_STYLE);
		return (apa ?? this.styles[0])?.id;
	}

	/** Whether every key in the group is one citeproc can be handed an item for. */
	known(group: CitationGroup, ref: LibraryRef = ZOTERO_LIBRARY): boolean {
		return group.citations.every((citation) => this.has(citation.id, ref));
	}

	/** Whether the library has handed over an item for the key. */
	has(citekey: string, ref: LibraryRef = ZOTERO_LIBRARY): boolean {
		return this.source(ref).items.has(citekey);
	}

	/**
	 * The link that selects a key's item in Zotero's window — the item in the
	 * library it was rendered from, since the same key can stand for an item in
	 * My Library and another in a group.
	 *
	 * Neither the export nor `item.pandoc_filter` says which item a key is, so
	 * Better BibTeX's `item.search` is asked, for that key in that library: it
	 * answers with Zotero's own CSL, whose `id` is the item's URI, and with
	 * Better BibTeX's key for it as `citekey`. The key is matched again on
	 * that, since Zotero's `is` does not tell case apart.
	 */
	async itemLink(citekey: string): Promise<ItemLink> {
		const library = this.source(ZOTERO_LIBRARY).itemLibraries.get(citekey);
		if (library === undefined) {
			return { error: "not-found" };
		}
		const found = await rpc<Record<string, unknown>[]>(
			this.port,
			"item.search",
			[
				[
					["citationKey", "is", citekey],
					["libraryID", "is", library],
				],
			]
		);
		if (!Array.isArray(found)) {
			return { error: "unreachable" };
		}
		const item = found.find(
			(candidate) =>
				candidate.citekey === citekey ||
				candidate["citation-key"] === citekey
		);
		const link = typeof item?.id === "string" ? selectLink(item.id) : null;
		return link ? { link } : { error: "not-found" };
	}

	/**
	 * The PDFs attached to a key's item, in the library it was rendered from,
	 * asked of Better BibTeX's `item.attachments` when they are wanted rather
	 * than kept: attaching a PDF in Zotero should not wait for anything to be
	 * refreshed.
	 *
	 * The method answers with an error, not an empty list, for a key the
	 * library no longer holds, and `rpc` makes that `null` just as it makes a
	 * closed Zotero `null`; so Zotero is asked for its libraries to tell the
	 * two apart.
	 */
	async itemPdfs(citekey: string): Promise<ItemPdfs> {
		const library = this.source(ZOTERO_LIBRARY).itemLibraries.get(citekey);
		if (library === undefined) {
			return { error: "not-found" };
		}
		const found = await rpc<unknown[]>(this.port, "item.attachments", [
			citekey,
			library,
		]);
		if (Array.isArray(found)) {
			return { pdfs: pdfAttachments(found) };
		}
		return {
			error: (await fetchLibraries(this.port)) === null ? "unreachable" : "not-found",
		};
	}

	/**
	 * Let the keys Better BibTeX had no item for be asked about again. A key
	 * is marked unknown for good the first time it is missed, and a Zotero that
	 * was closed at that moment misses every key there is.
	 */
	forgetUnknown(): void {
		for (const source of this.sources.values()) {
			source.unknown.clear();
			source.unreached.clear();
		}
		// A key may be missing because its group was joined after the list
		// of libraries was read.
		this.libraries = null;
	}

	/**
	 * The keys that have neither been found nor been looked for and missed —
	 * the ones, and only the ones, worth a request.
	 *
	 * The editor asks this before it asks for a lookup, and that is what stops
	 * a key Better BibTeX does not know from spinning: a lookup for it would
	 * finish at once, the editor would redraw, the key would still be missing,
	 * and it would ask again forever.
	 */
	pending(citekeys: string[], ref: LibraryRef = ZOTERO_LIBRARY): string[] {
		const source = this.source(ref);
		return [
			...new Set(
				citekeys.filter(
					(key) => !source.items.has(key) && !source.unknown.has(key)
				)
			),
		];
	}

	/**
	 * How locator labels are written in a note pandoc reads in `locale`, a
	 * carried locale — or `null` for a language the plugin carries none for,
	 * where the CSL names are written, which pandoc reads in every language.
	 */
	labelWriter(locale: string | null): LabelWriter {
		const key = locale ?? "";
		let writer = this.writers.get(key);
		if (!writer) {
			writer = labelWriter(
				locale === null ? null : (LOCALES[locale] ?? LOCALES[FALLBACK_LOCALE]),
				LOCALES[FALLBACK_LOCALE]
			);
			this.writers.set(key, writer);
		}
		return writer;
	}

	/** Every style Zotero has. */
	knownStyles(): CitationStyle[] {
		return this.styles;
	}

	/** The style Zotero has under the id, or `undefined`. */
	styleById(id: string): CitationStyle | undefined {
		return this.styles.find((candidate) => candidate.id === id);
	}

	/**
	 * The style chosen in the settings, run as Zotero runs it: in Zotero's
	 * language unless the style names its own, with locators read in English.
	 * `null` for no style, or one Zotero no longer has.
	 */
	zoteroStyle(styleId: string): StyleRef | null {
		const style = styleId ? this.styleById(styleId) : undefined;
		return style
			? {
					key: styleId,
					style,
					locale: "",
					labels: ENGLISH_LABELS,
					library: this.fallbackLibrary,
				}
			: null;
	}

	/**
	 * A style run as pandoc runs it for a note: in `locale` — a carried locale
	 * — forced over the style's own, with locators read in it and in the
	 * style's own terms for it. `csl` is the text of the style whose terms
	 * count: the style's, or its parent's for a dependent one.
	 */
	pandocStyle(
		style: CitationStyle,
		locale: string,
		csl: string,
		library: LibraryRef = this.fallbackLibrary
	): StyleRef {
		const key = `${style.path || style.id}\n${locale}`;
		let labels = this.labels.get(key);
		if (!labels) {
			labels = localeLabels(
				LOCALES[locale] ?? LOCALES[FALLBACK_LOCALE],
				LOCALES[FALLBACK_LOCALE],
				csl,
				locale
			);
			this.labels.set(key, labels);
		}
		return { key, style, locale, labels, library };
	}

	private async buildEngine(ref: StyleRef): Promise<StyleEngines | null> {
		let style = ref.style;
		let csl: string;
		try {
			csl = await this.readStyle(style);
		} catch {
			return null;
		}
		// citeproc is only ever given the parent, so it cannot see the language
		// a dependent style names; Zotero forces that language, and so does
		// this.
		let forcedLocale = "";
		const parent = parentId(csl);
		if (parent) {
			const independent = this.styleById(parent);
			if (!independent) {
				return null;
			}
			forcedLocale = styleLocale(csl);
			style = independent;
			csl = await this.readStyle(independent);
		}
		csl = eventToEventTitle(csl);

		// A note's own language is forced, as pandoc forces `lang`. Otherwise
		// the language Zotero asks citeproc for when none is forced; a style
		// naming its own still wins inside citeproc, as it does in Zotero.
		const locale =
			ref.locale ||
			forcedLocale ||
			carriedLocale(this.zotero.locale) ||
			FALLBACK_LOCALE;
		const forced = !!ref.locale || !!forcedLocale;

		const sys = {
			// A style may ask for a language the plugin does not carry, and
			// CSL's own answer to that is `en-US`.
			retrieveLocale: (lang: string): string =>
				LOCALES[carriedLocale(lang)] ?? LOCALES[FALLBACK_LOCALE],
			retrieveItem: (id: string): unknown => {
				// From whichever library the note being rendered reads; see
				// `current`, which is set by every render entry point.
				const item = this.current.items.get(id);
				return item
					? asZoteroCites(item, this.zotero.citePaperArticleURLs)
					: { id, type: "document" };
			},
			uppercase_subtitles: uppercasesSubtitles(ref.style.id, style.id),
		};
		let citation: Engine;
		try {
			citation = zoteroEngine(sys, csl, locale, forced);
		} catch {
			// Not a style citeproc can run. Nothing is rendered, and the note
			// goes on reading as the pandoc citation it holds.
			return null;
		}

		let bibliography: Engine | null = null;
		try {
			bibliography = zoteroEngine(
				sys,
				withoutCitationNumbers(csl),
				locale,
				forced
			);
			bibliography.setOutputFormat("text");
		} catch {
			// The citations still render; their tooltips fall back to the
			// note's text.
			bibliography = null;
		}
		return {
			citation,
			session: new CitationSession(citation),
			notes: citation.opt.xclass === "note",
			bibliography,
			tooltips: new Map(),
		};
	}

	/**
	 * Whether a style has been built, or tried and would not run — either way
	 * there is nothing left to wait for.
	 */
	built(ref: StyleRef): boolean {
		return this.engines.has(ref.key);
	}

	/** The engines of a style, synchronously, or `null` when they are not built yet. */
	preparedEngines(ref: StyleRef): StyleEngines | null {
		return this.engines.get(ref.key) ?? null;
	}

	/**
	 * The engines for a style, built once and kept while it is among the last
	 * few used. Building one takes up to a second, so the styles notes are open
	 * in stay running; one that has not been used for longest makes way.
	 */
	async engineFor(ref: StyleRef): Promise<StyleEngines | null> {
		if (this.engines.has(ref.key)) {
			const engines = this.engines.get(ref.key) ?? null;
			// The latest used goes last.
			this.engines.delete(ref.key);
			this.engines.set(ref.key, engines);
			return engines;
		}
		let build = this.building.get(ref.key);
		if (!build) {
			build = this.buildEngine(ref);
			this.building.set(ref.key, build);
		}
		const engines = await build;
		if (this.building.get(ref.key) === build) {
			this.building.delete(ref.key);
			this.engines.set(ref.key, engines);
			while (this.engines.size > KEPT_ENGINES) {
				const oldest = this.engines.keys().next().value;
				if (oldest === undefined) {
					break;
				}
				this.engines.delete(oldest);
			}
		}
		return engines;
	}

	/**
	 * Build the engine ahead of being asked to render with it. The editor draws
	 * its decorations synchronously, so the style has to be loaded by the time
	 * the first one is wanted; this is what the plugin calls when the setting
	 * changes.
	 */
	async prepare(styleId: string): Promise<void> {
		const ref = this.zoteroStyle(styleId);
		if (ref) {
			await this.engineFor(ref);
		}
	}

	/**
	 * The group in a style, synchronously — `null` if the style is not built
	 * yet or the items are not in hand. Both are ordinary and neither is an
	 * error: the citation stays as the note wrote it, and the caller asks again
	 * once the loading it started has finished.
	 */
	renderWith(ref: StyleRef, group: CitationGroup): RenderedCitation | null {
		const engine = this.preparedEngines(ref);
		return engine ? this.render(engine, group, ref.library) : null;
	}

	/**
	 * A source the plugin carries, cited on its own in a style — the settings
	 * preview, which has to show a style without asking Zotero for anything.
	 *
	 * The item is handed to citeproc the way a fetched one is, by putting it
	 * among the renderer's items, and taken out again once it is written: it
	 * must not outlive the preview as a source a note could seem to cite.
	 */
	async sample(
		styleId: string,
		item: CslItem
	): Promise<RenderedCitation | null> {
		const ref = this.zoteroStyle(styleId);
		const engines = ref ? await this.engineFor(ref) : null;
		if (!engines) {
			return null;
		}
		const source = this.source(ZOTERO_LIBRARY);
		source.items.set(item.id, item);
		this.reading(ZOTERO_LIBRARY);
		try {
			return this.render(engines, {
				from: 0,
				to: 0,
				citations: [
					{
						id: item.id,
						locator: "",
						label: "",
						prefix: "",
						suffix: "",
						suppressAuthor: false,
					},
				],
			});
		} finally {
			source.items.delete(item.id);
		}
	}

	/**
	 * The reference list of the note the citation engine holds, as the style
	 * writes it — or `null` for a style without a bibliography, or one citeproc
	 * fails to write.
	 *
	 * It is read off the note the session last brought the engine to, so it
	 * has to be asked for straight after that, with nothing run in between:
	 * the sources are the ones that note cites, in the order it first cites
	 * them, which is what a numbered style that does not sort numbers its
	 * entries by, and they are numbered and told apart (2020a, 2020b) as its
	 * citations are. The citation engine writes the list rather than the
	 * tooltips' number-less one: here the numbers belong, and so does the
	 * markup.
	 */
	bibliographyOf(
		engines: StyleEngines,
		ref: LibraryRef = ZOTERO_LIBRARY
	): RenderedBibliography | null {
		this.reading(ref);
		try {
			const written = engines.citation.makeBibliography();
			if (!written) {
				return null;
			}
			const [params, entries] = written;
			// The same list again as text, which is what Zotero's own "Copy
			// bibliography" writes as plain text. The engine goes back to HTML
			// at once: the note's citations are written in HTML.
			let text: string[] = [];
			try {
				engines.citation.setOutputFormat("text");
				const plain = engines.citation.makeBibliography();
				text = plain ? plain[1] : [];
			} finally {
				engines.citation.setOutputFormat("html");
			}
			const hanging = params.hangingindent;
			return {
				entries,
				text,
				params,
				hangingIndent:
					typeof hanging === "number" ? hanging : hanging ? 2 : 0,
				numberWidth: params["second-field-align"]
					? params.maxoffset
					: 0,
			};
		} catch {
			return null;
		}
	}

	/**
	 * A citation as the style wrote it, with the tooltip of the sources it
	 * names — or `null` when the style wrote nothing. The tooltips are kept
	 * with the engines, since a note names the same sources over and over and
	 * each one is written by an engine of its own.
	 */
	renderedCitation(
		engines: StyleEngines,
		ids: string[],
		html: string,
		ref: LibraryRef = ZOTERO_LIBRARY
	): RenderedCitation | null {
		this.reading(ref);
		const trimmed = html.trim();
		if (!trimmed) {
			return null;
		}
		if (!engines.bibliography) {
			return { html: trimmed, bibliography: "" };
		}
		const key = ids.join("\n");
		let tooltip = engines.tooltips.get(key);
		if (tooltip === undefined) {
			tooltip = bibliography(engines.bibliography, ids);
			engines.tooltips.set(key, tooltip);
		}
		return { html: trimmed, bibliography: tooltip };
	}

	/**
	 * The group as the style writes it on its own, with nothing before or
	 * after it — or `null` when it cannot be written: an unknown key, a style
	 * that will not load. Nothing rendered leaves the pandoc citation standing,
	 * which is the honest thing to show when the rendering is not to be had.
	 *
	 * This is how a citation reads with no note around it: the settings
	 * preview, and a piece of text that belongs to no note. A note's own
	 * citations are written together, in `src/noteRendering.ts`. The preview
	 * leaves the note the engine holds as it was.
	 */
	render(
		engines: StyleEngines,
		group: CitationGroup,
		ref: LibraryRef = ZOTERO_LIBRARY
	): RenderedCitation | null {
		this.reading(ref);
		if (!this.known(group, ref)) {
			return null;
		}
		try {
			const html = engines.citation.previewCitationCluster(
				{
					citationItems: group.citations.map(citationItem),
					properties: { noteIndex: 0 },
				},
				[],
				[],
				"html"
			);
			return this.renderedCitation(
				engines,
				group.citations.map((citation) => citation.id),
				html,
				ref
			);
		} catch {
			return null;
		}
	}
}
