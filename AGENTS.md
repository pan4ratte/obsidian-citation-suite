# AGENTS.md — citation-suite

## Commands

| Command | What it does |
|---------|-------------|
| `npm run dev` | esbuild watch mode (no typecheck) |
| `npm test` | Vitest — 326 tests, all passing |
| `npm run lint` / `npm run lint:fix` | ESLint (`lint:ts`) and Stylelint (`lint:css`) with the official Obsidian rulesets |
| `npm run build` | `tsc -noEmit -skipLibCheck && node esbuild.config.mjs production` |

## What this plugin is

A hotkey opens a citation window and writes what was picked into the note as a
pandoc citation, and the note's citations are previewed in a citation style.

Where the sources come from is the note's own business, and there are two
answers. **Zotero**, which is what the plugin was for: the pick is a single
HTTP request to Zotero's own window, there is no library index and no cache.
**A file of the vault** — a `.bib` or a CSL JSON export — which is read through
Obsidian and held, and which is what makes the plugin work on a phone, and on a
desktop with Zotero closed. Styles are the same shape: Zotero's installed ones,
read off the disk, and `.csl` files kept in the vault. See "Libraries and
styles of the vault" below; `Platform.isDesktopApp` is what decides whether
any of the Zotero half is even loaded.

## The CAYW contract

Everything the plugin knows about Zotero it knows through one endpoint —
`http://127.0.0.1:23119/better-bibtex/cayw`, registered by Better BibTeX on
Zotero's local HTTP server. The notes below were read out of BBT **9.0.64**'s
own bundle (`content/cayw.ts`, `content/cayw/formatter.ts` inside the `.xpi`)
and checked against a running Zotero. Check them there again before changing
anything that touches the wire.

- **The request blocks for as long as the picker is open.** The handler opens
  Zotero's citation window and answers when it closes. So `pickCitations` has no
  timeout, deliberately: there is no length of time after which a reader still
  choosing a source has gone wrong. Only `probeZotero` has one, because it asks
  a question a local server already has the answer to.
- **`format` defaults to `latex`.** Never omit it. The plugin asks for
  `format=pick`, which formats nothing and answers with the picked citations as
  JSON; `src/pandoc.ts` writes them out.
- **Every parameter arrives as a string and is read for truth**, so
  `brackets=false` and `minimize=false` are both as true as
  `true` is. A flag is sent only when it is on. `PICK_PARAMS` and
  `MINIMIZE_PARAMS` are the only parameters sent, and they keep that rule.
- **The pick is a POST, because a GET never returns a note.** BBT's formatters
  are marked `@acceptsNotes` by a decorator that sets a property on the method,
  and `getFormatter` hands out `Formatter[format].bind(Formatter)` — a bound
  function, without the property. So `formatter.acceptsNotes` is always
  undefined, `itemPicks()` filters every note out, and a GET that picked only a
  note answers with an empty body. A POST (`application/json`, body `{}`; the
  query string is still read) answers `{ state, pick, output }` instead:
  `output` is what the GET would have said, and `pick` is the citation window's
  raw result, where a note survives as `citationItems[].itemData` with
  `type: "note"`. `parsePickResponse` reads the citations from `output` and the
  notes from `pick`, and skips any note in `output` so that a fixed BBT does not
  insert it twice. Check this again when BBT is updated.
- **A POST does not minimize.** The handler acts on `minimize` only on the GET
  path. So `pickCitations` sends it afterwards as a GET of its own —
  `selected=true&minimize=true`, which reads the selection in Zotero's pane,
  opens nothing, and minimizes on the way out.
- **A cancelled pick is empty.** Closing the window without choosing answers a
  POST with an empty `output` and an empty `pick`. It is silent here: no notice,
  nothing inserted.
- **A failure answers 500 with prose, not JSON** — literally
  `CAYW failed: {…} requested: No such formatter "…"`. That body is what a
  `CaywError` carries, and it is appended to the notice. On a POST an error in
  the pick itself reaches here too; on a GET, BBT would have swallowed it,
  flashed "CAYW pick failed" inside Zotero and answered with an empty body.
- **`probe=true` is answered before the handler does any work**: `ready`, or
  `starting` while BBT is still indexing the library after launch. Those two are
  worth telling apart from unreachable — one is a wait, the other is something
  to fix — which is the whole reason the probe is a separate round trip rather
  than an error path.
- **The picker can return things with no citation key**: a standalone Zotero
  note (BBT's `pick` formatter accepts notes, unlike its `pandoc` one), and an
  item whose key has not been generated. `citable()` keeps only what has a key;
  the caller says how many were left out, rather than writing a bare `@` into
  the note.
- **A picked note is inserted as its text.** Zotero's window hands a picked note
  to the "document" as `Document.insertText` with the note's HTML, and BBT's
  `Picker.extractPickResults` (`content/cayw/pick.ts`) turns it into a pick of
  `itemType: "note"` with that HTML in `note` — unless the note holds citations
  or annotations, in which case BBT returns those citations instead and the
  note's text is lost before it reaches the plugin. `pickedNotes()` takes the
  HTML, `src/zoteroNote.ts` sanitises it and converts it with Obsidian's
  `htmlToMarkdown`, and `insertNotes` puts it at the cursor as paragraphs of
  its own, after the citation when one was picked with it.
- **The port is a setting because the beta moves it.** Zotero listens on 23119,
  Zotero Beta on 24119, so both can run at once.

The shape of one citation — `id`, `citationKey`, `locator`, `label`, `prefix`,
`suffix`, `suppressAuthor`, `uri`, and `itemType`/`title`/`note` for notes — is
BBT's `citationItems()`. `label` is filled in as `"page"` whenever a locator was
typed without a label of its own, so a locator practically always arrives
labelled; `selected=true` — which the fixture below is captured with, and which
the plugin sends only to minimize Zotero, ignoring the answer — is the
exception, since there is no window there to type either into. A real answer is pinned as a fixture in `tests/cayw.test.ts`.

## The JSON-RPC contract

Rendering needs the CSL data behind a key, and that comes from Better BibTeX's
`/better-bibtex/json-rpc`, not from CAYW. Read out of BBT **9.0.64**'s bundle
(`content/better-bibtex.js`, the `NSItem` class and the method schemas above it)
and checked against a Zotero whose sources sit in My Library and two groups at
once:

- **A citation key is unique per library, not per Zotero.** An item shared to a
  group keeps its key, so the same key commonly exists in two or three libraries.
- **`item.export` looks in My Library alone** when no library is named, and
  **throws for the whole request** if a single key is missing or duplicated
  there (`not found: …` / `duplicates found: …`, code -32602). A note citing
  one source from a group therefore lost every source in the same request. Do
  not go back to it.
- **`item.pandoc_filter(citekeys, true, libraryID, style)`** is what
  `fetchItems` uses. It hands over the keys it found as `Better CSL JSON`
  under `items`, keyed by citation key, and reports the rest under `errors` as a
  count — 0 missing, 2+ duplicated — instead of failing. Asked for several
  libraries at once, a key in two of them is a duplicate and comes back as
  nothing, so `fetchItems` asks **one library at a time**, in `user.groups`
  order (My Library first), each for what the earlier ones did not have.
- **Its items are only used to learn which keys a library holds.** The items
  themselves are exported again, exactly those keys, with `item.export` and
  Zotero's own `CSL JSON` translator (`bc03b4fe-436d-4a1f-ba59-de4d2d7a63f7`,
  `itemToCSLJSON` — what Zotero feeds citeproc). `Better CSL JSON` is not that:
  it rewrites the hyphen in an `issue` or `page` range as an en dash, and
  citeproc prints an issue as given, so a GOST entry read `№ 27–28` where
  Zotero writes `№ 27-28`. The export cannot fail on a missing key because
  `pandoc_filter` already found every one; if it fails anyway, BBT's copy is
  kept.
- **`libraryID` is a number, a name, or an array of names.** An array of
  numbers fails the schema, and a number sent as a string is not found
  (`could not find library 1`). A null parameter fails the schema too: leave a
  parameter out rather than sending it empty.
- **`pandoc_filter` renders each item's author against `style`**, `apa` by
  default, and the whole request fails if that style is not installed. So
  `installedStyle()` names APA when it is on disk and any installed style
  otherwise.
- **`item.search(terms, library)`** is the one method that tells an item's URI
  (`http://zotero.org/users|groups/…/items/KEY`), which the pane's "Reveal in
  Zotero" needs; see the bibliography pane below. It is also what the key
  suggestions search with; see "Citation key suggestions" below.
- **`item.search` with a string searches fewer fields than Zotero's quick
  search** — title, publication, short title, court, year and citation key,
  but no creators — so a surname finds nothing unless it is in the key. Given
  an array, every entry is passed to `Zotero.Search.addCondition` as it is,
  and `["quicksearch-titleCreatorYear", "contains", q]` is Zotero's own quick
  search: every word of `q` in the title, a creator or the year, and in Zotero
  7 the citation key too. `["ignore_feeds"]` is BBT's one shorthand. Its answer
  is `itemToCSLJSON` per item plus `library` (the name) and `citekey`, **in
  every library** when none is named, and it costs about 5 ms per item found
  on a 1,000-item library: one letter found 967 items in 4.6 s, three letters
  23–139 items in 0.2–0.7 s.
- **`user.groups`** answers with every library as `{ id: libraryID, name }`.
  The renderer keeps that list until `reset()` or `forgetUnknown()`.

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

## Rendering as Zotero renders

