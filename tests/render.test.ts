import { describe, expect, it } from "vitest";
import { libraryContents } from "src/libraryFile";
import {
	CitationRenderer,
	CslItem,
	FileLibraries,
	libraryRefOf,
	ZOTERO_LIBRARY,
} from "src/render";

/**
 * What the renderer keeps of each library's sources.
 *
 * A note reads from Zotero or from the files it names, and two notes open side
 * by side can read from different ones. The same citation key then stands for
 * two different sources, and the one thing that must never happen is a note
 * being written from the other note's library. These hold the bookkeeping to
 * that; what citeproc makes of the items is the business of the tests that run
 * it.
 */

/** The vault's library files, as the renderer is handed them. */
function filesOf(files: Record<string, string>, unreadable: string[] = []): FileLibraries {
	const read = new Map<string, Map<string, CslItem>>();
	return {
		load(paths: string[]): Promise<void> {
			for (const path of paths) {
				const text = files[path];
				if (text !== undefined && !unreadable.includes(path)) {
					read.set(path, libraryContents(text, "bibtex").items);
				}
			}
			return Promise.resolve();
		},
		itemsOf(paths: string[]): { items: Map<string, CslItem>; complete: boolean } {
			const items = new Map<string, CslItem>();
			let complete = true;
			for (const path of paths) {
				const held = read.get(path);
				if (!held) {
					complete = false;
					continue;
				}
				for (const [key, item] of held) {
					items.set(key, item);
				}
			}
			return { items, complete };
		},
	};
}

/** A renderer that knows nothing of Zotero, reading from the files given. */
function rendererOf(files: FileLibraries): CitationRenderer {
	return new CitationRenderer(
		23119,
		[],
		() => Promise.resolve(""),
		{ locale: "", citePaperArticleURLs: false },
		files
	);
}

function bib(key: string, title: string): string {
	return `@article{${key}, title = {${title}}, year = {2020}}`;
}

describe("sources by library", () => {
	it("keeps what a file library answered under that library alone", async () => {
		const renderer = rendererOf(filesOf({ "refs.bib": bib("doe2020", "A paper") }));
		const ref = libraryRefOf(["refs.bib"]);
		await renderer.load(["doe2020"], false, ref);

		expect(renderer.has("doe2020", ref)).toBe(true);
		// Zotero's own knows nothing of it, and must not be asked to pretend.
		expect(renderer.has("doe2020", ZOTERO_LIBRARY)).toBe(false);
	});

	it("tells two libraries holding one key apart", async () => {
		const renderer = rendererOf(
			filesOf({
				"one.bib": bib("shared", "From the first"),
				"two.bib": bib("shared", "From the second"),
			})
		);
		const first = libraryRefOf(["one.bib"]);
		const second = libraryRefOf(["two.bib"]);
		await renderer.load(["shared"], false, first);
		await renderer.load(["shared"], false, second);

		expect(renderer.knownItems(first).get("shared")).toMatchObject({
			title: "From the first",
		});
		expect(renderer.knownItems(second).get("shared")).toMatchObject({
			title: "From the second",
		});
	});

	it("merges the files of one library, the last named winning", async () => {
		const renderer = rendererOf(
			filesOf({
				"one.bib": [bib("shared", "From the first"), bib("only1", "One")].join("\n"),
				"two.bib": bib("shared", "From the second"),
			})
		);
		const ref = libraryRefOf(["one.bib", "two.bib"]);
		await renderer.load(["shared", "only1"], false, ref);

		expect(renderer.knownItems(ref).get("shared")).toMatchObject({
			title: "From the second",
		});
		expect(renderer.has("only1", ref)).toBe(true);
	});
});

describe("a key the library does not have", () => {
	it("is missing when the files were read", async () => {
		const renderer = rendererOf(filesOf({ "refs.bib": bib("doe2020", "A paper") }));
		const ref = libraryRefOf(["refs.bib"]);
		await renderer.load(["nobody2020"], false, ref);

		expect(renderer.missing("nobody2020", ref)).toBe(true);
		expect(renderer.unreachable("nobody2020", ref)).toBe(false);
	});

	it("is only unreached when the file could not be read", async () => {
		// A file being written over by a reference manager, say: the key may
		// be in it, and saying it is missing would mark a citation wrongly.
		const renderer = rendererOf(filesOf({ "refs.bib": bib("doe2020", "A") }, ["refs.bib"]));
		const ref = libraryRefOf(["refs.bib"]);
		await renderer.load(["doe2020"], false, ref);

		expect(renderer.missing("doe2020", ref)).toBe(false);
		expect(renderer.unreachable("doe2020", ref)).toBe(true);
	});

	it("is asked about again once the file can be read", async () => {
		const files = filesOf({ "refs.bib": bib("doe2020", "A paper") }, ["refs.bib"]);
		const renderer = rendererOf(files);
		const ref = libraryRefOf(["refs.bib"]);
		await renderer.load(["doe2020"], false, ref);
		expect(renderer.has("doe2020", ref)).toBe(false);

		// As the pane's refresh button asks, with the file readable now.
		const readable = filesOf({ "refs.bib": bib("doe2020", "A paper") });
		const second = rendererOf(readable);
		await second.load(["doe2020"], true, ref);
		expect(second.has("doe2020", ref)).toBe(true);
	});
});

describe("forgetting the files", () => {
	it("drops what was read from them and leaves Zotero's alone", async () => {
		const renderer = rendererOf(filesOf({ "refs.bib": bib("doe2020", "A paper") }));
		const ref = libraryRefOf(["refs.bib"]);
		await renderer.load(["doe2020"], false, ref);
		expect(renderer.has("doe2020", ref)).toBe(true);

		renderer.forgetFiles();
		expect(renderer.has("doe2020", ref)).toBe(false);
		// Zotero's sources are not read from a file and are not forgotten
		// with one; nothing was put there, and nothing was taken.
		expect(renderer.knownItems(ZOTERO_LIBRARY).size).toBe(0);
	});
});

describe("what a style is rendered against", () => {
	it("says which library every ref it makes reads from", () => {
		const renderer = rendererOf(filesOf({}));
		const ref = libraryRefOf(["refs.bib"]);
		renderer.setFallbackLibrary(ref);
		const style = { id: "apa", title: "APA", path: "/z/apa.csl", source: "zotero" as const };

		expect(renderer.pandocStyle(style, "en-US", "").library).toBe(ref);
		// A note naming its own is given that one instead.
		expect(renderer.pandocStyle(style, "en-US", "", "other.bib").library).toBe(
			"other.bib"
		);
	});
});
