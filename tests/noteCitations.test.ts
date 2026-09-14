import { describe, expect, it } from "vitest";
import { parseGroups } from "src/citation";
import {
	citationSignature,
	matchCitations,
	noteCitations,
} from "src/noteCitations";

/** The keys of each citation, in the order pandoc reads them, with the note it stands in. */
function order(text: string): string[] {
	return noteCitations(text).map(
		(citation) =>
			`${citation.citations.map((item) => item.id).join("+")}` +
			`${citation.inNote ? " in" : " at"} ${citation.noteNumber}`
	);
}

describe("noteCitations", () => {
	it("reads the body text in order, each citation a note of its own", () => {
		expect(order("A [@a]. B [@b; @c]. C [@a, p. 3].")).toEqual([
			"a at 1",
			"b+c at 2",
			"a at 3",
		]);
	});

	it("reads a footnote's text where it is anchored", () => {
		const note = [
			"First [@a].[^1] Then [@b].",
			"",
			"[^1]: See [@c, p. 4] and [@d].",
		].join("\n");
		expect(order(note)).toEqual(["a at 1", "c in 2", "d in 2", "b at 3"]);
	});

	it("numbers footnotes by their first anchor, not by their labels", () => {
		const note = [
			"One.[^z] Two.[^a] Again.[^z]",
			"",
			"[^a]: [@a]",
			"[^z]: [@z]",
		].join("\n");
		expect(order(note)).toEqual(["z in 1", "a in 2"]);
	});

	it("counts a footnote without citations among the notes", () => {
		const note = ["One.[^1] Two [@b].", "", "[^1]: Just a remark."].join("\n");
		expect(order(note)).toEqual(["b at 2"]);
	});

	it("reads an inline note where it stands, with its own number", () => {
		expect(order("A.^[See [@a] and [@b].] B [@c].")).toEqual([
			"a in 1",
			"b in 1",
			"c at 2",
		]);
	});

	it("puts a footnote nothing anchors after everything else", () => {
		const note = ["Body [@a].", "", "[^orphan]: [@b]", "[^1]: [@c]", "", "See.[^1]"].join(
			"\n"
		);
		expect(order(note)).toEqual(["a at 1", "c in 2", "b in 3"]);
	});

	it("keeps a footnote's text going over an indented paragraph", () => {
		const note = [
			"Text.[^1]",
			"",
			"[^1]: First [@a].",
			"",
			"    Second [@b].",
			"",
			"After [@c].",
		].join("\n");
		expect(order(note)).toEqual(["a in 1", "b in 1", "c at 2"]);
	});

	it("does not take an anchor inside a footnote's text for a note of its own", () => {
		const note = ["Text.[^1]", "", "[^1]: [@a] and a note.[^2]", "[^2]: [@b]"].join("\n");
		expect(order(note)).toEqual(["a in 1", "b in 2"]);
	});

	it("reads nothing out of code, comments or the front matter", () => {
		const note = [
			"---",
			"cite: [@front]",
			"---",
			"`[@code]` %%[@comment]%% [@real]",
		].join("\n");
		expect(order(note)).toEqual(["real at 1"]);
	});

	it("keeps each citation where it stands in the text", () => {
		const text = "Text.[^1] Body [@b].\n\n[^1]: [@a]";
		const [a, b] = noteCitations(text);
		expect(text.slice(a.from, a.to)).toBe("[@a]");
		expect(text.slice(b.from, b.to)).toBe("[@b]");
	});
});

describe("citationSignature", () => {
	it("is the same for the same citation wherever it stands", () => {
		const [first, second] = parseGroups("[@a, p. 3] and later [@a, p. 3]");
		expect(citationSignature(first)).toBe(citationSignature(second));
	});

	it("differs for a different locator, prefix or suppressed author", () => {
		const [plain, page, prefix, suppressed] = parseGroups(
			"[@a] [@a, p. 3] [see @a] [-@a]"
		);
		const signatures = new Set(
			[plain, page, prefix, suppressed].map(citationSignature)
		);
		expect(signatures.size).toBe(4);
	});
});

describe("matchCitations", () => {
	const note = "[@a] one [@b] two [@a] three [@c] four [@a]";
	const citations = noteCitations(note);

	it("tells a repeated citation apart by how many times it came before", () => {
		const piece = parseGroups("[@a] three [@c] four [@a]");
		const matches = matchCitations(piece, citations.slice(1));
		expect(matches.map((match) => match?.from)).toEqual([
			citations[2].from,
			citations[3].from,
			citations[4].from,
		]);
	});

	it("leaves a group the note does not hold unmatched, and goes on", () => {
		const piece = parseGroups("[@z] and [@b]");
		const matches = matchCitations(piece, citations);
		expect(matches[0]).toBeNull();
		expect(matches[1]).toBe(citations[1]);
	});
});