The bibliography pane and its copy are meant to be **what Zotero's own Quick
Copy writes**, and they are, entry for entry. That was checked by rendering a
57-source note in every installed style through the plugin and through
`item.bibliography` (Zotero's `QuickCopy.getContentFromItems`), one source at a
time and as whole lists: every style came out identical. Zotero bundles the same citeproc-js
processor (1.4.61) as the `citeproc` npm package. What made the difference was
everything around it, read out of Zotero 7's `xpcom/style.js` and
`xpcom/cite.js` and ported to `src/zoteroCite.ts` and `src/render.ts`:

- **Item data** from Zotero's `CSL JSON` translator, not `Better CSL JSON` —
  see the JSON-RPC contract above.
- **`asZoteroCites`**: Zotero's `Cite.System.retrieveItem` drops `URL` and
  `accessed` from a journal, newspaper or magazine article that has pages,
  unless `extensions.zotero.export.citePaperJournalArticleURL` is set. The pref
  is read off `prefs.js` with the locale, as `ZoteroCitePrefs`.
- **`zoteroEngine`**: `wrap_url_and_doi = true` and `parse_names = false`, as
  `getCiteProc` sets them. The first is not cosmetic: citeproc strips a
  `https://doi.org/` already in the DOI field only on that path, and without it
  a DOI stored as a URL prints as `https://doi.org/https://doi.org/…`. Zotero's
  **Word integration** turns it back off (zotero/zotero#5557), so a document
  there does print the doubled DOI; the pane follows Quick Copy.
- **`uppercase_subtitles`** on the sys object for APA-family styles, matched on
  the style's or the parent's short id with Zotero's own regex.
- **`eventToEventTitle`** on the style before citeproc sees it.
- **A dependent style's `default-locale` is forced** (`forceLang`), since
  citeproc is only handed the parent. Otherwise the locale is the Quick Copy
  locale or Zotero's own, and a style's `default-locale` wins inside citeproc.
- **`formattedBibliography`** is `makeFormattedBibliography`'s HTML branch —
  the inline styles a word processor needs — done by string replacement on
  citeproc's fixed markup rather than on a DOM. It was compared against
  Zotero's HTML for hanging-indent, number-column and spaced styles: identical
  but for serialisation (`&#38;` for `&amp;`, a literal U+00A0 for `&nbsp;`)
  and the COinS spans, which are left out.

**Locales are the one place the plugin carries less than Zotero**: five of
Zotero's 63, copied byte for byte from its `omni.ja`
(`chrome/content/zotero/locale/csl/`). Each is there for a reason, listed
over `LOCALES`: `en-US` is CSL's fallback, `ru-RU` the plugin's own language,
`en-GB` for British styles (MHRA's quotes), and `de-DE` and `fr-FR` for the
multilingual GOST styles "(ru, en, de, fr)".

Those GOST styles are the case that makes an item's `language` matter. They
hold one `<layout locale="…">` per language, citeproc picks the layout by the
item's `language`, and `localeResolve` turns `de` and `fr` into `de-DE` and
`fr-FR` before `retrieveLocale` is asked. Without the files a German entry
is written with English terms (`ed.` for `hrsg.`). `carriedLocale` sends a
regional variant the plugin does not carry (`de-AT`) to the carried locale of
its language, and anything else to `en-US`. Add a locale when a style in use
needs one, from Zotero's own files; the whole set is 1.6 MB.

To re-run the comparison, bundle a script that imports `src/render.ts` with
esbuild (Vitest cannot load the `.xml` imports), alias `obsidian` to a
`requestUrl` over Node's `fetch`, and compare `bibliographyOf(...).text` with
`item.bibliography([keys], { id, locale, contentType: "text" }, libraryID)`.
A style whose id is a bare UUID cannot be compared that way: BBT prefixes it
with `http://www.zotero.org/styles/` and then cannot find it. `bibliographyOf`
reads the note the session holds (below), so bring the session to the note's
citations first.

## A note's citations, written together

A citation is written by what came before it in the document: a source cited
again is shortened or "Ibid.", a numbered style numbers sources by first
citation, and 2020a/2020b are handed out across the whole document. So every
view writes a citation as part of its whole note, never on its own — the one
exception is the settings preview, and text that belongs to no note. Four
modules, each with one job:

- **`src/noteCitations.ts` (pure) reads a note's citations in the order pandoc
  reads them.** Pandoc reads a footnote's text at its anchor, not where the
  text stands, so `noteCitations` walks the body and puts each footnote's
  citations at the footnote's first anchor; an inline note `^[…]` is read where
  it stands; a footnote nothing anchors (pandoc drops it) comes after
  everything else, as the renumbering puts it. Anchors and inline notes inside
  a footnote's text are not notes of their own — pandoc has no nested notes.
  Each citation carries `noteNumber`: its footnote's number, or for a body
  citation the note a note style makes of it, counted among the footnotes.
  The footnotes are read by `footnoteLayout` in `src/footnote.ts`, the same
  reading the renumbering uses. `matchCitations` finds a piece's groups among
  the note's by `citationSignature`, the k-th repeat of an identical citation
  matched to the k-th candidate. Span lookups are binary searches: a 686 KB
  note with 4,000 citations parses in 15 ms, 68 KB in 2 ms; what is left is
  `parseGroups` itself.
- **`src/citationSession.ts` keeps one citeproc engine in step with a note.**
  `processCitationCluster(citation, pre, post)` is citeproc's word-processor
  API: it takes one citation, drops any citation not named in `pre`/`post`,
  and answers with every citation whose text changed. `update()` diffs the
  new list against what the engine holds — common prefix and suffix by
  signature, positional ids for the changed middle so a change is an update —
  and hands over only the middle, or one citation when only removals or note
  numbers changed. A change of a citation costs 1–2 ms; writing a chapter from
  scratch costs 0.1–0.7 s (200 citations, Chicago notes 0.4 s). Two things were
  found by checking random edits against a fresh engine, and both are load-
  bearing:
  - **The year-suffix letter does not follow a reordering.** Where the style
    does not sort, 2020a goes to the source registered first, and an
    incremental update keeps the old order. So `update()` rebuilds whenever
    the order sources are first cited in changes — other than removed sources,
    and new ones after all the rest (`sameFirstCitations`).
  - **A used engine is not a fresh one.** citeproc keeps disambiguation state
    for a registered item, so even `rebuildProcessorState` on a used engine can
    differ from a fresh engine (it did for a GOST footnote style). A rebuild
    calls `updateItems([])` before registering the note's items.
  A rebuild is `rebuildProcessorState` taken apart into steps (`updateItems`,
  then one `processCitationCluster` per citation with
  `ASSUME_ALL_ITEMS_REGISTERED`), so the caller can spread it over frames; a
  job abandoned for a newer one leaves `entries` describing exactly what the
  engine holds. `tests/citationSession.test.ts` pins all of this against
  `rebuildProcessorState` on a fresh engine, for small note, numbered and
  author-date styles written into the test; a throwaway run over the real
  Zotero styles (APA, Chicago author-date and notes, IEEE, GOST footnotes, MLA;
  900 random changes with same-author-year clones) found no difference in any
  citation or bibliography. `previewCitationCluster` leaves the held note as
  it was, so the settings preview and `render()` use the same engine.
- **`src/noteRendering.ts` (`NoteRenderer`) is the one queue in front of the
  engine.** It keeps each note's written citations (`states`, 24 notes) under a
  key of what is cited and in which note — typing prose changes no key and asks
  the engine nothing. A citation whose source is not in hand is left out of
  what the engine is given (it would be an untitled document and take a
  number); when the source arrives the key changes and it goes in. Work runs
  from a queue: `current()` (the editor) runs up to 12 ms in the frame and
  returns what is written, or — while a bigger job continues in 8 ms slices —
  the last rendering matched by signature, so nothing flickers back to source;
  `onRendered` tells the editors when a note is done. `render()` and
  `bibliography()` (reading view, pane) await the job. A note the editor waits
  on goes first unless the first task is half written. **The reference list is
  read inside `finish`**, straight after the last step, since the engine may
  hold another note a microtask later; asked for later, it is read at once only
  if `held` says the engine still holds that note, and otherwise the note is
  written again. If the engine throws, the note falls back to each citation
  written on its own. `restyle()` and `onunload` call `clear()`.
- **The views.** `src/live.ts` keeps a lazily parsed `ParsedText` in a
  `StateField`; the editor of a note's own tab (`editorInfoField` is a
  `MarkdownView`) holds the whole note and asks `current()`. Any other editor
  with a file — the footnote popover, a note embedded in a canvas — holds a piece, and
  matches its citations against `latest()`, writing unmatched ones on their
  own. Every key of the note is looked up, not only the visible ones, except
  the citation under the cursor, which would be looked up a keystroke at a
  time; `ready` is false while any other key is pending. `src/reading.ts` gets
  the whole text from `getSectionInfo(el).text` (or `noteText`, the open view
  or `cachedRead`, when there is no section info — embeds, print), matches the
  block's citations among those in the section's lines, and matches the
  footnote list — which Obsidian 1.13.7 renders as a trailing
  `section.footnotes` positioned after the last line, in anchor order — among
  the note's citations in footnotes. `CitationRenderer.load` shares one lookup
  per key between everything asking (`lookups`), so the editor asking on every
  redraw sends nothing twice.

Checked in a separate Obsidian 1.13.7 instance (its own `--user-data-dir` with
the 1.13.7 asar copied in, `--remote-debugging-port` and
`--remote-allow-origins=*`, driven over CDP) against a running Zotero: short
forms after the first citation in body and footnotes, a citation inserted at
the top turning a later one short and undo restoring it, APA 2005a/2005b and
IEEE numbers matching the pane, reading view's footnote list, and a 200-citation
note drawn in 0.9 s with typing at one frame. Reading view renders nothing in a
hidden window: `showInactive()` the window before checking it.

### Keys Zotero has no source for

`markMissingKeys` (on by default) marks the `@key` of a citation whose key
`CitationRenderer.missing` — Zotero answered and had nothing, not merely did
not answer — with `citation-suite-citation-missing`, a wavy `--text-error`
underline, in reading view, live preview **and source mode**, style or no
style: it is about what is written, like a spelling mark. The tooltip is a
mark decoration's `aria-label` plus `data-tooltip-delay`, which Obsidian's
body-level `pointerover` handler reads for any element (read out of 1.13.7's
`app.js`). `keyMentions` in `src/citation.ts` gives each key's range, and
`mentionsOf` is built on it. A key missed once is not asked about again until
the pane's refresh button (`forgetUnknown`) — the README's troubleshooting
says so.

## A note's own style: pandoc's `csl` and `lang`

A note that names `csl` (or `citation-style`) or `lang` in its front matter is
previewed — citations, tooltips and the pane — as pandoc will export it; a note
that names neither is previewed as before, in the settings' style the way
Zotero writes it. The properties are always read — there is no setting for it —
and "Do not style the preview" still turns everything off.
Every rule below was read off pandoc 3.11 itself, not the manual:

- **`csl`**: `.csl` is added to a name with no extension; a relative file is
  looked for in the resource path and in the `csl` folder of the user data
  directory, **not** the data directory's root (`%APPDATA%\pandoc\gost2018.csl`
  was not found). Pandoc GUI runs pandoc in the note's folder with the vault on
  the resource path, so `NoteStyles.findStyle` tries the note's folder, the
  vault root, then `<data dir>/csl` (`%APPDATA%\pandoc` on Windows,
  `$XDG_DATA_HOME/pandoc` or `~/.local/share/pandoc` and `~/.pandoc`
  elsewhere). Not the attachment folder: `fileManager.getAvailablePathForAttachment`
  is the only public way to it, and it is not a lookup. A URL is downloaded
  by pandoc; the preview matches it to Zotero's style ids instead
  (`styleForUrl`: scheme, `www.` and `.csl` ignored, then the short name).
- **`lang` wins over a style's `default-locale`**; without it the style's
  `default-locale` (a dependent style's before its parent's) is used, then
  `en-US`. So the engine is built with `locale` forced
  (`StyleRef.locale`). A language the plugin does not carry is rendered in
  `en-US` and reported in the pane.
- **Locators are read in that locale, and only in it.** With `lang: ru-RU`
  pandoc reads `с. 33` as a page and `p. 33` as suffix text; with none (or
  `en-US`) it reads English terms but **not `ch.`**. The words are the locale's
  terms in every form and number plus the CSL locator names (`page 3` is read
  in any language) and the symbols (`§`); the style's own `<locale>` terms are
  **added** — IEEE's `<locale xml:lang="en">` makes `ch.` a chapter alongside
  `chap.` — and `en-US` fills in only a locator the locale and style do not
  name. `src/localeTerms.ts` builds that table from the carried locale files
  and the style's text (XML comments stripped first — a comment mentioning
  `<locale>` was once read as a block), and `tests/localeTerms.test.ts` pins
  what pandoc did for 44 locators in three languages; `PANDOC_LOCATORS` is
  the fifteen locators pandoc reads at all, and a table built from a locale is
  matched exactly (`labelOf`), where `ENGLISH_LABELS` stays forgiving. The parser takes the
  table (`parseGroups(text, labels)`, `ENGLISH_LABELS` by default — the old,
  more forgiving list, kept for notes without properties), and every view
  parses a note with its style's labels, so signatures match between the note
  and a block of it.
