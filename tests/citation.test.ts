import { describe, expect, it } from "vitest";
import {
	authorInText,
	citedKeys,
	keyMentions,
	mentionsOf,
	parseCitation,
	parseGroups,
	proseOf,
	splitLocator,
} from "src/citation";
import { readFileSync } from "node:fs";
import { labelWriter, localeLabels, PANDOC_LOCATORS } from "src/localeTerms";
import { formatCitations } from "src/pandoc";
import { Citation } from "src/types";

function citation(overrides: Partial<Citation> = {}): Citation {
	return {
		id: 1,
		citationKey: "doe2020",
		locator: "",
		label: "",
		prefix: "",
		suffix: "",
		suppressAuthor: false,
		...overrides,
	};
}

describe("splitLocator", () => {
	it("takes the label off a locator that carries one", () => {
		expect(splitLocator("p. 33")).toEqual({ label: "page", locator: "33" });
		expect(splitLocator("ch. 2")).toEqual({
			label: "chapter",
			locator: "2",
		});
	});

	it("reads a label in the plural, spelled out, or in any case", () => {
		expect(splitLocator("pp. 4–5")).toEqual({
			label: "page",
			locator: "4–5",
		});
		expect(splitLocator("Pages 40–43")).toEqual({
			label: "page",
			locator: "40–43",
		});
		expect(splitLocator("vols. 1–2")).toEqual({
			label: "volume",
			locator: "1–2",
		});
		expect(splitLocator("§§ 3–4")).toEqual({
			label: "section",
			locator: "3–4",
		});
	});

	it("leaves a bare locator for the style to name", () => {
		expect(splitLocator("33")).toEqual({ label: "", locator: "33" });
		expect(splitLocator("33, 35")).toEqual({ label: "", locator: "33, 35" });
	});
});

describe("parseCitation", () => {
	it("reads the key on its own", () => {
		expect(parseCitation("@doe2020")).toMatchObject({
			id: "doe2020",
			locator: "",
			prefix: "",
			suffix: "",
			suppressAuthor: false,
		});
	});

	it("keeps the comma in a suffix when no locator follows it, as pandoc writes it", () => {
		expect(parseCitation("@doe2020, and more")).toMatchObject({
			locator: "",
			label: "",
			suffix: ", and more",
		});
		expect(parseCitation("@doe2020 and more")).toMatchObject({ suffix: "and more" });
	});

	it("reads the prefix, the locator and the suffix around it", () => {
		expect(parseCitation("see @doe2020, p. 33")).toMatchObject({
			id: "doe2020",
			prefix: "see",
			label: "page",
			locator: "33",
		});
	});

	it("reads the dash that suppresses the author", () => {
		expect(parseCitation("-@doe2020")?.suppressAuthor).toBe(true);
	});

	it("reads a locator written in pandoc's braces", () => {
		expect(parseCitation("@doe2020{p. 33, 35}")).toMatchObject({
			id: "doe2020",
			label: "page",
			locator: "33, 35",
		});
	});

	it("reads a braced locator after the comma, as Better BibTeX writes it", () => {
		expect(parseCitation("@doe2020, {pp. 40–43}")).toMatchObject({
			id: "doe2020",
			label: "page",
			locator: "40–43",
			suffix: "",
		});
		expect(
			parseCitation("@doe2020, {pp. iv, vi–xi} with suffix here")
		).toMatchObject({
			label: "page",
			locator: "iv, vi–xi",
			suffix: "with suffix here",
		});
	});

	it("reads a plural label after the comma", () => {
		expect(parseCitation("@doe2020, pp. 4–5")).toMatchObject({
			label: "page",
			locator: "4–5",
			suffix: "",
		});
	});

	it("reads a key that had to be braced to survive pandoc", () => {
		expect(parseCitation("@{odd key 2020}")?.id).toBe("odd key 2020");
	});

	it("is nothing at all when there is no citation in it", () => {
		expect(parseCitation("just some text")).toBeNull();
	});
});

