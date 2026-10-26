# Talking to Zotero: CAYW and JSON-RPC

Part of the notes for coding agents. [AGENTS.md](../AGENTS.md) has the rules most changes need and points here; this file holds the detail, moved there from AGENTS.md unchanged.

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
  Zotero" needs; see [the bibliography pane](bibliography-pane.md). It is also what the key
  suggestions search with; see [Citation key suggestions](suggestions.md).
- **`item.search` with a string searches fewer fields than Zotero's quick
  search** — title, publication, short title, court, year and citation key,
  but no creators — so a surname finds nothing unless it is in the key (and
  in 9.0.71 it fails outright, "Invalid condition 'groupStart'"). Given
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
