# Libraries and styles of the vault

Part of the notes for coding agents. [AGENTS.md](../AGENTS.md) has the rules most changes need and points here; this file holds the detail, moved there from AGENTS.md unchanged.

## Libraries and styles of the vault

The other half of where a citation comes from, and the half that works on a
phone. Nothing here asks Zotero anything.

**The platform split.** `src/zoteroStyles.ts` is the one module that reaches
for Node — `fs/promises`, `os`, `path`, and by `require()` rather than by
import, so that loading the module does not load them — and `src/main.ts`
loads that module with `await import()` behind `onDesktop()`. Everything else
reads through Obsidian's vault API and runs everywhere.
`tests/vaultStyles.test.ts` guards both halves: that no `src/` file imports
Node at all, and what `onDesktop()` answers.

**`onDesktop()`, not `Platform.isDesktopApp`** (`src/desktop.ts`). Obsidian's
mobile emulation — the way a phone is tried out on a desktop — sets `isMobile`
and clears `isDesktop` but **leaves `isDesktopApp` true**, while the `require`
a plugin is given starts answering `null` for every Node package and logging
"Attempting to load NodeJS package". Read out of 1.13.7's bundle:

    !rd.isMobile && localStorage.getItem("EmulateMobile") &&
        (rd.isMobile = !0, rd.isDesktop = !1, …)

So a gate on `isDesktopApp` alone loads the Node half under emulation and then
reads `homedir` off `null` — which took the whole plugin down with "Cannot read
properties of null". Every Zotero gate goes through `onDesktop()`, which is
`isDesktopApp && !isMobile`, and `nodeModule()` refuses a `null` module rather
than handing it on. Nothing that only the desktop can answer may throw into
`onload` either: `fromDesktop()` in `main.ts` degrades to no styles and default
preferences, since a style list is no reason for the plugin not to load.

The built bundle can be checked against both shapes by loading `main.js` with
`require` answering `null` for everything but `obsidian` and `@codemirror/*`,
once with emulation's flags and once with a phone's, and asserting that nothing
asked for a Node package.

**Which library a note reads.** `NoteStyles.libraryOf(path)` answers with a
`LibraryRef`: the empty string for Zotero, otherwise the vault paths of the
note's library files joined by newlines. It is the note's own `bibliography`
property first — pandoc's, several files allowed, the last of them winning a
shared key — and the settings' file otherwise. A settings path that resolves to
nothing falls back to Zotero rather than to an empty library, which is what
keeps a renamed file from silently emptying every note.

`src/vaultLibrary.ts` finds, reads and holds those files, and re-reads one
whose modification time moved, telling whoever shows its sources. It also
answers `vaultLibraryFiles(app)`, the list the settings offer: `.bib` and
`.bibtex` by extension alone, and a `.json` only if its head reads as a CSL
JSON array — a vault keeps canvases and plugin data under that extension too,
and those are not bibliographies.

**The renderer keeps items per library** (`LibraryRef` is part of `StyleRef`
and of `NoteInput.key`), and citeproc asks for items synchronously, so every
render entry point sets the current library with `reading(ref)` first. A new
entry point that does not is a note rendered from another note's sources.

**Styles.** `CitationStyle.source` says which file system a style's `path` is
in: `zotero` for the installed ones, `vault` for a `.csl` file of the vault,
and `readStyle()` in `main.ts` sends each to the reader that can read it. The
two can declare one id — the same style, exported into the vault for a phone —
so the settings write down `styleChoice(style)` rather than the id, and
`chosenStyle()` prefers a Zotero style for a bare id, which is what a setting
written before the path was written down with it meant.

**Which window the citation comes from** is the note's library, not whether
Zotero is answering: a note reading from a file is cited from that file with
Zotero running, since a key picked in Zotero's window is a key that file may
not have. `insertCitation` resolves the library before it probes anything.

### The file library's citation window

`src/sourceModal.ts`, a `SuggestModal` worked into the shape of Zotero's
citation window. One field does everything: a source is searched for and
chosen, becomes a pill in the field, and the field takes its page; Enter folds
the page into the pill and hands the field back to searching, so the next Enter
writes the citation and anything typed instead adds another source. The list
holds the sources while searching and, once there are pills, one row carrying
the citation as it stands — which is the row Enter lands on, and the row that
ends the window. `main.ts` hands the window two closures built on
`formatCitations`, one for the group and one for a pill, so what the row shows
is what the note gets.

Three things about `SuggestModal`, read out of Obsidian 1.13.7's own bundle
rather than guessed. They are what the window is built around:

- **`selectSuggestion` closes the window before it says what was chosen**:
  `this.close(), this.isOpen = false, this.onChooseSuggestion(…)`, all in one
  turn. So `onClose` cannot read a pick that a field was waiting for — the
  window did exactly that once, and nothing was ever written into a note.
  Overriding `selectSuggestion` is what keeps the window open for the pages,
  and the empty answer waits a microtask so a pick still coming wins.
- **The chooser registers ArrowUp/Down, PageUp/Down, Home/End, Ctrl+P/N and
  Enter** on the modal's scope, and Escape closes. Enter therefore works
  wherever the focus is. Backspace is not among them, which is what leaves it
  free to take a pill off.
- **`updateSuggestions()` is not in the API**; `inputEl.trigger("input")` is
  how the list is redrawn, which is what Obsidian's own suggesters do.
