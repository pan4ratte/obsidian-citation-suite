import { App, FileSystemAdapter } from "obsidian";
import type { StyleFiles } from "src/noteStyles";
import { onDesktop } from "src/desktop";
import { parseStyle, ZoteroCitePrefs } from "src/styles";
import { CitationStyle } from "src/types";

/**
 * What is read off the disk: the citation styles Zotero has, and the
 * preferences it writes citations by.
 *
 * Zotero keeps every style it knows — the ones it ships with and the ones the
 * reader installed — as a CSL file under `styles/` in its data directory, and
 * its local server offers no way to ask for the list: the endpoints there are
 * the connector's, the local API's and Better BibTeX's, and not one of them
 * serves styles. So the list is read from the files, which is the same set
 * Zotero's own settings show.
 *
 * This is the one module that reaches for a file system, and a phone has none.
 * `src/main.ts` loads it only where there is one, and everything it answers
 * has an answer for a phone that does without it: no styles of Zotero's, and
 * Zotero's preferences at their defaults. Nothing here is on the path of
 * writing a citation — it runs once, to fill a dropdown.
 */

/**
 * Node's modules, taken at the moment one is first needed rather than imported
 * at the top of the file.
 *
 * An import at the top is evaluated by the act of loading the module, which is
 * why the whole of this one is loaded behind `onDesktop()` — and the
 * guard is repeated here because the guard elsewhere cannot be seen from here:
 * what reads this file, a reader or Obsidian's plugin review, sees a file that
 * reaches for Node and nothing of what decides whether it is loaded.
 */
type NodeFs = typeof import("fs/promises");
type NodeOs = typeof import("os");
type NodePath = typeof import("path");

/** One of Node's modules, on a desktop. On a phone there is nothing to answer with. */
function nodeModule<T>(name: string): T {
	if (!onDesktop()) {
		throw new Error(`Citation Suite: ${name} is desktop-only`);
	}
	// eslint-disable-next-line @typescript-eslint/no-require-imports -- an import is what has to be avoided: it would be evaluated on a phone, which has none of these modules
	const module = require(name) as T | null;
	// Obsidian answers `null` for a Node package rather than throwing wherever
	// it has decided a plugin may not have one. Reading a function off that is
	// the error a reader sees ("Cannot read properties of null"), so it is
	// refused here, where what went wrong can still be said.
	if (!module) {
		throw new Error(`Citation Suite: ${name} could not be loaded`);
	}
	return module;
}

let fsModule: NodeFs | null = null;
let osModule: NodeOs | null = null;
let pathModule: NodePath | null = null;

/** `fs/promises`, `os` and `path`: required once, then kept. */
const fs = (): NodeFs => (fsModule ??= nodeModule<NodeFs>("fs/promises"));
const os = (): NodeOs => (osModule ??= nodeModule<NodeOs>("os"));
const path = (): NodePath => (pathModule ??= nodeModule<NodePath>("path"));

// The five the rest of the file reads as though they had been imported.
function join(...parts: string[]): string {
	return path().join(...parts);
}

function dirname(of: string): string {
	return path().dirname(of);
}

function isAbsolute(of: string): boolean {
	return path().isAbsolute(of);
}

function homedir(): string {
	return os().homedir();
}

function platform(): string {
	return os().platform();
}

/**
 * How much of a style file is read. A CSL file opens with its `<info>` block,
 * where the id and the title are; the longest of the styles Zotero ships closes
 * that block inside 2 KB, and the rest of the file — up to 240 KB of formatting
 * rules — has nothing in it this needs.
 */
const INFO_BYTES = 8192;

/**
 * Zotero's profile directory — its preferences, not its data. The two are
 * separate, and this one is only read to find out where the other is.
 */
function profileRoot(): string {
	const home = homedir();
	switch (platform()) {
		case "win32":
			return join(
				process.env.APPDATA ?? join(home, "AppData", "Roaming"),
				"Zotero",
				"Zotero"
			);
		case "darwin":
			return join(home, "Library", "Application Support", "Zotero");
		default:
			return join(home, ".zotero", "zotero");
	}
}

/**
 * Zotero's preferences file, as text. The first profile that has one answers:
 * a second profile is a thing Zotero supports and almost nobody has, and the
 * alternative is asking the reader which of them Obsidian should follow.
 */
async function readProfilePrefs(): Promise<string> {
	let profiles;
	try {
		profiles = await fs().readdir(join(profileRoot(), "Profiles"), {
			withFileTypes: true,
		});
	} catch {
		return "";
	}

	for (const profile of profiles) {
		if (!profile.isDirectory()) {
			continue;
		}
		try {
			return await fs().readFile(
				join(profileRoot(), "Profiles", profile.name, "prefs.js"),
				"utf8"
			);
		} catch {
			continue;
		}
	}
	return "";
}

/**
 * One `extensions.zotero.…` preference, or nothing when Zotero has not written
 * it — which is what it does with every preference still at its default.
 */
