import type { BibliographyParams } from "citeproc";

/**
 * What Zotero does around citeproc, done here too, so that a bibliography
 * written by the plugin reads as Zotero's own "Copy bibliography" writes it.
 *
 * Zotero and the plugin run the same citeproc-js (processor 1.4.61), but Zotero
 * does not hand it a style and an item as they are: it rewrites the style a
 * little, trims the item a little, and turns on options of its own. Everything
 * here is ported from Zotero 7's `xpcom/style.js` (`getCiteProc`,
 * `_eventToEventTitle`) and `xpcom/cite.js` (`Zotero.Cite.System`,
 * `makeFormattedBibliography`), and named after what it copies.
 */

/**
 * The styles Zotero sets subtitles in with a capital letter: APA and the ones
 * that follow its rule. Matched against the last segment of the style's id.
 */
const UPPERCASE_SUBTITLES = /^apa($|-)|^academy-of-management($|-)|^(freshwater-science)/;

/**
 * Whether Zotero turns citeproc's `uppercase_subtitles` on for a style — for
 * the style itself or, for a dependent one, for its parent.
 */
export function uppercasesSubtitles(...styleIds: string[]): boolean {
	return styleIds.some((id) => {
		const short = /\/?([^/]+)$/.exec(id);
		return !!short && UPPERCASE_SUBTITLES.test(short[1]);
	});
}

/**
 * The style with the CSL 1.0.2 `event` variable written as `event-title`,
 * which is the name Zotero's data gives it. A style already naming
 * `event-title` anywhere is left as it is, and `event-place` or `event-date`
 * are never touched.
 */
