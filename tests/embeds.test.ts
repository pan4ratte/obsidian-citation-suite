import { describe, expect, it } from "vitest";
import { citedKeys } from "src/citation";
import { Embed, embedsOf, EmbeddedText, expandEmbeds } from "src/embeds";
import { noteCitations } from "src/noteCitations";

/** A vault of notes by name, each resolved as a note of that name. */
function vault(notes: Record<string, string>) {
	return (embed: Embed): Promise<EmbeddedText | null> => {
		if (embed.link.endsWith(".png")) {
			return Promise.resolve({ path: embed.link, text: null });
		}
		const text = notes[embed.link];
		return Promise.resolve(
			text === undefined ? null : { path: `${embed.link}.md`, text }
		);
	};
}

describe("embedsOf", () => {
	it("reads wiki embeds with subpaths and aliases, and markdown embeds", () => {
		const text = "![[a]] ![[b#Part two|B]] ![[c#^block]] ![x](d%20e.md) ![y](https://x.org/p.png)";
		expect(embedsOf(text).map(({ link, subpath }) => [link, subpath])).toEqual([
			["a", ""],
			["b", "#Part two"],
			["c", "#^block"],
			["d e.md", ""],
		]);
	});

	it("skips embeds in code and comments, and plain links", () => {
		const text = "`![[a]]`\n```\n![[b]]\n```\n%% ![[c]] %%\n[[d]]";
		expect(embedsOf(text)).toEqual([]);
	});
});

describe("expandEmbeds", () => {
	it("reads an embedded note's citations where the embed stands", async () => {
		const notes = { ch1: "One [@b].", ch2: "Two [@c]." };
		const { text, paths } = await expandEmbeds(
			"Intro [@a].\n\n![[ch1]]\n\nMiddle [@d].\n\n![[ch2]]",
			"main.md",
			vault(notes)
		);
		expect(citedKeys(text)).toEqual(["a", "b", "d", "c"]);
		expect([...paths]).toEqual(["ch1.md", "ch2.md"]);
	});

	it("follows embeds inside embeds, and stops at one already being read", async () => {
		const notes = { a: "A [@a] ![[b]]", b: "B [@b] ![[a]] ![[main]]" };
		const { text } = await expandEmbeds("![[a]]", "main.md", vault(notes));
		expect(citedKeys(text)).toEqual(["a", "b"]);
	});

	it("leaves out the embedded note's front matter", async () => {
		const notes = { a: "---\ntitle: [@x]\n---\nBody [@a]." };
		const { text } = await expandEmbeds("![[a]]", "main.md", vault(notes));
		expect(citedKeys(text)).toEqual(["a"]);
	});

	it("keeps an embedded note's footnotes apart from the note's", async () => {
		const notes = { a: "A.[^1]\n\n[^1]: [@a]" };
		const { text } = await expandEmbeds(
			"M.[^1]\n\n![[a]]\n\n[^1]: [@m]",
			"main.md",
			vault(notes)
		);
		expect(
			noteCitations(text).map((c) => [c.citations[0].id, c.noteNumber])
		).toEqual([
			["m", 1],
			["a", 2],
		]);
	});

	it("says when an embed leads nowhere, and not for a picture", async () => {
		const found = await expandEmbeds("![[pic.png]]", "main.md", vault({}));
		expect(found.unresolved).toBe(false);
		expect(found.paths.size).toBe(0);
		const lost = await expandEmbeds("![[gone]] [@a]", "main.md", vault({}));
		expect(lost.unresolved).toBe(true);
		expect(lost.text).toBe("![[gone]] [@a]");
	});
});