- **A suffix after a comma with no locator keeps the comma**: pandoc's raw
  suffix is `, and more`, and it writes "(Doe 2020, and more)". This applies
  to every note, and is `splitTail`'s last line.
- **Pandoc cannot run CSL-M styles** such as the multilingual GOST ones
  ("Multiple layout elements present in citation"); citeproc-js can. Such a
  note previews and does not export — nothing the preview can match.

The resolution is `src/noteStyles.ts` (`NoteStyles`), with the pure rules in
`src/noteStyle.ts`. A note without either property is answered synchronously;
one with them is resolved once (file system) and cached by the settings' style
and its two values; `current()` returns `undefined` until then and `onChange`
fires. `metadataCache` `changed` re-resolves a note whose values changed; live
preview and the pane redraw from `onChange`, reading view is re-rendered by
`main.ts`. `restyle()` clears it.

**Engines are kept per `StyleRef`** (`key`: the style's id for the settings'
style, `path + locale` for a note's), four at most, least recently used out;
`built()` says whether a style was tried, so the editor does not ask for a
style that would not run on every redraw. `NoteRenderer`, `renderWith`,
`engineFor` and `preparedEngines` all take a `StyleRef`. Building a style
takes up to a second, as it always did; a note in a new style pays it once.

The pane draws `drawNoteStyle` above the list: the style and locale in use, and
the `csl` not found or the locale not carried.

Checked against pandoc on the same notes, in the test instance: APA with
`lang: ru-RU` gave `(Barton, 2019, с. 12)` and `(Barton, 2019, p. 14)` as
pandoc did; IEEE by URL gave `[2, Ch. 2]` and `[1, Ch. 3]`; `lang: de-DE` read
`S. 12` and not `p. 14`; editing `lang` through `processFrontMatter` redrew the
editor and the pane without reopening the note.

## Citation key suggestions

`src/citationSuggest.ts` is an `EditorSuggest`; `src/suggestion.ts` holds
what needs neither editor nor Zotero, and is tested. `citationSuggestions` is
on by default.

- **Trigger**: `@` or `-@` at the start of a line or after whitespace, `[`,
  `;` or `(`, followed by key characters of any alphabet — not after a letter
  (an address) or `[[`. Then `proseOf` over the text up to the cursor must
  leave the `@` standing, so code, comments and front matter do not trigger.
- **A file library is read whole**, so a note reading from one is offered
  everything in it (`renderer.allItems`) and filtered here, with nothing to
  ask and nothing to wait for. The rest of this point is Zotero's half, which
  is what the list does when the note's library is Zotero's.
- **No library copy.** Below 3 characters only `renderer.knownItems()` — every
  source looked up since Obsidian started — is offered, the note's own
  (`citedKeys`, read once per opening) first; with nothing typed, only the
  note's own. From 3 characters Zotero is asked (`searchLibrary`, the quick
  search conditions above) after 150 ms of no typing, and a query extending
  the last answered one is filtered locally (`sourceMatches`, `ё` as `е`)
  instead of asked again; both are dropped when the list reopens.