describe("parseGroups", () => {
	it("finds a group and where it sits", () => {
		const [group] = parseGroups("As shown [@doe2020, p. 33] and so on.");
		expect(group.from).toBe(9);
		expect(group.to).toBe(26);
		expect(group.citations).toHaveLength(1);
	});

	it("splits a group of several citations", () => {
		const [group] = parseGroups("[@doe2020, p. 33; -@roe2021]");
		expect(group.citations.map((c) => c.id)).toEqual([
			"doe2020",
			"roe2021",
		]);
		expect(group.citations[1].suppressAuthor).toBe(true);
	});

	it("leaves Obsidian's own brackets alone", () => {
		expect(parseGroups("[[A note]] and [a link](http://x)")).toEqual([]);
		expect(parseGroups("[an aside] with no citation")).toEqual([]);
	});

	it("finds every group in a paragraph", () => {
		expect(parseGroups("[@a] then [@b] then [@c]")).toHaveLength(3);
	});
});

describe("a citation standing alone", () => {
	// Every case is what pandoc 3.12.1 read in the same text.

	/** The one group the text holds, as the text between its offsets and its citations. */
	function only(text: string): { source: string; bare: boolean; citations: object[] } {
		const groups = parseGroups(text);
		expect(groups).toHaveLength(1);
		const [group] = groups;
		return {
			source: text.slice(group.from, group.to),
			bare: !!group.bare,
			citations: group.citations,
		};
	}

	it("is a citation with the author in the text", () => {
		const group = parseGroups("@doe2020 says blah.")[0];
		expect(group).toMatchObject({ from: 0, to: 8, bare: true });
		expect(group.citations).toEqual([
			{ id: "doe2020", locator: "", label: "", prefix: "", suffix: "", suppressAuthor: false },
		]);
		expect(authorInText(group)).toBe(true);
	});

	it("takes the bracket after it as its locator and suffix", () => {
		expect(only("@doe2020 [p. 33] says.")).toMatchObject({
			source: "@doe2020 [p. 33]",
			citations: [{ id: "doe2020", label: "page", locator: "33", suffix: "" }],
		});
		expect(only("@doe2020 [33]").citations).toMatchObject([{ label: "", locator: "33" }]);
		expect(only("@doe2020 [p. 33 and more]").citations).toMatchObject([
			{ label: "page", locator: "33", suffix: "and more" },
		]);
		expect(only("@doe2020 [{pp. 3, 5}]").citations).toMatchObject([
			{ label: "page", locator: "3, 5" },
		]);
	});

	it("keeps the comma of a suffix with no locator, as pandoc writes it", () => {
		for (const text of ["@doe2020 [and more]", "@doe2020 [, and more]"]) {
			expect(only(text).citations).toMatchObject([{ locator: "", suffix: ", and more" }]);
		}
	});

	it("takes the bracket on the next line, and the empty one", () => {
		expect(only("@doe2020\n[p. 3] says").source).toBe("@doe2020\n[p. 3]");
		expect(only("@doe2020 [] says").source).toBe("@doe2020 []");
	});

	it("takes the sources the bracket cites into the same citation", () => {
		expect(only("@doe2020 [p. 33; also @roe2021] says.")).toMatchObject({
			source: "@doe2020 [p. 33; also @roe2021]",
			citations: [
				{ id: "doe2020", locator: "33" },
				{ id: "roe2021", prefix: "also" },
			],
		});
		expect(only("@doe2020 [-@roe2021]").citations).toMatchObject([
			{ id: "doe2020" },
			{ id: "roe2021", suppressAuthor: true },
		]);
	});

	it("leaves a bracket with a part naming no key after the first to itself", () => {
		const groups = parseGroups("@doe2020 [see @roe2021; p. 4] says");
		expect(groups.map((group) => [group.bare ?? false, group.citations[0].id])).toEqual([
			[true, "doe2020"],
			[false, "roe2021"],
		]);
		expect(groups[0].to).toBe(8);
	});

	it("leaves Obsidian's link after it alone", () => {
		expect(only("@doe2020 [[a note]] says").source).toBe("@doe2020");
	});

	it("leaves the author out after a minus, and takes a bracket then too", () => {
		const group = parseGroups("Doe -@doe2020 [p. 33] says")[0];
		expect(group.citations[0]).toMatchObject({ suppressAuthor: true, locator: "33" });
		expect(authorInText(group)).toBe(false);
	});

	it("stands after punctuation, quotes and emphasis", () => {
		for (const text of ["(@doe2020)", "“@doe2020”", "*@doe2020*", "==@doe2020==", ";@doe2020"]) {
			expect(only(text)).toMatchObject({ source: "@doe2020", bare: true });
		}
	});

	it("is not an address, a link, a key cut short or one inside brackets", () => {
		for (const text of [
			"write to me@doe2020.org",
			"a.@doe2020",
			"https://x.com/@doe2020",
			"2@doe2020",
			"\\@doe2020",
		]) {
			expect(parseGroups(text)).toEqual([]);
		}
		expect(parseGroups("[[@doe2020]] and [see @doe2020 and @roe2021]").every((g) => !g.bare)).toBe(
			true
		);
	});

	it("is not a citation with the author in the text when it is bracketed", () => {
		expect(authorInText(parseGroups("[@doe2020]")[0])).toBe(false);
	});

	it("finds its key and the bracket's where they stand", () => {
		const text = "So @doe2020 [p. 3; see -@roe2021] said.";
		const [group] = parseGroups(text);
		expect(
			keyMentions(text, group).map(({ id, from, to }) => [id, text.slice(from, to)])
		).toEqual([
			["doe2020", "@doe2020"],
			["roe2021", "-@roe2021"],
		]);
	});

	it("is read in order among the bracketed groups", () => {
		expect(
			parseGroups("[@a] then @b [p. 2] then [@c] and @d.").map((group) => group.citations[0].id)
		).toEqual(["a", "b", "c", "d"]);
	});
});

