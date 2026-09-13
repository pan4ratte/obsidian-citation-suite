import { describe, expect, it } from "vitest";
import {
	FootnoteEdit,
	footnoteEdit,
	footnoteLabel,
	FootnoteOptions,
	fromRoman,
	isValidLabelText,
	nextFootnoteLabel,
	toRoman,
} from "src/footnote";

const CITATION = "[@doe2020, p. 33]";

const arabic = { numbering: "arabic", prefix: "", suffix: "" } as const;

/**
 * The note as it reads once the edit is made, with `|` where the cursor lands.
 * The changes are applied from the end of the note backwards, and of two at
 * the same place the later one first, which is how an editor lays them out.
 */
function applied(text: string, edit: FootnoteEdit): string {
	let result = text;
	const order = edit.changes
		.map((change, index) => ({ change, index }))
		.sort((a, b) => b.change.from - a.change.from || b.index - a.index);
	for (const { change } of order) {
		result =
			result.slice(0, change.from) + change.text + result.slice(change.to);
	}
	return result.slice(0, edit.cursor) + "|" + result.slice(edit.cursor);
}

/** Cites in a footnote at the `|` in `note`, and gives back what the note reads. */
function cite(
	note: string,
	options: Partial<FootnoteOptions> = {}
): string {
	const at = note.indexOf("|");
	const text = note.slice(0, at) + note.slice(at + 1);
	return applied(
		text,
		footnoteEdit(text, at, at, CITATION, {
			placement: "document",
			...arabic,
			...options,
		})
	);
}

describe("roman numerals", () => {
	it("writes them the standard way", () => {
		expect(toRoman(1)).toBe("I");
		expect(toRoman(4)).toBe("IV");
		expect(toRoman(9)).toBe("IX");
		expect(toRoman(14)).toBe("XIV");
		expect(toRoman(1994)).toBe("MCMXCIV");
	});

	it("reads them back in either case", () => {
		expect(fromRoman("xiv")).toBe(14);
		expect(fromRoman("MCMXCIV")).toBe(1994);
	});

	it("reads nothing that is not one", () => {
		expect(fromRoman("")).toBeNull();
		expect(fromRoman("IIII")).toBeNull();
		expect(fromRoman("Xiv")).toBeNull();
		expect(fromRoman("note")).toBeNull();
	});
});

describe("footnoteLabel", () => {
	it("writes the number in the chosen numbering", () => {
		expect(footnoteLabel(4, arabic)).toBe("4");
		expect(footnoteLabel(4, { ...arabic, numbering: "roman-lower" })).toBe(
			"iv"
		);
		expect(footnoteLabel(4, { ...arabic, numbering: "roman-upper" })).toBe(
			"IV"
		);
	});

	it("puts the prefix and the suffix around it", () => {
		expect(footnoteLabel(2, { ...arabic, prefix: "n", suffix: "-cite" })).toBe(
			"n2-cite"
		);
	});

	it("drops what would break the footnote", () => {
		expect(footnoteLabel(1, { ...arabic, prefix: "a b]", suffix: "^" })).toBe(
			"ab1"
		);
	});
});

describe("isValidLabelText", () => {
	it("takes ordinary text and nothing at all", () => {
		expect(isValidLabelText("")).toBe(true);
		expect(isValidLabelText("note-")).toBe(true);
	});

	it("refuses spaces and the characters that end a label", () => {
		for (const text of ["a b", "a]", "[a", "^a", "a\\", "a|b"]) {
			expect(isValidLabelText(text)).toBe(false);
		}
	});
});

