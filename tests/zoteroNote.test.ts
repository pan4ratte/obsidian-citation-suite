import { describe, expect, it } from "vitest";
import { asBlock } from "src/zoteroNote";

/** The note as it reads once the block is inserted between the two halves. */
function inserted(before: string, after: string, markdown: string): string {
	return before + asBlock(before, after, markdown).text + after;
}

describe("asBlock", () => {
	it("stands on its own in the middle of a sentence", () => {
		expect(inserted("As shown", " and so on.", "# Notes")).toBe(
			"As shown\n\n# Notes\n\n and so on."
		);
	});

	it("adds only the blank line a line break is missing", () => {
		expect(inserted("First.\n", "\nLast.", "Note")).toBe(
			"First.\n\nNote\n\nLast."
		);
	});

	it("adds nothing where the paragraph breaks already are", () => {
		expect(inserted("First.\n\n", "\n\nLast.", "Note")).toBe(
			"First.\n\nNote\n\nLast."
		);
	});

	it("adds nothing at the start or the end of the note", () => {
		expect(inserted("", "", "Note")).toBe("Note");
		expect(inserted("  \n", "\n", "Note")).toBe("  \nNote\n");
	});

	it("says where the Markdown itself sits, for the cursor", () => {
		const block = asBlock("As shown", " and so on.", "Note");
		expect(block.text.slice(block.start, block.end)).toBe("Note");
	});
});
