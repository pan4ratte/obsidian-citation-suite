# AGENTS.md — citation-suite

## Commands

| Command | What it does |
|---------|-------------|
| `npm run dev` | esbuild watch mode (no typecheck) |
| `npm test` | Vitest — 138 tests, all passing |
| `npm run lint` / `npm run lint:fix` | ESLint flat config with the official Obsidian ruleset |
| `npm run build` | `tsc -noEmit -skipLibCheck && node esbuild.config.mjs production` |

## What this plugin is

A hotkey opens Zotero's own citation window and writes what was picked into the
note as a pandoc citation. There is no bibliography in the vault, no library
index, no cache: the pick is a single HTTP request to Zotero and the answer is
the citation.

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
  `true` is. A flag is sent only when it is on. `pickParams` is the one place
  that builds them, and that is the rule it keeps.
- **An empty body is a cancelled pick.** Closing the window without choosing
  answers with `""`, and so does an error BBT handled itself (it flashes its own
  message inside Zotero first). Both are silent here: no notice, nothing
  inserted.
- **A failure answers 500 with prose, not JSON** — literally
  `CAYW failed: {…} requested: No such formatter "…"`. That body is what a
  `CaywError` carries, and it is appended to the notice.
- **`probe=true` is answered before the handler does any work**: `ready`, or
  `starting` while BBT is still indexing the library after launch. Those two are
  worth telling apart from unreachable — one is a wait, the other is something
  to fix — which is the whole reason the probe is a separate round trip rather
  than an error path.
