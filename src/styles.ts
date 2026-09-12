import { open, readdir, readFile } from "fs/promises";
import { homedir, platform } from "os";
import { join } from "path";
import { CitationStyle } from "src/types";

/**
 * The citation styles Zotero has, read off disk.
 *
 * Zotero keeps every style it knows — the ones it ships with and the ones the
 * reader installed — as a CSL file under `styles/` in its data directory, and
 * its local server offers no way to ask for the list: the endpoints there are
 * the connector's, the local API's and Better BibTeX's, and not one of them
 * serves styles. So the list is read from the files, which is the same set
 * Zotero's own settings show.
 *
 * Nothing here is on the path of inserting a citation. It runs once, to fill a
 * dropdown, and a Zotero that cannot be found on disk costs the reader the
 * list and nothing else.
 */

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
		profiles = await readdir(join(profileRoot(), "Profiles"), {
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
			return await readFile(
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

/** The text of the first `<tag>` in the style's `<info>` block. */
function element(xml: string, tag: string): string {
	const match = new RegExp("<" + tag + ">([^<]*)</" + tag + ">").exec(xml);
	return match ? decodeEntities(match[1]).trim() : "";
}

/** The five entities XML defines, which is all a style title uses. */
function decodeEntities(text: string): string {
	return text
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/&quot;/g, '"')
		.replace(/&apos;/g, "'")
		// Last, so that an escaped entity is not decoded twice.
		.replace(/&amp;/g, "&");
}

/**
 * A style's id and title, as its CSL file declares them. The id is what Zotero
 * is asked for the style by — a `zotero.org/styles/…` URL for a style it
 * distributes, and a bare UUID for one written by hand.
 */
export function parseStyle(csl: string, path = ""): CitationStyle | null {
	const id = element(csl, "id");
	const title = element(csl, "title");
	return id && title ? { id, title, path } : null;
}

/** The whole of a style's file, which is what citeproc has to be given. */
export async function readStyleFile(style: CitationStyle): Promise<string> {
	return readFile(style.path, "utf8");
}

/**
 * The language Zotero writes citations in.
 *
 * It is the locale set for Zotero's own quick copy, and when that was never
 * set — which is the usual case — the language Zotero itself runs in, which is
 * what Zotero falls back to as well. A style that names a language of its own
 * overrides both; `src/render.ts` puts the three in that order.
 */
export async function zoteroLocale(): Promise<string> {
	const prefs = await readProfilePrefs();
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
async function readHead(path: string): Promise<string | null> {
	let file;
	try {
		file = await open(path);
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
		names = await readdir(dir);
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
