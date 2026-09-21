import { proseOf } from "src/citation";

/**
 * A note with the notes it embeds written into it.
 *
 * `![[chapter]]` puts one note inside another, and a note assembled from
 * chapters that way cites what its chapters cite: reading view shows their
 * citations where the embeds stand, and a note exported with its embeds
 * expanded carries them into the document. So the reference list is read from
 * the note with every embed replaced by what it shows — a whole note, a
 * heading's section or a block — and every embed inside that too.
 *
 * Nothing here knows about the vault: the caller says what a link leads to.
 */

/** One `![[…]]` or `![…](…)` in a note, and where it stands. */
export interface Embed {
	from: number;
	to: number;
	/** The linked path, as written: no subpath, no alias. */
	link: string;
	/** `#heading`, `#^block`, or empty for the whole note. */
	subpath: string;
}

/**
 * What an embed shows: the file it leads to, and the text shown of it — or
 * `null` for a file that is not a note, an image or a PDF.
 */
export interface EmbeddedText {
	path: string;
	text: string | null;
}

/**
 * Finds what an embed shows, from the note it is written in, or answers
 * `null` for a link that leads to no file, or to no heading or block in it.
 */
export type EmbedResolver = (
	embed: Embed,
	sourcePath: string
) => Promise<EmbeddedText | null>;

export interface ExpandedNote {
	/** The note with every embed of a note written in. */
	text: string;
	/** Every note an embed led to, at any depth. */
	paths: Set<string>;
	/** Whether any embed led nowhere — a note created later may be it. */
	unresolved: boolean;
}

/** How deep embeds inside embeds are followed; Obsidian stops too. */
const MAX_DEPTH = 10;

const WIKI_EMBED = /!\[\[([^\]\n]+)\]\]/g;
const MARKDOWN_EMBED = /!\[[^\]\n]*\]\(\s*(<[^>\n]+>|[^)\s]+)(?:\s+"[^"\n]*")?\s*\)/g;

/** Splits `path#subpath` at its first `#`. */
function splitSubpath(target: string): { link: string; subpath: string } {
	const hash = target.indexOf("#");
	return hash < 0
		? { link: target.trim(), subpath: "" }
		: { link: target.slice(0, hash).trim(), subpath: target.slice(hash).trim() };
}

/** Every embed in the note's prose, in the order they stand. */
export function embedsOf(text: string): Embed[] {
	const prose = proseOf(text);
	const embeds: Embed[] = [];
	for (const match of prose.matchAll(WIKI_EMBED)) {
		const target = match[1].split("|")[0];
		embeds.push({
			from: match.index,
			to: match.index + match[0].length,
			...splitSubpath(target),
		});
	}
	for (const match of prose.matchAll(MARKDOWN_EMBED)) {
		let target = match[1];
		if (target.startsWith("<")) {
			target = target.slice(1, -1);
		}
		// An address is a picture from the web, not a note.
		if (/^[a-z][a-z0-9+.-]*:/i.test(target)) {
			continue;
		}
		let decoded = target;
		try {
			decoded = decodeURI(target);
		} catch {
			// Written unencoded, `%` and all.
		}
		embeds.push({
			from: match.index,
			to: match.index + match[0].length,
			...splitSubpath(decoded),
		});
	}
	return embeds
		.filter((embed) => embed.link !== "" || embed.subpath !== "")
		.sort((a, b) => a.from - b.from);
}

/** The note without its front matter: an embed never shows it. */
function withoutFrontMatter(text: string): string {
	const lines = text.split("\n");
	if (lines[0]?.trimEnd() !== "---") {
		return text;
	}
	for (let i = 1; i < lines.length; i++) {
		if (["---", "..."].includes(lines[i].trimEnd())) {
			return lines.slice(i + 1).join("\n");
		}
	}
	return text;
}

/**
 * The text with each footnote label made its own: a note and the note it
 * embeds number their footnotes apart, and `[^1]` in each is a different
 * footnote. Labels in code and comments are left as they are.
 */
function ownLabels(text: string, mark: string): string {
	const prose = proseOf(text);
	let written = "";
	let last = 0;
	for (const match of prose.matchAll(/\[\^([^\]\s]+)\]/g)) {
		const end = match.index + 2 + match[1].length;
		written += text.slice(last, end) + mark;
		last = end;
	}
	return written + text.slice(last);
}

/**
 * The note with every embed of a note replaced by what it shows, set apart
 * by blank lines as the embed sets it apart on screen. An embed of a note
 * already being written — the note itself, or one embedding it — is left as
 * it is, as Obsidian leaves it.
 */
export async function expandEmbeds(
	text: string,
	path: string,
	resolve: EmbedResolver
): Promise<ExpandedNote> {
	const result: ExpandedNote = { text: "", paths: new Set(), unresolved: false };
	let count = 0;

	const expand = async (
		text: string,
		path: string,
		ancestors: string[]
	): Promise<string> => {
		const embeds = embedsOf(text);
		if (embeds.length === 0 || ancestors.length > MAX_DEPTH) {
			return text;
		}
		let written = "";
		let last = 0;
		for (const embed of embeds) {
			const shown = await resolve(embed, path);
			if (!shown) {
				result.unresolved = true;
				continue;
			}
			if (shown.text === null) {
				continue;
			}
			result.paths.add(shown.path);
			if (ancestors.includes(shown.path)) {
				continue;
			}
			const inner = await expand(
				ownLabels(withoutFrontMatter(shown.text), `-embed-${++count}`),
				shown.path,
				[...ancestors, shown.path]
			);
			written += text.slice(last, embed.from) + "\n\n" + inner + "\n\n";
			last = embed.to;
		}
		return written + text.slice(last);
	};

	result.text = await expand(text, path, [path]);
	return result;
}
