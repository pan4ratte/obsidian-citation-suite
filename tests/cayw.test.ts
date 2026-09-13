import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	CaywError,
	citable,
	parsePickResponse,
	pickedNotes,
	parseCitations,
	pickCitations,
	probeZotero,
} from "src/cayw";
import { formatCitations } from "src/pandoc";

// The one thing about the requests themselves worth holding still. Everything
// else here is pure.
const requestUrl = vi.hoisted(() => vi.fn());
vi.mock("obsidian", () => ({ requestUrl }));

describe("parseCitations", () => {
	it("reads an empty body as a cancelled pick", () => {
		expect(parseCitations("")).toEqual([]);
		expect(parseCitations("   \n")).toEqual([]);
	});

	it("reads the pick Better BibTeX answers with", () => {
		// The shape of `format=pick`: BBT fills every field in, blank ones as
		// empty strings, and labels a locator typed without one as a page.
		const body = JSON.stringify([
			{
				id: 1234,
				citationKey: "doe2020",
				locator: "33",
				label: "page",
				prefix: "",
				suffix: "",
				suppressAuthor: true,
				uri: "http://zotero.org/users/local/x/items/ABCD",
			},
		]);
		expect(parseCitations(body)).toEqual([
			{
				id: 1234,
				citationKey: "doe2020",
				locator: "33",
				label: "page",
				prefix: "",
				suffix: "",
				suppressAuthor: true,
				uri: "http://zotero.org/users/local/x/items/ABCD",
				itemType: undefined,
				title: undefined,
			},
		]);
	});

	it("fills in every field a shorter answer leaves out", () => {
		const [citation] = parseCitations(
			JSON.stringify([{ citationKey: "doe2020" }])
		);
		expect(citation.locator).toBe("");
		expect(citation.label).toBe("");
		expect(citation.prefix).toBe("");
		expect(citation.suffix).toBe("");
		expect(citation.suppressAuthor).toBe(false);
		expect(citation.id).toBe(0);
	});

	it("refuses a body that is not a pick", () => {
		// What the endpoint answers a failure with is the reason, in prose.
		expect(() => parseCitations("CAYW failed: no such formatter")).toThrow(
			CaywError
		);
		expect(() => parseCitations('{"not":"an array"}')).toThrow(CaywError);
	});
});

describe("citable", () => {
	it("drops what has no citation key to write", () => {
		const citations = parseCitations(
			JSON.stringify([
				{ id: 1, citationKey: "doe2020" },
				// A standalone Zotero note: the picker returns it, and it has
				// no bibliography entry to cite.
				{ id: 2, citationKey: "", itemType: "note" },
			])
		);
		expect(citable(citations).map((c) => c.citationKey)).toEqual([
			"doe2020",
		]);
	});
});

describe("parsePickResponse", () => {
	// The shape Better BibTeX 9.0.64 answers a POST with: `output` is the
	// `pick` format's JSON, with every note filtered out of it, and `pick` is
	// the citation window's raw result, notes included.
	const NOTE_HTML =
		"<html><body><h1>Reading notes</h1><p>Not cumulative</p></body></html>";
	const response = (output: string, pick: unknown[]) =>
		JSON.stringify({ state: {}, pick, output });

	it("reads the citations from the output and the notes from the pick", () => {
		const citations = parsePickResponse(
			response(JSON.stringify([{ id: 1, citationKey: "doe2020" }]), [
				{ citationItems: [{ id: 1, itemData: { type: "book" } }] },
				{
					citationItems: [
						{
							itemData: {
								id: 7,
								type: "note",
								title: "Reading notes",
								note: NOTE_HTML,
								nonCSL: true,
							},
						},
					],
					properties: {},
				},
			])
		);
		expect(citations.map((c) => c.citationKey)).toEqual(["doe2020", ""]);
		expect(citations[1]).toMatchObject({
			id: 7,
			itemType: "note",
			title: "Reading notes",
			note: NOTE_HTML,
		});
	});

	it("does not insert a note twice once the output holds it too", () => {
		const note = { itemData: { type: "note", note: NOTE_HTML } };
		const citations = parsePickResponse(
			response(
				JSON.stringify([
					{ id: 7, citationKey: "", itemType: "note", note: NOTE_HTML },
				]),
				[{ citationItems: [note] }]
			)
		);
		expect(citations).toHaveLength(1);
	});

	it("is nothing at all for a cancelled pick", () => {
		expect(parsePickResponse(response("", []))).toEqual([]);
		expect(parsePickResponse("")).toEqual([]);
	});

	it("refuses a body that is not a pick", () => {
		expect(() => parsePickResponse("CAYW failed: no such formatter")).toThrow(
			CaywError
		);
		expect(() => parsePickResponse("[]")).toThrow(CaywError);
	});
});

