import { describe, expect, it } from "vitest";
import {
	forgetNoteFootnotes,
	hasNoteFootnoteSettings,
	moveNoteFootnotes,
	noteFootnoteSettings,
	readNoteFootnotes,
} from "src/noteFootnotes";
import { DEFAULT_SETTINGS, NoteFootnoteOverrides } from "src/types";

const general = {
	...DEFAULT_SETTINGS,
	footnotes: true,
	footnotePlacement: "section",
	footnoteNumbering: "arabic",
	footnotePrefix: "n",
	footnoteSuffix: "",
} as const;

describe("noteFootnoteSettings", () => {
	it("is the general settings for a note with none of its own", () => {
		const settings = { ...general, noteFootnotes: {} };
		expect(noteFootnoteSettings(settings, "a.md")).toEqual({
			footnotes: true,
			footnotePlacement: "section",
			footnoteNumbering: "arabic",
			footnotePrefix: "n",
			footnoteSuffix: "",
		});
	});

	it("is the general settings without a note", () => {
		const settings = {
			...general,
			noteFootnotes: { "a.md": { footnotes: false } },
		};
		expect(noteFootnoteSettings(settings, null).footnotes).toBe(true);
		expect(noteFootnoteSettings(settings, undefined).footnotes).toBe(true);
	});

	it("takes what the note set, and the rest from the general settings", () => {
		const settings = {
			...general,
			noteFootnotes: {
				"a.md": { footnotes: false, footnoteNumbering: "roman-upper" },
			},
		} as const;
		expect(noteFootnoteSettings(settings, "a.md")).toEqual({
			footnotes: false,
			footnotePlacement: "section",
			footnoteNumbering: "roman-upper",
			footnotePrefix: "n",
			footnoteSuffix: "",
		});
	});

	it("keeps an empty prefix the note set over the general one", () => {
		const settings = {
			...general,
			noteFootnotes: { "a.md": { footnotePrefix: "" } },
		};
		expect(noteFootnoteSettings(settings, "a.md").footnotePrefix).toBe("");
	});
});

describe("hasNoteFootnoteSettings", () => {
	it("tells a note with settings of its own from one without", () => {
		const overrides = { "a.md": { footnotes: false } };
		expect(hasNoteFootnoteSettings(overrides, "a.md")).toBe(true);
		expect(hasNoteFootnoteSettings(overrides, "b.md")).toBe(false);
		expect(hasNoteFootnoteSettings(overrides, "constructor")).toBe(false);
	});
});

describe("readNoteFootnotes", () => {
	it("is empty for nothing stored, or for what is not an object", () => {
		expect(readNoteFootnotes(undefined)).toEqual({});
		expect(readNoteFootnotes(null)).toEqual({});
		expect(readNoteFootnotes("a.md")).toEqual({});
		expect(readNoteFootnotes([{ footnotes: true }])).toEqual({});
	});

	it("is a new object every time", () => {
		const stored = {};
		expect(readNoteFootnotes(stored)).not.toBe(stored);
	});

	it("keeps every valid field", () => {
		const stored = {
			"notes/a.md": {
				footnotes: false,
				footnotePlacement: "paragraph",
				footnoteNumbering: "roman-lower",
				footnotePrefix: "n",
				footnoteSuffix: "-cite",
			},
		};
		expect(readNoteFootnotes(stored)).toEqual(stored);
	});

	it("drops values no footnote can be written with, and fields that are not footnote settings", () => {
		expect(
			readNoteFootnotes({
				"a.md": {
					footnotes: "yes",
					footnotePlacement: "margin",
					footnoteNumbering: "greek",
					footnotePrefix: 3,
					footnoteSuffix: "x",
					footnotePopover: false,
					port: 1,
				},
			})
		).toEqual({ "a.md": { footnoteSuffix: "x" } });
	});

	it("drops notes left with nothing, and entries that are not objects", () => {
		expect(
			readNoteFootnotes({
				"a.md": { port: 1 },
				"b.md": {},
				"c.md": "arabic",
				"d.md": null,
				"": { footnotes: true },
				"e.md": { footnotes: true },
			})
		).toEqual({ "e.md": { footnotes: true } });
	});
});

describe("moveNoteFootnotes", () => {
	it("moves a renamed note's settings", () => {
		const overrides: NoteFootnoteOverrides = { "a.md": { footnotes: false } };
		expect(moveNoteFootnotes(overrides, "a.md", "notes/b.md")).toBe(true);
		expect(overrides).toEqual({ "notes/b.md": { footnotes: false } });
	});

	it("moves every note under a renamed folder, and nothing beside it", () => {
		const overrides: NoteFootnoteOverrides = {
			"old/a.md": { footnotes: false },
			"old/deep/b.md": { footnotePrefix: "n" },
			"older/c.md": { footnotes: true },
			"old.md": { footnoteSuffix: "s" },
		};
		expect(moveNoteFootnotes(overrides, "old", "new")).toBe(true);
		expect(overrides).toEqual({
			"new/a.md": { footnotes: false },
			"new/deep/b.md": { footnotePrefix: "n" },
			"older/c.md": { footnotes: true },
			"old.md": { footnoteSuffix: "s" },
		});
	});

	it("takes the place of what was kept at the new path", () => {
		const overrides: NoteFootnoteOverrides = {
			"a.md": { footnotes: false },
			"b.md": { footnotes: true },
		};
		moveNoteFootnotes(overrides, "a.md", "b.md");
		expect(overrides).toEqual({ "b.md": { footnotes: false } });
	});

	it("says nothing moved for a note without settings", () => {
		const overrides: NoteFootnoteOverrides = { "a.md": { footnotes: false } };
		expect(moveNoteFootnotes(overrides, "b.md", "c.md")).toBe(false);
		expect(moveNoteFootnotes(overrides, "a.md", "a.md")).toBe(false);
		expect(overrides).toEqual({ "a.md": { footnotes: false } });
	});

	it("survives the folder's rename being followed by each note's", () => {
		const overrides: NoteFootnoteOverrides = { "old/a.md": { footnotes: false } };
		moveNoteFootnotes(overrides, "old", "new");
		expect(moveNoteFootnotes(overrides, "old/a.md", "new/a.md")).toBe(false);
		expect(overrides).toEqual({ "new/a.md": { footnotes: false } });
	});
});

describe("forgetNoteFootnotes", () => {
	it("drops a deleted note's settings", () => {
		const overrides: NoteFootnoteOverrides = {
			"a.md": { footnotes: false },
			"b.md": { footnotes: true },
		};
		expect(forgetNoteFootnotes(overrides, "a.md")).toBe(true);
		expect(overrides).toEqual({ "b.md": { footnotes: true } });
	});

	it("drops every note under a deleted folder, and nothing beside it", () => {
		const overrides: NoteFootnoteOverrides = {
			"dir/a.md": { footnotes: false },
			"dir/sub/b.md": { footnotes: false },
			"dir2/c.md": { footnotes: true },
		};
		expect(forgetNoteFootnotes(overrides, "dir")).toBe(true);
		expect(overrides).toEqual({ "dir2/c.md": { footnotes: true } });
	});

	it("says nothing was dropped for a note without settings", () => {
		const overrides: NoteFootnoteOverrides = { "a.md": { footnotes: false } };
		expect(forgetNoteFootnotes(overrides, "b.md")).toBe(false);
	});
});