export function eventToEventTitle(csl: string): string {
	if (/\bvariable\s*=\s*(["'])[^"']*\bevent-title\b/.test(csl)) {
		return csl;
	}
	return csl.replace(
		/(\bvariable\s*=\s*)(["'])([^"']*)\2/g,
		(whole, name: string, quote: string, value: string) =>
			/(^| )event( |$)/.test(value)
				? `${name}${quote}${value.replace(/(^| )event(?= |$)/g, "$1event-title")}${quote}`
				: whole
	);
}

/** The CSL types of the three Zotero item types a URL is dropped from. */
const PAPER_ARTICLES = new Set([
	"article-journal",
	"article-newspaper",
	"article-magazine",
]);

/**
 * The item as Zotero hands it to citeproc: an article from a journal, a
 * newspaper or a magazine that has pages loses its URL and accessed date,
 * unless Zotero's "Include URLs of paper articles in references" is on.
 */
export function asZoteroCites<T extends Record<string, unknown>>(
	item: T,
	citePaperArticleURLs: boolean
): T {
	if (
		citePaperArticleURLs ||
		typeof item.type !== "string" ||
		!PAPER_ARTICLES.has(item.type) ||
		!item.page
	) {
		return item;
	}
	const trimmed: Record<string, unknown> = { ...item };
	delete trimmed.URL;
	delete trimmed.accessed;
	return trimmed as T;
}

/** A class's opening tag in citeproc's HTML, for a style to be added to it. */
function openingTag(cls: string): RegExp {
	return new RegExp(`<div class="${cls}">`, "g");
}

/**
 * The bibliography as Zotero puts it on the clipboard as HTML: citeproc's
 * markup with the layout written into inline styles, since a word processor
 * pasting it into a document has no stylesheet to read classes by.
 *
 * Zotero builds it on a DOM; citeproc's HTML is regular enough — one fixed tag
 * per class — that the same styles are put on the same tags here with no DOM,
 * and the result is identical. COinS spans, which Zotero adds for reference
 * managers reading web pages, are left out.
 */
export function formattedBibliography(
	params: BibliographyParams,
	entries: string[]
): string {
	const html = `<div class="csl-bib-body">\n${entries.join("")}</div>`;
	const multiField = html.includes('<div class="csl-left-margin">');
	const secondFieldAlign = params["second-field-align"];
	const hangingIndent = params.hangingindent;

	// One of the characters is usually a period, so Zotero narrows the column.
	const maxOffset = Math.max(1, (Number(params.maxoffset) || 0) - 2);
	const entrySpacing = parseInt(String(params.entryspacing), 10);
	const lineSpacing = Math.max(
		1.35,
		parseInt(String(params.linespacing), 10) || 0
	);
	// The padding on the number's column, which the entry beside it clears.
	const rightPadding = 0.5;

	let bodyStyle = `line-height: ${lineSpacing}; `;
	if (hangingIndent && !multiField) {
		bodyStyle += "margin-left: 2em; text-indent:-2em;";
	}

	let index = 0;
	const count = entries.length;
	return html
		.replace(
			'<div class="csl-bib-body">',
			`<div class="csl-bib-body" style="${bodyStyle}">`
		)
		.replace(openingTag("csl-entry"), () => {
			let style = multiField ? "clear: left; " : "";
			if (entrySpacing && index !== count - 1) {
				style += `margin-bottom: ${entrySpacing}em;`;
			}
			index++;
			return style
				? `<div class="csl-entry" style="${style}">`
				: '<div class="csl-entry">';
		})
		.replace(openingTag("csl-left-margin"), () => {
			let style = `float: left; padding-right: ${rightPadding}em;`;
			if (secondFieldAlign) {
				style += `text-align: right; width: ${maxOffset}em;`;
			}
			return `<div class="csl-left-margin" style="${style}">`;
		})
		.replace(openingTag("csl-right-inline"), () => {
			let style = `margin: 0 .4em 0 ${secondFieldAlign ? maxOffset + rightPadding : "0"}em;`;
			if (hangingIndent) {
				style += "padding-left: 2em; text-indent:-2em;";
			}
			return `<div class="csl-right-inline" style="${style}">`;
		})
		.replace(
			openingTag("csl-indent"),
			'<div class="csl-indent" style="margin: .5em 0 0 2em; padding: 0 0 .2em .5em; border-left: 5px solid #ccc;">'
		);
}

/**
 * The link that selects an item in Zotero's window, from the URI Zotero knows
 * the item by — `http://zotero.org/users/…/items/KEY` for My Library,
 * `http://zotero.org/groups/ID/items/KEY` for a group — or `null` for anything
 * else. The two forms are the ones Zotero 7's `zotero://select` handler routes
 * (`SelectExtension` in `ZoteroProtocolHandler.mjs`), built the way Better
 * BibTeX's own Quick Copy builds them.
 */
export function selectLink(uri: string): string | null {
	const match =
		/^https?:\/\/zotero\.org\/(users|groups)\/((?:local\/)?[^/]+)\/items\/([^/]+)$/.exec(
			uri
		);
	if (!match) {
		return null;
	}
	const [, kind, library, key] = match;
	return kind === "users"
		? `zotero://select/library/items/${key}`
		: `zotero://select/groups/${library}/items/${key}`;
}

/** A PDF attached to a source: the file's name, and the link that opens it in Zotero. */
export interface PdfAttachment {
	name: string;
	link: string;
}

/**
 * The PDFs among what Better BibTeX's `item.attachments` answers with, in the
 * order Zotero lists them. Every attachment comes with a `zotero://open-pdf`
 * link — a web page snapshot too, which Zotero's reader also opens — and with
 * the path of its file, or no path at all for a link to a web page; so a PDF
 * is told by its path. The link is taken only in the form Zotero routes to its
 * reader, for My Library or a group.
 */
export function pdfAttachments(answer: unknown): PdfAttachment[] {
	if (!Array.isArray(answer)) {
		return [];
	}
	const pdfs: PdfAttachment[] = [];
	for (const attachment of answer as unknown[]) {
		if (!attachment || typeof attachment !== "object") {
			continue;
		}
		const { open, path } = attachment as { open?: unknown; path?: unknown };
		if (
			typeof open === "string" &&
			/^zotero:\/\/open-pdf\/(library|groups\/\d+)\/items\/[A-Z0-9]+$/.test(open) &&
			typeof path === "string" &&
			/\.pdf$/i.test(path)
		) {
			pdfs.push({ name: path.split(/[\\/]/).pop() ?? path, link: open });
		}
	}
	return pdfs;
}
