// The README screenshots, one function each. A shot sets up what it shows from
// a known state, measures its crop from the page rather than from fixed
// numbers, captures one or more panels, and puts the note back as it was.
// See docs/screenshots.md.
import { reconnect } from "./obsidian.mjs";
import { DEMO } from "./vault.mjs";

/**
 * Installs `window.__shot`, the helpers every shot calls in the page. It runs
 * again after each reload, the page having forgotten it.
 */
export function installHelpers(page, chapterPath) {
	return page.call((chapter) => {
		const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
		const plugin = () => app.plugins.plugins["citation-suite"];
		// The chapter's editor, whichever leaf is active: a click in the pane
		// makes the pane the active one.
		const editor = () => app.workspace.getLeavesOfType("markdown")[0]?.view.editor;
		const box = (el) => {
			const r = el.getBoundingClientRect();
			return { x: r.x, y: r.y, width: r.width, height: r.height, right: r.right, bottom: r.bottom };
		};
		window.__shot = {
			sleep,
			editor,
			box,
			async waitFor(test, timeout = 15000) {
				const end = Date.now() + timeout;
				while (Date.now() < end) {
					const value = test();
					if (value) return value;
					await sleep(100);
				}
				throw new Error(`timed out waiting for ${test}`);
			},
			async setting(key, value) {
				plugin().settings[key] = value;
				await plugin().saveSettings();
				if (key === "citationStyle" || key === "libraryFile") await plugin().restyle();
				else plugin().redrawCitations();
			},
			/** The state every shot starts from. */
			async reset() {
				// A tooltip left by an earlier hover; menus, popovers and the
				// citation window are closed with Escape by the shot that opened them.
				document.querySelectorAll("body > .tooltip").forEach((el) => el.remove());
				app.workspace.leftSplit.collapse();
				app.workspace.rightSplit.collapse();
				const settings = plugin().settings;
				Object.assign(settings, { footnotes: false, footnotePrefix: "", footnotePopover: true, libraryFile: "" });
				settings.citationStyle = "http://www.zotero.org/styles/chicago-notes-bibliography";
				await plugin().saveSettings();
				await plugin().restyle();
				let style = document.getElementById("readme-shot-style");
				if (!style) {
					style = document.head.createEl("style", { attr: { id: "readme-shot-style" } });
				}
				// The note's header row is the same in every shot, and a crop
				// would cut through its breadcrumb.
				style.textContent = '.workspace-leaf-content[data-type="markdown"] .view-header { display: none; }';
			},
			async open() {
				const file = app.vault.getMarkdownFiles().find((f) => f.path.endsWith(chapter));
				const leaf = app.workspace.getLeavesOfType("markdown")[0] ?? app.workspace.getLeaf(false);
				await leaf.openFile(file, { active: true });
				await sleep(1500);
				return file.path;
			},
			async read() {
				return app.vault.read(app.workspace.getLeavesOfType("markdown")[0].view.file);
			},
			async restore(text) {
				await app.vault.modify(app.workspace.getLeavesOfType("markdown")[0].view.file, text);
				await sleep(800);
			},
			findLine(prefix) {
				const e = editor();
				for (let i = 0; i < e.lineCount(); i++) if (e.getLine(i).startsWith(prefix)) return i;
				throw new Error(`no line starting ${prefix}`);
			},
			/** The note's rendered line holding the text (not one in a popover). */
			line(text) {
				return [...editor().cm.contentDOM.querySelectorAll(".cm-line")].find((el) => el.textContent.includes(text));
			},
			/** Scrolls so that a line's top sits at `y` in the viewport. */
			async scrollTo(lineNo, y) {
				const cm = editor().cm;
				const pos = cm.state.doc.line(lineNo + 1).from;
				for (let i = 0; i < 4; i++) {
					const top = cm.scrollDOM.getBoundingClientRect().top;
					cm.scrollDOM.scrollTop = cm.lineBlockAt(pos).top - (y - top);
					await sleep(500);
				}
			},
			/** Scrolls until the rendered line holding the text has its top at `y`. */
			async align(text, y) {
				for (let i = 0; i < 4; i++) {
					const el = __shot.line(text);
					if (!el) return;
					editor().cm.scrollDOM.scrollTop += el.getBoundingClientRect().top - y;
					await sleep(400);
				}
			},
			/** Puts the cursor on a line without scrolling to it. */
			caret(lineNo, ch = 0) {
				const cm = editor().cm;
				cm.dispatch({ selection: { anchor: cm.state.doc.line(lineNo + 1).from + ch } });
			},
			/** The note's text column; the pane, once clicked, is the active leaf. */
			content() {
				return box(editor().cm.contentDOM);
			},
			pane() {
				return app.workspace.getLeavesOfType("citation-suite-bibliography")[0]?.view;
			},
			async showPane(width) {
				app.workspace.rightSplit.expand();
				app.workspace.rightSplit.containerEl.style.width = `${width}px`;
				app.workspace.rightSplit.size = width;
				window.dispatchEvent(new Event("resize"));
				await sleep(500);
			},
			/** Draws panels with rounded corners and a stroke, side by side on a transparent ground. */
			async frame(panels, { radius, stroke, gap }) {
				const images = await Promise.all(
					panels.map(
						(data) =>
							new Promise((resolve) => {
								const image = new Image();
								image.onload = () => resolve(image);
								image.src = `data:image/png;base64,${data}`;
							})
					)
				);
				const canvas = document.createElement("canvas");
				canvas.width = images.reduce((sum, image) => sum + image.width, 0) + gap * (images.length - 1);
				canvas.height = Math.max(...images.map((image) => image.height));
				const context = canvas.getContext("2d");
				let x = 0;
				for (const image of images) {
					context.save();
					context.beginPath();
					context.roundRect(x, 0, image.width, image.height, radius);
					context.clip();
					context.drawImage(image, x, 0);
					context.restore();
					// The stroke is drawn inside the edge, so the transparent
					// corners stay clean on any background.
					context.beginPath();
					context.roundRect(x + stroke / 2, stroke / 2, image.width - stroke, image.height - stroke, radius - stroke / 2);
					context.lineWidth = stroke;
					context.strokeStyle = "rgba(255, 255, 255, 0.16)";
					context.stroke();
					x += image.width + gap;
				}
				return canvas.toDataURL("image/png").split(",")[1];
			},
		};
	}, chapterPath);
}

