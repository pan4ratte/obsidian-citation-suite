import { describe, expect, it } from "vitest";
import { literatureNote, NoteCandidate } from "src/literatureNote";

function note(
	path: string,
	frontmatter?: Record<string, unknown>
): NoteCandidate<string> {
	const basename = path.split("/").pop()?.replace(/\.md$/, "") ?? path;
	return { file: path, basename, path, frontmatter };
}

describe("literatureNote", () => {
	it("finds the note named after the key with an at sign first", () => {
		const notes = [note("Sources/kuhn1962.md"), note("Sources/@kuhn1962.md")];
		expect(literatureNote("kuhn1962", notes)).toBe("Sources/@kuhn1962.md");
	});

	it("finds a note named after the bare key", () => {
		expect(literatureNote("kuhn1962", [note("Reading/kuhn1962.md")])).toBe(
			"Reading/kuhn1962.md"
		);
	});

	it("finds a note that names the key in its front matter", () => {
		const notes = [
			note("Structure of Scientific Revolutions.md", { citekey: "@kuhn1962" }),
			note("Other.md", { citekey: "popper1959" }),
			note("Both.md", { "citation-key": ["x", "kuhn1970"] }),
		];
		expect(literatureNote("kuhn1962", notes)).toBe(
			"Structure of Scientific Revolutions.md"
		);
		expect(literatureNote("kuhn1970", notes)).toBe("Both.md");
		expect(literatureNote("popper1959", notes)).toBe("Other.md");
	});

	it("prefers a note named after the key to one that only names it", () => {
		const notes = [
			note("A.md", { citationKey: "kuhn1962" }),
			note("Deep/Folder/kuhn1962.md"),
		];
		expect(literatureNote("kuhn1962", notes)).toBe("Deep/Folder/kuhn1962.md");
	});

	it("picks the same one of several every time: the shortest path", () => {
		const notes = [note("b/long/@kuhn1962.md"), note("z/@kuhn1962.md"), note("a/@kuhn1962.md")];
		expect(literatureNote("kuhn1962", notes)).toBe("a/@kuhn1962.md");
		expect(literatureNote("kuhn1962", [...notes].reverse())).toBe("a/@kuhn1962.md");
	});

	it("does not take a key for a longer one it begins", () => {
		const notes = [note("@kuhn1962a.md"), note("X.md", { citekey: "kuhn1962a" })];
		expect(literatureNote("kuhn1962", notes)).toBeNull();
	});
});
