import { describe, expect, it } from "vitest";
import { ENGLISH_LABELS } from "src/citation";
import { libraryContents } from "src/libraryFile";
import { noteCitations } from "src/noteCitations";
import { documentKey, NoteRenderer } from "src/noteRendering";
import {
	CitationRenderer,
	CslItem,
	FileLibraries,
	libraryRefOf,
	StyleRef,
	ZOTERO_LIBRARY,
} from "src/render";

/**
 * Writing a whole note, which is where the engine is given its sources.
 *
 * The queue works through the notes open a slice at a time, and two of them
 * can read from different libraries — one from Zotero, one from a file in the
 * vault. citeproc asks for each source as it registers it, with no way to be
 * handed one, so the task being stepped has to say where it reads from; the
 * note whose sources are registered from the wrong library is written as a
 * note citing sources nothing is known about.
 */

const STYLE = `<?xml version="1.0" encoding="utf-8"?>
<style xmlns="http://purl.org/net/xbiblio/csl" class="in-text" version="1.0" default-locale="en-US">
	<info>
		<title>Numbered test style</title>
		<id>test-numbered</id>
		<category citation-format="numeric"/>
		<updated>2026-01-01T00:00:00+00:00</updated>
	</info>
	<citation>
		<layout prefix="[" suffix="]" delimiter=", ">
			<text variable="citation-number"/>
		</layout>
	</citation>
	<bibliography>
		<layout>
			<group delimiter=". ">
				<text variable="citation-number" prefix="[" suffix="]"/>
				<names variable="author"><name/></names>
				<text variable="title"/>
			</group>
		</layout>
	</bibliography>
</style>`;

const REFS = `@book{doe2020,
	author = {Doe, Jane},
	title = {A book in the vault},
	year = {2020},
}`;

/** The vault's library files, holding the one `.bib` above. */
function filesOf(): FileLibraries {
	const items = libraryContents(REFS, "bibtex").items;
	return {
		load(): Promise<void> {
			return Promise.resolve();
		},
		itemsOf(paths: string[]): { items: Map<string, CslItem>; complete: boolean } {
			return {
				items: paths.includes("refs.bib") ? items : new Map<string, CslItem>(),
				complete: true,
			};
		},
	};
}

describe("a note that reads from a file in the vault", () => {
	it("writes its bibliography from that file, whatever was rendered last", async () => {
		// The queue schedules its next slice through the window Obsidian runs
		// in; the tests run in Node, which has none.
		(global as unknown as { window: unknown }).window = global;

		const renderer = new CitationRenderer(
			23119,
			[],
			() => Promise.resolve(STYLE),
			{ locale: "", citePaperArticleURLs: false },
			filesOf()
		);
		const library = libraryRefOf(["refs.bib"]);
		const style: StyleRef = {
			key: "test-numbered|en-US",
			style: {
				id: "test-numbered",
				title: "Numbered test style",
				path: "test.csl",
				source: "vault",
			},
			locale: "",
			labels: ENGLISH_LABELS,
			library,
		};
		const notes = new NoteRenderer(renderer);
		const citations = noteCitations("A note citing [@doe2020].");

		// A note of Zotero's was the last thing written, so that is the
		// library citeproc would be asked for this note's sources from.
		renderer.reading(ZOTERO_LIBRARY);
		const bibliography = await notes.bibliography(style, "note.md", citations);

		expect(bibliography?.text.join("")).toContain("A book in the vault");
	});
});

