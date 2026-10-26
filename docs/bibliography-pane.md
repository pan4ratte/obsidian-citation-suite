# Bibliography pane

Part of the notes for coding agents. [AGENTS.md](../AGENTS.md) has the rules most changes need and points here; this file holds the detail, moved there from AGENTS.md unchanged.

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
  the searches: bracketed groups and citations standing alone, as everywhere
  else — a key only ever standing alone is kept once the library has it, a
  rename traces it or Zotero did not answer, so `@someone` is never listed as
  not found ([rendering.md](rendering.md)) — once each, in order of first citation, with the front
  matter, fenced and inline code, and `%%`/`<!-- -->` comments emptied out
  first. `proseOf` overwrites them with spaces, newlines kept, rather than
  removing them: no bracket meets another across a gap, and an offset into the
  prose is an offset into the note, which `mentionsOf` depends on.
- **The list is written with the note's citations**, through
  `NoteRenderer.bibliography`: the engine is brought to the note ([rendering.md](rendering.md)) and the
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
- **The bar reads "References", with the entry count beside it**, and four
  buttons: search, copy, select in Zotero and refresh. Copy writes `formattedBibliography` as
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
- **Select in Zotero** (the bar's `list-checks` button, desktop and a Zotero
  library only) selects every entry's item in Zotero's window through one
  link. Read out of Zotero 7's `ZoteroProtocolHandler.mjs`, `xpcom/api.js`
  and `pathparser.mjs`: the router lets a route's last parameter be missing,
  so `library/items` and `groups/ID/items` match with no key, and
  `itemKey=A,B,C` from the query is split on commas into one search whose
  items `ZoteroPane.selectItems` selects, after selecting the library root.
  One library per link, since Zotero's pane shows one. One library is
  selected at once; several are offered in a `Menu` under the button, each
  with the count of the list's sources in it, and the chosen one is selected.
  **Not `itemLibraries`**: that is the library a key was rendered from, the
  first in `user.groups` order that had it, while a source is commonly in
  My Library and the group it was shared to — counted by it, a note of 71
  group sources, one also in My Library, offered the group 70. So
  `selectionLibraries` in `src/render.ts` asks one `item.search` for the
  keys in every library, `["joinMode","any"]` and a `citationKey is` per
  key, and `librarySelections` in `src/zoteroCite.ts` groups the answer by
  the library its URI names (two groups can share a name), keeps a key only
  matched with its case, drops libraries `user.groups` does not list
  (feeds), orders them as it lists them — My Library first — and builds each
  link from the URIs with `selectItemsLink`. A menu choice opens its link
  with nothing more to ask. For reference, a single-library search of 250
  keys came back in 1.4 s as a 2.3 KB link. A press while one is being
  answered is ignored.
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
