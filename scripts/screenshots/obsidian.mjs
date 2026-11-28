// A separate Obsidian instance for the README screenshots, driven over the
// Chrome DevTools Protocol. It runs on a profile of its own, so the Obsidian
// the developer works in, its vaults, its language and its settings are never
// touched. See docs/screenshots.md.
import { spawn } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { homedir, platform, tmpdir } from "node:os";
import { join } from "node:path";

const PORT = 9333;
/** Every shot is taken at this pixel ratio, whatever the screen's scaling. */
export const SCALE = 1.5;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Where Obsidian keeps its updated app (`obsidian-x.y.z.asar`) on this system. */
function obsidianDataDir() {
	if (platform() === "win32") return join(process.env.APPDATA ?? "", "obsidian");
	if (platform() === "darwin") return join(homedir(), "Library", "Application Support", "obsidian");
	return join(homedir(), ".config", "obsidian");
}

function obsidianExecutable() {
	const candidates = [
		process.env.OBSIDIAN_EXE,
		join(process.env.LOCALAPPDATA ?? "", "Programs", "Obsidian", "Obsidian.exe"),
		join(process.env.LOCALAPPDATA ?? "", "Obsidian", "Obsidian.exe"),
		"C:\\Program Files\\Obsidian\\Obsidian.exe",
		"/Applications/Obsidian.app/Contents/MacOS/Obsidian",
		"/usr/bin/obsidian",
	].filter(Boolean);
	const found = candidates.find((path) => existsSync(path));
	if (!found) throw new Error("Obsidian not found: set OBSIDIAN_EXE to its executable.");
	return found;
}

/** The newest `obsidian-x.y.z.asar`, so the instance runs the version the developer has. */
function latestAsar() {
	const dir = obsidianDataDir();
	const asars = existsSync(dir)
		? readdirSync(dir).filter((name) => /^obsidian-[\d.]+\.asar$/.test(name))
		: [];
	const version = (name) => name.match(/[\d.]+(?=\.asar)/)[0].split(".").map(Number);
	asars.sort((a, b) => {
		const [x, y] = [version(a), version(b)];
		for (let i = 0; i < Math.max(x.length, y.length); i++) {
			if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) - (y[i] ?? 0);
		}
		return 0;
	});
	return asars.length ? join(dir, asars[asars.length - 1]) : null;
}

/** Waits until the vault window has loaded its workspace. */
async function ready(page) {
	for (let attempt = 0; attempt < 120; attempt++) {
		try {
			if (await page.call(() => typeof app !== "undefined" && Boolean(app.workspace?.layoutReady))) return;
		} catch {
			// The page is still loading.
		}
		await sleep(500);
	}
	throw new Error("Obsidian's workspace did not load");
}

/** A connection to one page of the instance. */
export class Page {
	constructor(ws) {
		this.ws = ws;
		this.id = 0;
		this.pending = new Map();
		ws.onmessage = (message) => {
			const data = JSON.parse(message.data);
			const waiting = data.id && this.pending.get(data.id);
			if (!waiting) return;
			this.pending.delete(data.id);
			if (data.error) waiting.reject(new Error(`${waiting.method}: ${JSON.stringify(data.error)}`));
			else waiting.resolve(data.result);
		};
		ws.onclose = () => {
			for (const waiting of this.pending.values()) waiting.reject(new Error("page closed"));
			this.pending.clear();
		};
	}

	static async connect(match) {
		for (let attempt = 0; attempt < 120; attempt++) {
			try {
				const targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
				const target = targets.find((t) => t.type === "page" && match(t.url));
				if (target) {
					const ws = new WebSocket(target.webSocketDebuggerUrl);
					await new Promise((resolve, reject) => {
						ws.onopen = resolve;
						ws.onerror = reject;
					});
					return new Page(ws);
				}
			} catch {
				// Not up yet.
			}
			await sleep(500);
		}
		throw new Error("Obsidian's page did not come up");
	}

	send(method, params = {}) {
		return new Promise((resolve, reject) => {
			const id = ++this.id;
			this.pending.set(id, { resolve, reject, method });
			this.ws.send(JSON.stringify({ id, method, params }));
		});
	}

	/** Runs `fn(...args)` in the page, awaited, and answers its JSON result. */
	async call(fn, ...args) {
		const result = await this.send("Runtime.evaluate", {
			expression: `(${fn.toString()})(...${JSON.stringify(args)})`,
			awaitPromise: true,
			returnByValue: true,
			userGesture: true,
		});
		if (result.exceptionDetails) {
			const detail = result.exceptionDetails.exception?.description ?? result.exceptionDetails.text;
			throw new Error(`in page: ${detail}`);
		}
		return result.result.value;
	}

	async mouse(type, x, y, button = "none") {
		await this.send("Input.dispatchMouseEvent", {
			type,
			x,
			y,
			button,
			clickCount: button === "none" ? 0 : 1,
		});
	}

	/** Moves the pointer onto a point from outside, so that `mouseover` fires there. */
	async hover(x, y) {
		await this.mouse("mouseMoved", 1, 1);
		await sleep(100);
		await this.mouse("mouseMoved", x - 6, y - 2);
		await this.mouse("mouseMoved", x, y);
	}

