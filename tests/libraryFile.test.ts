import { describe, expect, it } from "vitest";
import { libraryContents, libraryFormat } from "src/libraryFile";

describe("libraryFormat", () => {
	it("knows a library file by its extension", () => {
		expect(libraryFormat("refs.bib")).toBe("bibtex");
		expect(libraryFormat("Sources/refs.bibtex")).toBe("bibtex");
		expect(libraryFormat("refs.json")).toBe("csl-json");
		expect(libraryFormat("REFS.BIB")).toBe("bibtex");
	});

	it("answers with nothing for a file that is not one", () => {
		expect(libraryFormat("note.md")).toBeNull();
		expect(libraryFormat("refs")).toBeNull();
	});
});

describe("CSL JSON", () => {
	it("takes the export as it stands, since it is what citeproc asked for", () => {
		const { items, errors } = libraryContents(
			JSON.stringify([
				{
					id: "doe2020",
					type: "article-journal",
					title: "A paper",
					author: [{ family: "Doe", given: "Jane" }],
					issued: { "date-parts": [[2020]] },
				},
			]),
			"csl-json"
		);
		expect(errors).toEqual([]);
		expect(items.get("doe2020")).toMatchObject({
			type: "article-journal",
			title: "A paper",
		});
	});

	it("reports an item with no citation key and keeps the rest", () => {
		const { items, errors } = libraryContents(
			JSON.stringify([{ title: "Nameless" }, { id: "doe2020", title: "A paper" }]),
			"csl-json"
		);
		expect([...items.keys()]).toEqual(["doe2020"]);
		expect(errors).toHaveLength(1);
	});

	it("reports a file that is not CSL JSON at all", () => {
		expect(libraryContents("{}", "csl-json").errors).toHaveLength(1);
		expect(libraryContents("not json", "csl-json").errors).toHaveLength(1);
	});
});

describe("a key that stands for two sources", () => {
	// pandoc takes the last of them, and so the preview has to.
	it("keeps the last and reports that there were two", () => {
		const { items, errors } = libraryContents(
			[
				"@article{doe2020, title = {The first}, year = {2020}}",
				"@article{doe2020, title = {The second}, year = {2021}}",
			].join("\n"),
			"bibtex"
		);
		expect(items.get("doe2020")).toMatchObject({ title: "The second" });
		expect(errors).toEqual(["doe2020 is in the file more than once"]);
	});
});
