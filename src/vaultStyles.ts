import { App, TFile } from "obsidian";
import { parseStyle } from "src/styles";
import { CitationStyle } from "src/types";

/**
 * The citation styles kept in the vault.
 *
 * A style file put in the vault is read through Obsidian rather than off the
 * disk, which is what makes it the one kind of style a phone can have — and on
 * a desktop it sits beside Zotero's own, for a style written for one vault and
 * not installed anywhere.
 *
 * It is also how a note's `csl` property has always been meant to work: pandoc
 * reads the file the note names from the note's own folder, and that file is
 * in the vault. `src/noteStyles.ts` looks here first for that reason.
 */

/** How much of a style file is looked at: its `<info>` block and no more. */
const INFO_CHARS = 8192;

/** Every `.csl` file the vault holds. */
function styleFiles(app: App): TFile[] {
	return app.vault.getFiles().filter((file) => file.extension.toLowerCase() === "csl");
}

/**
 * The style a vault file declares itself to be, or `null` for a file that
 * declares neither an id nor a title — which is not a style, whatever it is.
 *
 * Obsidian reads a whole file at a time, so a style is read whole and the head
 * of it taken; `cachedRead` is what keeps that from costing anything the second
 * time. Zotero's copy is read a few kilobytes at a time instead, since there
 * are hundreds of those and nothing caches them.
 */
export async function vaultStyle(app: App, file: TFile): Promise<CitationStyle | null> {
	try {
		const text = await app.vault.cachedRead(file);
		return parseStyle(text.slice(0, INFO_CHARS), file.path, "vault");
	} catch {
		return null;
	}
}

/** Every style the vault holds, by title, as the settings list them. */
export async function vaultStyles(app: App): Promise<CitationStyle[]> {
	const found = await Promise.all(
		styleFiles(app).map((file) => vaultStyle(app, file))
	);
	const styles = found.filter((style): style is CitationStyle => style !== null);
	// By title, with the collator, as `installedStyles` sorts Zotero's.
	return styles.sort((a, b) => a.title.localeCompare(b.title));
}

/** The whole of a vault style's file, which is what citeproc has to be given. */
export function readVaultStyle(app: App, style: CitationStyle): Promise<string> {
	const file = app.vault.getFileByPath(style.path);
	if (!file) {
		return Promise.reject(new Error(`no style at ${style.path}`));
	}
	return app.vault.cachedRead(file);
}
