import { App, FileSystemAdapter, TFile } from "obsidian";
import { homedir, platform } from "os";
import { dirname, isAbsolute, join } from "path";
import {
	carriedLocale,
	CitationRenderer,
	parentId,
	StyleRef,
	styleLocale,
} from "src/render";
import {
	cslCandidates,
	isStyleUrl,
	StyleProperties,
	styleForUrl,
	styleProperties,
} from "src/noteStyle";
import { parseStyle, readHead, readStyleFile } from "src/styles";
import { CitationStyle } from "src/types";

/**
 * The style each note is previewed in.
 *
 * A note that names neither `csl` nor `lang` is previewed as it always was:
 * in the style chosen in the settings, the way Zotero writes it. A note that
 * names either is a note written for pandoc, and it is previewed the way
 * pandoc will export it (`src/noteStyle.ts` has the rules): in the style its
 * `csl` names — or the settings' style, with its own `lang` — in its language,
 * forced over the style's, and with its locators read in that language, since
 * that is how pandoc reads them. "Do not style the preview" in the settings
 * still turns the preview off for every note.
 *
 * A note without either property is answered at once. Finding a note's style
 * file takes the file system, so the first answer for such a note comes later,
 * and `onChange` says when; so does a change of the properties, which Obsidian
 * reports once the note's metadata is read again.
 */

/** How a note is previewed, and what its properties asked for that could not be had. */
export interface NoteStyle {
	/** The style to render in, or `null` for no preview. */
	ref: StyleRef | null;
	/** The note's `csl` and `lang`, or `null` when it names neither. */
	properties: StyleProperties | null;
	/** The style the preview found, when the note named one. */
	found: CitationStyle | null;
	/** The note's `csl`, when no style could be found for it. */
	missingCsl: string | null;
	/** The language the note or its style asks for, when the preview does not carry it. */
	uncarriedLocale: string | null;
}

/** What the resolver is handed by the plugin. */
export interface NoteStylesContext {
	renderer: CitationRenderer;
	/** The style chosen in the settings, or empty for no preview. */
	styleId(): string;
	/** Whether notes' `csl` and `lang` are read at all. */
	readProperties(): boolean;
}

/** pandoc's user data directories: the ones it reads `csl/` from. */
function pandocDataDirs(): string[] {
	const home = homedir();
	if (platform() === "win32") {
		return [join(process.env.APPDATA ?? join(home, "AppData", "Roaming"), "pandoc")];
	}
	return [
		join(process.env.XDG_DATA_HOME ?? join(home, ".local", "share"), "pandoc"),
		join(home, ".pandoc"),
	];
}

export class NoteStyles {
	/** Each note's answer, and what it was worked out from. */
	private resolved = new Map<string, { signature: string; style: NoteStyle }>();
	private resolving = new Map<string, Promise<NoteStyle>>();
	/** What each note asked about was last answered from. */
	private seen = new Map<string, string>();
	private listeners = new Set<(path: string) => void>();

	constructor(
		private app: App,
		private context: NoteStylesContext
	) {}

	/** Calls back with a note's path when its style has been worked out anew. */
	onChange(listener: (path: string) => void): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	/** Forgets every answer: the settings changed what they are worked out from. */
	clear(): void {
		this.resolved.clear();
		this.resolving.clear();
		this.seen.clear();
	}

	/**
	 * Called when a note's metadata was read again: if its `csl` or `lang`
	 * changed, its answer is worked out anew and `onChange` is told.
	 */
	metadataChanged(file: TFile): void {
		const seen = this.seen.get(file.path);
		if (seen !== undefined && seen !== this.signature(file.path)) {
			this.resolved.delete(file.path);
			void this.resolve(file.path).then(() => this.announce(file.path));
		}
	}

	/** The note's properties as they stand, or none when they are not read. */
	private properties(path: string): StyleProperties {
		if (!this.context.readProperties()) {
			return { csl: null, lang: null };
		}
		return this.frontmatterProperties(path);
	}

	/** The note's properties as they stand, read or not for the preview. */
	private frontmatterProperties(path: string): StyleProperties {
		const file = this.app.vault.getFileByPath(path);
		const frontmatter = file
			? this.app.metadataCache.getFileCache(file)?.frontmatter
			: undefined;
		return styleProperties(frontmatter);
	}

	/**
	 * The carried locale pandoc reads the note's locators in, for writing
	 * them: the note's `lang`, or else the language of the style its `csl`
	 * names, or else `en-US` — whatever the settings say about the preview,
	 * since the export does not ask them. `null` for a language the plugin
	 * carries no locale for.
	 */
	async pandocLocale(path: string | null): Promise<string | null> {
		const properties = path
			? this.frontmatterProperties(path)
			: { csl: null, lang: null };
		let wanted = properties.lang ?? "";
		if (!wanted && properties.csl && path) {
			const style = await this.findStyle(properties.csl, path);
			wanted = style ? (await this.styleText(style)).language : "";
		}
		return carriedLocale(wanted || "en-US") || null;
	}

