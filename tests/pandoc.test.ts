import { describe, expect, it } from "vitest";
import {
	citationKeyToken,
	formatCitations,
	locatorSuffix,
	locatorText,
	shortLabel,
} from "src/pandoc";
import { Citation } from "src/types";

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

const parenthetical = { brackets: true };

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
});

describe("locatorText", () => {
	it("is empty without a locator", () => {
		expect(locatorText(citation())).toBe("");
		expect(locatorText(citation({ label: "page" }))).toBe("");
	});

	it("labels the locator the way a citation spells it", () => {
		expect(locatorText(citation({ locator: "33", label: "page" }))).toBe(
			"p. 33"
		);
		expect(locatorText(citation({ locator: "2", label: "chapter" }))).toBe(
			"ch. 2"
		);
	});

	it("writes a locator that arrived without a label on its own", () => {
		// Better BibTeX labels a typed locator as a page, but the formatter
		// does not count on it.
		expect(locatorText(citation({ locator: "33" }))).toBe("33");
	});
});

describe("locatorSuffix", () => {
	it("follows the key after a comma", () => {
		expect(locatorSuffix(citation({ locator: "33", label: "page" }))).toBe(
			", p. 33"
		);
	});

	it("braces a locator that would end the citation early", () => {
		// `[@doe2020, pp. 33, 35]` would be a citation of 33 followed by the
		// stray text "35".
		expect(
			locatorSuffix(citation({ locator: "33, 35", label: "page" }))
		).toBe("{p. 33, 35}");
		expect(
			locatorSuffix(citation({ locator: "33; 35", label: "page" }))
		).toBe("{p. 33; 35}");
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
			formatCitations([citation()], { brackets: false })
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
