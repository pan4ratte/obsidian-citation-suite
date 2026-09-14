import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { labelWriter } from "src/localeTerms";
import {
	citationKeyToken,
	formatCitations,
	locatorSuffix,
	locatorText,
	pluralLocator,
	shortLabel,
} from "src/pandoc";
import { Citation } from "src/types";

const locale = (name: string): string =>
	readFileSync(new URL(`../locales/locales-${name}.xml`, import.meta.url), "utf8");

/** How a note without a language is written: in the words pandoc reads in `en-US`. */
const english = labelWriter(locale("en-US"), locale("en-US"));

/** A pick with the fields Better BibTeX always fills in, all of them empty. */
function citation(overrides: Partial<Citation> = {}): Citation {
	return {
		id: 1,
		citationKey: "doe2020",
		locator: "",
		label: "",
		prefix: "",
		suffix: "",
		suppressAuthor: false,
		...overrides,
	};
}

const parenthetical = { brackets: true, labels: english };

describe("shortLabel", () => {
	it("abbreviates the CSL labels the picker offers", () => {
		expect(shortLabel("page")).toBe("p.");
		expect(shortLabel("chapter")).toBe("ch.");
		expect(shortLabel("sub-verbo")).toBe("sv.");
	});

	it("leaves anything it does not know as it came", () => {
		expect(shortLabel("")).toBe("");
		expect(shortLabel("stanza")).toBe("stanza");
	});
});

describe("citationKeyToken", () => {
	it("writes an ordinary key bare", () => {
		expect(citationKeyToken("doe2020")).toBe("@doe2020");
		expect(citationKeyToken("doe_2020a")).toBe("@doe_2020a");
		// Internal punctuation is allowed as long as an alphanumeric follows.
		expect(citationKeyToken("doe:2020")).toBe("@doe:2020");
	});

	it("braces a key pandoc would otherwise cut short", () => {
		// A space, and a key ending in punctuation, both end the key early.
		expect(citationKeyToken("doe 2020")).toBe("@{doe 2020}");
		expect(citationKeyToken("doe2020-")).toBe("@{doe2020-}");
		expect(citationKeyToken("—dash")).toBe("@{—dash}");
	});

	it("decides a long key it rejects without backtracking", () => {
		// The shape that made the old pattern exponential: a long alphanumeric
		// run and then a character it does not accept.
		const key = `${"0".repeat(5000)}-`;
		const start = performance.now();
		expect(citationKeyToken(key)).toBe(`@{${key}}`);
		expect(performance.now() - start).toBeLessThan(100);
	});
});

describe("locatorText", () => {
	it("is empty without a locator", () => {
		expect(locatorText(citation(), english)).toBe("");
		expect(locatorText(citation({ label: "page" }), english)).toBe("");
	});

	it("labels the locator in the words pandoc reads in English", () => {
		expect(locatorText(citation({ locator: "33", label: "page" }), english)).toBe(
			"p. 33"
		);
		// Not Better BibTeX's `ch.`, which pandoc does not read as a chapter.
		expect(locatorText(citation({ locator: "2", label: "chapter" }), english)).toBe(
			"chap. 2"
		);
		expect(locatorText(citation({ locator: "4", label: "volume" }), english)).toBe(
			"vol. 4"
		);
	});

	it("writes the label in the plural for more than one", () => {
		expect(
			locatorText(citation({ locator: "33–35", label: "page" }), english)
		).toBe("pp. 33–35");
		expect(pluralLocator("33, 35")).toBe(true);
		expect(pluralLocator("3 & 5")).toBe(true);
		expect(pluralLocator("xiv")).toBe(false);
	});

	it("writes the label in the note's language", () => {
		const russian = labelWriter(locale("ru-RU"), locale("en-US"));
		expect(locatorText(citation({ locator: "33", label: "page" }), russian)).toBe(
			"с. 33"
		);
		expect(
			locatorText(citation({ locator: "33–35", label: "page" }), russian)
		).toBe("сс. 33–35");
		expect(locatorText(citation({ locator: "2", label: "chapter" }), russian)).toBe(
			"гл. 2"
		);
		const german = labelWriter(locale("de-DE"), locale("en-US"));
		expect(locatorText(citation({ locator: "33", label: "page" }), german)).toBe(
			"S. 33"
		);
	});

	it("writes the CSL name for a language with no locale, which pandoc reads in any", () => {
		const unknown = labelWriter(null, locale("en-US"));
		expect(locatorText(citation({ locator: "33", label: "page" }), unknown)).toBe(
			"page 33"
		);
	});

	it("abbreviates a label pandoc reads in no form as Better BibTeX does", () => {
		expect(
			locatorText(citation({ locator: "word", label: "sub verbo" }), english)
		).toBe("sv. word");
	});

	it("writes a locator that arrived without a label on its own", () => {
		// Better BibTeX labels a typed locator as a page, but the formatter
		// does not count on it.
		expect(locatorText(citation({ locator: "33" }), english)).toBe("33");
	});
});

describe("locatorSuffix", () => {
	it("follows the key after a comma", () => {
		expect(locatorSuffix(citation({ locator: "33", label: "page" }), english)).toBe(
			", p. 33"
		);
	});

	it("braces a locator that would end the citation early", () => {
		// `[@doe2020, pp. 33, 35]` would be a citation of 33 followed by the
		// stray text "35".
		expect(
			locatorSuffix(citation({ locator: "33, 35", label: "page" }), english)
		).toBe("{pp. 33, 35}");
		expect(
			locatorSuffix(citation({ locator: "33; 35", label: "page" }), english)
		).toBe("{pp. 33; 35}");
	});
});

describe("formatCitations", () => {
	it("writes nothing for an empty pick", () => {
		expect(formatCitations([], parenthetical)).toBe("");
	});

	it("brackets a parenthetical citation", () => {
		expect(formatCitations([citation()], parenthetical)).toBe("[@doe2020]");
	});

	it("leaves the brackets off when the setting is off", () => {
		expect(
			formatCitations([citation()], { brackets: false, labels: english })
		).toBe("@doe2020");
	});

	it("carries the picker's page, prefix, suffix and suppressed author", () => {
		expect(
			formatCitations(
				[
					citation({
						prefix: "see",
						locator: "33",
						label: "page",
						suffix: "and following",
						suppressAuthor: true,
					}),
				],
				parenthetical
			)
		).toBe("[see -@doe2020, p. 33 and following]");
	});

	it("makes one group of several picks", () => {
		expect(
			formatCitations(
				[
					citation({ locator: "33", label: "page" }),
					citation({ id: 2, citationKey: "roe2021" }),
				],
				parenthetical
			)
		).toBe("[@doe2020, p. 33; @roe2021]");
	});
});
