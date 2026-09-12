import { describe, expect, it } from "vitest";
import { isCustomColor, lookClasses } from "src/look";
import { CitationUnderline } from "src/types";

/** Neither bold nor italic. */
const plain = { citationBold: false, citationItalic: false };

describe("lookClasses", () => {
	it("adds nothing for the colour of body text", () => {
		expect(
			lookClasses({
				citationColor: "",
				citationUnderline: "dotted",
				...plain,
			})
		).toEqual(["zoterik-citation-underline-dotted"]);
	});

	it("names the accent and a custom colour apart", () => {
		expect(
			lookClasses({
				citationColor: "accent",
				citationUnderline: "wavy",
				...plain,
			})
		).toEqual([
			"zoterik-citation-color-accent",
			"zoterik-citation-underline-wavy",
		]);
		expect(
			lookClasses({
				citationColor: "#1a2B3c",
				citationUnderline: "none",
				...plain,
			})
		).toEqual([
			"zoterik-citation-color-custom",
			"zoterik-citation-underline-none",
		]);
	});

	it("adds bold and italic, each on its own", () => {
		expect(
			lookClasses({
				citationColor: "",
				citationUnderline: "solid",
				citationBold: true,
				citationItalic: true,
			})
		).toEqual([
			"zoterik-citation-underline-solid",
			"zoterik-citation-bold",
			"zoterik-citation-italic",
		]);
	});

	it("adds nothing for a value it does not know", () => {
		expect(
			lookClasses({
				citationColor: "red",
				citationUnderline: "double" as CitationUnderline,
				citationBold: "yes" as unknown as boolean,
				citationItalic: false,
			})
		).toEqual([]);
	});
});

describe("isCustomColor", () => {
	it("takes a colour input's #rrggbb and nothing else", () => {
		expect(isCustomColor("#00ff7f")).toBe(true);
		expect(isCustomColor("#0f7")).toBe(false);
		expect(isCustomColor("accent")).toBe(false);
		expect(isCustomColor("")).toBe(false);
	});
});
