import { App, debounce, normalizePath } from "obsidian";
import { citedKeysOfFile, ItemRef, KeyIndex } from "src/keyIndex";

/**
 * The key index (`src/keyIndex.ts`) on disk, and the sweep that keeps it to
 * the keys the vault cites.
 *
 * It is a file of its own in the plugin's folder, not part of `data.json`:
 * it is not a setting, it grows with the vault, and it is written whenever a
 * source is looked up for the first time, which the settings are not. It is
 * kept on a desktop only, since a phone has no Zotero to look anything up in.
 */

/** The file's name, in the plugin's folder. */
const FILE_NAME = "citation-keys.json";

/** How long a change waits for others before the file is written. */
const SAVE_DELAY = 2000;

/** How many files the sweep reads before it gives the window a turn. */
const SWEEP_BATCH = 20;

export class KeyIndexFile {
	private index = new KeyIndex();
	private readonly path: string;
	/** Whether something was changed since the file was last written. */
	private dirty = false;
	private sweeping = false;
	private stopped = false;
	private save = debounce(() => void this.write(), SAVE_DELAY, true);

	constructor(
		private app: App,
		/** The plugin's folder, inside the vault's config folder. */
		folder: string
	) {
		this.path = normalizePath(`${folder}/${FILE_NAME}`);
	}

	/**
	 * Reads the file, if there is one. A file that cannot be read or parsed
	 * leaves the index empty, to be filled again as sources are looked up: what
	 * it held is a convenience for later, and no reason for the plugin to fail.
	 */
	async load(): Promise<void> {
		const adapter = this.app.vault.adapter;
		try {
			if (!(await adapter.exists(this.path))) {
				return;
			}
			this.index = KeyIndex.fromData(JSON.parse(await adapter.read(this.path)));
		} catch (error) {
			console.error("Citation Suite: the citation key index could not be read", error);
		}
	}

	/** Remembers the item a key was just found for, and writes the file soon after. */
	record(citekey: string, library: number, itemKey: string): void {
		if (this.stopped) {
			return;
		}
		if (this.index.record(citekey, library, itemKey)) {
			this.changed();
		}
	}

	/** The items the key stood for when it was last found. */
	itemsOf(citekey: string): ItemRef[] {
		return this.index.itemsOf(citekey);
	}

	/**
	 * Reads every note and canvas of the vault for the keys it cites, and
	 * counts one sweep of the index over them — if a sweep is due and none is
	 * running. It reads in batches, giving the window a turn between them, and
	 * gives up without counting anything if the plugin is unloaded meanwhile.
	 */
	async sweepIfDue(): Promise<void> {
		if (this.sweeping || this.stopped || !this.index.due(Date.now())) {
			return;
		}
		this.sweeping = true;
		try {
			const cited = new Set<string>();
			const files = this.app.vault
				.getFiles()
				.filter((file) => file.extension === "md" || file.extension === "canvas");
			for (let i = 0; i < files.length; i++) {
				if (i > 0 && i % SWEEP_BATCH === 0) {
					await new Promise((resolve) => window.setTimeout(resolve, 0));
					if (this.stopped) {
						return;
					}
				}
				const file = files[i];
				let text: string;
				try {
					text = await this.app.vault.cachedRead(file);
				} catch {
					// A file that cannot be read now may cite anything: the
					// sweep is called off rather than counted without it.
					return;
				}
				for (const key of citedKeysOfFile(file.extension, text)) {
					cited.add(key);
				}
			}
			if (this.stopped) {
				return;
			}
			this.index.sweep(cited, Date.now());
			this.changed();
		} finally {
			this.sweeping = false;
		}
	}

	/** Stops recording and sweeping, and writes what has not been written yet. */
	stop(): void {
		this.stopped = true;
		this.save.cancel();
		if (this.dirty) {
			void this.write();
		}
	}

	private changed(): void {
		this.dirty = true;
		this.save();
	}

	private async write(): Promise<void> {
		this.dirty = false;
		try {
			await this.app.vault.adapter.write(
				this.path,
				JSON.stringify(this.index.toData())
			);
		} catch (error) {
			this.dirty = true;
			console.error("Citation Suite: the citation key index could not be written", error);
		}
	}
}
