import { requestUrl, RequestUrlResponse } from "obsidian";
import { Citation } from "src/types";

/**
 * The client for Better BibTeX's "cite as you write" endpoint.
 *
 * Zotero runs a local HTTP server (Preferences → Advanced → "Allow other
 * applications on this computer to communicate with Zotero"), and Better BibTeX
 * registers `/better-bibtex/cayw` on it. A GET to that path opens Zotero's
 * citation window — the same one its word-processor plugins open, with the
 * page, prefix, suffix and "suppress author" fields — and the request stays
 * open, unanswered, for as long as the window is: the response is the pick.
 *
 * That makes the request unlike any other the plugin sends. It has no timeout
 * of its own on purpose, because there is no length of time after which a
 * reader still choosing a source has gone wrong.
 */

/** Zotero's local server. The beta runs one port up so both can be open at once. */
export const ZOTERO_PORT = 23119;
export const ZOTERO_BETA_PORT = 24119;

const ENDPOINT = "/better-bibtex/cayw";

/**
 * What the plugin calls itself to Zotero.
 *
 * Zotero's server answers nothing at all — it drops the connection — when the
 * request carries a `User-Agent` naming a browser, which is how it keeps a web
 * page open in one from reaching the local API. Obsidian's `requestUrl` goes
 * out through Electron's network stack, whose agent begins `Mozilla/5.0`, so
 * every request the plugin made would be dropped and a running Zotero would
 * look unreachable. Naming the plugin instead is what gets an answer.
 */
const USER_AGENT = "Citation Suite";

/** Sent with every request the plugin makes to Zotero. See `USER_AGENT`. */
export const REQUEST_HEADERS: Record<string, string> = {
	"User-Agent": USER_AGENT,
};

/**
 * How long the probe waits. It answers from a local server that has the answer
 * ready, so anything approaching this is Zotero not being there at all.
 */
const PROBE_TIMEOUT_MS = 2000;

/**
 * What the endpoint says about itself, before anything is asked of it.
 *
 * `starting` is Zotero running with Better BibTeX still loading its database,
 * which on a large library takes a moment after launch. It is worth telling
 * apart from `unreachable`: one is a wait, the other is something to fix.
 */
export type ZoteroStatus = "ready" | "starting" | "unreachable";

/** The endpoint refused the request, or answered something unreadable. */
export class CaywError extends Error {}

/**
 * Zotero's own answer to "are you there", part of Zotero rather than of Better
 * BibTeX: `Zotero is running`.
 */
const PING = "/connector/ping";

function serverUrl(port: number, path: string): string {
	// 127.0.0.1 rather than localhost: the name can resolve to ::1 first, and
	// Zotero's server binds the IPv4 loopback.
	return `http://127.0.0.1:${port}${path}`;
}

function endpointUrl(port: number, params: Record<string, string>): string {
	return `${serverUrl(port, ENDPOINT)}?${new URLSearchParams(
		params
	).toString()}`;
}

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
	let timer: number | undefined;
	try {
		return await Promise.race([
			promise,
			new Promise<never>((_resolve, reject) => {
				timer = window.setTimeout(
					() => reject(new CaywError("timed out")),
					ms
				);
			}),
		]);
	} finally {
		if (timer !== undefined) {
			window.clearTimeout(timer);
		}
	}
}

/**
 * Whether the endpoint is there, without opening anything. `probe` is the one
 * parameter the handler answers before it does any work of its own, so this
 * costs a round trip on the loopback and nothing else.
 */
export async function probeZotero(port: number): Promise<ZoteroStatus> {
	try {
		const response = await withTimeout(
			requestUrl({
				url: endpointUrl(port, { probe: "true" }),
				method: "GET",
				headers: REQUEST_HEADERS,
				throw: false,
			}),
			PROBE_TIMEOUT_MS
		);
		if (response.status !== 200) {
			return "unreachable";
		}
		return response.text.trim() === "starting" ? "starting" : "ready";
	} catch {
		// Zotero is not running, its server is off, or something else holds
		// the port. They are one case here: nothing to cite from.
		return "unreachable";
	}
}

/** What Better BibTeX says about itself, as far as the settings need to know. */
export type BetterBibTeXState = "ready" | "starting" | "missing" | "unknown";

/** Whether Zotero is there to cite from, for the settings to show. */
export interface ZoteroCheck {
	/** Something that is Zotero answers on the port. */
	running: boolean;
	/** Better BibTeX's state; `unknown` when Zotero is not running at all. */
	betterBibTeX: BetterBibTeXState;
}

