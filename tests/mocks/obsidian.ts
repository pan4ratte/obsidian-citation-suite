// The tests cover the pure halves of the plugin — the pandoc formatter and the
// parsing of what CAYW answers with — and those modules sit in files that also
// import from `obsidian`. This stands in for the module at import time; it
// stubs only what evaluating the code under test reaches, and a test that needs
// more should extend it rather than fake Obsidian's behaviour.
export function requestUrl(): never {
	throw new Error("requestUrl is not stubbed in tests");
}