/** A crop around boxes, in CSS pixels, padded and kept inside the viewport. */
function around(boxes, pad = {}) {
	const { top = 16, right = 16, bottom = 16, left = 16 } = pad;
	const x = Math.max(0, Math.min(...boxes.map((b) => b.x)) - left);
	const y = Math.max(0, Math.min(...boxes.map((b) => b.y)) - top);
	return {
		x,
		y,
		width: Math.max(...boxes.map((b) => b.right)) + right - x,
		height: Math.max(...boxes.map((b) => b.bottom)) + bottom - y,
	};
}

/** Key suggestions open on `@cavana`, typed into footnote ch3-17's group. */
async function citing(page) {
	const original = await page.call(async () => {
		await __shot.reset();
		await __shot.open();
		const text = await __shot.read();
		const n = __shot.findLine("[^ch3-17]:");
		await __shot.scrollTo(n, 500);
		const e = __shot.editor();
		e.focus();
		e.setCursor({ line: n, ch: e.getLine(n).lastIndexOf("]") });
		return text;
	});
	try {
		return await suggestions(page);
	} finally {
		await page.key("Escape");
		await page.call(async (text) => {
			__shot.editor().cm.contentDOM.setCssProps({ "clip-path": "" });
			await __shot.restore(text);
		}, original);
	}
}

