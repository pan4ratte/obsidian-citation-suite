import { readFileSync } from "node:fs";
import { CslCitationItem, Engine } from "citeproc";
import { describe, expect, it } from "vitest";
import {
	authorAt,
	CitationSession,
	clusterOf,
	SessionCitation,
	withAuthor,
} from "src/citationSession";

/**
 * The session is checked against citeproc itself: after every change, what it
 * brought the engine to is compared with a fresh engine given the whole note
 * at once. The styles are small ones written for the purpose, each exercising
 * what a citation's place in the note decides — "Ibid." and the short form in
 * notes, numbers in order of first citation, and a year told apart by a letter.
 */

const LOCALE = readFileSync(
	new URL("../locales/locales-en-US.xml", import.meta.url),
	"utf8"
);

const INFO = "<info><title>Test</title><id>test</id><updated>2024-01-01T00:00:00+00:00</updated></info>";

const NOTE_STYLE = `<?xml version="1.0" encoding="utf-8"?>
<style xmlns="http://purl.org/net/xbiblio/csl" class="note" version="1.0">${INFO}
<citation><layout delimiter="; " suffix="."><choose>
<if position="ibid-with-locator"><text term="ibid"/><text variable="locator" prefix=", "/></if>
<else-if position="ibid"><text term="ibid"/></else-if>
<else-if position="subsequent"><names variable="author"><name form="short"/></names><text variable="locator" prefix=", "/></else-if>
<else><names variable="author"><name/></names><text variable="title" prefix=", "/><text variable="locator" prefix=", "/></else>
</choose></layout></citation>
<bibliography><layout><names variable="author"><name/></names><text variable="title" prefix=", "/></layout></bibliography>
</style>`;

const NUMBERED_STYLE = `<?xml version="1.0" encoding="utf-8"?>
<style xmlns="http://purl.org/net/xbiblio/csl" class="in-text" version="1.0">${INFO}
<citation><sort><key variable="citation-number"/></sort><layout prefix="[" suffix="]" delimiter=", ">
<text variable="citation-number"/><text variable="locator" prefix=" p. "/></layout></citation>
<bibliography><layout><text variable="citation-number" suffix=". "/><text variable="title"/></layout></bibliography>
</style>`;

const AUTHOR_DATE_STYLE = `<?xml version="1.0" encoding="utf-8"?>
<style xmlns="http://purl.org/net/xbiblio/csl" class="in-text" version="1.0">${INFO}
<citation disambiguate-add-year-suffix="true"><layout prefix="(" suffix=")" delimiter="; ">
<group delimiter=", "><names variable="author"><name form="short"/></names><date variable="issued"><date-part name="year"/></date><text variable="locator"/></group>
</layout></citation>
</style>`;

/** An author-date style that sorts the sources of a citation by author, as APA does. */
const SORTED_STYLE = `<?xml version="1.0" encoding="utf-8"?>
<style xmlns="http://purl.org/net/xbiblio/csl" class="in-text" version="1.0">${INFO}
<citation><sort><key macro="author"/></sort><layout prefix="(" suffix=")" delimiter="; ">
<group delimiter=", "><text macro="author"/><date variable="issued"><date-part name="year"/></date><text variable="locator"/></group>
</layout></citation>
<macro name="author"><names variable="author"><name form="short"/></names></macro>
</style>`;

const ITEMS: Record<string, Record<string, unknown>> = Object.fromEntries(
	[
		["doe2020a", "Doe", 2020, "First"],
		["doe2020b", "Doe", 2020, "Second"],
		["roe2019", "Roe", 2019, "Third"],
		["poe2021", "Poe", 2021, "Fourth"],
		["moe2018", "Moe", 2018, "Fifth"],
	].map(([id, family, year, title]) => [
		id,
		{
			id,
			type: "book",
			title,
			author: [{ family, given: "J." }],
			issued: { "date-parts": [[year]] },
		},
	])
);
const KEYS = Object.keys(ITEMS);

function engine(style: string): Engine {
	return new Engine(
		{
			retrieveLocale: () => LOCALE,
			retrieveItem: (id: string) => ITEMS[id],
		},
		style
	);
}

/**
 * What a fresh engine writes the note as, given all of it at once — and the
 * author of each citation with the author in the text, written where it stands
 * in the note the fresh engine holds.
 */
function fromScratch(style: string, citations: SessionCitation[]): string[] {
	const fresh = engine(style) as Engine & {
		rebuildProcessorState(
			citations: unknown[],
			mode: string
		): [string, number, string][];
	};
	const ids = citations.map((citation, index): [string, number] => [
		`fresh${index}`,
		citation.noteIndex,
	]);
	const written = fresh
		.rebuildProcessorState(
			citations.map((citation, index) => clusterOf(citation, ids[index][0])),
			"html"
		)
		.map(([, , text]) => text);
	const held = ids.map((position, index) => ({
		position,
		ids: citations[index].items.map((item) => item.id),
	}));
	return written.map((text, index) =>
		citations[index].inText && text
			? withAuthor(
					authorAt(fresh, citations[index], held.slice(0, index), ids.slice(index + 1)),
					text
				)
			: text
	);
}

