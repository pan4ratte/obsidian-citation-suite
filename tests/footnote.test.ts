import { describe, expect, it } from "vitest";
import {
	FootnoteEdit,
	footnoteEdit,
	footnoteLabel,
	FootnoteOptions,
	fromRoman,
	inFootnoteText,
	isValidLabelText,
	nextFootnoteLabel,
	renumberFootnotes,
	TextChange,
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
			"One[^1]. Two[^2]|.\n\n[^1]: [@roe2021]\n\n[^2]: [@doe2020, p. 33]\n"
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
			"First[^1][^2]|.\n\n[^1]: [@roe2021]\n\n[^2]: [@doe2020, p. 33]\n\nSecond."
		);
	});

	it("goes past footnotes written straight under one another", () => {
		expect(
			cite("A[^1][^2]|.\n\n[^1]: x\n[^2]: y\n\nNext.", { placement: "paragraph" })
		).toBe("A[^1][^2][^3]|.\n\n[^1]: x\n[^2]: y\n\n[^3]: [@doe2020, p. 33]\n\nNext.");
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

describe("a footnote with nothing in it", () => {
	/** Adds an empty footnote at the `|`, with `|` where its text is typed. */
	function blank(note: string, options: Partial<FootnoteOptions> = {}): string {
		const at = note.indexOf("|");
		const text = note.slice(0, at) + note.slice(at + 1);
		const edit = footnoteEdit(text, at, at, "", {
			placement: "document",
			...arabic,
			...options,
		});
		return applied(text, { ...edit, cursor: edit.textEnd });
	}

	it("puts the cursor where its text is to be typed", () => {
		expect(blank("One|.\n\nTwo.\n")).toBe("One[^1].\n\nTwo.\n\n[^1]: |\n");
	});

	it("does so under other footnotes, and above a paragraph after it", () => {
		expect(
			blank("A[^1]|.\n\n[^1]: x\n\nNext.", { placement: "paragraph" })
		).toBe("A[^1][^2].\n\n[^1]: x\n\n[^2]: |\n\nNext.");
	});
});

describe("inFootnoteText", () => {
	it("is true anywhere in a footnote's text, and only there", () => {
		const text = "Text[^1].\n\n[^1]: First line\nsecond line.\n\nAfter.";
		expect(inFootnoteText(text, text.indexOf("second"))).toBe(true);
		expect(inFootnoteText(text, text.indexOf("Text"))).toBe(false);
		expect(inFootnoteText(text, text.indexOf("After"))).toBe(false);
	});
});

describe("renumberFootnotes", () => {
	/** The note once renumbered as `options` say. */
	function renumbered(
		text: string,
		options: Partial<FootnoteOptions> = {}
	): string {
		const { changes } = renumberFootnotes(text, { ...arabic, ...options });
		return [...changes]
			.sort((a: TextChange, b: TextChange) => b.from - a.from)
			.reduce(
				(result, change) =>
					result.slice(0, change.from) + change.text + result.slice(change.to),
				text
			);
	}

	it("numbers the footnotes in the order their anchors come", () => {
		expect(renumbered("A[^2] B[^1]\n\n[^2]: two\n[^1]: one\n")).toBe(
			"A[^1] B[^2]\n\n[^1]: two\n[^2]: one\n"
		);
	});

	it("puts the footnote texts standing together in the new order", () => {
		expect(renumbered("A[^2] B[^1]\n\n[^1]: one\n\n[^2]: two")).toBe(
			"A[^1] B[^2]\n\n[^1]: two\n\n[^2]: one"
		);
	});

	it("writes the labels as the settings say, hand-named ones too", () => {
		expect(
			renumbered("A[^kuhn] B[^7]\n\n[^7]: x\n[^kuhn]: y", {
				numbering: "roman-lower",
				prefix: "n",
			})
		).toBe("A[^ni] B[^nii]\n\n[^ni]: y\n[^nii]: x");
	});

	it("gives an anchor repeated the one label", () => {
		expect(renumbered("A[^b] B[^a] C[^b]\n\n[^a]: 1\n[^b]: 2")).toBe(
			"A[^1] B[^2] C[^1]\n\n[^1]: 2\n[^2]: 1"
		);
	});

	it("numbers a footnote nothing anchors after all the others", () => {
		expect(renumbered("A[^x]\n\n[^orphan]: o\n[^x]: x")).toBe(
			"A[^1]\n\n[^1]: x\n[^2]: o"
		);
	});

	it("moves a footnote's text with every paragraph under it", () => {
		expect(
			renumbered(
				"A[^2] B[^1]\n\n[^1]: one\nstill one\n\n    one again\n\n[^2]: two\n"
			)
		).toBe(
			"A[^1] B[^2]\n\n[^1]: two\n\n[^2]: one\nstill one\n\n    one again\n"
		);
	});

	it("renames an anchor inside a footnote's text that is moved", () => {
		expect(renumbered("A[^b] B[^a]\n\n[^a]: see[^b]\n[^b]: b")).toBe(
			"A[^1] B[^2]\n\n[^1]: b\n[^2]: see[^1]"
		);
	});

	it("does not move a footnote's text away from its paragraph", () => {
		expect(
			renumbered("A[^2].\n\n[^2]: two\n\nB[^1].\n\n[^1]: one")
		).toBe("A[^1].\n\n[^1]: two\n\nB[^2].\n\n[^2]: one");
	});

	it("leaves labels in code and comments alone", () => {
		expect(
			renumbered("A[^b] `[^a]`\n\n```\n[^a]: code\n```\n%%[^a]%%\n\n[^b]: b")
		).toBe("A[^1] `[^a]`\n\n```\n[^a]: code\n```\n%%[^a]%%\n\n[^1]: b");
	});

	describe("keeping named footnotes", () => {
		/** The note once renumbered with named footnotes kept. */
		function keeping(
			text: string,
			options: Partial<FootnoteOptions> = {}
		): string {
			const { changes } = renumberFootnotes(
				text,
				{ ...arabic, ...options },
				true
			);
			return [...changes]
				.sort((a, b) => b.from - a.from)
				.reduce(
					(result, change) =>
						result.slice(0, change.from) +
						change.text +
						result.slice(change.to),
					text
				);
		}

		it("leaves a named label alone and numbers the rest past it", () => {
			expect(
				keeping("A[^3] B[^kuhn] C[^1]\n\n[^1]: c\n[^kuhn]: b\n[^3]: a")
			).toBe("A[^1] B[^kuhn] C[^2]\n\n[^1]: a\n[^kuhn]: b\n[^2]: c");
		});

		it("reads digits, and numerals in the settings' own case, between their prefix and suffix", () => {
			expect(
				keeping("A[^nII] B[^n1] C[^nv] D[^1] E[^note]", {
					numbering: "roman-upper",
					prefix: "n",
				})
			).toBe("A[^nI] B[^nII] C[^nv] D[^1] E[^note]");
		});

		it("keeps a word that spells a numeral in a note numbered in arabic", () => {
			expect(keeping("A[^x] B[^mix] C[^4]")).toBe("A[^x] B[^mix] C[^1]");
		});

		it("steps over a number spelling a kept label in another case", () => {
			expect(keeping("A[^N1] B[^n5]", { prefix: "n" })).toBe(
				"A[^N1] B[^n2]"
			);
		});

		it("says a note of named footnotes only is in order", () => {
			expect(renumberFootnotes("A[^x] B[^y]\n\n[^x]: 1\n[^y]: 2", arabic, true))
				.toEqual({ changes: [], count: 2 });
		});
	});

	it("changes nothing in a note already in order, and says how many there are", () => {
		expect(renumberFootnotes("A[^1] B[^2]\n\n[^1]: x\n[^2]: y", arabic)).toEqual({
			changes: [],
			count: 2,
		});
		expect(renumberFootnotes("No footnotes.", arabic)).toEqual({
			changes: [],
			count: 0,
		});
	});
});