describe("nextFootnoteLabel", () => {
	it("starts at one", () => {
		expect(nextFootnoteLabel("No footnotes here.", arabic)).toBe("1");
	});

	it("goes one past the highest number, not the count", () => {
		expect(nextFootnoteLabel("A[^1] b[^4]\n\n[^1]: x\n[^4]: y", arabic)).toBe(
			"5"
		);
	});

	it("counts only labels with the same prefix and suffix", () => {
		const options = { ...arabic, prefix: "n" };
		expect(nextFootnoteLabel("A[^n2] b[^7] c[^note]", options)).toBe("n3");
	});

	it("keeps counting across numberings", () => {
		const options = { ...arabic, numbering: "roman-lower" } as const;
		expect(nextFootnoteLabel("A[^1] b[^2]", options)).toBe("iii");
	});

	it("steps over a label the note already has in another case", () => {
		// `[^N1]` does not start with the prefix `n`, so it is not counted,
		// but a label differing from it only in case would be read as it.
		const options = { ...arabic, prefix: "n" };
		expect(nextFootnoteLabel("A[^N1]", options)).toBe("n2");
	});
});

describe("footnoteEdit", () => {
	it("puts the anchor at the cursor and the text at the end of the note", () => {
		expect(cite("One|.\n\nTwo.\n")).toBe(
			"One[^1]|.\n\nTwo.\n\n[^1]: [@doe2020, p. 33]\n"
		);
	});

	it("adds to the footnotes already at the end of the note", () => {
		expect(cite("One[^1]. Two|.\n\n[^1]: [@roe2021]\n")).toBe(
			"One[^1]. Two[^2]|.\n\n[^1]: [@roe2021]\n[^2]: [@doe2020, p. 33]\n"
		);
	});

	it("puts the text after the paragraph", () => {
		expect(
			cite("First|\nstill first.\n\nSecond.", { placement: "paragraph" })
		).toBe(
			"First[^1]|\nstill first.\n\n[^1]: [@doe2020, p. 33]\n\nSecond."
		);
	});

	it("puts the text past the footnotes under the paragraph", () => {
		expect(
			cite("First[^1]|.\n\n[^1]: [@roe2021]\n\nSecond.", {
				placement: "paragraph",
			})
		).toBe(
			"First[^1][^2]|.\n\n[^1]: [@roe2021]\n[^2]: [@doe2020, p. 33]\n\nSecond."
		);
	});

	it("puts the text at the end of the section, before the next heading", () => {
		expect(
			cite("# One\n\nText|.\n\nMore.\n\n## Two\n\nOther.", {
				placement: "section",
			})
		).toBe(
			"# One\n\nText[^1]|.\n\nMore.\n\n[^1]: [@doe2020, p. 33]\n\n## Two\n\nOther."
		);
	});

	it("keeps a blank line before a heading right under the section", () => {
		expect(cite("Text|.\n## Two", { placement: "section" })).toBe(
			"Text[^1]|.\n\n[^1]: [@doe2020, p. 33]\n\n## Two"
		);
	});

	it("does not end a section at a # inside code or front matter", () => {
		expect(
			cite("---\n# yaml\n---\nText|.\n\n```\n# code\n```\n\n# Next", {
				placement: "section",
			})
		).toBe(
			"---\n# yaml\n---\nText[^1]|.\n\n```\n# code\n```\n\n[^1]: [@doe2020, p. 33]\n\n# Next"
		);
	});

	it("runs to the end of the note in its last section", () => {
		expect(cite("# One\n\nText|.\n", { placement: "section" })).toBe(
			"# One\n\nText[^1]|.\n\n[^1]: [@doe2020, p. 33]\n"
		);
	});

	it("replaces the selection with the anchor", () => {
		const text = "Cite TODO here.";
		const from = text.indexOf("TODO");
		expect(
			applied(
				text,
				footnoteEdit(text, from, from + 4, CITATION, {
					placement: "document",
					...arabic,
				})
			)
		).toBe("Cite [^1]| here.\n\n[^1]: [@doe2020, p. 33]");
	});

	it("labels the anchor as the settings say", () => {
		expect(
			cite("Text|.", { numbering: "roman-upper", prefix: "c", suffix: "." })
		).toBe("Text[^cI.]|.\n\n[^cI.]: [@doe2020, p. 33]");
	});

	it("writes a citation inside a footnote as it is", () => {
		expect(cite("Text[^1].\n\n[^1]: See |.")).toBe(
			"Text[^1].\n\n[^1]: See [@doe2020, p. 33]|."
		);
	});
});