- **Obsidian applies an async answer whenever it resolves**, with no check
  that it is still the latest (read out of 1.13.7's `EditorSuggest.trigger`):
  so `getSuggestions` always answers for `this.context.query` as it stands when
  it resolves, never for the query it was called with. Do not name a field
  `context` on the subclass: that is the base class's.
- **Ranking**: cited in the note, key starts with the query, first creator
  starts with it, the rest; ties by key. The list shows `@key` and
  "creators · year · title" in Obsidian's `mod-complex` suggestion layout.
- **Insertion** (`keyInsertion`) replaces what was typed and any key
  characters after the cursor: inside an unclosed `[` it is the key alone,
  keeping `-`; outside it is `[@key]` when `brackets` is on, else `@key`. A key
  pandoc would cut short is braced through `citationKeyToken`.

## The pandoc formatter

`src/pandoc.ts` is the plugin's own, not a call into BBT's `format=pandoc`, and
that is a decision rather than an oversight: the endpoint formats one way per
request, and both forms the plugin offers — bracketed and not, parenthetical and
narrative — have to come out of a single pick. Writing it here also makes every
rule testable without Zotero running.

Two things follow from that, and both have to be kept:

- **`PLAIN_CITATION_KEY` is copied from BBT** (the key regex in its `pandoc`
  formatter), so a key reads the same whichever tool wrote it. If BBT changes
  it, this file is what drifts.
- **Locator labels are written in the words pandoc reads, not BBT's.** BBT's
  `shortLabel` abbreviations (`LOCATOR_LABELS`) were what the plugin wrote until
  pandoc was asked: it reads `ch.`, `vrs.` and `sv.` in no language, and in a
  note with `lang: ru-RU` not even `p.` — each was exported as plain text.
  `formatCitations` now takes a `LabelWriter`, and `main.ts` hands it
  `renderer.labelWriter(await noteStyles.pandocLocale(path))`: the locale
  pandoc reads the note in (`lang`, else the language of the style `csl`
  names, else `en-US` — read whatever the preview settings say), its short
  term, or long where the short is not one word, in the plural when the
  locator names more than one (`pluralLocator`: `-–—,;&` or "and"). A language
  the plugin does not carry gets the CSL name (`page 33`), which pandoc reads in
  every language. The fifteen locators pandoc reads are `PANDOC_LOCATORS`;
  anything else (sub verbo, appendix, Juris-M's) is read by pandoc in no form,
  and keeps BBT's abbreviation. `sub verbo`, as Zotero's window names it, is
  looked up as `sub-verbo`. Checked by writing all fifteen, one and several, in
  en-US, en-GB, ru-RU, de-DE, fr-FR and an uncarried es-ES, and running them
  through pandoc with a label-printing style: 210 of 210 read with the right
  label. `LOCATOR_LABELS` stays for reading back notes written with it
  (`ENGLISH_LABELS`).
- **`locatorSuffix` deliberately differs from BBT.** BBT wraps a locator in
  `{…}` *after* the comma whenever brackets are on — `[@doe2020, {p. 33}]` —
  which the pandoc manual does not document as a locator at all. Here the braces
  are used only where the plain form would break: a locator holding `,`, `;` or
  a bracket, which pandoc would otherwise read as the end of the citation,
  leaving the rest as stray text. Everything else comes out as plain
  `[@doe2020, p. 33]`. Do not "align this with BBT" without reading pandoc's
  citation syntax section first.

The narrative form brackets the *locator*, not the citation — `@doe2020 [p. 33]`
— so the `brackets` setting does not reach it. There is a test that says so.

## Footnotes

With `footnotes` on, `insertFootnote` in `src/main.ts` hands the citation to
`footnoteEdit` in `src/footnote.ts`, which is pure — text and offsets in, a list
of changes out — and every rule below is tested there. The `insert-footnote`
command hands it an empty string instead, whatever the toggle says, and puts
the cursor at `textEnd`, the end of the footnote's text, rather than after the
anchor — with a notice, and nothing inserted, when the cursor is already in a
footnote's text (`inFootnoteText`).

- **Both edits go in as one `editor.transaction`**, so one undo takes the whole
  footnote back out. The changes are in offsets into the note *before* the edit,
  which is what the transaction reads; the cursor is set afterwards with
  `setCursor`, rather than through the transaction's `selection`, so nothing
  depends on which coordinate space that field is read in.
- **The place for the text is worked out on the note with the anchor already
  in**, then mapped back by the anchor's length. The text always lands after
  the anchor, so that one subtraction is the whole mapping — and the line the
  anchor stands on is never mistaken for a blank one.
- **The label is one past the highest number already written between the same
  prefix and suffix**, read in any of the three numberings, not a count and not
  the footnote's position. Pandoc and Obsidian number footnotes by the order of
  their anchors whatever the labels say, so inserting one never renumbers the
  others: that is the `renumber-footnotes` command's job, done when asked. A
  label differing only in case is stepped over.
- **`renumberFootnotes` numbers every footnote by its first anchor**, as
  `footnoteLabel` writes the settings' labels; a footnote whose text nothing
  anchors comes after the rest. Every label is rewritten, hand-named ones
  included — that is what "as the settings say" means — unless
  `footnoteKeepNamed` is on; since each label gets a number of its own, no new
  label can collide with an old one. Labels
  are compared with case, as Obsidian and pandoc compare them. Labels are found
  in `proseOf(text)`, so code and comments are left alone, and a definition is
  a label at the start of a line (0–3 spaces) followed by `:`.
- **`footnoteKeepNamed` leaves named labels as they are**, and the numbered
  ones are counted past them: `A[^3] B[^kuhn] C[^1]` → `A[^1] B[^kuhn] C[^2]`.
  Kept texts still take their anchor's place when a run is reordered. What is
  "named" is `isNamedLabel`, deliberately **narrower than `labelNumber`**, the
  rule `nextFootnoteLabel` counts by: digits between the settings' prefix and
  suffix, or a roman numeral only when the settings write numerals, and only in
  their case. Every word of `i v x l c d m` is a numeral — `[^x]`, `[^mix]` —
  and a name wrongly renumbered is lost, while a stale numeral wrongly kept is
  merely left alone; a label under an old prefix is kept for the same reason.
  A new label differing from a kept one only in case is stepped over, as
  `nextFootnoteLabel` does. The row is drawn with the other footnote rows,
  always.
- **Footnote texts are reordered only where they stand together.** A text runs
  as pandoc reads one: lazy lines under its first line, and paragraphs indented
  4 spaces or a tab after a blank line, up to a heading or the next definition.
  Texts with only blank lines between them form a run, and a run out of order
  is rewritten as one change, each gap kept in its place; a text is never moved
  out of its run, so a footnote under a paragraph stays under it. Label changes
  inside a rewritten run are part of that change, and everything else is a
  change per label, so the transaction's changes never overlap. Nothing to
  renumber, and no footnotes at all, each say so in a notice.
- **A section ends at the next heading of any level**, outside code fences and
  front matter. Setext headings are not read.
- **A citation made inside a footnote's text is written there plainly** — a
  footnote cannot hold a footnote.
- **A new footnote's text opens in Obsidian's footnote popover** while
  `footnotePopover` is on — a citation's and an empty one's alike, after any
  picked Zotero notes are in — and only from a `MarkdownView`. Read out of
  Obsidian 1.13.7's `app.js`, its own `Editor.insertFootnote` saves the note,
  awaits `metadataCache.computeFileMetadataAsync` — the popover finds the text
  by `#[^label]`, which only the cache resolves — and creates an unexported
  `HoverPopover` subclass on that link with `state: { mode: "source" }`, which
  is what makes the embed editable and focused at once. `src/footnotePopover.ts`
  reaches that same class through the core Page preview plugin's
  `instance.onLinkHover`: every core plugin is instantiated and `init`ed at
  startup, enabled or not, and `onLinkHover` does not check. It saves with
  `view.save()` and waits for the cache's `changed` event to list the label,
  up to 2 s. The popover's editor (its `embed.editor`) holds the footnote's
  text alone, cursor at its start, and is focused only once the popover is on
  screen — after `onLinkHover` resolves — which loses a cursor set earlier. So
  the cursor goes to the end of its last non-blank line on the popover's first
  `focusin`, and again after `onLinkHover` if the focus came before the text.
  `workspace.activeEditor` is not the popover's yet at that point: do not go
  back to it. The popover stands by the anchor's element, 300 ms after asking,
  where Obsidian's own is placed at the anchor's coordinates at once —
  `onLinkHover` passes neither. The parent handed over wraps the view's
  `hoverPopover`, only so the popover can be caught arriving and given
  Obsidian's hand-back of the focus when it closes. None of this is public
  API: any step failing leaves the cursor as with the setting off — at the end
  of the footnote's text in the note, pushed down by any Zotero notes picked
  with the citation; for a citation only while `footnoteCursorToText` is on
  (its row is shown only with the popover off), otherwise after the anchor —
  unless the note was typed in meanwhile. Check it again when
  Obsidian is updated.
- **The prefix and suffix are refused by `validate` when they hold whitespace or
  `[ ] ^ \ |`**, and cleaned of the same when a label is built, because
  `validate` does not stop a hand-edited `data.json`.

### A note's own footnote settings

`src/noteFootnoteModal.ts` draws five of the tab's footnote rows — the toggle,
placement, numbering, prefix and suffix — for one note, opened by the
`note-footnote-settings` command (active note only) or from `file-menu` (file
explorer, tab) and `editor-menu`. It uses plain `Setting` rows with the tab's
names and descriptions, not the declarative API, which only a settings tab has.

- **Kept in `data.json` as `noteFootnotes`**, a map from note path to only the
  fields set for that note (`Partial<NoteFootnoteSettings>`). A field not set
  follows the tab, including later changes to it. A field set to the same value
  as the tab stays set. The reset button deletes the note's entry and is
  disabled while there is none. Not front matter: the settings are the plugin's,
  and writing them into a note would edit every note they are set for.
- **Every reader of a footnote setting goes through `noteFootnoteSettings`**
  (`src/noteFootnotes.ts`, pure and tested): `footnoteOptions(file)` for the
  insertion, the blank footnote and the renumbering, and the toggle in
  `insertCitation`. The style preview calls `footnoteOptions()` with no file,
  so it always shows the tab's settings. `footnoteKeepNamed`,
  `footnotePopover` and `footnoteCursorToText` are the reader's habits, not a
  note's, and stay global. `NOTE_FOOTNOTE_KEYS` in `src/types.ts` is the list.
- **The path is the key, so the entry follows the note.** Vault `rename` moves
  it and `delete` drops it, for the path itself and everything under it as a
  folder, so a folder's event and its children's events can both arrive in
  either order. A rename or deletion made while the plugin is not running is
  not seen and leaves the entry stale, as is a move a sync tool writes as a
  delete and a create.
- **`loadSettings` reads it with `readNoteFootnotes`**, the only nested field.
  It makes a fresh object, so the settings never share `DEFAULT_SETTINGS`'
  `{}`, and drops fields and values no footnote can be written with.
  A prefix or suffix typed in the modal is refused as in the tab, with
  `setErrorMessage`, and not saved.
- **The tab's last footnote row resets every note at once**
  (`resetNoteFootnotesSetting`, `plugin.resetNoteFootnotes()`), after
  `src/confirmModal.ts` asks. Obsidian exports no confirmation dialog, so that
  one draws its own, laid out like Obsidian's delete dialog, with the focus on
  cancel. The row is a `render` for its `setDestructive()` button, disabled
  while no note has settings. The declarative `action` row (read out of 1.13.7's
  `app.js`: `setAction` adds `mod-action tappable` to the row and draws no
  control) gives a click on the whole row with nothing that looks like a
  delete. After a reset the tab calls `update()` to disable the button again.

The footnote's rows are drawn **whatever the toggle says**: placement,
numbering, prefix and suffix are read by the `insert-footnote` and
`renumber-footnotes` commands too, which work with the toggle off, so hiding
them behind it left settings in force that could not be reached. Do not give
them a `visible` again. What a
footnote looks like is shown by the style preview, which redraws on every change
to the numbering, prefix or suffix — not by a row of its own, and not through
`update()`, which would redraw the tab and take the focus out of the field being
typed in.

## Bibliography pane

`src/bibliography.ts` is an `ItemView` in the right sidebar. It is put there
**once per vault per device**, on the first layout-ready after install — through
`ensureSideLeaf`, not active and not revealed — and the vault's local storage
(`app.saveLocalStorage`, key `citation-suite-bibliography-placed`) records that
it was. From then on the workspace layout keeps it, so a reader who closes it
is not handed it back on every launch; checking for a leaf instead of the flag
would do exactly that. The `show-bibliography` command opens and reveals it,
and `onunload` does not detach it.

**It is loaded at launch, shown or not.** Obsidian restores a tab it is not
showing as deferred — `leaf.isDeferred`, no view made until the tab is first
looked at — and a pane behind another sidebar tab then read no note until it
was opened. `loadBibliographyPanes()` calls `loadIfDeferred()` on every
bibliography leaf once the layout is ready and on each `layout-change`, so the
pane follows the note from the start and its list is there when the tab is.

The flag was a `data.json` field, `bibliographyPaneOpened`, and **must not go
back there**. `data.json` travels with the plugin's folder and is synced to
every device, while the layout is each device's own: a second device read "put
there already" and never got the pane, and so did a vault whose `data.json`
outlived the pane — which is how it went missing when the plugin was renamed.
Local storage is scoped to the vault and the device, as the layout is. A stale
`bibliographyPaneOpened` left in an old `data.json` is copied into the settings
object by `loadSettings` and read by nothing.

- **It follows the note being worked on**, like the outline and backlinks: a
  change of active leaf or file retargets it, but a leaf that is not a note —
  the pane itself, a PDF — leaves the last note's list standing. The text is
  read from the note's open `MarkdownView` when there is one (unsaved typing
  included), otherwise `vault.cachedRead`; typing is debounced.
- **A view names its note before the note is in it.** `TextFileView.loadFile`
  (read out of Obsidian 1.13.7's `app.js`) sets `view.file`, then awaits
  `vault.read`, and only then `setViewData`; leaving a note with unsaved
  changes `clear()`s the editor first, and a tab restored at launch is loaded
  this way on first being shown. The active-leaf events are a 0 ms timer that
  can fire inside that gap, so a pass reads the previous note or an empty one —
  "no sources" — and loading the text raises no event. `loadFile` requests the
  active-leaf events again once it is done, but `file-open` is not repeated for
  the same file. So `follow()` does not ignore the note already followed: it
  compares the text with `readText`, what the latest pass read, and redraws
  when they differ (`refreshIfRead`). Checked by restarting Obsidian with tabs
  restored and switching to each: without it the pane stayed on "no sources".
- **A key being typed is not cited yet.** While the key suggestions list is
  open, `CitationSuggest.typedKey` gives the range of the `@key` being typed
  (only when the suggesting editor holds the pane's exact text, so a footnote
  popover's offsets are never used), and the pass reads the note with that
  range written over in spaces — offsets kept, as `proseOf` keeps them — so a
  half-typed key is neither looked up nor listed as not found. The list's
  `open()`/`close()` overrides call `onTypingChange`, which redraws the pane:
  once the list closes (Escape, a pick, the cursor leaving, nothing matching),
  the key counts, found or not. Checked live: `@bart` stayed out of the missing
  list for 3 s with the list open and appeared once it closed.
- **Keys come from `citedKeys`** in `src/citation.ts` for the missing list and
  the searches: bracketed groups only,
  as everywhere else, once each, in order of first citation, with the front
  matter, fenced and inline code, and `%%`/`<!-- -->` comments emptied out
  first. `proseOf` overwrites them with spaces, newlines kept, rather than
  removing them: no bracket meets another across a gap, and an offset into the
  prose is an offset into the note, which `mentionsOf` depends on.
- **The list is written with the note's citations**, through
  `NoteRenderer.bibliography`: the engine is brought to the note (above) and the
  list read off it, so an unsorted numbered style numbers its entries as the
  citations are numbered, and 2020a/2020b agree with them. It is the citation
  engine, not the tooltips' number-less one: in a reference list the numbers
  belong. Unknown keys are not given to the engine — citeproc would write them
  as untitled documents — and are listed separately under the entries.
- **The list is read through the note's embeds.** `expandEmbeds`
  (`src/embeds.ts`, pure) writes every `![[note]]`, `![[note#heading]]`,
  `![[note#^block]]` and `![](note.md)` in the prose into the text, at any
  depth, an embed of a note already being read left as it is, the embedded
  note's front matter dropped and its footnote labels suffixed
  (`-embed-N`) so that its `[^1]` is not the note's. Keys and
  `noteCitations` are read from that text; the finding and the mention bar
  still read the note alone, where the offsets are, so a source cited only in
  an embed is not found in the note. A whole note is read as `noteText` reads
  it; a section is cut out of `cachedRead` with `resolveSubpath`, since the
  cache's offsets are the saved text's. The engine writes such a note under
  the path with `\nembeds` after it, not the note's path: the editor writes the note's own
  citations under that, and sharing it would make each rewrite the other's on
  every pass. The pane redraws on `metadataCache` `changed`, `editor-change`,
  rename and delete of any note it read through an embed, and on any
  `changed` while an embed led nowhere. The editor and reading view do not
  expand embeds: a numbered style can number the pane's list differently
  from the note's citations when an embed cites before the note does.
- **Each pass is numbered**, and a pass overtaken while it waited on Zotero draws
  nothing. `restyle()` refreshes every open pane.
- **The bar reads "References", with the entry count beside it**, and three
  buttons: search, copy and refresh. Copy writes `formattedBibliography` as
  `text/html` and the text engine's entries as `text/plain` in one
  `ClipboardItem` — what Zotero's Copy Bibliography puts on the clipboard — and
  always copies the whole list, not what the search leaves showing: a subset
  of a numbered list would paste with gaps in its numbers. Entries are
  separated by a rule.
- **The bar, the search field and the body are built once, in `onOpen`**, and
  a pass only empties and redraws the body. A pass runs on every save of the
  note, which can land while the reader types into the search field, and
  rebuilding the field would take the focus and caret out of it. The bar's
  buttons are shown and hidden per pass instead of drawn.
- **The search** is Obsidian's `SearchComponent`, opened by the search button
  and closed by it or `Esc`; closing clears the query, so a list is never left
  filtered by a field that is not on screen. `src/search.ts` decides a match:
  every word of the query in the entry, case-insensitively, `ё` read as `е`.
  An entry is searched in its rendered text plus `@key` for each id in
  citeproc's `entry_ids`; a missing key in `@key`. `applySearch` runs after
  every pass, so a filter survives the list being redrawn under it. The count
  reads `shown / total` while filtering.
- **The search field slides open**, and is never hidden by class: the row
  stays in the pane as a one-track grid animated from `0fr` to `1fr`, with the
  field fading in and dropping 8px into place, on Obsidian's
  `--anim-duration-moderate` and `--anim-motion-swing`. `visibility` keeps a
  closed field out of the tab order; it switches on with no delay when the row
  opens, which is what lets `toggleSearch` focus the input in the same call,
  and off only after the row has shut. The field's inner wrapper clips the
  collapse, so it carries padding for the input's focus ring and a negative
  margin giving that room back. `prefers-reduced-motion` turns it all off —
  Obsidian 1.13 has no motion setting of its own to follow. Checked in
  headless Chrome by scrubbing `document.getAnimations()` to fixed times,
  since transitions do not advance there under a virtual time budget.
- **Hiding is a class, `citation-suite-bibliography-hidden`, never `hidden`.** The
  attribute loses to the `display` given to `.csl-entry` (`flow-root`) and to
  Obsidian's `.clickable-icon`. The rule is the last in styles.css because it
  ties with those. The divider is drawn on
  `.csl-entry:not(.hidden) ~ .csl-entry:not(.hidden)` rather than `+`, so a
  filtered list never shows a rule over its first remaining entry.
- **Right-clicking an entry opens an Obsidian `Menu`**, in this order: open
  literature note (only when there is one), open PDF, reveal in Zotero, a
  separator, copy the entry, find in the note. Missing keys have no menu.
  Right-clicking marks nothing: only a finding colours an entry.
- **Open literature note** is looked for as the menu opens, over
  `vault.getMarkdownFiles()` and their cached front matter — cheap, and an
  item that leads nowhere is not offered. `src/literatureNote.ts` (pure) takes
  a note named `@key` (Zotero Integration, Citations), then `key`, then one
  whose front matter `citekey` / `citationKey` / `citation-key` holds the key,
  with or without `@`, alone or in a list; ties go to the shortest path, then
  by path. The note the pane follows is never its own literature note. Not
  `getFirstLinkpathDest`: a key may hold `#`, `^` or `/`, which a link path
  reads as a heading, a block or a folder. It opens through
  `workspace.getLeaf(Keymap.isModEvent(event))`, as a link would.
- **Open PDF** cannot know whether there is one before Zotero is asked, and a
  menu cannot wait, so the item is always there and asks when chosen:
  `CitationRenderer.itemPdfs` calls BBT's `item.attachments(citekey, libraryID)`
  (a numeric library is accepted: its `getLibraryID` tries name, library id and
  group id). Read out of BBT 9.0.64 and checked live, it answers one
  `{ open, path }` per attachment — `open` a
  `zotero://open-pdf/library|groups/ID/items/KEY` link for every attachment, a
  web page snapshot included (Zotero's reader opens those too), `path` the file
  or `false` for a link to a web page — and a JSON-RPC **error**, not an empty
  list, for a key the library does not hold; `rpc` turns both a closed Zotero
  and that error into `null`, so `user.groups` tells them apart.
  `pdfAttachments` (in `src/zoteroCite.ts`) keeps what has a `.pdf` path. One
  PDF opens in Zotero's reader through `window.open`, as reveal does; several
  are listed in a second `Menu` at the first menu's position; none, or an item
  gone, is a notice. Checked in the isolated test instance with `window.open`
  stubbed, so that no reader opened on the desktop.
- **The entry being found is set apart by its dividers, in the accent.** The
  rule above is the entry's own `border-top`; the rule below, under the mention
  bar, is the next shown entry's, picked out by `~` with a `:not()` that
  excludes any entry with a shown one between — which is how it skips entries
  the search hides. If another state is ever coloured the same way, give it a
  selector of its own rather than an `:is()` in that `:not()`: shared, a mark on
  an earlier entry would stop the finding's rule below from being found.
  Only the colour changes, never the width: the first entry has no rule above
  and the last none below, and are not given one, because adding a border
  would move the list.
- **Reveal in Zotero** opens a `zotero://select` link with `window.open`, which
  Obsidian hands to the system. The link must name the library the entry was
  rendered from — a key can stand for items in My Library and a group at once —
  so `load()` records each key's library, and `CitationRenderer.itemLink` asks
  BBT's `item.search` for `[["citationKey","is",key],["libraryID","is",id]]`.
  Its answer is Zotero's CSL with the item's URI as `id` (plus BBT's `citekey`,
  matched again since `is` ignores case), which `selectLink` turns into
  `zotero://select/library/items/KEY` or `…/groups/GROUPID/items/KEY` — the two
  routes of Zotero 7's `SelectExtension`, built as BBT's Quick Copy builds them.
  Do not switch to BBT's `zotero://select/items/@key`: its patched
  `parseLibraryKeyHash` looks the key up in My Library only. Checked by opening
  a group item's link and reading `item.citationkey("selected")` back.
- **Copy entry** is `copyBibliography` with an index: one entry, as HTML and
  text, numbered as it is in the list: it copies what the reader right-clicked.
- **Find in note** cannot be a submenu of mentions: Obsidian 1.13 has no public
  submenu API, and a menu has no room to tell forty mentions apart. It selects
  the first mention (`mentionsOf` — the `@key`, with a `-` before it) and puts a
  **mention bar** under the entry: `Mention 1 / 5`, previous, next and close.
  Previous and next count from the editor's selection, not from a stored index,
  so a cursor the reader moved is respected, and both wrap round. The bar is
  relabelled rather than redrawn on a step, so the pressed button keeps the
  focus; the editor takes the focus only from the menu item, never from the
  bar, so pressing a button from the keyboard again cannot type into the note.
  A pass redraws the bar with the count taken afresh from the text it read, and
  ends it when the note is another one or no longer cites the source. The bar
  is hidden with its entry by the search. The note is found in its open view
  (the most recent leaf first, a deferred one by its view state) or opened in a
  new tab; in reading view `previewMode.applyScroll` scrolls to the line.
  Finding the source already being found keeps its bar instead of closing it
  and opening another in the same place.
- **Every state change the menu and the bar make is animated, and a pass
  redraw is not.** A pass rebuilds the body on every save, so anything keyed to
  an element appearing would replay while the reader types. Two mechanisms:
  - **The dividers' colour is a transition** on `border-top-color`, so the
    accent fades in and out. An entry built by a pass with `is-finding` already
    on has no before-style, so nothing transitions.
  - **The bar is animations played by class**, because it is put in and taken
    out rather than kept: `play(el, cls)` in `src/bibliography.ts` restarts the
    class's keyframes (taking the class off, calling `getAnimations()` to bring
    the style up to date, putting it back), awaits every `CSSAnimation` in the
    subtree, and takes the class off. `is-opening` and `is-closing` run the
    search row's slide — the grid track between `0fr` and `1fr`, the content
    fading and dropping 8px, on `--anim-duration-moderate` and
    `--anim-motion-swing` — and closing is `forwards` and `inert`, with the
    element removed once `play` settles, in the same microtask checkpoint, so
    no frame shows it open again. The count rolls up for next
    (`is-stepping-next`), down for previous, and only fades
    (`is-changing`) when a pass changed it; the previous and next buttons pop
    in and out when the count crosses one.
  - What a bar last showed is kept on the finding as `drawn`, and
    `drawMentionBar` animates only the difference from it: no `drawn` opens
    the bar, and a bar rebuilt by a pass with the same count moves nothing.
  - `prefers-reduced-motion` turns it all off with the same selectors, later
    in the file, rather than `!important`; `play` then settles at once, which
    is what removes a closed bar. Checked in headless Chrome by pausing each
    animation at fixed `currentTime`s and reading the bar's height, the
    dividers' colours — a hidden neighbour, the first and last entry, a menu
    and a finding at once — and the count's transform, with and without
    `--force-prefers-reduced-motion`.
- **The refresh button calls `forgetUnknown()`** before redrawing. A key missed
  because Better BibTeX had no item for it is never asked about again; this is
  the one way back, short of changing the style or port, for a source added to
  Zotero since.
- **A key missed because Zotero did not answer is not listed as missing.**
  `load` marks it `unreachable` when `user.groups` or an `item.pandoc_filter`
  call got no answer, and drops the kept library list so it is read again.
  `rpc` answers `null` for a refusal as much as for a closed Zotero, so a
  `pandoc_filter` that comes back empty is followed by `user.groups`: if Zotero
  answers that, the library's request is sent once more, and a library refused
  twice is passed over with its keys not found rather than unreachable. Only
  a Zotero answering neither is not there. The
  pane shows a "Zotero is not responding" notice in place of those keys, drawn
  like the missing section but not searched, since it holds no source; keys
  Zotero did answer about still go under "Sources not found in Zotero".
  `forgetUnknown()` clears both.
- **The pane asks again for the keys Zotero did not answer for**, and only the
  pane: every pass calls `load(keys, true)`, and while the notice is up a
  `RETRY_DELAY` (5 s) timer does the same, redrawing the pane only once Zotero
  answers, so a closed Zotero does not redraw it every few seconds. The timer
  is cancelled by every pass and by `onClose`, and a retry overtaken by a pass
  draws nothing. When a retry brings in sources, `redrawCitations` draws the
  notes' citations again, since the editors only ask for keys not yet missed.
  The editor never retries: it would send a request on every keystroke.
- **The layout follows citeproc's bibliography params.** `hangingindent` and
  `maxoffset` are handed to styles.css as custom properties
  (`--citation-suite-bibliography-indent`, `--citation-suite-bibliography-number-width`, in
  `ch`) on a modifier class. `second-field-align: margin` is set as `flush`:
  a sidebar has no margin to hang a number in. `line-spacing` and
  `entry-spacing` are ignored in the pane — APA's double spacing is for paper —
  but the copy keeps them, as Zotero's does.

## Settings tab

Declared through Obsidian 1.13's `getSettingDefinitions()`. `display()` is gone:
a non-empty array of definitions renders the tab **instead of** it, and
`minAppVersion` is 1.13.0, so nothing reaches it.

Unlike the sibling Classy PDF Extractor, almost every setting here **is** a
control the API describes — toggles, dropdowns, text fields and a slider — so
each is declared as a `control` and Obsidian draws it, indexes it for the
settings search, and asks the tab to store the value. Keep it that way; a
`render` definition for any of them would mean hand-drawing something the API
already draws, and `render` does not auto-save.

The exceptions are the **two lists**, both drawn by `src/picker.ts` — laid out
after the style list in Zotero's "Document preferences" window, one scrolling
box of every entry with the chosen one marked, which no control type draws. So
each row is a `render` definition: its name and description are Obsidian's, the
list wraps onto a line of its own under them, and the empty control block is
hidden. A choice goes through `setControlValue`, so saving and restyling still
happen in the one place a control's change goes. A click saves at once; the
arrow keys save once they stop, so walking down the list does not restyle every
open note on each step. The box is as tall as what is in it, up to about ten
rows.

- The **citation style**, in "Citation format". Zotero's styles first, then the
  vault's under a captioned rule (`PickerChoice.group`). What is written down
  is `styleChoice(style)` — an id for one of Zotero's, `vault:` and a path for
  one of the vault's — not the bare id, since the two lists can hold one id
  between them; `chosenStyle()` reads it back. See "Libraries and styles of the
  vault".
- The **bibliography**, in a section of its own above "Citation format": the
  Zotero library first — named "No bibliography chosen" on a phone, where there
  is no Zotero to ask — then every `.bib` and CSL JSON file the vault holds.
  The section is left out of the definitions altogether when the vault holds
  none and none is chosen, since there would be nothing in it to choose.
  `getSettingDefinitions()` starts the scan for those files, which Obsidian
  runs on every open of the tab, and the scan calls `update()` only when what
  it found has changed — otherwise it would draw the tab forever.

The **note footnote reset** row is also a `render`, for its destructive
button; see "A note's own footnote settings" under Footnotes.

The other exception is the **port**, for its reset button. Read out of
Obsidian 1.13.7's `app.js`: a control's `defaultValue` draws a `rotate-ccw`
extra button only for `slider` and `color`; for `number` it is merely what an
empty field falls back to, and a `control` definition cannot take extra
buttons. So `portSetting()` is a `render` that draws the button and a number
field itself and copies the control's behaviour: saved on blur or Enter, an
empty field takes the default, Escape restores the port in force, an invalid
port is refused with `setErrorMessage`, and the button carries
`aria-disabled="true"` (Obsidian dims it) while the default is in force. Its
tooltip is Obsidian's own wording for that button, «Восстановить значение по
умолчанию» / "Restore default". The value still goes through
`setControlValue`. If a later Obsidian gives `number` a reset button, go back
to the control.

Under both lists, in a row of its own whose name and description are not drawn,
is the **style preview**, `src/preview.ts`: a sentence citing a
sample source (`src/sample.ts` — Kuhn's *Structure of Scientific Revolutions*,
in the edition a reader of the interface language would cite) under a bar of
icon buttons for the citation look. Every option is a button of its own in
that bar — three colours, four underlines, bold and italic — with the ones in
effect pressed; there are no menus to open. The sample is rendered by
`CitationRenderer.sample()` without asking Zotero anything, and its id holds a
space so that it can never share a key with a real source.

Beside the preview's title, three more buttons switch the **preview mode**
(`previewMode`, live preview by default) — reading view, source mode and live
preview, with the icons Obsidian's own view header uses. The mode is not part of
the look: it changes nothing outside the box, so it redraws the sample instead
of touching the body classes.

- **Reading view and live preview** draw an inline citation alike; they differ
  once footnotes are on. Reading view sets the anchor as a superscript and the
  footnote under a short rule. Live preview shows the note's own `[^1]` and
  `[^1]:`, small and raised with fainter brackets — values copied from
  Obsidian's `span.cm-footref` and `HyperMD-footnote` line rules in its
  `app.css`.
- **Source mode** is live preview with the citation as written: the style is
  never asked for. That matches the editor, since `src/live.ts` draws no styled
  citation unless `editorLivePreviewField` is on (it does mark missing keys).
- The anchor goes **before the full stop in Russian and after it otherwise**, in
  every mode, and both it and the footnote are labelled through
  `plugin.footnoteOptions()` — the same options the insertion uses.

The **citation look** — colour, underline, bold and italic — is not drawn onto
citations. It
is a class on the `<body>` of every window (`src/look.ts`), which styles.css
turns into CSS variables that `.citation-suite-citation` reads, so reading view, live
preview and the settings preview all follow it and nothing is rendered again
when it changes. A custom colour is the one value that cannot be a class, so it
rides along as `--citation-suite-citation-custom-color`. The underline takes the
citation's colour at full strength for the accent and a custom colour, and is
faded to `--text-faint` only in the colour of body text. The accent is the
default. Pop-out windows get the
classes on `window-open`, and `onunload` takes them off every window.

### How the family styles a settings tab

Publish to Telegram, Pandoc GUI, Classy PDF Extractor and Advanced Word Count
all open their stylesheets with the same problem and the same two answers, and
this tab follows them. Obsidian 1.13 draws a declarative tab inside setting
groups: the group is a card, and every row in it is restyled by
`.setting-group .setting-item:not(.setting-item-heading)` — **specificity
0,3,0**, because `:not()` contributes its argument's weight. So:

- **A group holding hand-drawn DOM opts out of the card.** Blank
  `> .setting-items`, put the plugin's DOM in a row marked as an *anchor*
  (`citation-suite-settings-anchor`, named through three classes to outrank the rule
  above), blank that row, kill its `::before` — the group draws its dividers as
  a pseudo-element inset to a padding that lines up with nothing once the card
  is gone — and hide its stock `.setting-item-info` / `.setting-item-control`.
  Every one of the four does exactly this; only the prefix differs (`telegram-`,
  `ex-`, `pdf-annotations-`, `wcp-`).
- **A group whose rows Obsidian draws keeps the card and corrects the row.**
  The card itself gets a border: 1.13 draws it with a zero-width one, so a
  group was a patch of background with no outline beside the outlined status
  card. `citation-suite-settings-rows > .setting-items` takes the status
  panel's border, radius and fill, so every group in the tab is outlined alike.
  Then two row corrections, both of them in the siblings and both in
  `citation-suite-settings-rows`:
  - `align-items: center`. 1.13 lays a row out `flex-start`, which lifts the
    control to the top, so a toggle sits level with the first line of the name
    while the description runs on below it.
  - `flex: 0 1 max-content` on `.setting-item.mod-toggle > .setting-item-control`.
    Obsidian gives the control block the same `flex: 1 1 auto` as the text
    beside it, so a switch a few dozen pixels wide claims an even share of the
    row — half of it on a wide pane — and the text wraps early in the rest.
    `max-content` rather than `flex: 0 0 auto`, and the shrink factor stays 1:
    a control that cannot shrink takes the whole row inside a nested layout and
    squeezes the name and description to zero width. Publish to Telegram has
    the long version of this note; read it before touching the value.
  - Both are also made for the rows of a note's footnote settings modal
    (`citation-suite-note-footnotes`). Those rows are outside any group, but
    both causes are Obsidian's base `.setting-item` / `.setting-item-control`
    rules. Their rules come before the tab's, because Stylelint's
    `no-descending-specificity` refuses the less specific selectors after the
    tab's, even in the same selector list.

**Every stylesheet in the family carries a file-order rule, and so does this
one**: rules that re-assert a look on one of these rows tie with the block at
the top, so file order is what settles them. New row rules go **below** it.

The two row idioms in the family are a choice, not a disagreement: Classy PDF
Extractor gives each row its own card (border, background, radius,
`margin-bottom`) because its sections are hand-drawn; Publish to Telegram and
Pandoc GUI flatten rows to a top-border separator and build their own
`*-settings-card` around groups of them. This tab needs neither — its rows are
Obsidian's, and Obsidian's group card is already the right frame for them, which
is the same call Advanced Word Count makes with `wcp-settings-rows`. Don't add a
card idiom here until there is hand-drawn DOM that needs one.

Everything else in `styles.css` is the status card at the head of the tab and
the window the changelog and the user guide are read in. The tab has no title or
description of its own: it opens straight onto the status card.

- `getControlValue` / `setControlValue` are overridden so that writing a setting
  goes through the plugin's own `saveSettings()` — the one place that writes
  `data.json`. The base class already points at `plugin.settings`; stating it
  keeps a second path from existing.
- The **status card** row is the one `render` definition that is not a setting:
  `searchable: false`, because there is nothing in it to search for. Its stock
  name and description (`PLUGIN_NAME`, `PLUGIN_DESCRIPTION`) are required by the
  definition and hidden by styles.css. `update()` re-runs a render on
  the row it already drew, so the root is looked up before it is created and
  emptied — appending a fresh one each time would draw the card twice.
- The **status card** (`src/statusCard.ts`) is drawn after the one at the head
  of Pandoc GUI's settings (`PandocDashboard`, `PandocNotices`, `PandocLinks`,
  `ChangelogNotice` there), with its classes and values carried over under this
  plugin's prefix: one card, a row to each thing it is read for. Top to bottom:
  what this release brought (until dismissed); then one row of panels divided
  by upright rules — three `actionButton`s in equal thirds (`flex: 1 1 0`,
  never narrower than their content), each an icon before a centred label:
  the Zotero status, which checks again when pressed (`refresh-cw`; its label
  is "Zotero:" and the coloured state as one run of text, a word space apart,
  not bold, no dot), then the changelog and the user guide — and last a
  notice across the card only when Better BibTeX is missing or still starting.
  The upright rules are the row's 1px `gap` over a border-coloured background,
  so they survive the row wrapping; every panel is opaque for that reason.
  Zotero's version is deliberately not shown. Better BibTeX deliberately has no
  panel of its own: it is only worth a line when something is wrong with it.
- `checkZotero()` in `src/cayw.ts` asks two things, and neither opens anything:
  Zotero's own `/connector/ping` (200 when Zotero runs, whether or not Better
  BibTeX is installed), then the CAYW `probe`. Zotero
  answers a path nothing registered with `404 No endpoint found`, which is how
  a Zotero without Better BibTeX is told from one that is not running. The
  answer is kept on the tab (`lastCheck`) so that a redraw from `update()` does
  not ask again; `hide()` drops it, and a port change asks again.
- Dismissing the changelog notice writes `manifest.version` into
  `dismissedChangelogVersion`, a settings field the tab never draws. The next
  release is a version that no longer matches, so the notice comes back.

## Changelog and user guide in the plugin

`src/markdownModal.ts` renders either document — `getChangelogContent()` or
`getUserGuideContent()`, each in the interface language — with
`MarkdownRenderer.render`, into a `Component` of its own that is unloaded with
the modal.

The **user guide is the README's own guide section**, not a copy:
`guideOf()` (`src/userGuide.ts`) takes `README_RU.md` / `README.md` from their
`# Руководство пользователя` / `# User guide` heading up to the next top-level
heading, then adds the `# Об авторе` / `# About the Author` section up to its
first subheading — which leaves out the third-party licenses under it. Renaming
any of those headings empties the modal or drops the author;
`tests/userGuide.test.ts` reads the shipped READMEs to catch exactly that. The guide's tables get Pandoc
GUI's table rules. The sizes and spacing in `styles.css` are
**replicated value for value from the sibling Classy PDF Extractor and Publish
to Telegram plugins**, which draw the same window. Check those before changing
any of it — the three changelogs are meant to read alike.

The window deliberately does **not** carry Obsidian's `markdown-rendered` class.
That class sizes rendered markdown for reading a note, which is far larger than
the settings this window is opened from, and it would override every size above.
Adding it back is the one change that silently undoes the whole block.

## Settings loading

`loadSettings` starts from `DEFAULT_SETTINGS` and copies whatever `data.json`
holds over it, so a file written by an earlier version — or missing a field —
still yields a complete settings object. There are **no migrations**: this
plugin has never shipped a settings shape other than the current one, and
nothing here was forked from another plugin's id. It was developed as
**Zoterik** (id `zoterik`, view type `zoterik-bibliography`, class prefix
`zoterik-`) and renamed to Citation Suite before its first release, so no
installed copy carries the old id and nothing reads it. The GitHub repository
was renamed with it, from `pan4ratte/obsidian-zoterik` to
`pan4ratte/obsidian-citation-suite`.

## Source layout (flat, not a monorepo)

```
src/
  main.ts           — Plugin class, 7 commands, note menus, the bibliography view, settings load/save
  cayw.ts           — the Better BibTeX CAYW client: probe, Zotero check, pick, parse
  sourceModal.ts    — the citation window for a file library: pills, pages, a group
  pandoc.ts         — citations → pandoc syntax (pure; no Obsidian, no network)
  footnote.ts       — a citation as a footnote: label, numbering, placement (pure)
  noteFootnotes.ts  — a note's own footnote settings: in force, read, moved, dropped (pure)
  noteFootnoteModal.ts — the modal those settings are set in
  confirmModal.ts   — a question asked before something that cannot be undone
  citation.ts       — pandoc citations read back out of a note, and its cited keys (pure)
  noteCitations.ts  — a note's citations in pandoc's reading order, with their notes (pure)
  citationSession.ts — one citeproc engine kept in step with a note, citation by citation
  noteRendering.ts  — the queue and cache every view writes a note's citations through
  render.ts         — citeproc: items, engines, tooltips, the bibliography, library search
  live.ts           — live preview: styled citations and missing-key marks
  reading.ts        — reading view: the same, block by block
  suggestion.ts     — key suggestions: trigger, insertion, ranking (pure)
  bibtex.ts         — a `.bib` read the way pandoc reads one (pure)
  libraryFile.ts    — a library file's format and its sources, by format (pure)
  vaultLibrary.ts   — the vault's library files: found, read, re-read when they change
  styles.ts         — a CSL file's id and title, and what a chosen style means (pure)
  vaultStyles.ts    — the `.csl` files of the vault, read through Obsidian
  zoteroStyles.ts   — the styles and preferences on Zotero's disk; the one Node importer
  literatureNote.ts — the note kept about a source, found by name or front matter (pure)
  noteStyle.ts      — a note's `csl` and `lang`, and where pandoc finds the style (pure)
  noteStyles.ts     — the style each note is previewed in, resolved and kept
  localeTerms.ts    — locator labels in a language, from CSL locale and style terms (pure)
  citationSuggest.ts — the EditorSuggest that offers sources after `@`
  bibliography.ts   — the right-sidebar pane listing the note's bibliography
  embeds.ts         — a note with the notes it embeds written in (pure)
  zoteroCite.ts     — what Zotero does around citeproc, ported (pure)
  search.ts         — the pane's filter: words, normalisation, matching (pure)
  settings.ts       — the declarative settings tab
  statusCard.ts     — the card at the head of the settings: status, notices, documents
  picker.ts         — the Zotero-like list a style or a bibliography is chosen from
  preview.ts        — the style preview and its bar of look buttons
  sample.ts         — the source the preview cites
  look.ts           — the citation colour and underline, as body classes
  markdownModal.ts  — the changelog or the user guide, rendered as markdown
  userGuide.ts      — the guide section cut out of a README (pure)
  zoteroNote.ts     — a picked Zotero note as Markdown at the cursor
  typography.ts     — the small text rules the rendered citations are held to (pure)
  spinner.ts        — the wait a pane shows while it has nothing to show
  types.ts          — Citation, CitationStyle, settings + defaults
lang/
  ru.ts             — every user-facing string; the original
  en.ts             — the same keys, in the same order, translated from ru.ts
  helpers.ts        — picks the locale, exports `t`, getChangelogContent() and getUserGuideContent()
  markdown.d.ts     — declares the "*.md" text imports for tsc
tests/
  pandoc.test.ts    — the formatter, every form and every field
  cayw.test.ts      — parsing what the endpoint answers, incl. a real answer
  footnote.test.ts  — labels, roman numerals, and where a footnote's text goes
  noteFootnotes.test.ts — a note's footnote settings over the tab's, and following renames
  noteCitations.test.ts — reading order, note numbers, matching a piece to its note
  citationSession.test.ts — incremental updates against a fresh citeproc engine
  suggestion.test.ts — trigger, insertion, sources shown and ranked
  literatureNote.test.ts — which note is a source's, and which of several
  embeds.test.ts    — embeds found, expanded, nested, and kept apart
  noteStyle.test.ts — properties, file names, URLs matched to Zotero's styles, lookup order
  localeTerms.test.ts — locators read as pandoc 3.11 read them, per language and style
  bibtex.test.ts    — a `.bib` mapped as pandoc maps one, rule by rule
  libraryFile.test.ts — both formats, and what a file that is neither comes to
  vaultLibrary.test.ts — finding the vault's library files, and re-reading them
  vaultStyles.test.ts — the vault's styles, and the guard that only `zoteroStyles.ts` imports Node
  styles.test.ts    — a style's id and title, and which file a written-down choice means
  render.test.ts    — engines, items per library, tooltips and the bibliography
  citation.test.ts, noteRendering.test.ts, search.test.ts, look.test.ts,
  typography.test.ts, userGuide.test.ts, zoteroCite.test.ts, zoteroNote.test.ts
  fixtures/         — IEEE's English locale block, for the style-terms test
  mocks/obsidian.ts — stands in for the module at import time
styles.css          — the status card, the settings rows, the document window
CHANGELOG_RU.md     — release notes; the original
CHANGELOG.md        — translated from CHANGELOG_RU.md; the workflow's source
versions.json       — plugin version → the minAppVersion it shipped with
```

`src/main.ts` is the esbuild entry point and the default export is
`CitationSuitePlugin`. Files import each other by package-root path (`src/…`,
`lang/…`), resolved through tsconfig's `paths` — not `baseUrl`, which is
deprecated in TypeScript 6 — and by esbuild and Vitest through the aliases in
their own configs. Three places, and they have to agree.

## Testing

Vitest, not the sibling Classy PDF Extractor's Jest: there is no `ts-jest`
layer to configure, and nothing here needs one. `tests/` is **in** the tsconfig
program, so `npm run build` type-checks the tests too and the type-aware lint
rules can read them.

Only the pure halves are tested — the formatter, the footnote edits, the
parsing of what CAYW answers with and of a note's citations, and the citation
session, which runs the real `citeproc` package against small CSL styles
written into the test and the bundled `en-US` locale read off disk (the `.xml`
import is esbuild's, not Vitest's). The modules they live in still import from `obsidian`, which is
aliased to `tests/mocks/obsidian.ts`; that mock stubs only what importing the
code under test evaluates. Extend it when a test needs more, rather than faking
Obsidian's behaviour.

The one fixture worth keeping honest is the real CAYW answer in
`cayw.test.ts` — field order, empty strings and all, straight off a running
Zotero. Re-capture it rather than editing it by hand:

```bash
curl -s "http://127.0.0.1:23119/better-bibtex/cayw?format=pick&selected=true"
```

`selected=true` answers from whatever is selected in Zotero's pane and opens no
window, which makes it the one way to exercise the endpoint without a dialog
appearing on someone's screen.

## Lint

`eslint.config.mjs` extends `eslint-plugin-obsidianmd`'s
`recommendedWithLocalesEn`, which bundles `eslint:recommended`,
typescript-eslint `recommended-type-checked`, `import`, `depend` and
`no-unsanitized`, and adds the sentence-case check over `lang/en.ts`. Lint is
**clean**: 0 errors and 0 warnings, and CI runs it with `--max-warnings 0`. Keep
it that way.

Three things about this config are load-bearing:

- **`files` covers `**/*.mts` as well as `**/*.ts`.** The preset parses `.mts`
  as TypeScript and turns the type-checked rules on for it, and a rule of that
  kind **fails to load** rather than reporting when no project service is wired
  up for the file it is asked about — the whole run dies on
  `vitest.config.mts` with a message about `await-thenable`. `*.mts` is in
  tsconfig's `include` for the same reason.
- **`brands` and `ignoreWords` replace the rule's default lists**, they do not
  add to them. That is why `Obsidian` is named alongside `Citation Suite`, `Zotero` and
  `Better BibTeX`: dropping it would lowercase it.
- **`Pandoc` is a brand in `lang/en.ts`.** The interface text writes it with its
  capital, as `manifest.json`, the READMEs and `ru.ts` do, so the locale-module
  rule keeps it that way. The plain `sentence-case` rule still ignores the
  lowercase `pandoc`, which names the command in code.

The sentence-case rule also **bans the disable comment for itself**, so there is
no exempting a string — write UI text that passes. It reads a value as one
literal, so a concatenated string is silently unchecked, and it objects to a
bare `@key` in prose (it reads the `@` as a handle): `SETTING_BRACKETS_DESC`
shows the bracketed example and describes the other rather than printing it.

### CSS

`stylelint.config.mjs` extends `stylelint-config-obsidianmd`, Obsidian's own
CSS ruleset and the one the review scanner runs over `styles.css`. It is a
separate package from the ESLint plugin, and ESLint never looks at CSS, so an
up-to-date `eslint-plugin-obsidianmd` alone lets the scanner's CSS findings
through. Lint is clean here as well, and CI runs it with `--max-warnings 0`.

- **The browser target is Electron 39 (Obsidian 1.11.4), not the preset's 43.**
  That is the version the scanner reported against. `browsers` replaces the
  preset's options rather than merging with them, so `ignore` is restated too.
- **`:has` is not used.** The scanner advises against it for its invalidation
  cost. The slider row it once found is sized by `white-space: nowrap` on the
  value alone; measured in Chromium against Obsidian's own `app.css`, the row
  came out the same at every width.
- **The scanner ignores `stylelint-disable` comments**, so `lint:css` runs with
  `--ignore-disables` and a warning has to be designed out, not silenced. Two
  were, both false positives in caniuse's data (partial support there means
  `text-decoration-skip` values and `text-indent`'s `hanging` / `each-line`
  keywords, none of which the stylesheet uses):
  - `text-decoration-*` longhands are flagged, but a `text-decoration`
    shorthand whose parts are all `var()`s is not. `text-decoration-skip-ink:
    none` is replaced by `text-underline-position: under` with a `0.05em`
    offset: below the descenders there is nothing to skip. Screenshots with
    skip-ink `auto` and `none` came out pixel-identical across 20 Windows
    fonts, 6 sizes and all three line styles.
  - `text-indent` for the hanging indent is replaced by padding on the entry
    and a negative margin on its `::first-letter`. Measured in Chromium, lines
    fall in the same places. It also stopped the indent being inherited by the
    mention bar, whose label it had pulled out of its box and clipped.