async function suggestions(page) {
	await page.type("; @cavana");
	const selected = await page.call(async () => {
		await __shot.waitFor(() => document.querySelectorAll(".suggestion-container .suggestion-item").length >= 3);
		await __shot.sleep(800);
		const items = [...document.querySelectorAll(".suggestion-container .suggestion-item")];
		return items.findIndex((item) => item.classList.contains("is-selected"));
	});
	for (let i = 0; i < selected; i++) await page.key("ArrowUp");
	const { list, paragraph, content } = await page.call(() => {
		const list = __shot.box(document.querySelector(".suggestion-container"));
		// The crop ends with the list, which would cut a line of the note in
		// half beside it: the note's text is clipped above that line instead.
		const contentDOM = __shot.editor().cm.contentDOM;
		const cut = [...contentDOM.querySelectorAll(".cm-line")]
			.map((line) => line.getBoundingClientRect())
			.find((r) => r.top < list.bottom && r.bottom > list.bottom - 4);
		if (cut) contentDOM.setCssProps({ "clip-path": `inset(0 0 ${contentDOM.getBoundingClientRect().bottom - cut.top}px 0)` });
		return {
			list,
			paragraph: __shot.box(__shot.line("One of the representatives")),
			content: __shot.content(),
		};
	});
	const panel = await page.capture(
		around([paragraph, list, { ...content, y: paragraph.y, bottom: paragraph.bottom }], { left: 22, top: 14, bottom: 2 })
	);
	return [panel];
}

/** Short and full notes, a tooltip on the ch3-14 short form, and an unknown key. */
async function preview(page) {
	await page.call(async () => {
		await __shot.reset();
		await __shot.open();
		const n = __shot.findLine("[^ch3-12]:");
		__shot.caret(n - 8);
		await __shot.scrollTo(n, 230);
		await __shot.sleep(1500);
	});
	// The citation can be drawn again under a pointer that has not moved, and
	// a redrawn element gets no `mouseover`: hover until the tooltip shows.
	for (let attempt = 0; ; attempt++) {
		const target = await page.call(() => {
			const cite = [...document.querySelectorAll(".citation-suite-citation")].find((el) => el.textContent.startsWith("McFarland, under"));
			return __shot.box(cite);
		});
		await page.hover(Math.round(target.x + target.width / 2), Math.round(target.y + target.height / 2));
		const shown = await page.call(() => __shot.waitFor(() => document.querySelector("body > .tooltip"), 3000).then(() => true, () => false));
		if (shown) break;
		if (attempt === 4) throw new Error("the tooltip never showed");
	}
	const boxes = await page.call(async (typo) => {
		const tooltip = document.querySelector("body > .tooltip");
		await __shot.sleep(400);
		return [
			__shot.box(__shot.line("Stackhouse")),
			__shot.box(__shot.line(`@${typo}`)),
			__shot.box(tooltip),
			__shot.content(),
		];
	}, DEMO.typo.to);
	const [first, last, tooltip, content] = boxes;
	const panel = await page.capture(
		around([first, last, tooltip, { ...content, y: first.y, bottom: last.bottom }], { left: 18, right: 18, top: 22, bottom: 18 })
	);
	await page.mouse("mouseMoved", 5, 995);
	return [panel];
}

/** The pane in IEEE beside the note's numbers, with an entry's context menu. */
async function bibliography(page) {
	await page.call(async () => {
		await __shot.reset();
		await __shot.setting("citationStyle", "http://www.zotero.org/styles/ieee");
		await __shot.showPane(440);
		await __shot.open();
		await __shot.waitFor(() => __shot.pane()?.containerEl.querySelectorAll(".csl-entry").length >= 10);
		const n = __shot.findLine("[^ch3-3]:");
		__shot.caret(0);
		await __shot.scrollTo(n, 66);
		await __shot.sleep(1000);
		await __shot.align("In fact, Christians who make", __shot.editor().cm.scrollDOM.getBoundingClientRect().top + 24);
		await __shot.sleep(800);
	});
	const entry = await page.call(() => __shot.box(__shot.pane().containerEl.querySelectorAll(".csl-entry")[1]));
	await page.click(Math.round(entry.x + 210), Math.round(entry.y + 22), "right");
	const area = await page.call(async () => {
		await __shot.waitFor(() => document.querySelector(".menu"));
		await __shot.sleep(400);
		const editorBox = __shot.box(__shot.editor().cm.scrollDOM.closest(".view-content"));
		const status = __shot.box(document.querySelector(".status-bar"));
		return { x: __shot.content().x - 22, y: editorBox.y, right: window.innerWidth, bottom: status.y - 2 };
	});
	const panel = await page.capture({ x: area.x, y: area.y, width: area.right - area.x, height: area.bottom - area.y });
	await page.key("Escape");
	return [panel];
}

