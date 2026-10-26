import { describe, expect, it } from "vitest";
import {
	citedKeysOfFile,
	itemKeyOf,
	itemRef,
	KeyIndex,
	SWEEP_INTERVAL,
} from "src/keyIndex";

const DAY = SWEEP_INTERVAL;

describe("itemKeyOf", () => {
	it("reads the item key off every kind of Zotero URI", () => {
		expect(itemKeyOf("http://zotero.org/users/9070599/items/9NUEPUXZ")).toBe("9NUEPUXZ");
		expect(itemKeyOf("http://zotero.org/groups/12345/items/ABCD2345")).toBe("ABCD2345");
		expect(itemKeyOf("http://zotero.org/users/local/aBcD/items/ABCD2345")).toBe("ABCD2345");
	});

	it("answers nothing for what is not an item's URI", () => {
		expect(itemKeyOf(undefined)).toBeNull();
		expect(itemKeyOf(42)).toBeNull();
		expect(itemKeyOf("http://zotero.org/users/1/collections/ABCD2345")).toBeNull();
		expect(itemKeyOf("http://zotero.org/users/1/items/abcd2345")).toBeNull();
	});
});

describe("KeyIndex.record", () => {
	it("keeps the item a key was found for", () => {
		const index = new KeyIndex();
		expect(index.record("kuhn1962", 1, "ABCD2345")).toBe(true);
		expect(index.itemsOf("kuhn1962")).toEqual([itemRef(1, "ABCD2345")]);
		expect(index.itemsOf("other")).toEqual([]);
	});

	it("changes nothing when the same pair is found again", () => {
		const index = new KeyIndex();
		index.record("kuhn1962", 1, "ABCD2345");
		expect(index.record("kuhn1962", 1, "ABCD2345")).toBe(false);
		expect(index.size).toBe(1);
	});

	it("keeps an old key and a new key of one item side by side", () => {
		const index = new KeyIndex();
		index.record("kuhnStructure1962", 1, "ABCD2345");
		index.record("kuhnStructureScientific1962", 1, "ABCD2345");
		expect(index.itemsOf("kuhnStructure1962")).toEqual(["1:ABCD2345"]);
		expect(index.itemsOf("kuhnStructureScientific1962")).toEqual(["1:ABCD2345"]);
	});

	it("drops a pair when another item of the same library takes the key", () => {
		const index = new KeyIndex();
		index.record("doe2020", 1, "AAAA2222");
		expect(index.record("doe2020", 1, "BBBB3333")).toBe(true);
		expect(index.itemsOf("doe2020")).toEqual(["1:BBBB3333"]);
		expect(index.size).toBe(1);
	});

	it("keeps one key's items in different libraries, My Library first", () => {
		const index = new KeyIndex();
		index.record("doe2020", 4, "GGGG4444");
		index.record("doe2020", 1, "AAAA2222");
		expect(index.itemsOf("doe2020")).toEqual(["1:AAAA2222", "4:GGGG4444"]);
	});
});

describe("KeyIndex.sweep", () => {
	it("is due a day after the last sweep, and only with something to sweep", () => {
		const index = new KeyIndex();
		expect(index.due(10 * DAY)).toBe(false);
		index.record("doe2020", 1, "AAAA2222");
		expect(index.due(10 * DAY)).toBe(true);
		index.sweep(new Set(["doe2020"]), 10 * DAY);
		expect(index.due(10 * DAY + DAY - 1)).toBe(false);
		expect(index.due(11 * DAY)).toBe(true);
	});

	it("is due when the clock was set back past the last sweep", () => {
		const index = new KeyIndex();
		index.record("doe2020", 1, "AAAA2222");
		index.sweep(new Set(), 10 * DAY);
		expect(index.due(5 * DAY)).toBe(true);
	});

	it("keeps a pair whose key the vault cites", () => {
		const index = new KeyIndex();
		index.record("doe2020", 1, "AAAA2222");
		for (let day = 1; day <= 5; day++) {
			index.sweep(new Set(["doe2020"]), day * DAY);
		}
		expect(index.itemsOf("doe2020")).toEqual(["1:AAAA2222"]);
	});

	it("drops a pair only on the second sweep in a row that finds it cited nowhere", () => {
		const index = new KeyIndex();
		index.record("doe2020", 1, "AAAA2222");
		index.sweep(new Set(), DAY);
		expect(index.size).toBe(1);
		index.sweep(new Set(), 2 * DAY);
		expect(index.size).toBe(0);
	});

	it("starts the count again when the key is cited between sweeps", () => {
		const index = new KeyIndex();
		index.record("doe2020", 1, "AAAA2222");
		index.sweep(new Set(), DAY);
		index.sweep(new Set(["doe2020"]), 2 * DAY);
		index.sweep(new Set(), 3 * DAY);
		expect(index.size).toBe(1);
	});

	it("starts the count again when the key is found again", () => {
		const index = new KeyIndex();
		index.record("doe2020", 1, "AAAA2222");
		index.sweep(new Set(), DAY);
		expect(index.record("doe2020", 1, "AAAA2222")).toBe(true);
		index.sweep(new Set(), 2 * DAY);
		expect(index.size).toBe(1);
	});

	it("keeps an old key a note still cites after the item took a new one", () => {
		const index = new KeyIndex();
		index.record("old2020", 1, "AAAA2222");
		index.record("new2020", 1, "AAAA2222");
		// One note was rewritten with the new key, another still has the old.
		index.sweep(new Set(["old2020", "new2020"]), DAY);
		index.sweep(new Set(["old2020", "new2020"]), 2 * DAY);
		expect(index.itemsOf("old2020")).toEqual(["1:AAAA2222"]);
	});
});

