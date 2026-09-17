import { App } from "obsidian";
import { describe, expect, it } from "vitest";
import { vaultCandidates } from "src/noteStyle";
import { VaultLibraries, vaultLibraryFiles } from "src/vaultLibrary";

/** One file of the fake vault. */
interface FakeFile {
	path: string;
	stat: { mtime: number };
	text: string;
}

/**
 * A vault of the few files a test needs. Only what `VaultLibraries` reaches is
 * here — finding a file by its path, its modification time, and its text.
 */
function vaultOf(files: Record<string, string>): {
	app: App;
	write(path: string, text: string): void;
} {
	const held = new Map<string, FakeFile>();
	for (const [path, text] of Object.entries(files)) {
		held.set(path, { path, stat: { mtime: 1 }, text });
	}
	const app = {
		vault: {
			getFileByPath: (path: string): FakeFile | null => held.get(path) ?? null,
			getFiles: (): FakeFile[] => [...held.values()],
			cachedRead: (file: FakeFile): Promise<string> => Promise.resolve(file.text),
		},
	} as unknown as App;
	return {
		app,
		write(path, text) {
			const file = held.get(path);
			held.set(path, {
				path,
				stat: { mtime: (file?.stat.mtime ?? 0) + 1 },
				text,
			});
		},
	};
}

/** One entry, under the key, with the title. */
function bib(key: string, title: string): string {
	return `@article{${key}, title = {${title}}, year = {2020}}`;
}

describe("vaultCandidates", () => {
	it("looks beside the note first, then from the vault's root", () => {
		expect(vaultCandidates("refs.bib", "Papers/Note.md")).toEqual([
			"Papers/refs.bib",
			"refs.bib",
		]);
	});

	it("reads a name that starts at the root for what it is", () => {
		expect(vaultCandidates("/Sources/refs.bib", "Papers/Note.md")).toEqual([
			"Sources/refs.bib",
		]);
	});

	it("takes a note in the root, a `./` and a backslash as they are meant", () => {
		expect(vaultCandidates("refs.bib", "Note.md")).toEqual(["refs.bib"]);
		expect(vaultCandidates("./refs.bib", "Papers/Note.md")).toEqual([
			"Papers/refs.bib",
			"refs.bib",
		]);
		expect(vaultCandidates("Sources\\refs.bib", null)).toEqual(["Sources/refs.bib"]);
	});
});

describe("finding a note's library", () => {
	it("takes the file beside the note over the one at the root", () => {
		const { app } = vaultOf({
			"refs.bib": bib("a", "At the root"),
			"Papers/refs.bib": bib("a", "Beside the note"),
		});
		const libraries = new VaultLibraries(app);
		expect(libraries.fileFor("refs.bib", "Papers/Note.md")?.path).toBe("Papers/refs.bib");
		expect(libraries.fileFor("refs.bib", "Other/Note.md")?.path).toBe("refs.bib");
	});

	it("passes over a file that is not a library at all", () => {
		const { app } = vaultOf({ "refs.md": "not a library" });
		expect(new VaultLibraries(app).fileFor("refs.md", null)).toBeNull();
	});

	it("answers with nothing for a name the vault has no file under", () => {
		const { app } = vaultOf({});
		expect(new VaultLibraries(app).fileFor("refs.bib", null)).toBeNull();
	});
});