/** A GET to Zotero's server that answers `null` rather than failing. */
async function ask(url: string): Promise<RequestUrlResponse | null> {
	try {
		return await withTimeout(
			requestUrl({
				url,
				method: "GET",
				headers: REQUEST_HEADERS,
				throw: false,
			}),
			PROBE_TIMEOUT_MS
		);
	} catch {
		return null;
	}
}

/**
 * Whether Zotero is running, and whether Better BibTeX is installed in it.
 * Neither question opens anything.
 *
 * The two are asked apart because they fail apart. Zotero's ping is Zotero's
 * own endpoint, so it answers whether Better BibTeX is there or not; the CAYW
 * probe is Better BibTeX's, and Zotero answers a path nothing has registered
 * with `404 No endpoint found` — which is how a Zotero without Better BibTeX
 * is told from one that is not running.
 */
export async function checkZotero(port: number): Promise<ZoteroCheck> {
	const ping = await ask(serverUrl(port, PING));
	if (!ping || ping.status !== 200) {
		return { running: false, betterBibTeX: "unknown" };
	}

	const probe = await ask(endpointUrl(port, { probe: "true" }));
	let betterBibTeX: BetterBibTeXState = "unknown";
	if (probe?.status === 200) {
		betterBibTeX = probe.text.trim() === "starting" ? "starting" : "ready";
	} else if (probe?.status === 404) {
		betterBibTeX = "missing";
	}
	return { running: true, betterBibTeX };
}

export interface PickOptions {
	port: number;
	/** Minimize Zotero's window once the pick is done. */
	minimize?: boolean;
}

/**
 * What the pick is asked for with. `format=pick` hands back the picked
 * citations as JSON and formats nothing; `src/pandoc.ts` does that. Without it
 * the endpoint defaults to LaTeX.
 *
 * Asking the endpoint to format is deliberately not done. What goes into the
 * note is the pandoc citation, always; a style is applied to what the reader
 * sees, by `src/render.ts`, and never to what is written down.
 */
const PICK_PARAMS: Record<string, string> = { format: "pick" };

/**
 * What minimizes Zotero's window without opening anything: `selected=true`
 * answers from the items selected in Zotero's pane, and `minimize=true` is
 * honoured on the way out. Every parameter arrives as a string and is read for
 * truth, so a flag is only ever sent when it is on.
 */
const MINIMIZE_PARAMS: Record<string, string> = {
	format: "pick",
	selected: "true",
	minimize: "true",
};

/**
 * The citations the picker returned, in the order they were picked.
 *
 * An empty array is a cancelled pick: closing the window without choosing
 * anything answers with an empty body, and so does an error Better BibTeX
 * handled itself (it flashes its own message in Zotero before answering).
 */
export function parseCitations(body: string): Citation[] {
	const text = body.trim();
	if (!text) {
		return [];
	}

	let parsed: unknown;
	try {
		parsed = JSON.parse(text);
	} catch {
		throw new CaywError(text);
	}
	if (!Array.isArray(parsed)) {
		throw new CaywError(text);
	}

	return parsed.map((item): Citation => {
		const citation = item as Partial<Citation>;
		return {
			id: typeof citation.id === "number" ? citation.id : 0,
			citationKey:
				typeof citation.citationKey === "string"
					? citation.citationKey
					: "",
			locator:
				typeof citation.locator === "string" ? citation.locator : "",
			label: typeof citation.label === "string" ? citation.label : "",
			prefix: typeof citation.prefix === "string" ? citation.prefix : "",
			suffix: typeof citation.suffix === "string" ? citation.suffix : "",
			suppressAuthor: !!citation.suppressAuthor,
			uri: typeof citation.uri === "string" ? citation.uri : undefined,
			itemType:
				typeof citation.itemType === "string"
					? citation.itemType
					: undefined,
			title: typeof citation.title === "string" ? citation.title : undefined,
			note: typeof citation.note === "string" ? citation.note : undefined,
		};
	});
}

/**
 * What a citation can be written for: everything with a citation key. A
 * standalone Zotero note has none — it has no bibliography entry — and is
 * inserted as its text instead (`pickedNotes`). An item whose key Better BibTeX
 * has not generated yet has none either; that one is dropped, and the caller
 * is told, rather than writing `@` into the note.
 */
export function citable(citations: Citation[]): Citation[] {
	return citations.filter((citation) => citation.citationKey);
}

