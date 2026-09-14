// citeproc-js ships no types. This declares the corner of it the renderer uses
// — the engine, and the two callbacks it asks its host for data through.
declare module "citeproc" {
	/** One citation inside a cluster, in CSL's own spelling. */
	export interface CslCitationItem {
		id: string;
		locator?: string;
		label?: string;
		prefix?: string;
		suffix?: string;
		"suppress-author"?: boolean;
	}

	export interface CslCitation {
		/** The id the engine keeps the citation by in its document. */
		citationID?: string;
		citationItems: CslCitationItem[];
		/** The note it stands in, or 0 for a citation in the text. */
		properties: { noteIndex: number };
	}

	/** A citation elsewhere in the document: its id, and the note it stands in. */
	export type CslCitationPosition = [string, number];

	/** What the engine asks its host for: the style's locale, and the items. */
	export interface CslSys {
		retrieveLocale(lang: string): string;
		retrieveItem(id: string): unknown;
		/** Capitalise the first word of a subtitle, as APA does. */
		uppercase_subtitles?: boolean;
	}

	export class Engine {
		constructor(
			sys: CslSys,
			style: string,
			locale?: string,
			forceLocale?: boolean
		);
		/**
		 * The engine's options; Zotero switches some of them after construction.
		 * `xclass` is the style's class: "note" for a style that cites in notes.
		 */
		opt: { development_extensions: Record<string, boolean>; xclass: string };
		updateItems(ids: string[]): void;
		/**
		 * The cluster as the style writes it between the citations named before
		 * and after it, leaving the document the engine holds as it was.
		 */
		previewCitationCluster(
			citation: CslCitation,
			citationsPre: CslCitationPosition[],
			citationsPost: CslCitationPosition[],
			format: string
		): string;
		/**
		 * Puts the citation into the document the engine holds, between the
		 * citations named before and after it — and any citation it holds that
		 * is named in neither is taken out. Answers with every citation whose
		 * text changed, by its place among the three: before, this, after.
		 */
		processCitationCluster(
			citation: CslCitation,
			citationsPre: CslCitationPosition[],
			citationsPost: CslCitationPosition[],
			flag?: number
		): [unknown, [number, string, string?][]];
		/** What everything after this is written as: "html", "text", "rtf". */
		setOutputFormat(format: string): void;
		/**
		 * The bibliography of every item `updateItems` was last given, one
		 * string per entry — or `false` for a style that has no bibliography.
		 */
		makeBibliography(): [BibliographyParams, string[]] | false;
	}

	/** How the style lays its bibliography out, beside the entries themselves. */
	export interface BibliographyParams {
		/** The widest `second-field-align` label, in characters. */
		maxoffset: number;
		/** `2` or `true` when every line of an entry but the first is indented. */
		hangingindent?: number | boolean;
		/** Whether the entry's number is set in a column of its own. */
		"second-field-align": "flush" | "margin" | false;
		[param: string]: unknown;
	}
}

// The CSL locale files, bundled as text by esbuild's ".xml" loader.
declare module "*.xml" {
	const content: string;
	export default content;
}
