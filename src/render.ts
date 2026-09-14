import { BibliographyParams, CslSys, Engine } from "citeproc";
import { requestUrl } from "obsidian";
import { REQUEST_HEADERS } from "src/cayw";
import { CitationGroup } from "src/citation";
import { withoutCitationNumbers, ZoteroCitePrefs } from "src/styles";
import { tooltipEntry } from "src/typography";
import { CitationStyle } from "src/types";
import {
	asZoteroCites,
	eventToEventTitle,
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
 */
export interface StyleEngines {
	citation: Engine;
	/** `null` if the style would not run with its numbers taken out. */
	bibliography: Engine | null;
}

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

/**
 * A style that only names another one has no rules of its own to render with,
 * and the parent's are the ones Zotero would use. The href is the parent's id,
 * which is how every style is keyed.
 */
function parentId(csl: string): string {
	const link = /<link[^>]*rel="independent-parent"[^>]*>/.exec(csl);
	const href = link ? /href="([^"]*)"/.exec(link[0]) : null;
	return href ? href[1] : "";
}

/**
 * The carried locale a language is written in: `ru-RU` for `ru-RU` and for a
 * bare `ru` alike, and `de-DE` for an Austrian `de-AT` the plugin does not
 * carry — closer than CSL's `en-US`. Empty for a language not carried at all.
 */
function carriedLocale(lang: string): string {
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
function styleLocale(csl: string): string {
	const match = /<style[^>]*default-locale="([^"]*)"/.exec(csl);
	return match ? match[1] : "";
}

export class CitationRenderer {
	/** CSL data by citation key, for everything asked about so far. */
	private items = new Map<string, CslItem>();
	/** The library each item in `items` was taken from, by citation key. */
	private itemLibraries = new Map<string, number>();
	/** Keys Better BibTeX has no item for. Asked once, then left alone. */
	private unknown = new Set<string>();
	/** The keys in `unknown` that were missed because Zotero did not answer. */
	private unreached = new Set<string>();
	/** Zotero's libraries, in the order a key is looked for in them. */
	private libraries: number[] | null = null;
	private engine: StyleEngines | null = null;
	private engineStyle = "";

	constructor(
		private port: number,
		private styles: CitationStyle[],
		private readStyle: (style: CitationStyle) => Promise<string>,
		private zotero: ZoteroCitePrefs
	) {}

