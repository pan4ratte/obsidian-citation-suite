import { describe, expect, it } from "vitest";
import type { BibliographyParams } from "citeproc";
import {
	asZoteroCites,
	eventToEventTitle,
	formattedBibliography,
	librarySelections,
	pdfAttachments,
	selectItemsLink,
	selectLink,
	uppercasesSubtitles,
} from "src/zoteroCite";

/** citeproc's layout parameters, with what a test leaves out at its default. */
function params(overrides: Partial<BibliographyParams> = {}): BibliographyParams {
	return {
		maxoffset: 0,
		entryspacing: 0,
		linespacing: 1,
		"second-field-align": false,
		...overrides,
	};
}

describe("uppercasesSubtitles", () => {
	it("is on for APA and the styles Zotero groups with it", () => {
		expect(uppercasesSubtitles("http://www.zotero.org/styles/apa")).toBe(true);
		expect(
			uppercasesSubtitles("http://www.zotero.org/styles/apa-6th-edition")
		).toBe(true);
		expect(
			uppercasesSubtitles(
				"http://www.zotero.org/styles/academy-of-management-review"
			)
		).toBe(true);
	});

	it("is on for a dependent style whose parent is APA", () => {
		expect(
			uppercasesSubtitles(
				"http://www.zotero.org/styles/some-journal",
				"http://www.zotero.org/styles/apa"
			)
		).toBe(true);
	});

	it("is off for a style that only has apa somewhere in its name", () => {
		expect(
			uppercasesSubtitles("http://www.zotero.org/styles/japanese-style")
		).toBe(false);
		expect(uppercasesSubtitles("http://www.zotero.org/styles/ieee")).toBe(
			false
		);
	});
});

describe("eventToEventTitle", () => {
	it("renames the event variable, alone or among others", () => {
		expect(eventToEventTitle('<text variable="event"/>')).toBe(
			'<text variable="event-title"/>'
		);
		expect(eventToEventTitle('<if variable="title event">')).toBe(
			'<if variable="title event-title">'
		);
	});

	it("leaves event-place and event-date alone", () => {
		const csl = '<text variable="event-place"/><date variable="event-date"/>';
		expect(eventToEventTitle(csl)).toBe(csl);
	});

	it("leaves a style that already names event-title as it is", () => {
		const csl =
			'<text variable="event-title"/><text variable="event"/>';
		expect(eventToEventTitle(csl)).toBe(csl);
	});
});

describe("asZoteroCites", () => {
	const article = {
		id: "doe2020",
		type: "article-journal",
		page: "1-9",
		URL: "https://example.com/a",
		accessed: { "date-parts": [[2024, 1, 1]] },
	};

	it("drops the URL and accessed date of a paper article with pages", () => {
		expect(asZoteroCites(article, false)).toEqual({
			id: "doe2020",
			type: "article-journal",
			page: "1-9",
		});
	});

	it("keeps them when Zotero is told to cite those URLs", () => {
		expect(asZoteroCites(article, true)).toEqual(article);
	});

	it("keeps them for an article without pages, and for a web page", () => {
		const online = { ...article, page: undefined };
		expect(asZoteroCites(online, false)).toEqual(online);
		const webpage = { ...article, type: "webpage" };
		expect(asZoteroCites(webpage, false)).toEqual(webpage);
	});

	it("leaves the item it was given untouched", () => {
		asZoteroCites(article, false);
		expect(article.URL).toBe("https://example.com/a");
	});
});

