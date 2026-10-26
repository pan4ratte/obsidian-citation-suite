import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * A key Zotero no longer has, traced through the key index to the key its item
 * has now — against a Better BibTeX that answers the way 9.0.71 was seen to
 * answer: `custom.uri` with every item `item.pandoc_filter` finds, and
 * `item.citationkey` keyed by `libraryID:itemKey`.
 */

type Rpc = (method: string, params: unknown[]) => unknown;

/** What Better BibTeX answers each method with, set by each test. */
let answer: Rpc = () => null;
/** The methods asked, in order. */
let asked: string[] = [];

vi.mock("obsidian", async (importOriginal) => ({
	...(await importOriginal<Record<string, unknown>>()),
	requestUrl: (request: { body: string }) => {
		const { method, params } = JSON.parse(request.body) as {
			method: string;
			params: unknown[];
		};
		asked.push(method);
		const result = answer(method, params);
		return Promise.resolve(
			result === undefined
				? { status: 500, json: null }
				: { status: 200, json: { jsonrpc: "2.0", result, id: 1 } }
		);
	},
}));

const { CitationRenderer } = await import("src/render");

function renderer(history: Record<string, string[]>) {
	const found: [string, number, string][] = [];
	const instance = new CitationRenderer(
		23119,
		[],
		() => Promise.resolve(""),
		{ locale: "", citePaperArticleURLs: false }
	);
	instance.onIdentified((key, library, itemKey) => found.push([key, library, itemKey]));
	instance.setKeyHistory((key) => history[key] ?? []);
	return { instance, found };
}

/** Zotero with one library holding `doe2020`, and `old2020`'s item now named `new2020`. */
function zotero(renamed: Record<string, string | null>): Rpc {
	return (method, params) => {
		switch (method) {
			case "user.groups":
				return [{ id: 1, name: "My Library" }];
			case "item.pandoc_filter": {
				const keys = params[0] as string[];
				return {
					items: keys.includes("doe2020")
						? {
								doe2020: {
									id: "doe2020",
									title: "A paper",
									custom: { uri: "http://zotero.org/users/9/items/DOE22020" },
								},
							}
						: {},
					errors: Object.fromEntries(
						keys.filter((key) => key !== "doe2020").map((key) => [key, 0])
					),
				};
			}
			case "item.export":
				return JSON.stringify([{ id: "doe2020", "citation-key": "doe2020", title: "A paper" }]);
			case "item.citationkey":
				return Object.fromEntries(
					(params[0] as string[]).map((ref) => [ref, renamed[ref] ?? null])
				);
			default:
				return undefined;
		}
	};
}

beforeEach(() => {
	asked = [];
});

describe("tracing changed keys", () => {
	it("records the item each found key stands for", async () => {
		answer = zotero({});
		const { instance, found } = renderer({});
		await instance.load(["doe2020"]);
		expect(found).toEqual([["doe2020", 1, "DOE22020"]]);
	});

	it("finds the key a missing key's item has now", async () => {
		answer = zotero({ "1:AAAA2222": "new2020" });
		const { instance } = renderer({ old2020: ["1:AAAA2222"] });
		await instance.load(["doe2020", "old2020"]);
		expect(instance.missing("old2020")).toBe(true);
		expect(instance.renamed("old2020")).toBe("new2020");
		expect(instance.renamed("doe2020")).toBeUndefined();
	});

	it("asks nothing for a key the index never saw, and leaves it missing", async () => {
		answer = zotero({});
		const { instance } = renderer({});
		await instance.load(["gone2020"]);
		expect(instance.missing("gone2020")).toBe(true);
		expect(instance.renamed("gone2020")).toBeUndefined();
		expect(asked).not.toContain("item.citationkey");
	});

	it("takes the first item with another key, and none whose item is gone", async () => {
		answer = zotero({ "1:AAAA2222": null, "4:GGGG4444": "groupKey2020" });
		const { instance } = renderer({
			old2020: ["1:AAAA2222", "4:GGGG4444"],
			lost2020: ["1:BBBB3333"],
		});
		await instance.load(["old2020", "lost2020"]);
		expect(instance.renamed("old2020")).toBe("groupKey2020");
		expect(instance.renamed("lost2020")).toBeUndefined();
		expect(asked.filter((method) => method === "item.citationkey")).toHaveLength(1);
	});

	it("forgets what it traced when asked to look again", async () => {
		answer = zotero({ "1:AAAA2222": "new2020" });
		const { instance } = renderer({ old2020: ["1:AAAA2222"] });
		await instance.load(["old2020"]);
		instance.forgetUnknown();
		expect(instance.renamed("old2020")).toBeUndefined();
	});

	it("traces nothing when Zotero did not answer", async () => {
		answer = () => undefined;
		const { instance } = renderer({ old2020: ["1:AAAA2222"] });
		await instance.load(["old2020"]);
		expect(instance.unreachable("old2020")).toBe(true);
		expect(instance.renamed("old2020")).toBeUndefined();
	});
});
