import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ENGLISH_LABELS, parseCitation } from "src/citation";
import { localeLabels } from "src/localeTerms";

const locale = (name: string): string =>
	readFileSync(new URL(`../locales/locales-${name}.xml`, import.meta.url), "utf8");

const EN = locale("en-US");

/**
 * What pandoc 3.11 made of each locator in a note of each language, read off a
 * style that prints the label it parsed: a label, or nothing — the locator
 * written out as a suffix.
 */
const PANDOC: Record<string, [string, string][]> = {
	"en-US": [
		["p. 3", "page"],
		["pp. 3-4", "page"],
		["pages 3-4", "page"],
		["P. 3", "page"],
		["chap. 2", "chapter"],
		["chapter 2", "chapter"],
		["sec. 5", "section"],
		["§ 5", "section"],
		["vol. 4", "volume"],
		["no. 7", "issue"],
		["fig. 1", "figure"],
		["col. 2", "column"],
		["l. 9", "line"],
		["n. 4", "note"],
		["para. 2", "paragraph"],
		["pt. 1", "part"],
		["bk. 2", "book"],
		["v. 3", "verse"],
		["с. 3", ""],
		["S. 3", ""],
	],
	"ru-RU": [
		["page 3", "page"],
		["chapter 2", "chapter"],
		["с. 3", "page"],
		["гл. 2", "chapter"],
		["т. 4", "volume"],
		["разд. 5", "section"],
		["стб. 2", "column"],
		["§ 5", "section"],
		["p. 3", ""],
		["pp. 3-4", ""],
		["pages 3-4", ""],
		["chap. 2", ""],
		["sec. 5", ""],
		["vol. 4", ""],
		["no. 7", ""],
		["fig. 1", ""],
		["col. 2", ""],
		["l. 9", ""],
		["n. 4", ""],
		["para. 2", ""],
		["pt. 1", ""],
		["bk. 2", ""],
		["v. 3", ""],
		["P. 3", ""],
		["ch. 2", ""],
	],
	"de-DE": [
		["S. 3", "page"],
		["Kap. 2", "chapter"],
		["Bd. 4", "volume"],
		["v. 3", "verse"],
		["page 3", "page"],
		["§ 5", "section"],
		["p. 3", ""],
		["с. 3", ""],
	],
};

describe("localeLabels", () => {
	for (const [name, cases] of Object.entries(PANDOC)) {
		it(`reads locators as pandoc does in a note in ${name}`, () => {
			const labels = localeLabels(locale(name), EN);
			for (const [written, label] of cases) {
				const citation = parseCitation(`@doe2020, ${written}`, labels);
				expect({ written, label: citation?.label ?? "" }).toEqual({ written, label });
			}
		});
	}

	it("writes out a locator it does not read as the suffix", () => {
		const labels = localeLabels(locale("ru-RU"), EN);
		expect(parseCitation("@doe2020, p. 33", labels)).toMatchObject({
			label: "",
			locator: "",
			suffix: ", p. 33",
		});
		expect(parseCitation("@doe2020, с. 33", labels)).toMatchObject({
			label: "page",
			locator: "33",
			suffix: "",
		});
	});

	it("takes the style's own terms first, as IEEE's make ch. a chapter", () => {
		const ieee = readFileSync(new URL("./fixtures/ieee-locale.csl", import.meta.url), "utf8");
		const labels = localeLabels(EN, EN, ieee, "en-US");
		// pandoc 3.11 printed [2, Ch. 2] for [@key, ch. 2] in IEEE.
		expect(parseCitation("@doe2020, ch. 2", labels)?.label).toBe("chapter");
		expect(parseCitation("@doe2020, chap. 2", labels)?.label).toBe("chapter");
		// A style's block for another language says nothing here.
		expect(parseCitation("@doe2020, ch. 2", localeLabels(locale("ru-RU"), EN, ieee, "ru-RU"))?.label).toBe("");
	});

	it("keeps the note's language apart from the English labels a note without one is read with", () => {
		expect(parseCitation("@doe2020, ch. 2", ENGLISH_LABELS)?.label).toBe("chapter");
		expect(parseCitation("@doe2020, ch. 2", localeLabels(EN, EN))?.label).toBe("");
	});
});
