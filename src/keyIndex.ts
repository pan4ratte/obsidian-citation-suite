import { citedKeys } from "src/citation";

/**
 * Which Zotero item each citation key cited in the vault stood for, kept so
 * that a key Better BibTeX has since made anew can be traced to its item and
 * the item asked for its key as it is now.
 *
 * A key is Better BibTeX's name for an item, and the name can change: by
 * hand, or on every edit of the item while "Regenerate citation key when item
 * changes" is on. Nothing in Zotero remembers the old name, so a note citing
 * it has lost the source for good unless something here remembered it first.
 * What is remembered is the item's identity — its library and its Zotero item
 * key, which never change — in the form Better BibTeX's `item.citationkey`
 * takes: `libraryID:itemKey`.
 *
 * It is kept as pairs of a key and an item, not one key per item: when an
 * item's key changes and a note is written with the new one, other notes still
 * cite the old one, and both have to lead to the item.
 *
 * It does not grow without end because a pair is kept only while the vault
 * cites its key. A sweep reads every note now and then and drops the pairs
 * whose key no note cites — not on the first sweep that misses one but on the
 * second in a row, so that a note still on its way from another device does
 * not lose its pair. Age is no measure: a note left unopened for a year still
 * cites its keys, and is the likeliest to have one change under it unseen.
 * A key whose item has changed it stays cited in the notes that are now
 * missing it, which is exactly what keeps its pair.
 *
 * This module is pure; `src/keyIndexFile.ts` keeps it on disk and runs the
 * sweep over the vault.
 */

/** An item as Better BibTeX's `item.citationkey` names one: `libraryID:itemKey`. */
export type ItemRef = string;

/** The item `ref` for an item of the library with that Zotero item key. */
export function itemRef(library: number, itemKey: string): ItemRef {
	return `${library}:${itemKey}`;
}

/**
 * The item key a Zotero URI ends in — `http://zotero.org/users/1/items/ABCD2345`,
 * `…/groups/7/items/ABCD2345`, or `…/users/local/xyz/items/ABCD2345` for a
 * library that has never synced — or `null` for anything else. Better BibTeX
 * hands the URI over as `custom.uri` with every item `item.pandoc_filter`
 * finds.
 */
export function itemKeyOf(uri: unknown): string | null {
	if (typeof uri !== "string") {
		return null;
	}
	const match = /\/items\/([A-Z0-9]{8})$/.exec(uri);
	return match ? match[1] : null;
}

/** How long after a sweep the next one is due, in milliseconds: a day. */
export const SWEEP_INTERVAL = 24 * 60 * 60 * 1000;

/** How many sweeps in a row have to find a key cited nowhere for its pair to go. */
export const SWEEPS_TO_FORGET = 2;

/** One key and the item it stood for, when it was looked up. */
interface Entry {
	citekey: string;
	item: ItemRef;
	/** The library the item is in, read off `item`. */
	library: number;
	/** How many sweeps in a row found the key cited nowhere. */
	misses: number;
}

/** The index as it is written to disk. */
export interface KeyIndexData {
	version: 1;
	/** When the last sweep ended, in milliseconds since the epoch; 0 for never. */
	swept: number;
	/** `[citekey, item]`, and the sweeps missed as a third member when there were any. */
	keys: ([string, string] | [string, string, number])[];
}

/** The library an item ref names, or `null` when it is not one. */
function libraryOf(item: string): number | null {
	const match = /^(\d+):[A-Z0-9]{8}$/.exec(item);
	return match ? Number(match[1]) : null;
}

export class KeyIndex {
	/** Every pair, by `citekey` and `item` together. */
	private entries = new Map<string, Entry>();
	/** The pairs of each key. */
	private byKey = new Map<string, Entry[]>();
	/** When the last sweep ended; 0 for never. */
	swept = 0;

	/** How many pairs are kept. */
	get size(): number {
		return this.entries.size;
	}

	/**
	 * Remembers that `citekey` stands for the item, as Zotero just said, and
	 * whether that changed anything worth writing down.
	 *
	 * A key is unique inside its library, so another item of the same library
	 * that had the key has it no more: that pair goes. The same key in another
	 * library is another item — a source and its copy in a group — and stays.
	 */
	record(citekey: string, library: number, itemKey: string): boolean {
		const item = itemRef(library, itemKey);
		let changed = false;
		for (const entry of this.byKey.get(citekey) ?? []) {
			if (entry.library === library && entry.item !== item) {
				this.remove(entry);
				changed = true;
			}
		}
		const existing = this.entries.get(pairId(citekey, item));
		if (existing) {
			if (existing.misses > 0) {
				existing.misses = 0;
				changed = true;
			}
			return changed;
		}
		this.add({ citekey, item, library, misses: 0 });
		return true;
	}