// The expected markup is Zotero's own, as its Quick Copy wrote it for the same
// citeproc output (read through Better BibTeX's item.bibliography), with the
// entries' text replaced.
describe("formattedBibliography", () => {
	it("hangs the indent on the body of an author-date list", () => {
		const entries = [
			'  <div class="csl-entry">Doe, J. (2020). <i>Book</i>.</div>\n',
			'  <div class="csl-entry">Roe, R. (2021). Article.</div>\n',
		];
		expect(
			formattedBibliography(
				params({ linespacing: 2, hangingindent: true }),
				entries
			)
		).toBe(
			'<div class="csl-bib-body" style="line-height: 2; margin-left: 2em; text-indent:-2em;">\n' +
				'  <div class="csl-entry">Doe, J. (2020). <i>Book</i>.</div>\n' +
				'  <div class="csl-entry">Roe, R. (2021). Article.</div>\n' +
				"</div>"
		);
	});

	it("sets a numbered list's numbers in a right-aligned column", () => {
		const entries = [
			'  <div class="csl-entry">\n    <div class="csl-left-margin">[1]</div><div class="csl-right-inline">J. Doe, <i>Book</i>.</div>\n  </div>\n',
		];
		expect(
			formattedBibliography(
				params({ maxoffset: 3, "second-field-align": "flush" }),
				entries
			)
		).toBe(
			'<div class="csl-bib-body" style="line-height: 1.35; ">\n' +
				'  <div class="csl-entry" style="clear: left; ">\n' +
				'    <div class="csl-left-margin" style="float: left; padding-right: 0.5em;text-align: right; width: 1em;">[1]</div>' +
				'<div class="csl-right-inline" style="margin: 0 .4em 0 1.5em;">J. Doe, <i>Book</i>.</div>\n' +
				"  </div>\n" +
				"</div>"
		);
	});

	it("spaces the entries apart, all but the last", () => {
		const entries = [
			'<div class="csl-entry">1. Doe.</div>',
			'<div class="csl-entry">2. Roe.</div>',
		];
		expect(
			formattedBibliography(params({ entryspacing: 1 }), entries)
		).toBe(
			'<div class="csl-bib-body" style="line-height: 1.35; ">\n' +
				'<div class="csl-entry" style="margin-bottom: 1em;">1. Doe.</div>' +
				'<div class="csl-entry">2. Roe.</div>' +
				"</div>"
		);
	});
});

describe("pdfAttachments", () => {
	it("takes the PDFs out of what item.attachments answers, with their file names", () => {
		// As a running Better BibTeX 9.0.64 answered, a web page snapshot added.
		const answer = [
			{
				open: "zotero://open-pdf/library/items/HBU9YVLE",
				path: "C:\\Users\\user\\Zotero\\storage\\HBU9YVLE\\Barton - 2019 - A history of the Bible.pdf",
			},
			{
				open: "zotero://open-pdf/library/items/MZM97H4M",
				path: "C:\\Users\\user\\Zotero\\storage\\MZM97H4M\\obsidian-tutorial.html",
			},
			{ open: "zotero://open-pdf/groups/12345/items/ABCD1234", path: "/home/me/Zotero/storage/ABCD1234/Paper.PDF" },
		];
		expect(pdfAttachments(answer)).toEqual([
			{
				name: "Barton - 2019 - A history of the Bible.pdf",
				link: "zotero://open-pdf/library/items/HBU9YVLE",
			},
			{ name: "Paper.PDF", link: "zotero://open-pdf/groups/12345/items/ABCD1234" },
		]);
	});

	it("leaves out a link to a web page, which has no file, and anything malformed", () => {
		expect(
			pdfAttachments([
				{ open: "zotero://open-pdf/library/items/LINK0001", path: false },
				{ open: "https://example.com/paper.pdf", path: "paper.pdf" },
				null,
				"paper.pdf",
			])
		).toEqual([]);
		expect(pdfAttachments({ error: "nope" })).toEqual([]);
	});
});