describe("pickedNotes", () => {
	it("takes the HTML of every Zotero note picked, and nothing else", () => {
		const citations = parseCitations(
			JSON.stringify([
				{ id: 1, citationKey: "doe2020" },
				{
					id: 2,
					citationKey: "",
					itemType: "note",
					title: "Reading notes",
					note: '<div data-schema-version="9"><p>Reading notes</p></div>',
				},
				// A note with nothing in it has nothing to insert.
				{ id: 3, citationKey: "", itemType: "note", note: "  " },
				// An item whose key is not generated yet is not a note.
				{ id: 4, citationKey: "", itemType: "book" },
			])
		);
		expect(pickedNotes(citations)).toEqual([
			'<div data-schema-version="9"><p>Reading notes</p></div>',
		]);
	});
});

describe("a real answer", () => {
	// Verbatim from Better BibTeX 9.0.64, `format=pick&selected=true` against a
	// group library — field order, the empty strings, and a citation key of the
	// shape BBT generates. The plugin is written against this, so it is the
	// fixture rather than a hand-made one.
	const BODY =
		'[{"id":1607,"locator":"","suppressAuthor":false,"prefix":"","suffix":"","label":"","citationKey":"BogYavilSvoe1994","uri":"http://zotero.org/groups/6069354/items/7ENTQEMH","itemType":"magazineArticle","title":"Бог явил Свое Слово в проповеди"}]';

	it("parses into one citable citation", () => {
		const citations = parseCitations(BODY);
		expect(citations).toHaveLength(1);
		expect(citations[0].citationKey).toBe("BogYavilSvoe1994");
		// Picked out of Zotero's pane, so there was no field to type a locator
		// into and none of the four is filled.
		expect(citations[0].locator).toBe("");
		expect(citations[0].label).toBe("");
		expect(citable(citations)).toHaveLength(1);
	});

	it("becomes the citation that goes into the note", () => {
		expect(
			formatCitations(citable(parseCitations(BODY)), { brackets: true })
		).toBe("[@BogYavilSvoe1994]");
	});
});

describe("what the requests carry", () => {
	beforeEach(() => {
		requestUrl.mockReset();
		requestUrl.mockResolvedValue({ status: 200, text: "ready" });
		// `withTimeout` reaches for the window's timers, which the app has and
		// a node test run does not.
		vi.stubGlobal("window", { setTimeout, clearTimeout });
	});

	/**
	 * Zotero's server drops, without answering, any request whose user agent
	 * names a browser — that is how it keeps a web page from reaching the local
	 * API. Obsidian sends Electron's own `Mozilla/5.0 …` unless told otherwise,
	 * and a dropped request is indistinguishable from Zotero not running: the
	 * plugin calls a working Zotero unreachable.
	 */
	const userAgentOf = (): string =>
		(requestUrl.mock.calls[0][0] as { headers: Record<string, string> })
			.headers["User-Agent"];

	it("names the plugin to Zotero, and no browser", async () => {
		await probeZotero(23119);
		expect(userAgentOf()).toBe("Citation Suite");
	});

	it("names it on the pick as well as on the probe", async () => {
		requestUrl.mockResolvedValue({
			status: 200,
			text: JSON.stringify({ state: {}, pick: [], output: "" }),
		});
		await pickCitations({ port: 23119 });
		expect(userAgentOf()).toBe("Citation Suite");
	});

	it("posts the pick, which is what brings the notes back", async () => {
		requestUrl.mockResolvedValue({
			status: 200,
			text: JSON.stringify({ state: {}, pick: [], output: "" }),
		});
		await pickCitations({ port: 23119 });
		expect(requestUrl.mock.calls).toHaveLength(1);
		expect(requestUrl.mock.calls[0][0]).toMatchObject({
			method: "POST",
			contentType: "application/json",
		});
	});

	it("minimizes Zotero in a request of its own, since a POST cannot", async () => {
		requestUrl.mockResolvedValue({
			status: 200,
			text: JSON.stringify({ state: {}, pick: [], output: "" }),
		});
		await pickCitations({ port: 23119, minimize: true });
		const minimize = requestUrl.mock.calls[1][0] as {
			method: string;
			url: string;
		};
		expect(minimize.method).toBe("GET");
		expect(minimize.url).toContain("selected=true");
		expect(minimize.url).toContain("minimize=true");
	});
});
