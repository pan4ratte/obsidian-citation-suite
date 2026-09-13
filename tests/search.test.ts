import { describe, expect, it } from "vitest";
import { matchesTerms, normalizeForSearch, queryTerms } from "src/search";

describe("queryTerms", () => {
	it("splits a query into its words, whatever the spacing", () => {
		expect(queryTerms("  Kuhn   1962 ")).toEqual(["kuhn", "1962"]);
	});

	it("is empty for a query of nothing but spaces", () => {
		expect(queryTerms("   ")).toEqual([]);
	});
});

describe("normalizeForSearch", () => {
	it("reads ё as е and a non-breaking space as a space", () => {
		expect(normalizeForSearch("Отчёт\u00a0о  работе")).toBe("отчет о работе");
	});
});

describe("matchesTerms", () => {
	const entry =
		"@kuhn1962 Kuhn, T. S. The Structure of Scientific Revolutions. Chicago, 1962.";

	it("finds every word, in any order and any case", () => {
		expect(matchesTerms(entry, queryTerms("1962 KUHN"))).toBe(true);
		expect(matchesTerms(entry, queryTerms("structure revol"))).toBe(true);
	});

	it("misses an entry holding only some of the words", () => {
		expect(matchesTerms(entry, queryTerms("kuhn 1970"))).toBe(false);
	});

	it("finds an entry by its citation key, with or without the @", () => {
		expect(matchesTerms(entry, queryTerms("@kuhn1962"))).toBe(true);
		expect(matchesTerms(entry, queryTerms("kuhn1962"))).toBe(true);
	});

	it("finds Russian typed without the dots over ё", () => {
		expect(
			matchesTerms("Отчёт о работе Оргкомитета", queryTerms("отчет"))
		).toBe(true);
	});

	it("lets everything through when nothing is typed", () => {
		expect(matchesTerms(entry, [])).toBe(true);
	});
});
