import { describe, expect, it } from "vitest";
import {
	citedKeys,
	parseCitation,
	parseGroups,
	splitLocator,
} from "src/citation";
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

describe("what the plugin writes, read back", () => {
	// The two halves have to agree: whatever `src/pandoc.ts` puts in the note
	// is what the renderer is handed back when it reads the note again.
	const roundTrip = (source: Citation) => {
		const text = formatCitations([source], { brackets: true });
		const [group] = parseGroups(text);
		return group.citations[0];
	};

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

	it("is empty for a note that cites nothing", () => {
		expect(citedKeys("A [[link]] and [text](url) and me@example.com")).toEqual(
			[]
		);
	});
});
