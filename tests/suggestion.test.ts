import { describe, expect, it } from "vitest";
import {
	citationOf,
	insideBrackets,
	keyInsertion,
	keyTrigger,
	rankSources,
	sourceMatches,
	SuggestedSource,
	suggestedSource,
	typedKeyEnd,
} from "src/suggestion";

/** The line with the pick written in, and `|` where the cursor lands. */
function pick(typed: string, citekey: string, brackets = true): string {
	const cursor = typed.indexOf("|");
	const line = typed.slice(0, cursor) + typed.slice(cursor + 1);
	const trigger = keyTrigger(line.slice(0, cursor));
	if (!trigger) {
		throw new Error(`no trigger in ${typed}`);
	}
	const { from, to, text } = keyInsertion(line, trigger, cursor, citekey, brackets);
	const written = line.slice(0, from) + text + line.slice(to);
	const end = from + text.length;
	return `${written.slice(0, end)}|${written.slice(end)}`;
}

describe("keyTrigger", () => {
	it("starts where a citation can: a line, a space, a bracket, a semicolon", () => {
		expect(keyTrigger("@kuhn")).toEqual({ start: 0, query: "kuhn" });
		expect(keyTrigger("as shown by @ku")).toEqual({ start: 12, query: "ku" });
		expect(keyTrigger("[@ku")).toEqual({ start: 1, query: "ku" });
		expect(keyTrigger("[@doe2020; @ku")).toEqual({ start: 11, query: "ku" });
		expect(keyTrigger("[see @ku")).toEqual({ start: 5, query: "ku" });
	});

	it("opens on the at sign alone, before anything is typed after it", () => {
		expect(keyTrigger("[@")).toEqual({ start: 1, query: "" });
	});

	it("keeps the dash that suppresses the author", () => {
		expect(keyTrigger("[-@ku")).toEqual({ start: 1, query: "ku" });
	});

	it("takes words of any alphabet, for a title or a transliterated key", () => {
		expect(keyTrigger("[@кун")).toEqual({ start: 1, query: "кун" });
	});

	it("is not an address, a link to a note, or a finished word", () => {
		expect(keyTrigger("mail me at me@example")).toBeNull();
		expect(keyTrigger("[[@kuhn")).toBeNull();
		expect(keyTrigger("[@kuhn] and")).toBeNull();
	});
});

describe("typedKeyEnd", () => {
	it("runs over the whole key, past the cursor, and stops at what ends it", () => {
		const line = "See [-@bart; @doe2020]";
		expect(line.slice(5, typedKeyEnd(line, 5))).toBe("-@bart");
		expect(line.slice(13, typedKeyEnd(line, 13))).toBe("@doe2020");
		expect(typedKeyEnd("[@", 1)).toBe(2);
	});
});

describe("insideBrackets", () => {
	it("is inside a citation whose bracket is still open", () => {
		expect(insideBrackets("see [@a; @b", 9)).toBe(true);
		expect(insideBrackets("[see @b", 5)).toBe(true);
	});

	it("is outside once the bracket is closed, and in a link or a footnote", () => {
		expect(insideBrackets("[@a] and @b", 9)).toBe(false);
		expect(insideBrackets("@b", 0)).toBe(false);
		expect(insideBrackets("[[@b", 2)).toBe(false);
		expect(insideBrackets("[^@b", 2)).toBe(false);
	});
});

describe("keyInsertion", () => {
	it("writes a citation of its own in brackets, as the settings put them", () => {
		expect(pick("as shown by @ku|", "kuhn1962")).toBe("as shown by [@kuhn1962]|");
		expect(pick("as shown by @ku|", "kuhn1962", false)).toBe("as shown by @kuhn1962|");
	});

	it("writes the key alone inside a citation's brackets", () => {
		expect(pick("[@doe2020; @ku|]", "kuhn1962")).toBe("[@doe2020; @kuhn1962|]");
		expect(pick("[see @ku|, p. 3]", "kuhn1962")).toBe("[see @kuhn1962|, p. 3]");
	});

	it("keeps the dash that suppresses the author", () => {
		expect(pick("[-@ku|]", "kuhn1962")).toBe("[-@kuhn1962|]");
		expect(pick("Kuhn -@ku|", "kuhn1962")).toBe("Kuhn [-@kuhn1962]|");
	});

	it("replaces the whole key when picked in the middle of it", () => {
		expect(pick("[@ku|hn19]", "kuhn1962")).toBe("[@kuhn1962|]");
	});

	it("braces a key pandoc would cut short", () => {
		expect(pick("[@we|]", "weird key!")).toBe("[@{weird key!}|]");
	});
});

describe("citationOf", () => {
	it("writes a citation of the source as the settings write one", () => {
		expect(citationOf("doe2020", true)).toBe("[@doe2020]");
		expect(citationOf("doe2020", false)).toBe("@doe2020");
	});

	it("braces a key pandoc would not read whole", () => {
		// The key holds what ends a key for pandoc, so it is written in
		// braces, as `citationKeyToken` writes one.
		expect(citationOf("doe2020,a", true)).toBe("[@{doe2020,a}]");
	});
});

describe("suggestedSource", () => {
	it("shows the surnames, the year and the title", () => {
		expect(
			suggestedSource("kuhn1962", {
				title: "The Structure of Scientific Revolutions",
				author: [{ family: "Kuhn", given: "Thomas S." }],
				issued: { "date-parts": [[1962]] },
			})
		).toEqual({
			citekey: "kuhn1962",
			title: "The Structure of Scientific Revolutions",
			creators: "Kuhn",
			year: "1962",
		});
	});

	it("shortens many creators, and falls back to the editors", () => {
		const many = suggestedSource("a", {
			author: [{ family: "A" }, { family: "B" }, { literal: "C Inc." }],
		});
		expect(many.creators).toBe("A…");
		const two = suggestedSource("b", {
			editor: [{ family: "Doe" }, { literal: "Roe" }],
			issued: { raw: "circa 1990" },
		});
		expect(two).toMatchObject({ creators: "Doe, Roe", year: "1990" });
	});

	it("leaves out what the item does not have", () => {
		expect(suggestedSource("x", {})).toEqual({
			citekey: "x",
			title: "",
			creators: "",
			year: "",
		});
	});
});

describe("sourceMatches and rankSources", () => {
	const source = (citekey: string, creators = "", title = ""): SuggestedSource => ({
		citekey,
		creators,
		title,
		year: "",
	});

	it("finds a source by its key, title or creator, in any case, ё as е", () => {
		const kuhn = source("kuhn1962", "Кун", "Структура научных революций");
		expect(sourceMatches(kuhn, "KUHN")).toBe(true);
		expect(sourceMatches(kuhn, "кун")).toBe(true);
		expect(sourceMatches(kuhn, "научн")).toBe(true);
		expect(sourceMatches(source("x", "", "Её книга"), "ее")).toBe(true);
		expect(sourceMatches(kuhn, "popper")).toBe(false);
	});

	it("puts the note's own sources first, then keys, then creators", () => {
		const ranked = rankSources(
			[
				source("zeta", "", "About kuhn"),
				source("mann", "Kuhnert"),
				source("kuhn1970"),
				source("kuhn1962"),
			],
			"kuhn",
			["mann"]
		);
		expect(ranked.map((s) => s.citekey)).toEqual([
			"mann",
			"kuhn1962",
			"kuhn1970",
			"zeta",
		]);
	});
});
