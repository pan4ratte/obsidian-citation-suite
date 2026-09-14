import { isAbsolute, join } from "node:path/posix";
import { describe, expect, it } from "vitest";
import {
	cslCandidates,
	cslFileName,
	isStyleUrl,
	styleForUrl,
	styleProperties,
} from "src/noteStyle";
import { CitationStyle } from "src/types";

const styles: CitationStyle[] = [
	{ id: "http://www.zotero.org/styles/apa", title: "APA", path: "/z/apa.csl" },
	{ id: "http://www.zotero.org/styles/ieee", title: "IEEE", path: "/z/ieee.csl" },
	{ id: "2f7a0b3c-uuid", title: "Hand-written", path: "/z/mine.csl" },
];

describe("styleProperties", () => {
	it("reads csl, citation-style for want of it, and lang", () => {
		expect(styleProperties({ csl: " gost.csl ", lang: "ru-RU" })).toEqual({
			csl: "gost.csl",
			lang: "ru-RU",
		});
		expect(styleProperties({ "citation-style": "apa" })).toEqual({ csl: "apa", lang: null });
		expect(styleProperties({ csl: "a", "citation-style": "b" }).csl).toBe("a");
	});

	it("reads nothing that is not text", () => {
		expect(styleProperties({ csl: ["apa"], lang: 7 })).toEqual({ csl: null, lang: null });
		expect(styleProperties({ csl: "  " })).toEqual({ csl: null, lang: null });
		expect(styleProperties(undefined)).toEqual({ csl: null, lang: null });
	});
});

describe("cslFileName and isStyleUrl", () => {
	it("adds .csl to a name without an extension, as pandoc does", () => {
		expect(cslFileName("gost2018")).toBe("gost2018.csl");
		expect(cslFileName("styles/gost2018.csl")).toBe("styles/gost2018.csl");
		expect(cslFileName("v1.2/apa")).toBe("v1.2/apa.csl");
	});

	it("tells a URL from a file", () => {
		expect(isStyleUrl("https://www.zotero.org/styles/apa")).toBe(true);
		expect(isStyleUrl("apa.csl")).toBe(false);
	});
});

describe("styleForUrl", () => {
	it("finds the style Zotero keeps under the URL, whatever its scheme", () => {
		expect(styleForUrl("https://www.zotero.org/styles/apa", styles)?.title).toBe("APA");
		expect(styleForUrl("http://zotero.org/styles/ieee/", styles)?.title).toBe("IEEE");
	});

	it("finds a style by its short name on another site", () => {
		expect(
			styleForUrl(
				"https://raw.githubusercontent.com/citation-style-language/styles/master/ieee.csl",
				styles
			)?.title
		).toBe("IEEE");
	});

	it("finds nothing for a style Zotero does not have", () => {
		expect(styleForUrl("https://www.zotero.org/styles/nature", styles)).toBeNull();
		expect(styleForUrl("https://example.com/2f7a0b3c-uuid.csl", styles)).toBeNull();
	});
});

describe("cslCandidates", () => {
	it("looks in each folder, then in the csl folder of each data directory", () => {
		expect(
			cslCandidates("gost", ["/vault/Notes", "/vault"], ["/home/me/.local/share/pandoc"], join, isAbsolute)
		).toEqual([
			"/vault/Notes/gost.csl",
			"/vault/gost.csl",
			"/home/me/.local/share/pandoc/csl/gost.csl",
		]);
	});

	it("takes an absolute path as it is", () => {
		expect(cslCandidates("/styles/gost.csl", ["/vault"], ["/data"], join, isAbsolute)).toEqual([
			"/styles/gost.csl",
		]);
	});
});