describe("what the plugin writes, read back", () => {
	// The two halves have to agree: whatever `src/pandoc.ts` puts in the note
	// is what the renderer is handed back when it reads the note again.
	const locale = (name: string): string =>
		readFileSync(new URL(`../locales/locales-${name}.xml`, import.meta.url), "utf8");
	const EN = locale("en-US");
	const english = labelWriter(EN, EN);
	const roundTrip = (source: Citation) => {
		const text = formatCitations([source], { brackets: true, labels: english });
		const [group] = parseGroups(text);
		return group.citations[0];
	};

	for (const name of ["en-US", "en-GB", "ru-RU", "de-DE", "fr-FR"]) {
		it(`reads back every locator written in ${name}, one and several`, () => {
			const labels = localeLabels(locale(name), EN, "", name);
			const writer = labelWriter(locale(name), EN);
			for (const label of PANDOC_LOCATORS) {
				for (const locator of ["3", "3–5"]) {
					const text = formatCitations(
						[citation({ locator, label })],
						{ brackets: true, labels: writer }
					);
					const [group] = parseGroups(text, labels);
					expect({ text, label: group.citations[0].label }).toEqual({
						text,
						label,
					});
				}
			}
		});
	}

	it("recovers a plain citation", () => {
		expect(roundTrip(citation())).toMatchObject({ id: "doe2020" });
	});

	it("recovers the page, prefix, suffix and suppressed author", () => {
		expect(
			roundTrip(
				citation({
					prefix: "see",
					locator: "33",
					label: "page",
					suffix: "and following",
					suppressAuthor: true,
				})
			)
		).toMatchObject({
			id: "doe2020",
			prefix: "see",
			label: "page",
			locator: "33",
			suffix: "and following",
			suppressAuthor: true,
		});
	});

	it("recovers a locator that had to be braced", () => {
		expect(
			roundTrip(citation({ locator: "33, 35", label: "page" }))
		).toMatchObject({ label: "page", locator: "33, 35" });
	});
});