describe("selectLink", () => {
	it("links an item in My Library by its key alone", () => {
		expect(selectLink("http://zotero.org/users/9070599/items/9NUEPUXZ")).toBe(
			"zotero://select/library/items/9NUEPUXZ"
		);
		expect(selectLink("http://zotero.org/users/local/Ab12cD/items/ABCD1234")).toBe(
			"zotero://select/library/items/ABCD1234"
		);
	});

	it("links an item in a group through the group", () => {
		expect(selectLink("http://zotero.org/groups/6069354/items/7ENTQEMH")).toBe(
			"zotero://select/groups/6069354/items/7ENTQEMH"
		);
	});

	it("links nothing that is not an item's URI", () => {
		expect(selectLink("doe2020")).toBeNull();
		expect(selectLink("http://zotero.org/groups/1/collections/ABCD")).toBeNull();
		expect(selectLink("https://example.com/users/1/items/ABCD")).toBeNull();
	});
});

describe("selectItemsLink", () => {
	it("selects several items of My Library in one link", () => {
		expect(
			selectItemsLink([
				"http://zotero.org/users/9070599/items/9NUEPUXZ",
				"http://zotero.org/users/9070599/items/M9Y6U8BS",
				"http://zotero.org/users/9070599/items/9NUEPUXZ",
			])
		).toBe("zotero://select/library/items?itemKey=9NUEPUXZ,M9Y6U8BS");
	});

	it("selects items of a group", () => {
		expect(
			selectItemsLink(["http://zotero.org/groups/5823832/items/5VQ4XA96"])
		).toBe("zotero://select/groups/5823832/items?itemKey=5VQ4XA96");
	});

	it("gives no link for items of two libraries, or for none", () => {
		expect(
			selectItemsLink([
				"http://zotero.org/users/9070599/items/9NUEPUXZ",
				"http://zotero.org/groups/5823832/items/5VQ4XA96",
			])
		).toBeNull();
		expect(selectItemsLink([])).toBeNull();
		expect(selectItemsLink(["urn:x"])).toBeNull();
	});
});

describe("librarySelections", () => {
	const libraries = ["Моя библиотека", "Dissertation SPCU", "Stellenbosch Thesis"];
	/** An item as `item.search` answers with it: Zotero's CSL, its URI and library. */
	const found = (citekey: string, library: string, id: string) => ({
		id,
		citekey,
		library,
	});

	it("counts a key in every library holding it, in Zotero's order", () => {
		const selections = librarySelections(
			[
				found("barton2019", "Stellenbosch Thesis", "http://zotero.org/groups/6069354/items/MM42KG3K"),
				found("ingrem2025", "Stellenbosch Thesis", "http://zotero.org/groups/6069354/items/CBMER66X"),
				found("ingrem2025", "Моя библиотека", "http://zotero.org/users/9070599/items/KFKU3ZET"),
			],
			["ingrem2025", "barton2019"],
			libraries
		);
		expect(selections).toEqual([
			{
				name: "Моя библиотека",
				keys: ["ingrem2025"],
				link: "zotero://select/library/items?itemKey=KFKU3ZET",
			},
			{
				name: "Stellenbosch Thesis",
				keys: ["ingrem2025", "barton2019"],
				link: "zotero://select/groups/6069354/items?itemKey=MM42KG3K,CBMER66X",
			},
		]);
	});

	it("leaves out keys matched without their case, and libraries Zotero does not list", () => {
		expect(
			librarySelections(
				[
					found("Barton2019", "Моя библиотека", "http://zotero.org/users/9070599/items/9NUEPUXZ"),
					found("barton2019", "A feed", "http://zotero.org/users/9070599/items/M9Y6U8BS"),
				],
				["barton2019"],
				libraries
			)
		).toEqual([]);
	});

	it("tells apart two groups of one name", () => {
		const selections = librarySelections(
			[
				found("a", "Thesis", "http://zotero.org/groups/1/items/AAAAAAAA"),
				found("b", "Thesis", "http://zotero.org/groups/2/items/BBBBBBBB"),
			],
			["a", "b"],
			["Thesis"]
		);
		expect(selections.map((selection) => selection.keys)).toEqual([["a"], ["b"]]);
	});
});
