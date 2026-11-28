// The demo vault the README screenshots are taken in: the chapters of the
// author's thesis, copied, with the few deliberate edits the shots need. Every
// step here can run again on a prepared vault and changes nothing the second
// time. The original thesis is only ever read. See docs/screenshots.md.
import {
	copyFileSync,
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	writeFileSync,
} from "node:fs";
import { homedir, platform } from "node:os";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const LOCAL_CONFIG = join(dirname(fileURLToPath(import.meta.url)), "config.local.json");

/** What the shots rely on finding in the thesis and in Zotero. */
export const DEMO = {
	chapterFolders: ["Chapters Translated", "Chapters in Russian"],
	/** The chapter every shot is taken in. */
	chapter: "Chapters Translated/Chapter 3. What is Political Theology (EN).md",
	/** The Zotero group the thesis cites from, and its collection for the chapter. */
	library: "Stellenbosch Thesis",
	collection: "Ch. 3: What is \"Political Theology\"?",
	/** A key Better BibTeX "renamed": the chapter cites the old one. */
	renamed: { old: "kim2011", current: "kimTheologyPublicSphere2011", locator: "pp. 3–4" },
	/** A key with a typo, for the wavy underline. */
	typo: { from: "smitWhatDoesPublic2007", to: "smitWhatDoesPublc2007" },
	/** The style the phone shot reads from the vault, a phone having no Zotero. */
	style: "chicago-notes-bibliography.csl",
	bib: "Thesis.bib",
};

/**
 * Where the vault is, and where the thesis it is made from is: the local
 * config (git-ignored, since the paths are the author's own) or the
 * environment, with the vault defaulting to Documents/Obsidian.
 */
export function locations() {
	const local = existsSync(LOCAL_CONFIG) ? JSON.parse(readFileSync(LOCAL_CONFIG, "utf8")) : {};
	return {
		vault:
			process.env.CITATION_SUITE_DEMO_VAULT ??
			local.vault ??
			join(homedir(), "Documents", "Obsidian", "Citation Suite Demo"),
		thesis: process.env.CITATION_SUITE_DEMO_THESIS ?? local.thesis ?? null,
	};
}

/** The folder in the vault holding the thesis chapters. */
export function thesisFolder(vault) {
	const folder = readdirSync(vault, { withFileTypes: true }).find(
		(entry) => entry.isDirectory() && existsSync(join(vault, entry.name, DEMO.chapterFolders[0]))
	);
	if (!folder) throw new Error(`no thesis chapters in ${vault}`);
	return folder.name;
}

async function rpc(method, params) {
	const response = await fetch("http://127.0.0.1:23119/better-bibtex/json-rpc", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ jsonrpc: "2.0", method, params, id: 1 }),
	});
	const body = await response.json();
	if (body.error) throw new Error(`${method}: ${body.error.message}`);
	return body.result;
}

function zoteroStylesDir() {
	const profiles =
		platform() === "win32"
			? join(process.env.APPDATA ?? "", "Zotero", "Zotero", "Profiles")
			: platform() === "darwin"
				? join(homedir(), "Library", "Application Support", "Zotero", "Profiles")
				: join(homedir(), ".zotero", "zotero");
	if (existsSync(profiles)) {
		for (const profile of readdirSync(profiles)) {
			const prefs = join(profiles, profile, "prefs.js");
			if (!existsSync(prefs)) continue;
			const match = readFileSync(prefs, "utf8").match(/"extensions\.zotero\.dataDir",\s*"([^"]+)"/);
			if (match) return join(match[1].replace(/\\\\/g, "\\"), "styles");
		}
	}
	return join(homedir(), "Zotero", "styles");
}

/**
 * Copies a folder's files over another's. Not `cpSync`: on Windows it fails
 * with ESRCH on some paths (this one has an apostrophe in it) where
 * `copyFileSync` copies the same file without complaint.
 */
function copyTree(from, to, skip = () => false) {
	mkdirSync(to, { recursive: true });
	for (const entry of readdirSync(from, { withFileTypes: true })) {
		if (skip(entry.name)) continue;
		const source = join(from, entry.name);
		const target = join(to, entry.name);
		if (entry.isDirectory()) copyTree(source, target, skip);
		else copyFileSync(source, target);
	}
}

function edit(path, change) {
	const text = readFileSync(path, "utf8");
	const next = change(text);
	if (next !== text) writeFileSync(path, next);
}

/** The keys a note cites, as the plugin reads them closely enough for an export. */
function citedKeys(text) {
	return [...new Set([...text.matchAll(/@([A-Za-z][\w:.-]*\w)/g)].map((m) => m[1]))];
}