## npm audit and the lockfile

`npm audit` reports **0 vulnerabilities**, and there is no `overrides` block
keeping it there — unlike the sibling Classy PDF Extractor, which needs one.

The sibling's **"package-lock.json must be generated on Linux"** rule does
**not** apply here, and it is worth knowing why before someone copies the CI
guard across. That trap is `@unrs/resolver`, a native binding pulled in by a
newer `eslint-plugin-import`, whose optional `@emnapi/*` dependencies Windows
never hoists to the top level. This tree has no `@unrs/resolver` at all:
`eslint-plugin-import` is nested under `eslint-plugin-obsidianmd` at a version
that predates it. Check before assuming that still holds:

```bash
node -e 'const l=require("./package-lock.json");console.log(Object.keys(l.packages).filter(k=>k.includes("unrs")||k.includes("emnapi")))'
```

An empty array means a lockfile written on Windows is complete everywhere. If
that ever prints something, `npm ci` will start failing on Linux with "Missing:
@emnapi/core from lock file" and the lockfile has to be regenerated under WSL —
read that repo's AGENTS.md, which documents the whole trap and its remedy.

## Release

`manifest.json` is the source of truth. `.github/workflows/main.yml` releases
automatically when its `version` changes on `main` — **no manual tagging and no
`npm version`**; the release creates the tag.