	/** The items the key stood for when it was last found, My Library's first. */
	itemsOf(citekey: string): ItemRef[] {
		return (this.byKey.get(citekey) ?? [])
			.slice()
			.sort((a, b) => a.library - b.library)
			.map((entry) => entry.item);
	}

	/** Whether a sweep is due at `now`: a day after the last, or a clock set back. */
	due(now: number): boolean {
		return this.size > 0 && (now - this.swept >= SWEEP_INTERVAL || now < this.swept);
	}

	/**
	 * Counts one sweep that found `cited` cited in the vault: a pair whose key
	 * is among them starts its count again, and one whose key has been cited
	 * nowhere for `SWEEPS_TO_FORGET` sweeps in a row goes.
	 */
	sweep(cited: ReadonlySet<string>, now: number): void {
		for (const entry of [...this.entries.values()]) {
			if (cited.has(entry.citekey)) {
				entry.misses = 0;
			} else if (++entry.misses >= SWEEPS_TO_FORGET) {
				this.remove(entry);
			}
		}
		this.swept = now;
	}

	/** The index as it is written to disk. */
	toData(): KeyIndexData {
		return {
			version: 1,
			swept: this.swept,
			keys: [...this.entries.values()].map((entry) =>
				entry.misses > 0
					? [entry.citekey, entry.item, entry.misses]
					: [entry.citekey, entry.item]
			),
		};
	}

	/**
	 * The index a file held, with whatever in it is not a pair left out. Read
	 * forgivingly: it is the plugin's own file, but a sync tool or a hand may
	 * have been at it, and losing one pair is better than losing all of them.
	 */
	static fromData(data: unknown): KeyIndex {
		const index = new KeyIndex();
		if (!data || typeof data !== "object") {
			return index;
		}
		const { swept, keys } = data as Partial<Record<keyof KeyIndexData, unknown>>;
		if (typeof swept === "number" && Number.isFinite(swept)) {
			index.swept = swept;
		}
		if (!Array.isArray(keys)) {
			return index;
		}
		for (const pair of keys) {
			if (!Array.isArray(pair)) {
				continue;
			}
			const [citekey, item, misses] = pair as unknown[];
			const library = typeof item === "string" ? libraryOf(item) : null;
			if (typeof citekey !== "string" || !citekey || library === null) {
				continue;
			}
			if (index.entries.has(pairId(citekey, item as string))) {
				continue;
			}
			index.add({
				citekey,
				item: item as string,
				library,
				misses:
					typeof misses === "number" && misses > 0 ? Math.floor(misses) : 0,
			});
		}
		return index;
	}

	private add(entry: Entry): void {
		this.entries.set(pairId(entry.citekey, entry.item), entry);
		const pairs = this.byKey.get(entry.citekey);
		if (pairs) {
			pairs.push(entry);
		} else {
			this.byKey.set(entry.citekey, [entry]);
		}
	}

	private remove(entry: Entry): void {
		this.entries.delete(pairId(entry.citekey, entry.item));
		const pairs = this.byKey.get(entry.citekey)?.filter((other) => other !== entry);
		if (pairs && pairs.length > 0) {
			this.byKey.set(entry.citekey, pairs);
		} else {
			this.byKey.delete(entry.citekey);
		}
	}
}

/** What a pair is kept by. No citation key holds a line break. */
function pairId(citekey: string, item: ItemRef): string {
	return `${citekey}\n${item}`;
}

/**
 * The keys a file of the vault cites, for the sweep: a note's, read as every
 * view reads them (`citedKeys`), and a canvas's, from its text cards, which
 * reading view renders citations in as it does a note. Any other file cites
 * nothing, and neither does a canvas that is not JSON.
 */
export function citedKeysOfFile(extension: string, text: string): string[] {
	if (!text.includes("@")) {
		return [];
	}
	if (extension === "md") {
		return citedKeys(text);
	}
	if (extension !== "canvas") {
		return [];
	}
	let canvas: unknown;
	try {
		canvas = JSON.parse(text);
	} catch {
		return [];
	}
	const nodes = (canvas as { nodes?: unknown } | null)?.nodes;
	if (!Array.isArray(nodes)) {
		return [];
	}
	const keys = new Set<string>();
	for (const node of nodes as { type?: unknown; text?: unknown }[]) {
		if (node?.type === "text" && typeof node.text === "string") {
			for (const key of citedKeys(node.text)) {
				keys.add(key);
			}
		}
	}
	return [...keys];
}