- **The picker can return things with no citation key**: a standalone Zotero
  note (BBT's `pick` formatter accepts notes, unlike its `pandoc` one), and an
  item whose key has not been generated. `citable()` drops them and the caller
  says how many, rather than writing a bare `@` into the note.
- **The port is a setting because the beta moves it.** Zotero listens on 23119,
  Zotero Beta on 24119, so both can run at once.

The shape of one citation — `id`, `citationKey`, `locator`, `label`, `prefix`,
`suffix`, `suppressAuthor`, `uri`, and `itemType`/`title`/`note` for notes — is
BBT's `citationItems()`. `label` is filled in as `"page"` whenever a locator was
typed without a label of its own, so a locator practically always arrives
labelled; `selected=true` — which the fixture below is captured with, and which
the plugin does not send — is the exception, since there is no window there to
type either into. A real answer is pinned as a fixture in `tests/cayw.test.ts`.

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
  Zotero" needs; see the bibliography pane below.
- **`user.groups`** answers with every library as `{ id: libraryID, name }`.
  The renderer keeps that list until `reset()` or `forgetUnknown()`.

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
with `http://www.zotero.org/styles/` and then cannot find it.

## The pandoc formatter

`src/pandoc.ts` is the plugin's own, not a call into BBT's `format=pandoc`, and
that is a decision rather than an oversight: the endpoint formats one way per
request, and both forms the plugin offers — bracketed and not, parenthetical and
narrative — have to come out of a single pick. Writing it here also makes every
rule testable without Zotero running.

Two things follow from that, and both have to be kept:

- **`LOCATOR_LABELS` and `PLAIN_CITATION_KEY` are copied from BBT** (`shortLabel`
  and the key regex in its `pandoc` formatter), so a locator and a key read the
  same whichever tool wrote them. If BBT changes either, this file is what
  drifts.
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
- **The prefix and suffix are refused by `validate` when they hold whitespace or
  `[ ] ^ \ |`**, and cleaned of the same when a label is built, because
  `validate` does not stop a hand-edited `data.json`.

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
- **Keys come from `citedKeys`** in `src/citation.ts`: bracketed groups only,
  as everywhere else, once each, in order of first citation, with the front
  matter, fenced and inline code, and `%%`/`<!-- -->` comments emptied out
  first. `proseOf` overwrites them with spaces, newlines kept, rather than
  removing them: no bracket meets another across a gap, and an offset into the
  prose is an offset into the note, which `mentionsOf` depends on.
- **The list is written by the citation engine, not the tooltips' number-less
  one**, through `CitationRenderer.bibliographyOf`: in a reference list the
  numbers belong. The keys are handed to `updateItems` in first-citation order,
  which is what an unsorted numbered style numbers by. Unknown keys are dropped
  before that — citeproc would write them as untitled documents — and are listed
  separately under the entries.
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
- **Right-clicking an entry opens an Obsidian `Menu`** with three items, in
  this order: reveal in Zotero, copy the entry, find in the note. Missing keys
  have no menu. Right-clicking marks nothing: only a finding colours an entry.
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
  once is never asked about again, and a Zotero that was closed at that moment
  misses every key; this is the one way back short of changing the style or
  port.
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
control the API describes — toggles, dropdowns, text fields and a number — so
each is declared as a `control` and Obsidian draws it, indexes it for the
settings search, and asks the tab to store the value. Keep it that way; a
`render` definition for any of them would mean hand-drawing something the API
already draws, and `render` does not auto-save.

The one exception is the **citation style**. It is chosen from a list drawn in
the tab itself, `src/stylePicker.ts`, laid out after the style list in Zotero's
"Document preferences" window — one scrolling box of every style, the chosen one
marked — and no control type draws that. So the row is a `render` definition:
its name and description are Obsidian's, the list wraps onto a line of its own
under them, and the empty control block is hidden. A choice goes through
`setControlValue`, so saving and restyling still happen in the one place a
control's change goes. A click saves at once; the arrow keys save once they
stop, so walking down the list does not restyle every open note on each step.

Under the list is the **style preview**, `src/preview.ts`: a sentence citing a
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
  never asked for. That matches the editor, since `src/live.ts` draws nothing
  unless `editorLivePreviewField` is on.
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
  Two corrections, both of them in the siblings and both in
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

Everything else in `styles.css` is the header (title and muted description, set
the way Publish to Telegram sets the same paragraph), the changelog banner, and
the changelog window.

- `getControlValue` / `setControlValue` are overridden so that writing a setting
  goes through the plugin's own `saveSettings()` — the one place that writes
  `data.json`. The base class already points at `plugin.settings`; stating it
  keeps a second path from existing.
- The **changelog banner** is the one `render` definition, and the one thing in
  the tab that is not a setting: `searchable: false`, because there is nothing
  in it to search for. `update()` re-runs a render on the row it already drew,
  so the root is looked up before it is created — appending a fresh one each
  time would draw the banner twice.
- Closing the banner writes `manifest.version` into `dismissedChangelogVersion`,
  a settings field the tab never draws. The next release is a version that no
  longer matches, so the banner comes back.

## Changelog in the plugin

`src/changelogModal.ts` renders `getChangelogContent()` — the changelog in the
interface language — with `MarkdownRenderer.render`, into a `Component` of its
own that is unloaded with the modal. The sizes and spacing in `styles.css` are
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
  main.ts           — Plugin class, 6 commands, the bibliography view, settings load/save
  cayw.ts           — the Better BibTeX CAYW client: probe, pick, parse
  pandoc.ts         — citations → pandoc syntax (pure; no Obsidian, no network)
  footnote.ts       — a citation as a footnote: label, numbering, placement (pure)
  citation.ts       — pandoc citations read back out of a note, and its cited keys (pure)
  render.ts         — citeproc: a citation, its tooltip, and a note's bibliography
  bibliography.ts   — the right-sidebar pane listing the note's bibliography
  zoteroCite.ts     — what Zotero does around citeproc, ported (pure)
  search.ts         — the pane's filter: words, normalisation, matching (pure)
  settings.ts       — the declarative settings tab and the changelog banner
  stylePicker.ts    — the Zotero-like list the citation style is chosen from
  preview.ts        — the style preview and its bar of look buttons
  sample.ts         — the source the preview cites
  look.ts           — the citation colour and underline, as body classes
  changelogModal.ts — the changelog, rendered as markdown
  types.ts          — Citation, CitationForm, settings + defaults
lang/
  ru.ts             — every user-facing string; the original
  en.ts             — the same keys, in the same order, translated from ru.ts
  helpers.ts        — picks the locale, exports `t` and getChangelogContent()
  markdown.d.ts     — declares the "*.md" text imports for tsc
tests/
  pandoc.test.ts    — the formatter, every form and every field
  cayw.test.ts      — parsing what the endpoint answers, incl. a real answer
  footnote.test.ts  — labels, roman numerals, and where a footnote's text goes
  mocks/obsidian.ts — stands in for the module at import time
styles.css          — the settings header, the banner, the changelog window
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

Only the pure halves are tested — the formatter, the footnote edits, and the
parsing of what CAYW answers with. The modules they live in still import from `obsidian`, which is
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
- **`pandoc` is an ignored word, not a brand.** It is lowercase in its own
  documentation and in the syntax it names; as a brand the rule would capitalise
  it.

The sentence-case rule also **bans the disable comment for itself**, so there is
no exempting a string — write UI text that passes. It reads a value as one
literal, so a concatenated string is silently unchecked, and it objects to a
bare `@key` in prose (it reads the `@` as a handle): `SETTING_BRACKETS_DESC`
shows the bracketed example and describes the other rather than printing it.

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