To cut a release, in one commit:

1. Bump `version` in **`manifest.json` and `package.json`** to the same value —
   the workflow fails the run if they disagree
2. Rename `## Не выпущено` in **`CHANGELOG_RU.md`** and `## Unreleased` in
   **`CHANGELOG.md`** to that version. Both are shipped inside `main.js` and the
   plugin picks between them by locale, so a version renamed in one file and not
   the other leaves half the readers on a heading that says the release is
   unreleased. The workflow checks both and greps `## <version>` in
   `CHANGELOG.md` for the release notes
3. Add the new version to `versions.json`, mapped to the `minAppVersion` this
   release ships with — that file is what lets an older Obsidian keep offering
   the last release it can actually run. It is read from the repository, not
   from the release assets, so it only has to be committed. The workflow fails
   the run if the version is missing from it
4. Push

The workflow then runs `npm ci` and `npm run build`, attests build provenance
for `main.js` / `manifest.json` / `styles.css`, creates the release with those
three assets, and verifies the attestations. It skips if that version is already
released, so unrelated `manifest.json` edits are harmless.

`.github/workflows/ci.yml` is what runs lint, tests and the build on every push
and pull request; the release workflow does not. Still run `npm run lint` and
`npm test` before pushing — CI is the backstop, not the first look.