/** The select menu with the open collection, and the changed and unknown keys. */
async function bibliographySelect(page, { collectionLink }) {
	await page.call(async (link) => {
		await __shot.reset();
		await __shot.setting("citationStyle", "http://www.zotero.org/styles/ieee");
		await __shot.showPane(440);
		await __shot.open();
		await __shot.waitFor(() => __shot.pane()?.containerEl.querySelector(".citation-suite-bibliography-missing"));
		// Opens the chapter's collection in Zotero's window, which the menu
		// then offers under the libraries.
		window.open(link);
		await __shot.sleep(2500);
	}, collectionLink);
	const bottom = await page.call(async () => {
		const scroller = __shot.pane().containerEl.querySelector(".view-content");
		scroller.scrollTop = scroller.scrollHeight;
		await __shot.sleep(600);
		const entries = scroller.querySelectorAll(".csl-entry");
		const pane = __shot.box(scroller);
		const missing = __shot.box(scroller.querySelector(".citation-suite-bibliography-missing"));
		const last = __shot.box(entries[entries.length - 1]);
		// From just under the last entry's divider, which is its top border.
		return { x: pane.x - 2, y: last.y + 2, width: pane.width + 4, height: missing.bottom + 6 - (last.y + 2) };
	});
	const keysPanel = await page.capture(bottom);
	const button = await page.call(async () => {
		const scroller = __shot.pane().containerEl.querySelector(".view-content");
		scroller.scrollTop = 0;
		await __shot.sleep(600);
		const select = [...__shot.pane().containerEl.querySelectorAll(".clickable-icon")].find(
			(el) => el.getAttribute("aria-label") === "Select all sources in Zotero"
		);
		return __shot.box(select);
	});
	await page.click(Math.round(button.x + button.width / 2), Math.round(button.y + button.height / 2));
	const top = await page.call(async (height) => {
		const menu = await __shot.waitFor(() => {
			const el = document.querySelector(".menu");
			return el && el.querySelectorAll(".menu-item").length >= 2 && el;
		});
		await __shot.sleep(400);
		const pane = __shot.box(__shot.pane().containerEl.querySelector(".view-content"));
		return { x: pane.x - 2, y: pane.y, width: pane.width + 4, height: Math.max(height, __shot.box(menu).bottom + 40 - pane.y) };
	}, bottom.height);
	const selectPanel = await page.capture(top);
	await page.key("Escape");
	return [selectPanel, keysPanel];
}

