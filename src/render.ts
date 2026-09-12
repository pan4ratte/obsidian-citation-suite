import { Engine } from "citeproc";
import { requestUrl } from "obsidian";
import { REQUEST_HEADERS } from "src/cayw";
import { CitationGroup } from "src/citation";
import { withoutCitationNumbers } from "src/styles";
import { tooltipEntry } from "src/typography";
import { CitationStyle } from "src/types";
import localeEnUs from "../locales/locales-en-US.xml";
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

/** The CSL locales the plugin carries, for the languages it is translated into. */
const LOCALES: Record<string, string> = {
	"en-US": localeEnUs,
	"ru-RU": localeRuRu,
};

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

/** One item as Better BibTeX exports it, keyed by the citation key. */
interface CslItem {
	id: string;
	[field: string]: unknown;
}

/**
 * The CSL data for a set of citation keys, from Better BibTeX.
 *
 * `Better CSL JSON` is the translator whose output is keyed by citation key,
 * which is the name the note cites a source by, so nothing has to be matched up
 * afterwards.
 */
async function fetchItems(
	port: number,
	citekeys: string[]
): Promise<CslItem[]> {
	const response = await requestUrl({
		url: `http://127.0.0.1:${port}/better-bibtex/json-rpc`,
		method: "POST",
		headers: { ...REQUEST_HEADERS, "Content-Type": "application/json" },
		body: JSON.stringify({
			jsonrpc: "2.0",
			method: "item.export",
			params: [citekeys, "Better CSL JSON"],
			id: 1,
		}),
		throw: false,
	});
	if (response.status !== 200) {
		return [];
	}

	// The answer is JSON holding a string that is itself JSON: the translator
	// writes a document, and the RPC hands that document over as one value.
	const body = response.json as { result?: string } | null;
	if (!body?.result) {
		return [];
	}
	try {
		const items = JSON.parse(body.result) as CslItem[];
		return Array.isArray(items) ? items : [];
	} catch {
		return [];
	}
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

/** The locale a style asks for, when it asks for one. */
function styleLocale(csl: string): string {
	const match = /<style[^>]*default-locale="([^"]*)"/.exec(csl);
	return match ? match[1] : "";
}

export class CitationRenderer {
	/** CSL data by citation key, for everything asked about so far. */
	private items = new Map<string, CslItem>();
	/** Keys Better BibTeX has no item for. Asked once, then left alone. */
	private unknown = new Set<string>();
	private engine: StyleEngines | null = null;
	private engineStyle = "";

	constructor(
		private port: number,
		private styles: CitationStyle[],
		private readStyle: (style: CitationStyle) => Promise<string>,
		private zoteroLocale: string
	) {}

	/** Forget everything: the port, the styles or the library have changed. */
	reset(port: number, styles: CitationStyle[], zoteroLocale: string): void {
		this.port = port;
		this.styles = styles;
		this.zoteroLocale = zoteroLocale;
		this.items.clear();
		this.unknown.clear();
		this.engine = null;
		this.engineStyle = "";
	}

	/**
	 * Make sure every key named is either known or known to be unknown. Only
	 * this is asynchronous; rendering afterwards is not, because citeproc asks
	 * for its data with no way to wait for an answer.
	 */
	async load(citekeys: string[]): Promise<void> {
		const wanted = [
			...new Set(
				citekeys.filter(
					(key) => !this.items.has(key) && !this.unknown.has(key)
				)
			),
		];
		if (wanted.length === 0) {
			return;
		}

		const items = await fetchItems(this.port, wanted);
		for (const item of items) {
			if (typeof item.id === "string") {
				this.items.set(item.id, item);
			}
		}
		for (const key of wanted) {
			if (!this.items.has(key)) {
				// Better BibTeX does not know it: a key typed by hand, or one
				// whose item has gone. Asking again on every keystroke would
				// only be told the same thing.
				this.unknown.add(key);
			}
		}
	}

	/** Whether every key in the group is one citeproc can be handed an item for. */
	known(group: CitationGroup): boolean {
		return group.citations.every((citation) => this.items.has(citation.id));
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
		const parent = parentId(csl);
		if (parent) {
			const independent = this.styles.find(
				(candidate) => candidate.id === parent
			);
			if (!independent) {
				return null;
			}
			style = independent;
			csl = await this.readStyle(independent);
		}

		const locale =
			styleLocale(csl) ||
			(this.zoteroLocale in LOCALES ? this.zoteroLocale : "") ||
			FALLBACK_LOCALE;

		const sys = {
			// A style may ask for a language the plugin does not carry, and
			// CSL's own answer to that is `en-US`.
			retrieveLocale: (lang: string): string =>
				LOCALES[lang] ?? LOCALES[FALLBACK_LOCALE],
			retrieveItem: (id: string): unknown =>
				this.items.get(id) ?? { id, type: "document" },
		};
		let citation: Engine;
		try {
			citation = new Engine(sys, csl, locale);
		} catch {
			// Not a style citeproc can run. Nothing is rendered, and the note
			// goes on reading as the pandoc citation it holds.
			return null;
		}

		let bibliography: Engine | null = null;
		try {
			bibliography = new Engine(sys, withoutCitationNumbers(csl), locale);
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