describe("a citation with the author in the text", () => {
	const AUTHOR_DATE = `<?xml version="1.0" encoding="utf-8"?>
<style xmlns="http://purl.org/net/xbiblio/csl" class="in-text" version="1.0" default-locale="en-US">
	<info><title>Author-date test style</title><id>test-author-date</id><updated>2026-01-01T00:00:00+00:00</updated></info>
	<citation><layout prefix="(" suffix=")" delimiter="; ">
		<group delimiter=", "><names variable="author"><name form="short"/></names><date variable="issued"><date-part name="year"/></date><text variable="locator"/></group>
	</layout></citation>
</style>`;

	const NOTES = `<?xml version="1.0" encoding="utf-8"?>
<style xmlns="http://purl.org/net/xbiblio/csl" class="note" version="1.0" default-locale="en-US">
	<info><title>Note test style</title><id>test-notes</id><updated>2026-01-01T00:00:00+00:00</updated></info>
	<citation><layout suffix="."><group delimiter=", ">
		<names variable="author"><name form="short"/></names><text variable="title" font-style="italic"/>
	</group></layout></citation>
</style>`;

	/** The note's citations as the style writes them, `null` for one left as written. */
	async function written(csl: string, id: string, text: string): Promise<(string | null)[]> {
		(global as unknown as { window: unknown }).window = global;
		const renderer = new CitationRenderer(
			23119,
			[],
			() => Promise.resolve(csl),
			{ locale: "", citePaperArticleURLs: false },
			filesOf()
		);
		const style: StyleRef = {
			key: id,
			style: { id, title: id, path: `${id}.csl`, source: "vault" },
			locale: "",
			labels: ENGLISH_LABELS,
			library: libraryRefOf(["refs.bib"]),
		};
		const note = await new NoteRenderer(renderer).render(style, "note.md", noteCitations(text));
		return note?.rendered.map((citation) => citation?.html ?? null) ?? [];
	}

	it("names the author before the rest, and leaves a key nothing is known about as written", async () => {
		expect(
			await written(
				AUTHOR_DATE,
				"test-author-date",
				"@doe2020 [33] says, as [@doe2020] did; ask @someone."
			)
		).toEqual(["Doe (2020, 33)", "(Doe, 2020)", null]);
	});

	it("names the author in the body of a note style, and cites as any note does in a footnote", async () => {
		expect(
			await written(NOTES, "test-notes", "@doe2020 says.[^1]\n\n[^1]: As @doe2020 did.")
		).toEqual(["Doe <i>A book in the vault</i>.", "Doe, <i>A book in the vault</i>."]);
	});
});

describe("the text cards of a canvas", () => {
	// Obsidian draws every card of a canvas with the canvas's path, and draws
	// them all at once when the canvas opens (issue #3).
	const TITLES = `<?xml version="1.0" encoding="utf-8"?>
<style xmlns="http://purl.org/net/xbiblio/csl" class="in-text" version="1.0" default-locale="en-US">
	<info><title>Title test style</title><id>test-titles</id><updated>2026-01-01T00:00:00+00:00</updated></info>
	<citation><layout prefix="(" suffix=")"><text variable="title"/></layout></citation>
</style>`;

	const TWO = `@book{doe2020,
	author = {Doe, Jane},
	title = {The first book},
	year = {2020},
}
@book{roe2021,
	author = {Roe, Richard},
	title = {The second book},
	year = {2021},
}`;

	/** Both cards written at once, each with what the renderer is told is its key. */
	async function cards(keyOf: (text: string) => string): Promise<(string | null)[][]> {
		(global as unknown as { window: unknown }).window = global;
		const items = libraryContents(TWO, "bibtex").items;
		const renderer = new CitationRenderer(
			23119,
			[],
			() => Promise.resolve(TITLES),
			{ locale: "", citePaperArticleURLs: false },
			{
				load: () => Promise.resolve(),
				itemsOf: () => ({ items, complete: true }),
			}
		);
		const style: StyleRef = {
			key: "test-titles",
			style: { id: "test-titles", title: "test-titles", path: "t.csl", source: "vault" },
			locale: "",
			labels: ENGLISH_LABELS,
			library: libraryRefOf(["refs.bib"]),
		};
		const notes = new NoteRenderer(renderer);
		const texts = ["See [@doe2020].", "See [@roe2021]."];
		const written = await Promise.all(
			texts.map((text) => notes.render(style, keyOf(text), noteCitations(text)))
		);
		return written.map(
			(note) => note?.rendered.map((citation) => citation?.html ?? null) ?? []
		);
	}

	it("writes each card as a document of its own", async () => {
		expect(await cards((text) => documentKey("board.canvas", text))).toEqual([
			["(The first book)"],
			["(The second book)"],
		]);
	});

	it("never hands one card what the other cites, kept under the one path", async () => {
		const [first, second] = await cards(() => "board.canvas");
		expect(first).not.toEqual(["(The second book)"]);
		expect(second).toEqual(["(The second book)"]);
	});

	it("keeps a note under its path, whatever part of it asks", () => {
		expect(documentKey("folder/note.md", "a block")).toBe("folder/note.md");
	});
});
