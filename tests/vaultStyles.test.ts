import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { App } from "obsidian";
import { describe, expect, it } from "vitest";
import { vaultStyle, vaultStyles } from "src/vaultStyles";

/** A CSL file that declares itself to be the style named. */
function csl(id: string, title: string): string {
	return `<?xml version="1.0" encoding="utf-8"?>
<style xmlns="http://purl.org/net/xbiblio/csl" class="in-text" version="1.0">
  <info>
    <title>${title}</title>
    <id>${id}</id>
  </info>
  <citation><layout></layout></citation>
</style>`;
}

/** One file of the fake vault: what `vaultStyles` looks at, and no more. */
interface FakeFile {
	path: string;
	extension: string;
	stat: { mtime: number };
}

/** A vault of the files named, as `vaultStyles` reaches it. */
function vaultOf(files: Record<string, string>): App {
	const held = new Map<string, FakeFile>();
	for (const path of Object.keys(files)) {
		const dot = path.lastIndexOf(".");
		held.set(path, {
			path,
			extension: dot < 0 ? "" : path.slice(dot + 1),
			stat: { mtime: 1 },
		});
	}
	return {
		vault: {
			getFiles: (): FakeFile[] => [...held.values()],
			getFileByPath: (path: string): FakeFile | null => held.get(path) ?? null,
			cachedRead: (file: FakeFile): Promise<string> =>
				Promise.resolve(files[file.path] ?? ""),
		},
	} as unknown as App;
}

describe("the styles a vault holds", () => {
	it("reads every .csl file, by title", async () => {
		const app = vaultOf({
			"Styles/zebra.csl": csl("zebra", "Zebra style"),
			"apa.csl": csl("apa", "APA style"),
			"Notes/note.md": "not a style",
		});
		const styles = await vaultStyles(app);
		expect(styles.map((style) => style.title)).toEqual(["APA style", "Zebra style"]);
		expect(styles[0]).toMatchObject({
			id: "apa",
			path: "apa.csl",
			source: "vault",
		});
	});

	it("passes over a .csl file that declares no style", async () => {
		const app = vaultOf({ "broken.csl": "<style><info></info></style>" });
		expect(await vaultStyles(app)).toEqual([]);
	});

	it("knows a style by its file, for the `csl` a note names", async () => {
		const app = vaultOf({ "gost.csl": csl("gost-2018", "ГОСТ Р 7.0.5-2008") });
		const file = app.vault.getFileByPath("gost.csl");
		expect(file).not.toBeNull();
		const style = file ? await vaultStyle(app, file) : null;
		expect(style).toMatchObject({ id: "gost-2018", source: "vault" });
	});
});

/**
 * The plugin loads on a phone only as long as nothing on the path to loading
 * it imports Node. No module imports Node at all: `src/zoteroStyles.ts`, the
 * one that reads the disk, requires what it needs behind
 * `Platform.isDesktopApp` and is itself loaded behind the same guard. A static
 * import anywhere in `src/` would be evaluated with the module that holds it —
 * and reported by Obsidian's plugin review, which reads the source.
 */
describe("what the mobile build may import", () => {
	const NODE = /^\s*import\s[^;]*?from\s+"(node:)?(fs|fs\/promises|os|path|child_process|http|https|net|electron)"/m;

	it("imports Node nowhere", () => {
		const dir = join(__dirname, "..", "src");
		const offenders = readdirSync(dir)
			.filter((name) => name.endsWith(".ts"))
			.filter((name) => NODE.test(readFileSync(join(dir, name), "utf8")));
		expect(offenders).toEqual([]);
	});
});