export async function prepareVault() {
	const { vault, thesis } = locations();
	if (!existsSync(vault) && !thesis) {
		throw new Error(
			`The demo vault ${vault} does not exist. Set "thesis" in ${LOCAL_CONFIG} ` +
				"(or CITATION_SUITE_DEMO_THESIS) to the thesis folder it is made from."
		);
	}
	// The chapters are copied afresh on every run when the thesis is at hand,
	// so a run that stopped halfway never leaves its typing in the next one.
	if (thesis) {
		for (const folder of DEMO.chapterFolders) {
			copyTree(join(thesis, folder), join(vault, basename(thesis), folder), (name) => /\.md\.bak-/.test(name));
		}
	}
	const config = join(vault, ".obsidian");
	const pluginDir = join(config, "plugins", "citation-suite");
	mkdirSync(pluginDir, { recursive: true });

	// The plugin as just built.
	for (const file of ["main.js", "manifest.json", "styles.css"]) {
		copyFileSync(join(REPO, file), join(pluginDir, file));
	}
	const { version } = JSON.parse(readFileSync(join(REPO, "manifest.json"), "utf8"));

	// The look: Neo on the dark base, copied from the vault the repo lives in.
	const neo = join(REPO, "..", "..", "themes", "Neo");
	if (!existsSync(neo)) throw new Error(`the Neo theme is not at ${neo}`);
	copyTree(neo, join(config, "themes", "Neo"));
	writeFileSync(join(config, "appearance.json"), JSON.stringify({ theme: "obsidian", cssTheme: "Neo" }));
	writeFileSync(
		join(config, "app.json"),
		JSON.stringify({ nativeMenus: false, promptDelete: false, propertiesInDocument: "hidden" })
	);
	writeFileSync(join(config, "community-plugins.json"), JSON.stringify(["citation-suite"]));
	writeFileSync(
		join(pluginDir, "data.json"),
		JSON.stringify(
			{
				citationStyle: "http://www.zotero.org/styles/chicago-notes-bibliography",
				citationColor: "accent",
				citationUnderline: "none",
				citationBold: false,
				citationItalic: false,
				libraryFile: "",
				footnotes: false,
				footnotePrefix: "",
				footnotePopover: true,
				noteFootnotes: {},
				dismissedChangelogVersion: version,
			},
			null,
			"\t"
		)
	);

	// The thesis is in English but Zotero's Quick Copy language may not be:
	// the note's own `lang` is what the plugin follows first.
	const folder = join(vault, thesisFolder(vault));
	for (const name of readdirSync(join(folder, DEMO.chapterFolders[0]))) {
		if (!name.startsWith("Chapter ")) continue;
		edit(join(folder, DEMO.chapterFolders[0], name), (text) =>
			text.startsWith("---") && !/^lang:/m.test(text)
				? text.replace(/^---(\r?\n)/, "---$1lang: en-US$1")
				: text
		);
	}
	const chapter = join(folder, DEMO.chapter);
	const { renamed, typo } = DEMO;
	edit(chapter, (text) =>
		text
			.replace(`[@${renamed.current}, ${renamed.locator}]`, `[@${renamed.old}, ${renamed.locator}]`)
			.replace(`[@${typo.from}]`, `[@${typo.to}]`)
	);

	// The rename: the key index remembers the old key for the item that now
	// has the new one, as it would have before Better BibTeX changed it.
	const groups = await rpc("user.groups", []);
	const holders = await rpc("item.search", [[["citationKey", "is", renamed.current]]]);
	const libraryOf = (item) => groups.find((group) => group.name === item.library);
	const holder = holders
		.filter((item) => item.citekey === renamed.current && libraryOf(item))
		.sort((a, b) => groups.indexOf(libraryOf(a)) - groups.indexOf(libraryOf(b)))[0];
	if (!holder) throw new Error(`Zotero has no ${renamed.current}`);
	const pair = [renamed.old, `${libraryOf(holder).id}:${holder.id.split("/").pop()}`];
	const indexFile = join(pluginDir, "citation-keys.json");
	const index = existsSync(indexFile)
		? JSON.parse(readFileSync(indexFile, "utf8"))
		: { version: 1, swept: Date.now(), keys: [] };
	index.keys = index.keys.filter(([key]) => key !== renamed.old).concat([pair]);
	index.swept = Date.now();
	writeFileSync(indexFile, JSON.stringify(index));

	// What the phone reads: the chapter's sources and a style, in the vault.
	const keys = citedKeys(readFileSync(chapter, "utf8"))
		.filter((key) => key !== renamed.old && key !== typo.to)
		.concat(renamed.current);
	const group = groups.find((g) => g.name === DEMO.library);
	// The whole group, filtered here: a condition group to OR the keys inside
	// a library is Zotero 10's, and Zotero 7 to 9 refuse it.
	const inGroup = await rpc("item.search", [[["libraryID", "is", group.id]]]);
	const exportable = [...new Set(inGroup.map((item) => item.citekey))].filter((key) => keys.includes(key));
	const bib = await rpc("item.export", [exportable, "Better BibTeX", group.id]);
	writeFileSync(join(vault, DEMO.bib), typeof bib === "string" ? bib : bib[2]);
	copyFileSync(join(zoteroStylesDir(), DEMO.style), join(vault, DEMO.style));

	// The `zotero://select` link to the chapter's collection names the group
	// by its Zotero id, which only an item's URI carries.
	const groupId = inGroup.find((item) => /\/groups\/\d+\//.test(item.id))?.id.match(/\/groups\/(\d+)\//)[1];
	const collections = (await rpc("user.groups", [true])).find((g) => g.id === group.id).collections;
	const collection = collections.find((c) => c.name === DEMO.collection);
	if (!groupId || !collection) throw new Error(`no collection "${DEMO.collection}" in ${DEMO.library}`);

	return {
		vault,
		folder: basename(folder),
		collectionLink: `zotero://select/groups/${groupId}/collections/${collection.key}`,
	};
}
