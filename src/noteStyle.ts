import { CitationStyle } from "src/types";

/**
 * What a note says about how pandoc should write its citations.
 *
 * A note exported with pandoc can name its citation style and its language in
 * its front matter, and a note that does is previewed the way pandoc will
 * write it (`src/noteStyles.ts`). This file is how those two properties are
 * read — pure, with the file system left to the caller — and every rule in it
 * was checked against pandoc 3.11:
 *
 * - **`csl`, or `citation-style`**, names the style. A value with no extension
 *   has `.csl` added. A path is looked for as it is when absolute, otherwise in
 *   the folders pandoc runs with — Pandoc GUI runs it in the note's folder with
 *   the vault among its resource paths — and last in the `csl` folder of
 *   pandoc's user data directory (not in the data directory itself).
 * - **A URL** is downloaded by pandoc; the preview downloads nothing and takes
 *   the style Zotero has under that URL, which is what Zotero's style ids are.
 * - **`lang`** is the language, and it wins over the language a style names.
 *   Without it pandoc writes in the style's own language, or in `en-US`.
 */

/** The two properties, as the note gives them, or `null` for one it does not. */
export interface StyleProperties {
	csl: string | null;
	lang: string | null;
}

function text(value: unknown): string | null {
	return typeof value === "string" && value.trim() ? value.trim() : null;
}

/** The note's `csl` (or `citation-style`) and `lang`, from its front matter. */
export function styleProperties(frontmatter: unknown): StyleProperties {
	if (!frontmatter || typeof frontmatter !== "object") {
		return { csl: null, lang: null };
	}
	const properties = frontmatter as Record<string, unknown>;
	return {
		csl: text(properties.csl) ?? text(properties["citation-style"]),
		lang: text(properties.lang),
	};
}

/** Whether the value names a style by URL rather than by file. */
export function isStyleUrl(value: string): boolean {
	return /^https?:\/\//i.test(value);
}

/** The file a `csl` value names: itself, or with `.csl` added when it has no extension. */
export function cslFileName(value: string): string {
	const name = value.split(/[\\/]/).pop() ?? value;
	return /\.[^.]+$/.test(name) ? value : `${value}.csl`;
}

/** A style URL with what does not tell styles apart taken off. */
function normalizeUrl(url: string): string {
	return url
		.toLowerCase()
		.replace(/^https?:\/\/(www\.)?/, "")
		.replace(/\.csl$/, "")
		.replace(/\/+$/, "");
}

/** The last part of a URL or a path, without `.csl`: a style's short name. */
function shortName(value: string): string {
	return (value.replace(/\/+$/, "").split(/[\\/]/).pop() ?? "")
		.replace(/\.csl$/i, "")
		.toLowerCase();
}

/**
 * The style Zotero has for a style URL: the one whose id is that URL — Zotero
 * keys the styles it distributes by `http://www.zotero.org/styles/…` — or,
 * failing that, the one of that short name, which is how the same style is
 * named on the CSL repository (`…/styles/master/apa.csl`). `null` for none.
 */
export function styleForUrl(url: string, styles: CitationStyle[]): CitationStyle | null {
	const wanted = normalizeUrl(url);
	const exact = styles.find((style) => normalizeUrl(style.id) === wanted);
	if (exact) {
		return exact;
	}
	const name = shortName(url);
	return (
		styles.find(
			(style) =>
				isStyleUrl(style.id) && shortName(style.id) === name
		) ?? null
	);
}

/**
 * Where pandoc looks for a style file, in order: the path itself when it is
 * absolute, otherwise each folder in turn, then the `csl` folder of each data
 * directory. `join` and `isAbsolute` are the platform's.
 */
export function cslCandidates(
	value: string,
	folders: string[],
	dataDirs: string[],
	join: (...parts: string[]) => string,
	isAbsolute: (path: string) => boolean
): string[] {
	const file = cslFileName(value);
	if (isAbsolute(file)) {
		return [file];
	}
	return [
		...folders.map((folder) => join(folder, file)),
		...dataDirs.map((dir) => join(dir, "csl", file)),
	];
}