/**
 * The Zotero notes picked in the citation window, with the HTML of each. Only
 * a note without citations of its own arrives as one: Better BibTeX answers a
 * note that holds citations with those citations.
 */
export function pickedNotes(citations: Citation[]): string[] {
	return citations
		.filter((citation) => !citation.citationKey && citation.itemType === "note")
		.map((citation) => citation.note ?? "")
		.filter((note) => note.trim() !== "");
}

/** A Zotero note in Better BibTeX's raw pick results, as a pick of its own. */
function noteCitation(item: unknown): Citation | null {
	const data = (item as { itemData?: Record<string, unknown> } | null)
		?.itemData;
	if (data?.type !== "note" || typeof data.note !== "string") {
		return null;
	}
	return {
		id: typeof data.id === "number" ? data.id : 0,
		citationKey: "",
		locator: "",
		label: "",
		prefix: "",
		suffix: "",
		suppressAuthor: false,
		itemType: "note",
		title: typeof data.title === "string" ? data.title : undefined,
		note: data.note,
	};
}

/**
 * The pick, out of what the endpoint answers a POST with:
 * `{ state, pick, output }`, where `output` is what a GET would have answered
 * — here the `pick` format's JSON — and `pick` is the raw result of the
 * citation window.
 *
 * The citations are read from `output`, as they always were. The notes are
 * read from `pick`, because `output` never holds them: Better BibTeX 9.0.64
 * marks the `pick` formatter as accepting notes by setting a property on the
 * method, then looks the formatter up with `.bind()`, which returns a function
 * without that property — so every note is filtered out before formatting. A
 * note that did make it into `output` in a later version is skipped there, so
 * that it is not inserted twice.
 *
 * An empty `output` with no notes is a cancelled pick.
 */
export function parsePickResponse(body: string): Citation[] {
	const text = body.trim();
	if (!text) {
		return [];
	}

	let parsed: unknown;
	try {
		parsed = JSON.parse(text);
	} catch {
		throw new CaywError(text);
	}
	if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
		throw new CaywError(text);
	}

	const { output, pick } = parsed as { output?: unknown; pick?: unknown };
	const citations =
		typeof output === "string"
			? parseCitations(output).filter(
					(citation) => citation.itemType !== "note"
				)
			: [];
	const notes = (Array.isArray(pick) ? (pick as unknown[]) : [])
		.flatMap((result) => {
			const items = (result as { citationItems?: unknown } | null)
				?.citationItems;
			return Array.isArray(items) ? (items as unknown[]) : [];
		})
		.map(noteCitation)
		.filter((note): note is Citation => note !== null);
	return [...citations, ...notes];
}

/**
 * Opens Zotero's citation window and waits for it, answering with the body the
 * endpoint sent. Rejects with `CaywError` if the endpoint is unreachable or
 * refuses the request.
 *
 * It is a POST, not a GET, for the notes: see `parsePickResponse`. The handler
 * reads the same parameters from the query string either way, and a POST has
 * to carry a JSON body, if an empty one.
 */
async function requestPick(port: number): Promise<string> {
	let response;
	try {
		response = await requestUrl({
			url: endpointUrl(port, PICK_PARAMS),
			method: "POST",
			contentType: "application/json",
			body: "{}",
			headers: REQUEST_HEADERS,
			// Read the body of a failure rather than an exception about it:
			// the endpoint puts the reason in the body it answers with.
			throw: false,
		});
	} catch (error) {
		throw new CaywError(error instanceof Error ? error.message : String(error));
	}

	if (response.status !== 200) {
		throw new CaywError(response.text.trim());
	}
	return response.text;
}

/**
 * Minimizes Zotero's window, answering nothing either way. A POST ignores
 * `minimize` — the handler only acts on it for a GET — so it is asked for in a
 * request of its own. It fails only where there is no window to minimize.
 */
async function minimizeZotero(port: number): Promise<void> {
	try {
		await requestUrl({
			url: endpointUrl(port, MINIMIZE_PARAMS),
			method: "GET",
			headers: REQUEST_HEADERS,
			throw: false,
		});
	} catch {
		// Zotero went away, and its window with it.
	}
}

/** The pick as data, for `src/pandoc.ts` to write. */
export async function pickCitations(
	options: PickOptions
): Promise<Citation[]> {
	try {
		return parsePickResponse(await requestPick(options.port));
	} finally {
		if (options.minimize) {
			void minimizeZotero(options.port);
		}
	}
}