function run(session: CitationSession, citations: SessionCitation[]): string[] {
	const job = session.update(citations);
	while (!job.step()) {
		// every step, as the renderer would take them across frames
	}
	return job.outputs();
}

/** A small deterministic stream of numbers, so a failure can be run again. */
function numbers(seed: number): (below: number) => number {
	let state = seed;
	return (below) => {
		state = (state * 16807) % 2147483647;
		return state % below;
	};
}

function cite(id: string, locator?: string): CslCitationItem {
	return locator ? { id, locator, label: "page" } : { id };
}

describe("CitationSession", () => {
	it("writes a repeated source as ibid. and as its short form in notes", () => {
		const session = new CitationSession(engine(NOTE_STYLE));
		const outputs = run(session, [
			{ items: [cite("doe2020a", "3")], noteIndex: 1 },
			{ items: [cite("doe2020a", "4")], noteIndex: 2 },
			{ items: [cite("roe2019")], noteIndex: 3 },
			{ items: [cite("doe2020a")], noteIndex: 4 },
		]);
		expect(outputs).toEqual([
			"J. Doe, First, 3.",
			"Ibid., 4.",
			"J. Roe, Third.",
			"Doe.",
		]);
	});

	it("renumbers the sources when one is cited earlier", () => {
		const session = new CitationSession(engine(NUMBERED_STYLE));
		const first = [
			{ items: [cite("roe2019")], noteIndex: 0 },
			{ items: [cite("doe2020a")], noteIndex: 0 },
		];
		expect(run(session, first)).toEqual(["[1]", "[2]"]);
		const inserted = [{ items: [cite("doe2020a", "9")], noteIndex: 0 }, ...first];
		expect(run(session, inserted)).toEqual(["[1 p. 9]", "[2]", "[1]"]);
	});

	it("tells two sources of one author and year apart", () => {
		const session = new CitationSession(engine(AUTHOR_DATE_STYLE));
		const one = [{ items: [cite("doe2020a")], noteIndex: 0 }];
		expect(run(session, one)).toEqual(["(Doe, 2020)"]);
		const both = [...one, { items: [cite("doe2020b")], noteIndex: 0 }];
		expect(run(session, both)).toEqual(["(Doe, 2020a)", "(Doe, 2020b)"]);
		expect(run(session, one)).toEqual(["(Doe, 2020)"]);
	});

	for (const [name, style, notes] of [
		["a note style", NOTE_STYLE, true],
		["a numbered style", NUMBERED_STYLE, false],
		["an author-date style", AUTHOR_DATE_STYLE, false],
	] as const) {
		it(`writes every change as a fresh engine would, in ${name}`, () => {
			const random = numbers(7);
			const citation = (): {
				items: CslCitationItem[];
				notesBefore: number;
				inText: boolean;
			} => {
				const items = [cite(KEYS[random(KEYS.length)], random(2) ? String(random(20)) : undefined)];
				if (random(5) === 0) {
					items.push(cite(KEYS[random(KEYS.length)]));
				}
				return { items, notesBefore: random(3) === 0 ? 1 : 0, inText: random(4) === 0 };
			};
			const note = Array.from({ length: 12 }, citation);
			const numbered = (): SessionCitation[] => {
				let noteNumber = 0;
				return note.map(({ items, notesBefore, inText }) => {
					noteNumber += 1 + notesBefore;
					return { items, noteIndex: notes ? noteNumber : 0, inText };
				});
			};
			const session = new CitationSession(engine(style));
			const bibliography = (e: Engine): string => {
				const written = e.makeBibliography();
				return written ? written[1].join("") : "";
			};

			for (let change = 0; change < 60; change++) {
				// One to three edits at once, as a paste or a quick run of
				// typing between two readings of the note would make.
				for (let edit = 1 + random(3); edit > 0; edit--) {
					const at = random(note.length);
					switch (random(4)) {
						case 0:
							note[at] = { ...citation(), notesBefore: note[at].notesBefore };
							break;
						case 1:
							note.splice(at, 0, citation());
							break;
						case 2:
							if (note.length > 1) {
								note.splice(at, 1);
							}
							break;
						default:
							// A footnote added before a citation, which moves
							// every later one into the next note.
							note[at].notesBefore++;
					}
				}
				const citations = numbered();
				expect(run(session, citations)).toEqual(fromScratch(style, citations));
			}
			// The reference list read off the session is the fresh engine's.
			const citations = numbered();
			const fresh = engine(style);
			(fresh as Engine & { rebuildProcessorState(c: unknown[], m: string): unknown })
				.rebuildProcessorState(
					citations.map((c, index) => ({
						citationID: `f${index}`,
						citationItems: c.items.map((item) => ({ ...item })),
						properties: { noteIndex: c.noteIndex },
					})),
					"html"
				);
			const held = engine(style);
			const heldSession = new CitationSession(held);
			run(heldSession, citations.slice(0, 3));
			run(heldSession, citations);
			expect(bibliography(held)).toBe(bibliography(fresh));
		});
	}

	it("leaves the note as it was when a preview is written in between", () => {
		const held = engine(NOTE_STYLE);
		const session = new CitationSession(held);
		const citations = [
			{ items: [cite("doe2020a")], noteIndex: 1 },
			{ items: [cite("doe2020a")], noteIndex: 2 },
		];
		run(session, citations);
		held.previewCitationCluster(
			{ citationItems: [cite("poe2021")], properties: { noteIndex: 0 } },
			[],
			[],
			"html"
		);
		const changed = [...citations, { items: [cite("doe2020a", "5")], noteIndex: 3 }];
		expect(run(session, changed)).toEqual(fromScratch(NOTE_STYLE, changed));
	});

	it("names the author in the text, the rest after it in the order written", () => {
		const session = new CitationSession(engine(SORTED_STYLE));
		expect(
			run(session, [
				{ items: [cite("roe2019")], noteIndex: 0, inText: true },
				{ items: [cite("roe2019", "33")], noteIndex: 0, inText: true },
				{ items: [cite("roe2019", "33"), cite("doe2020a")], noteIndex: 0, inText: true },
				{ items: [cite("roe2019"), cite("doe2020a")], noteIndex: 0 },
			])
		).toEqual([
			"Roe (2019)",
			"Roe (2019, 33)",
			"Roe (2019, 33; Doe, 2020)",
			"(Doe, 2020; Roe, 2019)",
		]);
	});

	it("gives the citation alone in a style that names no author", () => {
		const session = new CitationSession(engine(NUMBERED_STYLE));
		expect(
			run(session, [
				{ items: [cite("roe2019")], noteIndex: 0, inText: true },
				{ items: [cite("doe2020a", "4")], noteIndex: 0, inText: true },
			])
		).toEqual(["[1]", "[2 p. 4]"]);
	});

	it("writes the author anew when the note around it changes", () => {
		const session = new CitationSession(engine(AUTHOR_DATE_STYLE));
		const one = [{ items: [cite("doe2020a")], noteIndex: 0, inText: true }];
		expect(run(session, one)).toEqual(["Doe (2020)"]);
		const both = [...one, { items: [cite("doe2020b")], noteIndex: 0 }];
		expect(run(session, both)).toEqual(["Doe (2020a)", "(Doe, 2020b)"]);
		// Nothing handed over: the author kept is the one written.
		expect(run(session, both)).toEqual(["Doe (2020a)", "(Doe, 2020b)"]);
	});

	it("names an author in full the first time in a note style, and short after", () => {
		const session = new CitationSession(engine(NOTE_STYLE));
		const citations = [
			{ items: [cite("doe2020a")], noteIndex: 1, inText: true },
			{ items: [cite("roe2019")], noteIndex: 2 },
			{ items: [cite("doe2020a")], noteIndex: 3, inText: true },
		];
		const outputs = run(session, citations);
		expect(outputs[0]).toMatch(/^J\. Doe /);
		expect(outputs[2]).toMatch(/^Doe /);
		expect(outputs).toEqual(fromScratch(NOTE_STYLE, citations));
	});

	it("names the author where the style writes ibid., as a later citation names it", () => {
		const session = new CitationSession(engine(NOTE_STYLE));
		const citations = [
			{ items: [cite("doe2020a")], noteIndex: 1 },
			{ items: [cite("roe2019")], noteIndex: 2 },
			{ items: [cite("doe2020a")], noteIndex: 3 },
			{ items: [cite("doe2020a", "7")], noteIndex: 4, inText: true },
		];
		const outputs = run(session, citations);
		expect(outputs[3]).toBe("Doe Ibid., 7.");
		expect(outputs).toEqual(fromScratch(NOTE_STYLE, citations));
	});

	it("gives up nothing but the job it abandons", () => {
		const session = new CitationSession(engine(NOTE_STYLE));
		const long = KEYS.map((key, index) => ({ items: [cite(key)], noteIndex: index + 1 }));
		const abandoned = session.update(long);
		abandoned.step();
		abandoned.step();
		const short = long.slice(0, 2);
		expect(run(session, short)).toEqual(fromScratch(NOTE_STYLE, short));
		expect(abandoned.step()).toBe(true);
	});
});
