import { describe, expect, it } from "vitest";
import { ENGLISH_LABELS } from "src/citation";
import { libraryContents } from "src/libraryFile";
import { noteCitations } from "src/noteCitations";
import { NoteRenderer } from "src/noteRendering";
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
