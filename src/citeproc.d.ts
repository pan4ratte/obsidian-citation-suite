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
		citationItems: CslCitationItem[];
		properties: { noteIndex: number };
	}

	/** What the engine asks its host for: the style's locale, and the items. */
	export interface CslSys {
		retrieveLocale(lang: string): string;
		retrieveItem(id: string): unknown;
	}

	export class Engine {
		constructor(
			sys: CslSys,
			style: string,
			locale?: string,
			forceLocale?: boolean
		);
		updateItems(ids: string[]): void;
		/**
		 * The cluster as the style writes it, with nothing before or after it
		 * in the document — which is what a citation in a note is.
		 */
		previewCitationCluster(
			citation: CslCitation,
			citationsPre: [string, number][],
			citationsPost: [string, number][],
			format: string
		): string;
		/** What everything after this is written as: "html", "text", "rtf". */
		setOutputFormat(format: string): void;
		/**
		 * The bibliography of every item `updateItems` was last given, one
		 * string per entry — or `false` for a style that has no bibliography.
		 */
		makeBibliography(): [Record<string, unknown>, string[]] | false;
	}
}

// The CSL locale files, bundled as text by esbuild's ".xml" loader.
declare module "*.xml" {
	const content: string;
	export default content;
}
