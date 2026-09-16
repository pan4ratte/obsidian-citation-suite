import { describe, expect, it } from "vitest";
import { bibtexLibrary } from "src/bibtex";
import type { CslItem } from "src/render";

/**
 * What a `.bib` is read as, held to what pandoc reads it as.
 *
 * Every expectation here was taken from pandoc 3.11 rather than from
 * judgement: the entry was put through `pandoc --from biblatex --to csljson`
 * and what came back is what is written down. Where the reading here differs
 * from pandoc's on purpose, the test says so and says why.
 */

/** The one source in a `.bib`, read. */
function one(bib: string): CslItem {
	const { items, errors } = bibtexLibrary(bib);
	expect(errors).toEqual([]);
	expect(items).toHaveLength(1);
	return items[0];
}

/** An entry of the type, with whatever fields the case needs. */
function entry(type: string, fields: string): string {
	return `@${type}{key,\n${fields}\n}`;
}

describe("entry types", () => {
	it("reads each type as the CSL type pandoc reads it as", () => {
		const types: Record<string, string> = {
			article: "article-journal",
			book: "book",
			booklet: "pamphlet",
			inbook: "chapter",
			incollection: "chapter",
			inproceedings: "paper-conference",
			mastersthesis: "thesis",
			phdthesis: "thesis",
			proceedings: "book",
			techreport: "report",
			unpublished: "manuscript",
			online: "webpage",
		};
		for (const [bibtex, csl] of Object.entries(types)) {
			expect(one(entry(bibtex, "  title = {T},"))).toMatchObject({ type: csl });
		}
	});

	it("leaves the type empty for the types pandoc has no CSL type for", () => {
		// pandoc writes `"type": ""` for these, and a style asking about the
		// type has to find the same nothing here.
		expect(one(entry("misc", "  title = {T},")).type).toBe("");
		expect(one(entry("conference", "  title = {T},")).type).toBe("");
	});
});

describe("fields", () => {
	it("reads an entry holding everything the way pandoc reads it", () => {
		const item = one(
			entry(
				"inproceedings",
				[
					"  author = {Dubois, Jean-Pierre and von der Leyen, Ursula and {Institute of Physics}},",
					"  editor = {Smith, Jr., John},",
					"  translator = {Ivanov, Ivan},",
					"  title = {The {DNA} of Cafe Culture},",
					"  subtitle = {a study},",
					"  booktitle = {Proceedings of Things},",
					"  series = {Lecture Notes},",
					"  volume = {12},",
					"  number = {3},",
					"  pages = {33--47},",
					"  publisher = {Academic Press},",
					"  address = {Cambridge},",
					"  organization = {ACM},",
					"  school = {MIT},",
					"  institution = {CERN},",
					"  edition = {2nd},",
					"  month = jan,",
					"  year = {2020},",
					"  doi = {10.1000/xyz},",
					"  isbn = {978-3-16-148410-0},",
					"  issn = {1234-5678},",
					"  url = {https://example.org/a},",
					"  urldate = {2021-05-04},",
					"  note = {A note},",
					"  keywords = {one, two},",
					"  chapter = {4},",
					"  type = {Technical Report},",
				].join("\n")
			)
		);
		expect(item).toEqual({
			id: "key",
			type: "paper-conference",
			author: [
				{ family: "Dubois", given: "Jean-Pierre" },
				{ family: "Leyen", given: "Ursula", "dropping-particle": "von der" },
				{ literal: "Institute of Physics" },
			],
			editor: [{ family: "Smith", given: "John", suffix: "Jr." }],
			translator: [{ family: "Ivanov", given: "Ivan" }],
			// `DNA` needs no `nocase` mark of its own: citeproc leaves a word
			// in capitals alone whatever case a style asks for.
			title: "The DNA of cafe culture: a study",
			"title-short": "The DNA of cafe culture",
			"container-title": "Proceedings of things",
			"collection-title": "Lecture notes",
			volume: "12",
			"collection-number": "3",
			page: "33-47",
			// Every one of the five, joined, and in pandoc's order.
			publisher: "MIT; CERN; ACM; Academic Press",
			"publisher-place": "Cambridge",
			edition: "2nd",
			issued: { "date-parts": [[2020, 1]] },
			DOI: "10.1000/xyz",
			ISBN: "978-3-16-148410-0",
			ISSN: "1234-5678",
			URL: "https://example.org/a",
			accessed: { "date-parts": [[2021, 5, 4]] },
			note: "A note",
			keyword: "one, two",
			"chapter-number": "4",
			genre: "Technical Report",
		});
	});

	it("reads a number as the issue, and as the number in a series when there is one", () => {
		expect(one(entry("article", "  journal = {J},\n  number = {4},"))).toMatchObject({
			issue: "4",
		});
		expect(
			one(entry("book", "  series = {Lecture Notes},\n  number = {4},"))
		).toMatchObject({ "collection-number": "4" });
	});

	it("writes a page range with the hyphen citeproc prints", () => {
		expect(one(entry("article", "  pages = {33--47},")).page).toBe("33-47");
		expect(one(entry("article", "  pages = {5-20},")).page).toBe("5-20");
	});

	it("takes the container's title from whichever field names it", () => {
		// A journal's name is left as it was written, as pandoc leaves it: it
		// is a name, not a title, and sentence-casing it would be wrong.
		expect(one(entry("article", "  journaltitle = {Biblatex Journal},"))).toMatchObject(
			{ "container-title": "Biblatex Journal" }
		);
		expect(one(entry("article", "  journal = {Bibtex Journal},"))).toMatchObject({
			"container-title": "Bibtex Journal",
		});
		// A book's, which is a title, is sentence-cased.
		expect(one(entry("incollection", "  booktitle = {Proceedings of Things},"))).toMatchObject(
			{ "container-title": "Proceedings of things" }
		);
	});
});

