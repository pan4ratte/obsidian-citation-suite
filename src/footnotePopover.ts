import { EditorView } from "@codemirror/view";
import { App, Editor, HoverParent, HoverPopover, MarkdownView, TFile } from "obsidian";

/**
 * A new footnote's text, opened for writing in the popover Obsidian's own
 * "Insert footnote" command opens: an editor of the footnote alone, floating
 * over its anchor, with the cursor at the end of what it already holds.
 *
 * Read out of Obsidian 1.13.7's `app.js`, `Editor.insertFootnote` does three
 * things once the footnote is in: it saves the note, has the metadata cache
 * read it — the popover finds the footnote's text by `#[^label]`, and only the
 * cache knows where that is — and creates a hover popover on that link in
 * source mode, which makes its embed editable and focused at once. The
 * popover's class is not exported. The one way to it from a plugin is the core
 * Page preview plugin's `onLinkHover`, which creates it with the state it is
 * handed and does not check whether Page preview is enabled.
 *
 * None of that is public API, so every step is allowed to fail, and the caller
 * is told whether the popover opened.
 */

/** How long the metadata cache is waited on to have read the new footnote. */
const INDEX_TIMEOUT_MS = 2000;

interface PagePreview {
	onLinkHover(
		parent: HoverParent,
		targetEl: HTMLElement,
		linktext: string,
		sourcePath: string,
		state?: unknown
	): Promise<void>;
}

interface InternalApp {
	internalPlugins?: {
		getPluginById(id: string): { instance?: Partial<PagePreview> } | null;
	};
}

function pagePreview(app: App): PagePreview | null {
	const instance = (app as unknown as InternalApp).internalPlugins?.getPluginById(
		"page-preview"
	)?.instance;
	return typeof instance?.onLinkHover === "function"
		? (instance as PagePreview)
		: null;
}

/**
 * Saves the note and waits for the metadata cache to have the footnote in it,
 * or for the wait to run out. Whether it has it is the answer.
 */
async function saveAndIndex(
	view: MarkdownView,
	file: TFile,
	label: string
): Promise<boolean> {
	const { metadataCache } = view.app;
	const wanted = label.toLowerCase();
	const indexed = (): boolean =>
		metadataCache
			.getFileCache(file)
			?.footnotes?.some((footnote) => footnote.id.toLowerCase() === wanted) ??
		false;

	// Listened for before the save, so that a quick answer is not missed.
	const ready = new Promise<boolean>((resolve) => {
		const done = (result: boolean): void => {
			metadataCache.offref(ref);
			window.clearTimeout(timer);
			resolve(result);
		};
		const ref = metadataCache.on("changed", (changed) => {
			if (changed === file && indexed()) {
				done(true);
			}
		});
		const timer = window.setTimeout(() => done(indexed()), INDEX_TIMEOUT_MS);
	});
	await view.save();
	return ready;
}

/**
 * Puts the cursor at the end of the footnote's text in the popover, past a
 * citation already in it, for the reader to go on writing after it.
 *
 * The popover's editor holds the footnote's text alone, with the cursor at its
 * start. It is the popover's `embed`, which is not public either.
 */
function putCursorAtEnd(popover: HoverPopover): void {
	const editor = (popover as unknown as { embed?: { editor?: Editor } }).embed
		?.editor;
	if (!editor) {
		return;
	}
	let line = editor.lastLine();
	while (line > 0 && editor.getLine(line).trim() === "") {
		line--;
	}
	editor.setCursor({ line, ch: editor.getLine(line).length });
}

/**
 * Has the cursor put at the end of the popover's text once its editor takes
 * the focus. The popover's editor is focused only once the popover is on
 * screen, which is after it has been asked for and its text loaded, and
 * whatever the cursor was set to before that is not kept; so it is set on that
 * first focus, and only then, so that coming back into the popover later
 * leaves the cursor where the reader put it. A popover already focused has it
 * set at once.
 */
function cursorToEndOnFocus(popover: HoverPopover): void {
	const { hoverEl } = popover;
	if (hoverEl.contains(hoverEl.doc.activeElement)) {
		putCursorAtEnd(popover);
		return;
	}
	hoverEl.addEventListener(
		"focusin",
		() => hoverEl.win.setTimeout(() => putCursorAtEnd(popover)),
		{ once: true }
	);
}

/**
 * Opens the text of the footnote labelled `label`, whose anchor starts at
 * `anchorFrom` in the editor, in Obsidian's footnote popover. Whether it did
 * is the answer: when it did not, the footnote is still in the note, and the
 * caller takes the reader to its text instead.
 */
export async function openFootnotePopover(
	view: MarkdownView,
	editor: Editor,
	anchorFrom: number,
	label: string
): Promise<boolean> {
	const preview = pagePreview(view.app);
	const file = view.file;
	const cm = (editor as unknown as { cm?: EditorView }).cm;
	if (!preview || !file || !cm) {
		return false;
	}
	try {
		if (!(await saveAndIndex(view, file, label))) {
			return false;
		}
		// The element the anchor is drawn in, for the popover to stand by.
		const { node } = cm.domAtPos(anchorFrom + 1);
		const targetEl = node.instanceOf(HTMLElement) ? node : node.parentElement;
		if (!targetEl) {
			return false;
		}

		// The popover sets itself on its parent when it shows and clears
		// itself when it hides. The view stays its parent, as it is for
		// Obsidian's own command; this only lets the popover be seen arriving.
		let opened: HoverPopover | null = null;
		const parent: HoverParent = {
			get hoverPopover() {
				return view.hoverPopover;
			},
			set hoverPopover(popover) {
				view.hoverPopover = popover;
				if (popover && popover !== opened) {
					opened = popover;
					cursorToEndOnFocus(popover);
					// Closed with nothing else taking the focus, the popover
					// hands it back to the note, as Obsidian's own does.
					popover.register(() => {
						const doc = targetEl.doc;
						targetEl.win.setTimeout(() => {
							if (doc.activeElement === doc.body) {
								editor.focus();
							}
						});
					});
				}
			},
		};
		await preview.onLinkHover(parent, targetEl, `#[^${label}]`, file.path, {
			mode: "source",
		});
		// The text is loaded now. A popover focused before it was has had its
		// cursor put at the end of nothing, and loading the text took it back
		// to the start.
		const shown = opened as HoverPopover | null;
		if (shown?.hoverEl.contains(shown.hoverEl.doc.activeElement)) {
			putCursorAtEnd(shown);
		}
		return true;
	} catch (error) {
		console.error(error);
		return false;
	}
}