/** The note on a phone, from the vault's `.bib`, and the citation window with a pill. */
async function mobile(page) {
	await page.call(async () => {
		await __shot.reset();
		const win = require("@electron/remote").getCurrentWindow();
		win.setContentSize(410, 880);
		await __shot.sleep(500);
		setTimeout(() => app.emulateMobile(true), 100);
	});
	page = await reconnect(page, 410, 880);
	await installHelpers(page, DEMO.chapter);
	const original = await page.call(async (bib) => {
		await __shot.reset();
		await __shot.setting("libraryFile", bib);
		await __shot.open();
		const n = __shot.findLine("[^ch3-12]:");
		__shot.caret(n - 8);
		document.activeElement?.blur();
		await __shot.scrollTo(n, 150);
		await __shot.sleep(1000);
		await __shot.align("Stackhouse", 150);
		await __shot.sleep(1000);
		return __shot.read();
	}, DEMO.bib);
	const notePanel = await page.capture();
	await page.call(async () => {
		const e = __shot.editor();
		const n = __shot.findLine("[^ch3-14]:");
		e.focus();
		e.setCursor({ line: n, ch: e.getLine(n).length });
		await __shot.sleep(500);
		app.commands.executeCommandById("citation-suite:insert-citation");
		await __shot.waitFor(() => document.querySelector(".prompt input"));
		await __shot.sleep(600);
	});
	await page.type("mann");
	await page.call(() => __shot.waitFor(() => document.querySelectorAll(".prompt .suggestion-item").length >= 1));
	await page.key("Enter");
	await page.type("137");
	await page.key("Enter");
	await page.type("public");
	await page.call(async () => {
		await __shot.waitFor(() => document.querySelectorAll(".prompt .suggestion-item").length >= 5);
		await __shot.sleep(600);
	});
	const windowPanel = await page.capture();
	await page.key("Escape");
	await page.call(async (text) => {
		await __shot.restore(text);
		await __shot.setting("libraryFile", "");
		require("@electron/remote").getCurrentWindow().setContentSize(1600, 1000);
		await __shot.sleep(500);
		setTimeout(() => app.emulateMobile(false), 100);
	}, original);
	page = await reconnect(page, 1600, 1000);
	await installHelpers(page, DEMO.chapter);
	return { panels: [notePanel, windowPanel], page };
}

/** A footnote inserted with the chapter's own label prefix, its text in the popup. */
async function footnotes(page) {
	const original = await page.call(async () => {
		await __shot.reset();
		Object.assign(app.plugins.plugins["citation-suite"].settings, {
			footnotes: true,
			footnotePrefix: "ch3-",
			footnoteNumbering: "arabic",
			footnotePlacement: "paragraph",
			footnotePopover: true,
		});
		await app.plugins.plugins["citation-suite"].saveSettings();
		await __shot.open();
		const text = await __shot.read();
		const n = __shot.findLine("Hence, a key element");
		await __shot.scrollTo(n, 100);
		const e = __shot.editor();
		e.focus();
		e.setCursor({ line: n, ch: e.getLine(n).length });
		await __shot.sleep(500);
		app.commands.executeCommandById("citation-suite:insert-footnote");
		await __shot.waitFor(() => document.querySelector(".hover-popover.is-editing"));
		await __shot.sleep(600);
		return text;
	});
	try {
		return await footnotePopover(page);
	} finally {
		await page.key("Escape");
		await page.call((text) => __shot.restore(text), original);
	}
}

async function footnotePopover(page) {
	await page.type("See also [@tiptonCivilReligionPublic2019, p. 88]");
	const boxes = await page.call(async () => {
		await __shot.waitFor(() => __shot.line("See also Steven"));
		await __shot.sleep(1200);
		return [
			__shot.box(__shot.line("Hence, a key element")),
			__shot.box(__shot.line("See also Steven")),
			__shot.box(document.querySelector(".hover-popover")),
			__shot.content(),
		];
	});
	const [paragraph, body, popover, content] = boxes;
	const panel = await page.capture(
		around([paragraph, body, popover, { ...content, y: paragraph.y, bottom: body.bottom }], { left: 22, right: 16, top: 16, bottom: 18 })
	);
	return [panel];
}

/**
 * Every shot: its file in `assets/`, how its panels are framed, and the
 * function that takes them. Shots that reload the window answer the new page.
 */
export const SHOTS = [
	{ name: "citing", radius: 18, run: citing },
	{ name: "preview", radius: 18, run: preview },
	{ name: "bibliography", radius: 18, run: bibliography },
	{ name: "bibliography-select", radius: 18, run: bibliographySelect },
	{ name: "mobile", radius: 42, run: mobile },
	{ name: "footnotes", radius: 18, run: footnotes },
];