describe("dates", () => {
	it("reads the day, the month and the year biblatex writes as one date", () => {
		expect(one(entry("article", "  date = {2020-05-04},")).issued).toEqual({
			"date-parts": [[2020, 5, 4]],
		});
	});

	it("reads a date range as its two ends", () => {
		expect(one(entry("article", "  date = {2019-05/2020-06},")).issued).toEqual({
			"date-parts": [
				[2019, 5],
				[2020, 6],
			],
		});
	});

	it("reads a month written as a macro, a number or a name", () => {
		for (const month of ["mar", "{3}", "{March}"]) {
			expect(one(entry("article", `  year = {2020},\n  month = ${month},`)).issued).toEqual(
				{ "date-parts": [[2020, 3]] }
			);
		}
	});

	it("hands over a date in no shape it knows as a literal one", () => {
		expect(one(entry("article", "  year = {forthcoming},")).issued).toEqual({
			literal: "forthcoming",
		});
	});

	it("leaves out the date of an entry that gives none", () => {
		expect(one(entry("article", "  title = {T},")).issued).toBeUndefined();
	});
});

describe("titles", () => {
	it("sentence-cases as bib(la)tex means it, keeping what braces protect", () => {
		expect(one(entry("article", "  title = {Studies in {New york city} Today},")).title).toBe(
			'Studies in <span class="nocase">New york city</span> today'
		);
	});

	it("leaves a title alone when the entry is not in English", () => {
		expect(
			one(entry("article", "  title = {Die Deutsche Sprache Heute},\n  langid = {german},"))
				.title
		).toBe("Die Deutsche Sprache Heute");
	});

	it("keeps the short title the entry gives over the one the title would make", () => {
		expect(
			one(
				entry(
					"article",
					"  title = {A Very Long Title Indeed},\n  shorttitle = {Short One},"
				)
			)
		).toMatchObject({
			title: "A very long title indeed",
			"title-short": "Short one",
		});
	});
});

describe("crossref", () => {
	it("takes from the entry a crossref names what the entry does not have", () => {
		const { items } = bibtexLibrary(
			[
				"@proceedings{parent, title = {Big Proceedings}, year = {2020}, publisher = {Springer}}",
				"@inproceedings{child, title = {A Paper}, crossref = {parent}, author = {Doe, Jane}}",
			].join("\n")
		);
		const child = items.find((item) => item.id === "child");
		expect(child).toMatchObject({
			title: "A paper",
			"container-title": "Big proceedings",
			publisher: "Springer",
			issued: { "date-parts": [[2020]] },
		});
	});
});

describe("a file that is not all well", () => {
	it("reads the entries it can and reports the rest", () => {
		const { items } = bibtexLibrary(
			"@article{good, title = {T}, year = {2020}}\n@article{alsogood, title = {U}}"
		);
		expect(items.map((item) => item.id)).toEqual(["good", "alsogood"]);
	});

	it("answers with nothing at all for text that is not bibtex", () => {
		expect(bibtexLibrary("# Just a note\n\nSome prose.").items).toEqual([]);
	});
});