function prefValue(prefs: string, name: string): string | null {
	const pattern = new RegExp(
		'user_pref[(]"' + name.replace(/[.]/g, "[.]") + '", *("[^"]*")[)]'
	);
	const match = pattern.exec(prefs);
	if (!match) {
		return null;
	}
	// The value is a JavaScript string literal, so a Windows path arrives with
	// its separators doubled.
	try {
		return JSON.parse(match[1]) as string;
	} catch {
		return null;
	}
}

/** Zotero's data directory: `~/Zotero`, unless the reader moved it. */
export async function zoteroDataDir(): Promise<string> {
	const prefs = await readProfilePrefs();
	const configured = prefs ? prefValue(prefs, "extensions.zotero.dataDir") : null;
	return configured ?? join(homedir(), "Zotero");
}


/** The whole of a style's file, which is what citeproc has to be given. */
export async function readStyleFile(style: CitationStyle): Promise<string> {
	return fs().readFile(style.path, "utf8");
}

/** A `true`/`false` preference, or nothing when Zotero has not written it. */
function boolPrefValue(prefs: string, name: string): boolean | null {
	const pattern = new RegExp(
		'user_pref[(]"' + name.replace(/[.]/g, "[.]") + '", *(true|false)[)]'
	);
	const match = pattern.exec(prefs);
	return match ? match[1] === "true" : null;
}

/** The preferences Zotero writes citations by, read off its profile. */
export async function zoteroCitePrefs(): Promise<ZoteroCitePrefs> {
	const prefs = await readProfilePrefs();
	return {
		locale: localeFromPrefs(prefs),
		citePaperArticleURLs:
			boolPrefValue(
				prefs,
				"extensions.zotero.export.citePaperJournalArticleURL"
			) ?? false,
	};
}

/**
 * The language Zotero writes citations in.
 *
 * It is the locale set for Zotero's own quick copy, and when that was never
 * set — which is the usual case — the language Zotero itself runs in, which is
 * what Zotero falls back to as well. A style that names a language of its own
 * overrides both; `src/render.ts` puts the three in that order.
 */
function localeFromPrefs(prefs: string): string {
	if (!prefs) {
		return "";
	}
	return (
		prefValue(prefs, "extensions.zotero.export.quickCopy.locale") ??
		prefValue(prefs, "intl.locale.requested") ??
		""
	);
}

/** The head of one style file, or nothing if it cannot be read. */
export async function readHead(filePath: string): Promise<string | null> {
	let file;
	try {
		file = await fs().open(filePath);
	} catch {
		return null;
	}
	try {
		const buffer = Buffer.alloc(INFO_BYTES);
		const { bytesRead } = await file.read(buffer, 0, INFO_BYTES, 0);
		return buffer.toString("utf8", 0, bytesRead);
	} catch {
		return null;

	} finally {
		await file.close();
	}
}

/**
 * Every style Zotero has, by title. An empty list is Zotero not being where it
 * was looked for, or having no styles there — both leave the dropdown with the
 * pandoc entry alone, which is the setting's default anyway.
 */
export async function installedStyles(): Promise<CitationStyle[]> {
	const dir = join(await zoteroDataDir(), "styles");
	let names: string[];
	try {
		names = await fs().readdir(dir);
	} catch {
		return [];
	}

	const styles: CitationStyle[] = [];
	for (const name of names) {
		if (!name.endsWith(".csl")) {
			continue;
		}
		const head = await readHead(join(dir, name));
		const style = head ? parseStyle(head, join(dir, name)) : null;
		if (style) {
			styles.push(style);
		}
	}
	// By title, the way the reader will look for one in the dropdown, and with
	// the collator so that a Russian title sorts where a Russian reader expects.
	return styles.sort((a, b) => a.title.localeCompare(b.title));
}


/** pandoc's user data directories: the ones it reads `csl/` from. */
function pandocDataDirs(): string[] {
	const home = homedir();
	if (platform() === "win32") {
		return [join(process.env.APPDATA ?? join(home, "AppData", "Roaming"), "pandoc")];
	}
	return [
		join(process.env.XDG_DATA_HOME ?? join(home, ".local", "share"), "pandoc"),
		join(home, ".pandoc"),
	];
}

/**
 * Where a note's `csl` is looked for outside the vault, for
 * `src/noteStyles.ts`: the folders pandoc runs in — Pandoc GUI runs it in the
 * note's folder, with the vault among its resource paths — and pandoc's own
 * data directories. All of it is the disk, and so all of it is here.
 */
export function styleFiles(app: App): StyleFiles {
	return {
		folders(notePath: string): string[] {
			const adapter = app.vault.adapter;
			const vault =
				adapter instanceof FileSystemAdapter ? adapter.getBasePath() : "";
			return vault ? [join(vault, dirname(notePath)), vault] : [];
		},
		dataDirs: pandocDataDirs,
		readHead,
		join,
		isAbsolute,
	};
}
