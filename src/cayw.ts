import { requestUrl } from "obsidian";
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

function endpointUrl(port: number, params: Record<string, string>): string {
	// 127.0.0.1 rather than localhost: the name can resolve to ::1 first, and
	// Zotero's server binds the IPv4 loopback.
	return `http://127.0.0.1:${port}${ENDPOINT}?${new URLSearchParams(
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

export interface PickOptions {
	port: number;
	/**
	 * Skip the citation window and take whatever is selected in Zotero's pane.
	 * Those picks carry no locator, prefix or suffix — there was no window to
	 * type one in.
	 */
	selected?: boolean;
	/** Minimize Zotero's window once the pick is done. */
	minimize?: boolean;
}

function pickParams(options: PickOptions): Record<string, string> {
	// `format=pick` hands back the picked citations as JSON and formats
	// nothing; `src/pandoc.ts` does that. Without it the endpoint defaults to
	// LaTeX.
	const params: Record<string, string> = { format: "pick" };
	// Every parameter arrives at Zotero as a string and is read for truth, so
	// `selected=false` is as true as `selected=true`. A flag is sent only when
	// it is on, and left out entirely when it is off.
	if (options.selected) {
		params.selected = "true";
	}
	if (options.minimize) {
		params.minimize = "true";
	}
	return params;
}

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
		};
	});
}

/**
 * A standalone Zotero note is a thing the picker can return and a thing no
 * citation can be made of — it has no bibliography entry and so no citation
 * key. So is an item whose key Better BibTeX has not generated yet. Both are
 * dropped, and the caller is told how many, rather than writing `@` into the
 * note.
 */
export function citable(citations: Citation[]): Citation[] {
	return citations.filter((citation) => citation.citationKey);
}

/**
 * Opens Zotero's citation window and waits for it. Rejects with `CaywError` if
 * the endpoint is unreachable or answers something that is not a pick.
 */
export async function pickCitations(
	options: PickOptions
): Promise<Citation[]> {
	let response;
	try {
		response = await requestUrl({
			url: endpointUrl(options.port, pickParams(options)),
			method: "GET",
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
	return parseCitations(response.text);
}