	async click(x, y, button = "left") {
		await this.mouse("mouseMoved", x, y);
		await this.mouse("mousePressed", x, y, button);
		await sleep(40);
		await this.mouse("mouseReleased", x, y, button);
	}

	/** Types text one character at a time, as a person would. */
	async type(text) {
		for (const char of text) {
			await this.send("Input.insertText", { text: char });
			await sleep(30);
		}
	}

	async key(key) {
		const codes = { Enter: 13, Escape: 27, ArrowDown: 40, ArrowUp: 38, Backspace: 8 };
		const base = { key, code: key, windowsVirtualKeyCode: codes[key] ?? 0 };
		const text = key === "Enter" ? { text: "\r" } : {};
		await this.send("Input.dispatchKeyEvent", { type: "rawKeyDown", ...base, ...text });
		if (key === "Enter") await this.send("Input.dispatchKeyEvent", { type: "char", ...base, text: "\r" });
		await this.send("Input.dispatchKeyEvent", { type: "keyUp", ...base });
		await sleep(60);
	}

	/** A PNG of a part of the viewport, in CSS pixels: `{ x, y, width, height }`. */
	async capture(clip) {
		const params = { format: "png" };
		if (clip) params.clip = { ...clip, scale: 1 };
		const result = await this.send("Page.captureScreenshot", params);
		return Buffer.from(result.data, "base64");
	}

	close() {
		this.ws.close();
	}
}

/**
 * Starts the instance on its own profile with the vault open, in English,
 * with community plugins on, and answers its vault window.
 */
export async function launch(vault) {
	const profile = join(tmpdir(), "citation-suite-screenshots-profile");
	mkdirSync(profile, { recursive: true });
	const asar = latestAsar();
	if (asar) copyFileSync(asar, join(profile, asar.split(/[\\/]/).pop()));
	if (!existsSync(join(profile, "obsidian.json"))) {
		writeFileSync(
			join(profile, "obsidian.json"),
			JSON.stringify({ vaults: {}, language: "en", updateDisabled: true })
		);
	}

	const child = spawn(
		obsidianExecutable(),
		[
			`--user-data-dir=${profile}`,
			`--remote-debugging-port=${PORT}`,
			"--remote-allow-origins=*",
			`--force-device-scale-factor=${SCALE}`,
		],
		{ detached: true, stdio: "ignore" }
	);
	child.unref();
	try {
		return { page: await open(vault), child };
	} catch (error) {
		// A half-started instance would hold the debugging port for the next run.
		try {
			process.kill(child.pid);
		} catch {
			// Already gone.
		}
		throw error;
	}
}

async function open(vault) {
	// A profile with no vault open starts on the vault picker.
	const starter = await Page.connect((url) => url.includes("starter.html") || url.includes("index.html"));
	const onStarter = await starter.call(() => location.href.includes("starter.html"));
	if (onStarter) {
		await starter.call(
			(path) => require("electron").ipcRenderer.sendSync("vault-open", path, false),
			vault
		);
	}
	starter.close();

	let page = await Page.connect((url) => url.includes("index.html"));
	await ready(page);

	// The interface language lives in the profile's local storage.
	const english = await page.call(() => localStorage.getItem("language") === "en");
	if (!english) {
		await page.call(() => {
			localStorage.setItem("language", "en");
			setTimeout(() => location.reload(), 100);
		});
		page.close();
		await sleep(1500);
		page = await Page.connect((url) => url.includes("index.html"));
		await ready(page);
	}
	await prime(page);
	return page;
}

/**
 * What every connection to the vault window needs: plugins on (a new
 * profile starts in restricted mode), Sync's status icon off, the window's
 * size, and the real mouse kept out — a pointer resting over the window
 * would hover citations and highlight list items in the middle of a shot.
 */
export async function prime(page, width = 1600, height = 1000) {
	await page.send("Emulation.setFocusEmulationEnabled", { enabled: true });
	await page.call(
		async (w, h) => {
			if (!app.plugins.isEnabled()) await app.plugins.setEnable(true);
			if (!app.plugins.plugins["citation-suite"]) await app.plugins.enablePluginAndSave("citation-suite");
			await app.internalPlugins.getPluginById("sync")?.disable(true);
			const win = require("@electron/remote").getCurrentWindow();
			win.unmaximize();
			win.setContentSize(w, h);
			win.setIgnoreMouseEvents(true);
			await new Promise((resolve) => setTimeout(resolve, 800));
		},
		width,
		height
	);
}

/** Reloads the window (which mobile emulation does) and answers the new connection. */
export async function reconnect(page, width, height) {
	page.close();
	await sleep(2500);
	const next = await Page.connect((url) => url.includes("index.html"));
	await ready(next);
	await prime(next, width, height);
	return next;
}

export async function quit(page, child) {
	try {
		await page.call(() => require("@electron/remote").app.quit());
	} catch {
		// Quitting closes the connection under the call.
	}
	page.close();
	await sleep(1500);
	try {
		process.kill(child.pid);
	} catch {
		// Already gone.
	}
}