describe("KeyIndex data", () => {
	it("comes back from what it writes", () => {
		const index = new KeyIndex();
		index.record("doe2020", 1, "AAAA2222");
		index.record("roe2021", 4, "GGGG4444");
		index.sweep(new Set(["doe2020"]), DAY);
		const data = index.toData();
		expect(data).toEqual({
			version: 1,
			swept: DAY,
			keys: [
				["doe2020", "1:AAAA2222"],
				["roe2021", "4:GGGG4444", 1],
			],
		});
		const read = KeyIndex.fromData(JSON.parse(JSON.stringify(data)));
		expect(read.toData()).toEqual(data);
		// The miss counted before is still counted.
		read.sweep(new Set(["doe2020"]), 2 * DAY);
		expect(read.itemsOf("roe2021")).toEqual([]);
	});

	it("leaves out what is not a pair, and reads nothing out of what is not an index", () => {
		const read = KeyIndex.fromData({
			version: 1,
			swept: "yesterday",
			keys: [
				["doe2020", "1:AAAA2222"],
				["doe2020", "1:AAAA2222"],
				["", "1:AAAA2222"],
				["roe2021", "ABCD2345"],
				["roe2021", "x:ABCD2345"],
				"moe2022",
				[7, "1:AAAA2222"],
				["poe2023", "2:BBBB3333", -3],
			],
		});
		expect(read.swept).toBe(0);
		expect(read.toData().keys).toEqual([
			["doe2020", "1:AAAA2222"],
			["poe2023", "2:BBBB3333"],
		]);
		expect(KeyIndex.fromData(null).size).toBe(0);
		expect(KeyIndex.fromData([]).size).toBe(0);
		expect(KeyIndex.fromData({ keys: "none" }).size).toBe(0);
	});
});

describe("citedKeysOfFile", () => {
	it("reads a note's keys as the views read them", () => {
		const note = "---\nnocite: [@front]\n---\nText [@doe2020; @roe2021, p. 3].\n`[@code]`\n";
		expect(citedKeysOfFile("md", note)).toEqual(["doe2020", "roe2021"]);
	});

	it("reads a canvas's text cards and nothing else in it", () => {
		const canvas = JSON.stringify({
			nodes: [
				{ id: "a", type: "text", text: "Card [@doe2020]." },
				{ id: "b", type: "file", file: "Notes/[@roe2021].md" },
				{ id: "c", type: "text", text: "Again [@doe2020] and [@moe2022]." },
			],
			edges: [],
		});
		expect(citedKeysOfFile("canvas", canvas)).toEqual(["doe2020", "moe2022"]);
	});

	it("reads nothing from other files, or a canvas that is not JSON", () => {
		expect(citedKeysOfFile("txt", "[@doe2020]")).toEqual([]);
		expect(citedKeysOfFile("canvas", "[@doe2020] {")).toEqual([]);
		expect(citedKeysOfFile("canvas", "null @")).toEqual([]);
		expect(citedKeysOfFile("md", "no keys here")).toEqual([]);
	});
});