	/** Forget everything: the port, the styles or the library have changed. */
	reset(port: number, styles: CitationStyle[], zotero: ZoteroCitePrefs): void {
		this.port = port;
		this.styles = styles;
		this.zotero = zotero;
		this.items.clear();
		this.itemLibraries.clear();
		this.unknown.clear();
		this.unreached.clear();
		this.libraries = null;
		this.engine = null;
		this.engineStyle = "";
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
	async load(citekeys: string[], retryUnreached = false): Promise<void> {
		const wanted = [
			...new Set(
				citekeys.filter(
					(key) =>
						!this.items.has(key) &&
						(!this.unknown.has(key) ||
							(retryUnreached && this.unreached.has(key)))
				)
			),
		];
		if (wanted.length === 0) {
			return;
		}

		// Asked once and kept: a library is added in Zotero far less often
		// than a note is read, and the refresh button asks again.
		this.libraries ??= await fetchLibraries(this.port);
		const { found, answered } = this.libraries
			? await fetchItems(
					this.port,
					wanted,
					this.libraries,
					this.installedStyle()
				)
			: { found: [], answered: false };
		for (const { item, library } of found) {
			if (typeof item.id === "string") {
				this.items.set(item.id, item);
				this.itemLibraries.set(item.id, library);
			}
		}
		if (!answered) {
			// Read again once Zotero answers: a group may have been joined
			// while it was closed.
			this.libraries = null;
		}
		for (const key of wanted) {
			if (this.items.has(key)) {
				this.unknown.delete(key);
				this.unreached.delete(key);
			} else {
				// Better BibTeX does not know it: a key typed by hand, or one
				// whose item has gone — or Zotero did not answer. Asking again
				// on every keystroke would only be told the same thing.
				this.unknown.add(key);
				if (answered) {
					this.unreached.delete(key);
				} else {
					this.unreached.add(key);
				}
			}
		}
	}

	/** Whether the key was missed because Zotero did not answer when asked. */
	unreachable(citekey: string): boolean {
		return this.unreached.has(citekey);
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
	known(group: CitationGroup): boolean {
		return group.citations.every((citation) => this.has(citation.id));
	}

	/** Whether Better BibTeX has handed over an item for the key. */
	has(citekey: string): boolean {
		return this.items.has(citekey);
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
		const library = this.itemLibraries.get(citekey);
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
	 * Let the keys Better BibTeX had no item for be asked about again. A key
	 * is marked unknown for good the first time it is missed, and a Zotero that
	 * was closed at that moment misses every key there is.
	 */
	forgetUnknown(): void {
		this.unknown.clear();
		this.unreached.clear();
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
	pending(citekeys: string[]): string[] {
		return [
			...new Set(
				citekeys.filter(
					(key) => !this.items.has(key) && !this.unknown.has(key)
				)
			),
		];
	}

	private async buildEngine(styleId: string): Promise<StyleEngines | null> {
		let style = this.styles.find((candidate) => candidate.id === styleId);
		if (!style) {
			return null;
		}

		let csl = await this.readStyle(style);
		// citeproc is only ever given the parent, so it cannot see the language
		// a dependent style names; Zotero forces that language, and so does
		// this.
		let forcedLocale = "";
		const parent = parentId(csl);
		if (parent) {
			const independent = this.styles.find(
				(candidate) => candidate.id === parent
			);
			if (!independent) {
				return null;
			}
			forcedLocale = styleLocale(csl);
			style = independent;
			csl = await this.readStyle(independent);
		}
		csl = eventToEventTitle(csl);

		// The language Zotero asks citeproc for when none is forced; a style
		// naming its own still wins inside citeproc, as it does in Zotero.
		const locale =
			forcedLocale || carriedLocale(this.zotero.locale) || FALLBACK_LOCALE;

		const sys = {
			// A style may ask for a language the plugin does not carry, and
			// CSL's own answer to that is `en-US`.
			retrieveLocale: (lang: string): string =>
				LOCALES[carriedLocale(lang)] ?? LOCALES[FALLBACK_LOCALE],
			retrieveItem: (id: string): unknown => {
				const item = this.items.get(id);
				return item
					? asZoteroCites(item, this.zotero.citePaperArticleURLs)
					: { id, type: "document" };
			},
			uppercase_subtitles: uppercasesSubtitles(styleId, style.id),
		};
		let citation: Engine;
		try {
			citation = zoteroEngine(sys, csl, locale, !!forcedLocale);
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
				!!forcedLocale
			);
			bibliography.setOutputFormat("text");
		} catch {
			// The citations still render; their tooltips fall back to the
			// note's text.
			bibliography = null;
		}
		return { citation, bibliography };
	}

	/** The engine for a style, built once and kept until the style changes. */
	async engineFor(styleId: string): Promise<StyleEngines | null> {
		if (this.engine && this.engineStyle === styleId) {
			return this.engine;
		}
		this.engine = await this.buildEngine(styleId);
		this.engineStyle = this.engine ? styleId : "";
		return this.engine;
	}

	/**
	 * Build the engine ahead of being asked to render with it. The editor draws
	 * its decorations synchronously, so the style has to be loaded by the time
	 * the first one is wanted; this is what the plugin calls when the setting
	 * changes.
	 */
	async prepare(styleId: string): Promise<void> {
		if (!styleId) {
			this.engine = null;
			this.engineStyle = "";
			return;
		}
		await this.engineFor(styleId);
	}

	/**
	 * The group in the prepared style, synchronously — `null` if the style is
	 * not prepared yet or the items are not in hand. Both are ordinary and
	 * neither is an error: the citation stays as the note wrote it, and the
	 * caller asks again once the loading it started has finished.
	 */
	renderWith(styleId: string, group: CitationGroup): RenderedCitation | null {
		const engine =
			this.engine && this.engineStyle === styleId ? this.engine : null;
		return engine ? this.render(engine, group) : null;
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
		const engines = await this.engineFor(styleId);
		if (!engines) {
			return null;
		}
		this.items.set(item.id, item);
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
			this.items.delete(item.id);
		}
	}

	/**
	 * The reference list of the keys, as the style writes it — or `null` for a
	 * style without a bibliography, or one citeproc fails to write. Keys with
	 * no item in hand are left out, since citeproc would write them as
	 * untitled documents.
	 *
	 * The keys are handed over in the order the note first cites them, which
	 * is what a numbered style that does not sort numbers its entries by. The
	 * citation engine writes the list rather than the tooltips' number-less one:
	 * here the numbers belong, and so does the markup.
	 */
	bibliographyOf(
		engines: StyleEngines,
		citekeys: string[]
	): RenderedBibliography | null {
		const ids = citekeys.filter((key) => this.has(key));
		try {
			engines.citation.updateItems(ids);
			const written = engines.citation.makeBibliography();
			if (!written) {
				return null;
			}
			const [params, entries] = written;
			// The same list again as text, which is what Zotero's own "Copy
			// bibliography" writes as plain text. The engine goes back to HTML
			// at once: every citation it renders asks for HTML by name, but
			// nothing should depend on that.
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
	 * The group as the style writes it, or `null` when it cannot be written —
	 * an unknown key, a style that will not load. Nothing rendered leaves the
	 * pandoc citation standing, which is the honest thing to show when the
	 * rendering is not to be had.
	 */
	render(
		engines: StyleEngines,
		group: CitationGroup
	): RenderedCitation | null {
		if (!this.known(group)) {
			return null;
		}
		const ids = group.citations.map((citation) => citation.id);
		try {
			engines.citation.updateItems(ids);
			const html = engines.citation
				.previewCitationCluster(
					{
						citationItems: group.citations.map((citation) => ({
							id: citation.id,
							locator: citation.locator || undefined,
							label: citation.label || undefined,
							prefix: citation.prefix || undefined,
							suffix: citation.suffix || undefined,
							"suppress-author":
								citation.suppressAuthor || undefined,
						})),
						properties: { noteIndex: 0 },
					},
					[],
					[],
					"html"
				)
				.trim();
			return html
				? {
						html,
						bibliography: engines.bibliography
							? bibliography(engines.bibliography, ids)
							: "",
					}
				: null;
		} catch {
			return null;
		}
	}
}
