# Rendering citations

Part of the notes for coding agents. [AGENTS.md](../AGENTS.md) has the rules most changes need and points here; this file holds the detail, moved there from AGENTS.md unchanged.

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
  see [the JSON-RPC contract](zotero.md).
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

### Citations with the author in the text

`@doe2020 says` is pandoc's author-in-text citation (issue #1), and it is
previewed as pandoc 3.12.1 writes it. Every rule below was read off pandoc
running APA, IEEE and Chicago notes on the same notes, not its manual:

- **Where one stands** (`BARE` in `src/citation.ts`): after anything but a
  letter, a digit or a full stop — `(@key)`, `"@key"`, `*@key*`, `;@key` are
  citations, `me@x.org` and `a.@key` are not. Two departures, on purpose:
  not after `/` (pandoc cites `x.com/@user`), and not inside any bracket, so
  Obsidian's `[[@key]]` stays a link. `-@key` alone is an ordinary citation
  with the author left out, "(2020)".
- **The bracket after it** — after spaces or on the next line — is part of
  it (`bracketAfter`): a first part naming no key is the locator and suffix,
  read as the text after a comma is (`[and more]` keeps pandoc's comma,
  "(2020, and more)"); a part naming a key is another source of the same
  citation (`[p. 33; also @roe2021]`, `[@roe2021]`). A bracket with a later
  part naming no key is not taken at all; `[[link]]` is never taken. A
  comma after the key is not a locator: `@doe2020, p. 4` is "Doe (2020), p. 4".
- **`^[…]` is an inline note, not a group.** Its text is read like any other,
  so `^[As @doe2020 says.]` holds an author-in-text citation. Before this the
  whole note was read as one bracketed citation.
- **Written as two pieces** (`clusterOf`, `authorOf`, `withAuthor` in
  `src/citationSession.ts`): the engine holds the citation with the first
  source's `suppress-author` and `unsorted: true` — pandoc keeps the in-text
  source first where APA would sort it last — and the author is
  `previewCitationCluster` of the first source `author-only`, at the
  citation's place among the note's, which leaves the engine as it was. That
  gives "John Smith" the first time in Chicago notes and "Smith" after, as
  pandoc does. `[NO_PRINTED_FORM]` from a style with no author in its
  citations (IEEE) leaves the citation alone, "[1]". Where the style writes
  "Ibid." it names no one, and pandoc names the author anyway, "Kuhn (Ibid.,
  p. 33)": `authorAt` asks again without the citations of that source just
  before, which gives a later citation's form — or the first one's, where
  those were its only citations, which pandoc would still write short. The authors are job
  steps after the citations, all written again whenever anything was handed
  over (a given name added for a second Smith changes no citation's text);
  200 of them cost 100 ms in APA, 170 ms in Chicago. citeproc's own
  `composite` mode was tried and is wrong three ways: it sorts first, prints
  `[NO_PRINTED_FORM]`, and doubles the author in a note style.
- **In a note style** the author stays in the line, followed by the note's
  text, as a note style's body citation always is in the preview. In a
  footnote, pandoc writes it as an ordinary citation (`inTextHere`).
- **Only a known key is a citation.** A bare group is left out of what the
  engine is given unless every source is in hand (`known`, as for any group),
  its own key is never marked missing (`standsAlone`) unless the key index
  traces it to a new key, and the pane lists it only once found
  (`citedKeys(text, { bracketed: true })` is what may be listed as not
  found). Pandoc writes an unknown one as "(someone?)"; the preview leaves
  `@someone` as it is.

Checked against pandoc for the three styles with the notes in the tests and
the issue: every citation came out the same, but for Chicago's body citation
being author plus the note's text where pandoc puts the text in a footnote.

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
