import { FOOTNOTE_NUMBERINGS, FOOTNOTE_PLACEMENTS } from "src/footnote";
import {
	CitationSuiteSettings,
	NOTE_FOOTNOTE_KEYS,
	NoteFootnoteOverrides,
	NoteFootnoteSettings,
} from "src/types";

/**
 * Footnote settings of a note's own.
 *
 * A note keeps only the fields that were set for it, under its path in
 * `noteFootnotes`; every other field follows the plugin's settings, including
 * when those change later. Taking the note's settings back to the plugin's is
 * dropping its entry.
 *
 * The path is the key, so the entry has to follow the note: a rename moves it,
 * a deletion drops it, and a folder's rename or deletion does the same for
 * every note under it.
 *
 * Everything here works on the settings object and knows nothing of the vault,
 * so every rule below is testable without one.
 */

/** The footnote settings in force in the note at `path`, or the plugin's without one. */
export function noteFootnoteSettings(
	settings: CitationSuiteSettings,
	path: string | null | undefined
): NoteFootnoteSettings {
	const own = path ? settings.noteFootnotes[path] : undefined;
	return {
		footnotes: own?.footnotes ?? settings.footnotes,
		footnotePlacement: own?.footnotePlacement ?? settings.footnotePlacement,
		footnoteNumbering: own?.footnoteNumbering ?? settings.footnoteNumbering,
		footnotePrefix: own?.footnotePrefix ?? settings.footnotePrefix,
		footnoteSuffix: own?.footnoteSuffix ?? settings.footnoteSuffix,
	};
}

/** Whether the note at `path` has any footnote setting of its own. */
export function hasNoteFootnoteSettings(
	overrides: NoteFootnoteOverrides,
	path: string
): boolean {
	return Object.hasOwn(overrides, path);
}

/** Whether a field holds a value that field can take. */
function isValidValue(key: string, value: unknown): boolean {
	switch (key) {
		case "footnotes":
			return typeof value === "boolean";
		case "footnotePlacement":
			return (FOOTNOTE_PLACEMENTS as unknown[]).includes(value);
		case "footnoteNumbering":
			return (FOOTNOTE_NUMBERINGS as unknown[]).includes(value);
		case "footnotePrefix":
		case "footnoteSuffix":
			// What a label may not hold is taken out when the label is built.
			return typeof value === "string";
		default:
			return false;
	}
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * The notes' settings as `data.json` held them, keeping only fields that are
 * footnote settings with a value they can take, and only notes left with one.
 * The file can be edited by hand, and a value no footnote can be written with
 * is better forgotten than obeyed.
 *
 * Always a new object, so the settings never share one with the defaults.
 */
export function readNoteFootnotes(stored: unknown): NoteFootnoteOverrides {
	const overrides: NoteFootnoteOverrides = {};
	if (!isRecord(stored)) {
		return overrides;
	}
	for (const [path, fields] of Object.entries(stored)) {
		if (!path || !isRecord(fields)) {
			continue;
		}
		const own: Record<string, unknown> = {};
		for (const key of NOTE_FOOTNOTE_KEYS) {
			if (Object.hasOwn(fields, key) && isValidValue(key, fields[key])) {
				own[key] = fields[key];
			}
		}
		if (Object.keys(own).length > 0) {
			overrides[path] = own;
		}
	}
	return overrides;
}

/** Whether `path` is `root` itself or lies inside it, as a folder. */
function isAtOrUnder(path: string, root: string): boolean {
	return path === root || path.startsWith(`${root}/`);
}

/**
 * Moves the settings of the note that was at `oldPath` to `newPath` — or, when
 * a folder moved, of every note under it — replacing whatever was kept at the
 * new path. Says whether anything moved, so that nothing is saved otherwise.
 */
export function moveNoteFootnotes(
	overrides: NoteFootnoteOverrides,
	oldPath: string,
	newPath: string
): boolean {
	if (oldPath === newPath) {
		return false;
	}
	const moved = Object.keys(overrides).filter((path) =>
		isAtOrUnder(path, oldPath)
	);
	const entries = moved.map((path) => ({
		to: newPath + path.slice(oldPath.length),
		own: overrides[path],
	}));
	for (const path of moved) {
		delete overrides[path];
	}
	for (const { to, own } of entries) {
		if (own) {
			overrides[to] = own;
		}
	}
	return moved.length > 0;
}

/**
 * Drops the settings of the note at `path` — or, when a folder went, of every
 * note under it. Says whether anything was dropped.
 */
export function forgetNoteFootnotes(
	overrides: NoteFootnoteOverrides,
	path: string
): boolean {
	const gone = Object.keys(overrides).filter((kept) =>
		isAtOrUnder(kept, path)
	);
	for (const kept of gone) {
		delete overrides[kept];
	}
	return gone.length > 0;
}