	/**
	 * A style's text and its rules' — its parent's for a dependent style, which
	 * holds the rules and the terms a locator is read in — and the language it
	 * names: the dependent style's own before its parent's. Empty for a style
	 * that cannot be read.
	 */
	private async styleText(
		style: CitationStyle
	): Promise<{ rules: string; language: string }> {
		const read = async (source: CitationStyle): Promise<string> =>
			readStyleFile(source).catch(() => "");
		const csl = await read(style);
		const parent = this.context.renderer.styleById(parentId(csl));
		const rules = parent ? await read(parent) : csl;
		return { rules, language: styleLocale(csl) || styleLocale(rules) };
	}

	/** Everything an answer is worked out from, as one string. */
	private signature(path: string): string {
		const { csl, lang } = this.properties(path);
		return [this.context.styleId(), csl ?? "", lang ?? ""].join("\n");
	}

	/**
	 * The note's style now, or `undefined` while it is being worked out — which
	 * only a note naming `csl` or `lang` ever is, and only the first time.
	 * `onChange` says when it is done.
	 */
	current(path: string | null): NoteStyle | undefined {
		if (path === null) {
			return this.plain();
		}
		const signature = this.signature(path);
		this.seen.set(path, signature);
		const properties = this.properties(path);
		if (!properties.csl && !properties.lang) {
			return this.plain();
		}
		const known = this.resolved.get(path);
		if (known && known.signature === signature) {
			return known.style;
		}
		void this.resolve(path).then(() => this.announce(path));
		return undefined;
	}

	/** The note's style, worked out if it has to be. */
	async resolve(path: string): Promise<NoteStyle> {
		const signature = this.signature(path);
		this.seen.set(path, signature);
		const known = this.resolved.get(path);
		if (known && known.signature === signature) {
			return known.style;
		}
		const key = `${path}\n${signature}`;
		let resolving = this.resolving.get(key);
		if (!resolving) {
			resolving = this.work(path, this.properties(path));
			this.resolving.set(key, resolving);
		}
		const style = await resolving;
		this.resolving.delete(key);
		if (this.signature(path) === signature) {
			this.resolved.set(path, { signature, style });
		}
		return style;
	}

	private announce(path: string): void {
		this.listeners.forEach((listener) => listener(path));
	}

	/** A note previewed as Zotero writes it, in the settings' style. */
	private plain(): NoteStyle {
		return {
			ref: this.context.renderer.zoteroStyle(this.context.styleId()),
			properties: null,
			found: null,
			missingCsl: null,
			uncarriedLocale: null,
		};
	}

	private async work(path: string, properties: StyleProperties): Promise<NoteStyle> {
		const { renderer } = this.context;
		const settings = renderer.zoteroStyle(this.context.styleId());
		if (!properties.csl && !properties.lang) {
			return this.plain();
		}
		if (!settings) {
			// No preview at all, whatever the note names.
			return { ...this.plain(), properties };
		}

		let found: CitationStyle | null = null;
		if (properties.csl) {
			found = await this.findStyle(properties.csl, path);
		}
		const style = found ?? settings.style;

		// pandoc's language: the note's, or the style's own — a dependent
		// style's before its parent's — or `en-US`.
		const { rules, language } = await this.styleText(style);
		const wanted = properties.lang || language || "en-US";
		const locale = carriedLocale(wanted);
		return {
			ref: renderer.pandocStyle(style, locale || "en-US", rules),
			properties,
			found,
			missingCsl: properties.csl && !found ? properties.csl : null,
			uncarriedLocale: locale ? null : wanted,
		};
	}

	/**
	 * The style a `csl` value names: for a URL, the style Zotero has under it;
	 * otherwise the first CSL file where pandoc would look — the note's folder,
	 * the vault's root, and the `csl` folder of pandoc's data directory.
	 */
	private async findStyle(csl: string, notePath: string): Promise<CitationStyle | null> {
		const { renderer } = this.context;
		if (isStyleUrl(csl)) {
			return styleForUrl(csl, renderer.knownStyles());
		}
		const adapter = this.app.vault.adapter;
		const vault = adapter instanceof FileSystemAdapter ? adapter.getBasePath() : "";
		const folders = vault ? [join(vault, dirname(notePath)), vault] : [];
		for (const candidate of cslCandidates(csl, folders, pandocDataDirs(), join, isAbsolute)) {
			const head = await readHead(candidate);
			const style = head ? parseStyle(head, candidate) : null;
			if (style) {
				return style;
			}
		}
		return null;
	}
}
