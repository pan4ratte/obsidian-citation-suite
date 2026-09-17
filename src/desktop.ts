import { Platform } from "obsidian";

/**
 * Whether this is a desktop in the sense the rest of the plugin means it: a
 * file system to read Zotero's styles off, and a local port to reach Zotero
 * through. Everything about Zotero is behind this, and `src/zoteroStyles.ts`
 * — the one module that reaches for Node — is loaded only where it answers
 * true.
 *
 * `Platform.isDesktopApp` alone will not do, and the reason is Obsidian's
 * mobile emulation. Read out of 1.13.7's own bundle: turning it on sets
 * `isMobile` and clears `isDesktop`, and leaves `isDesktopApp` as it was —
 *
 *     !rd.isMobile && localStorage.getItem("EmulateMobile") &&
 *         (rd.isMobile = !0, rd.isDesktop = !1, …)
 *
 * — while the `require` a plugin is given starts answering `null` for every
 * Node package and logging "Attempting to load NodeJS package". So a plugin
 * that asks `isDesktopApp` alone loads its Node half under emulation and then
 * reads `homedir` off `null`, which is what this one did. Emulation is how a
 * phone is tried out on a desktop, and it should behave as a phone does.
 */
export function onDesktop(): boolean {
	return Platform.isDesktopApp && !Platform.isMobile;
}
