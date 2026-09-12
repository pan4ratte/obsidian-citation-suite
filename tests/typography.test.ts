import { describe, expect, it } from "vitest";
import { tooltipEntry } from "src/typography";

/** The entry with its non-breaking spaces made visible. */
function marked(entry: string): string {
	return tooltipEntry(entry).split(String.fromCharCode(0xa0)).join("_");
}

describe("tooltipEntry", () => {
	it("holds a page count to its abbreviation", () => {
		expect(
			marked(
				"Брюггеман У. Пророческое воображение. – Черкассы: Коллоквиум, 2012. – 231 с."
			)
		).toBe(
			"Брюггеман У. Пророческое воображение._– Черкассы: Коллоквиум, 2012._– 231_с."
		);
	});

	it("holds a locator to its number", () => {
		expect(marked("Journal. – 2019. – Vol. 3. – P. 1-9. Last")).toBe(
			"Journal._– 2019._– Vol._3._– P._1-9._Last"
		);
		expect(marked("On Stuff, pp. 1–9, 2019. End")).toBe(
			"On Stuff, pp._1–9, 2019._End"
		);
	});

	it("does not take a word ending a longer one for an abbreviation", () => {
		expect(marked("London 2020 Publishers. and more")).toBe(
			"London 2020 Publishers. and_more"
		);
		expect(marked("Something. 5 and more")).toBe("Something. 5 and_more");
	});

	it("keeps the last word off a line of its own", () => {
		expect(marked("Doe, J. (2020). A Book of Things. Pub.")).toBe(
			"Doe, J. (2020). A Book of Things._Pub."
		);
	});

	it("collapses an entry citeproc broke over several lines", () => {
		expect(marked("\n  Doe J.\n    A Book of Things.  ")).toBe(
			"Doe J. A Book of_Things."
		);
	});
});
