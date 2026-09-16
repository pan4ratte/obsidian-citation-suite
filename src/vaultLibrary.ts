import { App, TFile } from "obsidian";
import { LibraryContents, libraryContents, libraryFormat } from "src/libraryFile";
import { vaultCandidates } from "src/noteStyle";
import type { CslItem } from "src/render";

/**
 * The library files of the vault: found, read, and read again when they change.
 *
 * A note names its own in `bibliography`, as it would for pandoc, and the
 * settings name one for the notes that do not. Either way the file is in the
 * vault, which is what makes this work on a phone: no Zotero to ask, no path
 * outside the vault to resolve, nothing but a file Obsidian already has.
 *
 * Files are read once and kept, since a `.bib` of any size costs real time to
 * parse and a note is rendered again on every keystroke. A file the reader
 * edits — or that a reference manager exports over — is noticed by its
 * modification time and read afresh, and whoever is showing its sources is
 * told, so the note redraws itself.
 */

/** What reading a note's library files came to. */
export interface LibraryItems {
	/** Every source in them, by citation key. */
	items: Map<string, CslItem>;
	/** What could not be read: a file that is missing, or entries that are not. */
	errors: string[];
	/** Whether every file named was found and read. */
	complete: boolean;
}

/** Nothing read, for a note that names no library at all. */
const NOTHING: LibraryItems = { items: new Map(), errors: [], complete: true };

export class VaultLibraries {
	/** What each file held when it was last read, by its path in the vault. */
	private read = new Map<string, { mtime: number; contents: LibraryContents }>();
	/** The files being read, so that two notes asking at once read one. */
	private reading = new Map<string, Promise<void>>();
	private listeners = new Set<() => void>();

	constructor(private app: App) {}

	/** Calls back when a library file changed under a note; answers the unsubscribe. */
	onChange(listener: () => void): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	/** Forgets every file: the settings changed, or the vault was closed. */
	clear(): void {
		this.read.clear();
		this.reading.clear();
	}

	/**
	 * Told when a file of the vault changed. A library among them is forgotten
	 * and whoever shows its sources is told to ask again; anything else — which
	 * is most of what a vault's files do — costs a lookup and nothing more.
	 */
	changed(path: string): void {
		if (this.read.delete(path)) {
			this.listeners.forEach((listener) => listener());
		}
	}

	/**
	 * The file a name stands for, looked for beside the note first and then
	 * from the vault's root, as `vaultCandidates` has it. `null` for a name
	 * that stands for nothing, or for a file that is not a library at all.
	 */
	fileFor(name: string, notePath: string | null): TFile | null {
		for (const candidate of vaultCandidates(name, notePath)) {
			const file = this.app.vault.getFileByPath(candidate);
			if (file && libraryFormat(file.path)) {
				return file;
			}
		}
		return null;
	}

	/** The paths the names stand for, in the order they were named. */
	paths(names: string[], notePath: string | null): string[] {
		return names
			.map((name) => this.fileFor(name, notePath)?.path)
			.filter((path): path is string => path !== undefined);
	}

	/** Whether every one of the files has been read and is still in hand. */
	ready(paths: string[]): boolean {
		return paths.every((path) => this.read.has(path));
	}

	/**
	 * The sources in the files, merged in the order the note named them: where
	 * two files hold one citation key, the last of them is the source cited,
	 * which is the one pandoc would cite.
	 *
	 * Synchronous, and so it answers only from what has been read. `load` is
	 * what reads; a caller that has not called it, or that asks while a file is
	 * being read, is answered with what there is and told it is not all.
	 */
	itemsOf(paths: string[]): LibraryItems {
		if (paths.length === 0) {
			return NOTHING;
		}
		const items = new Map<string, CslItem>();
		const errors: string[] = [];
		let complete = true;
		for (const path of paths) {
			const read = this.read.get(path);
			if (!read) {
				complete = false;
				continue;
			}
			for (const [key, item] of read.contents.items) {
				items.set(key, item);
			}
			errors.push(...read.contents.errors);
		}
		return { items, errors, complete };
	}

	/** Reads whichever of the files is not in hand, and waits for those that are being read. */
	async load(paths: string[]): Promise<void> {
		await Promise.all(paths.map((path) => this.readFile(path)));
	}

	/**
	 * One file, read unless it is in hand and has not been written since. A
	 * file Obsidian no longer has, or cannot read, is left out of what is in
	 * hand rather than remembered as empty: it may be a file still being
	 * written over, and the next pass will find it.
	 */
	private async readFile(path: string): Promise<void> {
		const file = this.app.vault.getFileByPath(path);
		const format = file ? libraryFormat(file.path) : null;
		if (!file || !format) {
			this.read.delete(path);
			return;
		}
		const known = this.read.get(path);
		if (known && known.mtime === file.stat.mtime) {
			return;
		}
		let reading = this.reading.get(path);
		if (!reading) {
			reading = (async (): Promise<void> => {
				const mtime = file.stat.mtime;
				try {
					const text = await this.app.vault.cachedRead(file);
					this.read.set(path, { mtime, contents: libraryContents(text, format) });
				} catch {
					this.read.delete(path);
				}
			})().finally(() => {
				if (this.reading.get(path) === reading) {
					this.reading.delete(path);
				}
			});
			this.reading.set(path, reading);
		}
		await reading;
	}
}