describe("reading a note's sources", () => {
	it("says it has nothing until the files are read", async () => {
		const { app } = vaultOf({ "refs.bib": bib("a", "A paper") });
		const libraries = new VaultLibraries(app);
		expect(libraries.itemsOf(["refs.bib"]).complete).toBe(false);
		await libraries.load(["refs.bib"]);
		const read = libraries.itemsOf(["refs.bib"]);
		expect(read.complete).toBe(true);
		expect(read.items.get("a")).toMatchObject({ title: "A paper" });
	});

	it("merges the files in the order the note named them, the last winning", async () => {
		const { app } = vaultOf({
			"one.bib": [bib("shared", "From the first"), bib("only1", "Only in one")].join("\n"),
			"two.bib": [bib("shared", "From the second"), bib("only2", "Only in two")].join("\n"),
		});
		const libraries = new VaultLibraries(app);
		await libraries.load(["one.bib", "two.bib"]);
		const { items } = libraries.itemsOf(["one.bib", "two.bib"]);
		expect(items.get("shared")).toMatchObject({ title: "From the second" });
		expect([...items.keys()].sort()).toEqual(["only1", "only2", "shared"]);
	});

	it("reads a CSL JSON file and a .bib alike", async () => {
		const { app } = vaultOf({
			"refs.json": JSON.stringify([{ id: "a", title: "From JSON" }]),
		});
		const libraries = new VaultLibraries(app);
		await libraries.load(["refs.json"]);
		expect(libraries.itemsOf(["refs.json"]).items.get("a")).toMatchObject({
			title: "From JSON",
		});
	});
});

describe("a library file that changed", () => {
	it("is read again, and whoever shows it is told", async () => {
		const vault = vaultOf({ "refs.bib": bib("a", "As it was") });
		const libraries = new VaultLibraries(vault.app);
		let told = 0;
		libraries.onChange(() => (told += 1));
		await libraries.load(["refs.bib"]);

		vault.write("refs.bib", bib("a", "As it is now"));
		libraries.changed("refs.bib");
		expect(told).toBe(1);
		expect(libraries.itemsOf(["refs.bib"]).complete).toBe(false);

		await libraries.load(["refs.bib"]);
		expect(libraries.itemsOf(["refs.bib"]).items.get("a")).toMatchObject({
			title: "As it is now",
		});
	});

	it("says nothing about a file of the vault that is not a library", async () => {
		const vault = vaultOf({ "refs.bib": bib("a", "A paper") });
		const libraries = new VaultLibraries(vault.app);
		let told = 0;
		libraries.onChange(() => (told += 1));
		await libraries.load(["refs.bib"]);
		libraries.changed("Some/Note.md");
		expect(told).toBe(0);
		expect(libraries.itemsOf(["refs.bib"]).complete).toBe(true);
	});

	it("reads a file again once it has been written, and not before", async () => {
		const vault = vaultOf({ "refs.bib": bib("a", "As it was") });
		const libraries = new VaultLibraries(vault.app);
		await libraries.load(["refs.bib"]);
		// Nothing was written, so the second pass reads nothing and the item
		// it has stands.
		await libraries.load(["refs.bib"]);
		expect(libraries.itemsOf(["refs.bib"]).items.get("a")).toMatchObject({
			title: "As it was",
		});
	});
});

describe("vaultLibraryFiles", () => {
	it("finds the vault's .bib files by their extension, by path", () => {
		// By the collator, as the styles are listed: `a.bibtex` before
		// `Sources/`, which is not what comparing the strings would give.
		const { app } = vaultOf({
			"Sources/refs.bib": bib("doe2020", "A paper"),
			"a.bibtex": bib("kuhn1962", "Another"),
			"Note.md": "# not a library",
		});
		return expect(vaultLibraryFiles(app)).resolves.toEqual([
			"a.bibtex",
			"Sources/refs.bib",
		]);
	});

	it("takes a .json file that is a CSL JSON export", () => {
		const { app } = vaultOf({
			"refs.json": '[{"id": "doe2020", "title": "A paper"}]',
			"empty.json": "  [ ]  ",
		});
		return expect(vaultLibraryFiles(app)).resolves.toEqual([
			"empty.json",
			"refs.json",
		]);
	});

	it("leaves the other things a vault keeps under .json alone", () => {
		const { app } = vaultOf({
			"Canvas.json": '{"nodes": [], "edges": []}',
			"data.json": '["a", "b"]',
			"broken.json": "{ not json at all",
		});
		return expect(vaultLibraryFiles(app)).resolves.toEqual([]);
	});
});