## Style

- `.editorconfig`: tabs, indent 4, UTF-8, final newline.
- No inline UI styles — put CSS in `styles.css` and add a class.
- Settings UI: sentence case for all user-facing text, and no plugin name in a
  command name.
- **Command IDs are never renamed.** They are persisted with whatever hotkey is
  bound to them, and a rename silently unbinds it.
- **No string literals in the UI** — command names, notices, setting names and
  descriptions all come from `lang/en.ts`, reached as `t.SOME_KEY` via
  `import { t } from "lang/helpers"`. Flat `UPPER_SNAKE` keys grouped under
  `// ─── Section ───` banners; values are plain strings, and anything variable
  is interpolated at the call site
  (`` new Notice(`${t.NOTICE_PICK_FAILED} ${detail}`) ``). A new language is a
  copy of `en.ts` listed in `helpers.ts`'s `localeMap`. Every locale file must
  carry all of `en.ts`'s keys, since `t` is typed as `typeof en`.
- **`ru.ts` is the original; `en.ts` is translated from it.** New or reworded UI
  text goes into `ru.ts` first and `en.ts` is synced to match in the same
  change — never the reverse. Exempt, and to stay exempt: the command IDs, the
  citation examples inside a description (`[@doe2020, p. 33]` is pandoc syntax,
  not prose), and the locator abbreviations in `LOCATOR_LABELS`, which are CSL's
  and are not user-facing text in the first place.
- **`CHANGELOG_RU.md` is the original; `CHANGELOG.md` is translated from it.**
  The same rule, for the same reason: a release note written in English first
  reads like a translation in Russian. Keep them line for line — the same
  versions, in the same order, with the same headings
  (`### Новые возможности` / `### New features`,
  `### UI/UX улучшения и исправления багов` /
  `### UI/UX enhancements and bug fixes`) and the same bullets in the same
  order. Version numbers, code spans and the markdown itself are not translated.
  Notes stay short — a bold lead-in and a sentence or two.
- `manifest.json`'s `name` and `description` are duplicated by `PLUGIN_NAME` and
  `PLUGIN_DESCRIPTION`, which the plugin browser cannot reach and no translation
  can. Change them together.
