// The tests cover the pure halves of the plugin — the pandoc formatter and the
// parsing of what CAYW answers with — and those modules sit in files that also
// import from `obsidian`. This stands in for the module at import time; it
// stubs only what evaluating the code under test reaches, and a test that needs
// more should extend it rather than fake Obsidian's behaviour.
/**
 * What the app says it is running on. Mutable, because it is what the tests of
 * `src/desktop.ts` are about: Obsidian's own flags are set once at boot, and a
 * test sets them to the shape it is asking about.
 */
export const Platform = { isDesktopApp: true, isMobile: false };

export function requestUrl(): never {
	throw new Error("requestUrl is not stubbed in tests");
}

export function htmlToMarkdown(): never {
	throw new Error("htmlToMarkdown is not stubbed in tests");
}

export function sanitizeHTMLToDom(): never {
	throw new Error("sanitizeHTMLToDom is not stubbed in tests");
}