describe("citedKeys", () => {
	it("names every key once, in the order the note first cites it", () => {
		expect(
			citedKeys(
				"First [@roe2021, p. 3]. Then [see @doe2020; -@roe2021].\n\nAgain [@doe2020] and [@{odd key}]."
			)
		).toEqual(["roe2021", "doe2020", "odd key"]);
	});

	it("reads the citations in a footnote's text", () => {
		expect(citedKeys("Text.[^1]\n\n[^1]: [@doe2020, p. 33]")).toEqual([
			"doe2020",
		]);
	});

	it("passes over the front matter", () => {
		expect(
			citedKeys("---\nnote: [@hidden2020]\n---\nBody [@doe2020].")
		).toEqual(["doe2020"]);
	});

	it("passes over fenced code, to the fence that closes it", () => {
		expect(
			citedKeys(
				"```md\n[@code2020]\n~~~\n[@still2020]\n```\nAfter [@doe2020]."
			)
		).toEqual(["doe2020"]);
	});

	it("passes over inline code, however many backticks open it", () => {
		expect(
			citedKeys("`[@one2020]` and ``a ` [@two2020]`` but [@doe2020]")
		).toEqual(["doe2020"]);
	});

	it("does not let a stray backtick hide the next paragraph", () => {
		expect(citedKeys("A lone ` here.\n\nThen [@doe2020] and `x`.")).toEqual(
			["doe2020"]
		);
	});

	it("passes over Obsidian and HTML comments", () => {
		expect(
			citedKeys(
				"%%[@obsidian2020]%% <!-- [@html2020] --> [@doe2020]"
			)
		).toEqual(["doe2020"]);
	});

	it("names the keys standing alone too, and leaves them out when asked for the bracketed", () => {
		const text = "@doe2020 says [@roe2021]; ask @someone, or @moe2022 [see @poe2023].";
		expect(citedKeys(text)).toEqual(["doe2020", "roe2021", "someone", "moe2022", "poe2023"]);
		expect(citedKeys(text, { bracketed: true })).toEqual(["roe2021", "poe2023"]);
	});

	it("is empty for a note that cites nothing", () => {
		expect(citedKeys("A [[link]] and [text](url) and me@example.com")).toEqual(
			[]
		);
	});
});

describe("proseOf", () => {
	it("keeps every offset where it was in the note", () => {
		const text =
			"---\ntitle: x\n---\n```\ncode\n```\n`a` %%b%% <!-- c\nd --> [@doe2020]";
		const prose = proseOf(text);
		expect(prose).toHaveLength(text.length);
		expect(prose.indexOf("[@doe2020]")).toBe(text.indexOf("[@doe2020]"));
		expect(prose.split("\n")).toHaveLength(text.split("\n").length);
	});
});

describe("keyMentions", () => {
	it("finds each key of the group where it stands, in the order cited", () => {
		const text = "As [see -@doe2020, p. 3; @{roe 2021}] said.";
		const [group] = parseGroups(text);
		expect(
			keyMentions(text, group).map(({ id, from, to }) => [id, text.slice(from, to)])
		).toEqual([
			["doe2020", "-@doe2020"],
			["roe 2021", "@{roe 2021}"],
		]);
	});
});

describe("mentionsOf", () => {
	/** What each mention found covers in the text. */
	function found(text: string, keys: string[]): string[] {
		return mentionsOf(text, keys).map(({ from, to }) => text.slice(from, to));
	}

	it("finds every citation of the key in order, from the @ to the key's end", () => {
		const text =
			"First [@doe2020, p. 3]. Then [see -@doe2020; @roe2021] and [@{doe2020}].";
		expect(found(text, ["doe2020"])).toEqual([
			"@doe2020",
			"-@doe2020",
			"@{doe2020}",
		]);
		expect(mentionsOf(text, ["doe2020"])[0].from).toBe(text.indexOf("@doe2020"));
	});

	it("finds any of several keys", () => {
		expect(found("[@a] [@b] [@c]", ["c", "a"])).toEqual(["@a", "@c"]);
	});

	it("does not take a key for a longer one it begins", () => {
		expect(found("[@doe2020a] [@doe2020]", ["doe2020"])).toEqual(["@doe2020"]);
	});

	it("leaves out what the list leaves out, and counts the offsets past it", () => {
		const text = "---\nx: [@doe2020]\n---\n`[@doe2020]` %%[@doe2020]%% [@doe2020]";
		expect(mentionsOf(text, ["doe2020"])).toEqual([
			{ from: text.lastIndexOf("@doe2020"), to: text.length - 1 },
		]);
	});

	it("does not cut a group at a semicolon inside a code span", () => {
		expect(
			found("[see `a;b` @doe2020; @roe2021]", ["doe2020", "roe2021"])
		).toEqual(["@doe2020", "@roe2021"]);
	});
});
