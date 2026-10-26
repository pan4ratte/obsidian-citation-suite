# Citation keys that change

Part of the notes for coding agents. [AGENTS.md](../AGENTS.md) has the rules most changes need and points here; this file holds the detail, moved there from AGENTS.md unchanged.

## Citation keys that change

A key is Better BibTeX's name for an item, and the name can change: by hand,
or — while "Regenerate citation key when item changes" is on — on every edit
of the item. Nothing in Zotero remembers the old key, so a note citing it loses
the source for good. Three steps answer that: a warning, an index of which
item each key stood for, and the repair built on the index.

What Better BibTeX does, read out of **9.0.71**'s bundle and checked against
a running Zotero:

- **There is no pinning any more.** Keys live in Zotero's own Citation Key
  field, and a key once filled in stays — the old "pinned" key. The migration
  moved `autoPin`/`autoPinDelay` to `fillKeyAfter` ("Automatically fill
  citation key after N seconds", for an item with no key) and
  `autoPinOverwrite` to `resetKeyOnChange` ("Regenerate citation key when
  item changes", on the "Citation keys" tab, off by default; the migration
  dialog turns it on when the reader chose dynamic keys). Only the second
  overwrites a key on an edit: `KeyManager.update(item, { replace:
  Preference.resetKeyOnChange })` on every `updateCitationKeys` event.
- **`item.pandoc_filter`'s `Better CSL JSON` carries the item's URI** as
  `custom.uri` (with `custom.itemID`, the local database id, which is useless
  elsewhere). So which item a key stands for costs no request beyond the
  lookup the renderer makes anyway.
- **`item.citationkey(["libraryID:itemKey", …])`** answers
  `{ "libraryID:itemKey": citekey | null }` from BBT's key manager; a bare
  `itemKey` means My Library, and `"selected"` reads Zotero's selection.
  `libraryID` is the number `user.groups` gives as `id`, not a group id.

**1. The warning.** `regeneratesCitationKeys()` in `src/zoteroStyles.ts` reads
`extensions.zotero.translators.better-bibtex.resetKeyOnChange` off `prefs.js`
(absent means off). The status card reads it on every check, with the Zotero
check (`StatusCheck` is both), and while it is on draws a notice saying which
option to turn off — Zotero running or not, since it is a preference on disk,
but not when Better BibTeX is missing. It is a card of its own under the status
card — a sign, a title, the text — with a cross that closes it for good: `dismissedKeysWarning`, a
settings field the tab never draws, as `dismissedChangelogVersion` is. Once
closed it is not drawn again even if the option is turned off and on; the
README's troubleshooting still says it. The English text describes the option
rather than quoting its label: the sentence-case rule flags a quoted capital
anywhere in the string. The Russian one quotes it, since Better BibTeX has no
Russian interface.

**2. The key index.** `src/keyIndex.ts` (pure, tested) keeps pairs of a key
and the item it stood for, as `libraryID:itemKey`; `src/keyIndexFile.ts` keeps
them in `citation-keys.json` in the plugin's folder and sweeps them; `main.ts`
creates it on a desktop only and has the renderer report every Zotero key it
finds (`CitationRenderer.onIdentified`, fed by `fetchItems` from `custom.uri`).

- **Pairs, not one key per item.** When an item's key changes and one note is
  written with the new key, other notes still cite the old one, and both have
  to lead to the item. A key found for another item of the **same** library
  drops the old pair, since a key is unique inside a library; the same key in
  another library is another item, and stays.
- **Bounded by the vault, not by age.** A sweep reads every `.md` and the text
  cards of every `.canvas` (`citedKeysOfFile`, with `citedKeys`) and drops a
  pair whose key no file cites — on the **second sweep in a row** that finds
  it so, so that a note still on its way from another device keeps its pair.
  A key whose item changed it stays cited in the notes missing it, which is
  what keeps its pair. Dropping by age would be wrong: a note unopened for a
  year still cites its keys, and is the likeliest to lose one unseen.
- **When.** One minute after the layout is ready, then looked at hourly; it
  runs when a day has passed since the last (`swept`, in the file), or the
  clock went back. It reads in batches of 20 with a turn for the window
  between, and an unreadable file or an unload calls the sweep off uncounted.
- **The file**: `{ version: 1, swept, keys: [[citekey, item], [citekey, item,
  misses], …] }`, written 2 s after the last change and on unload; read
  forgivingly, a bad pair skipped, an unreadable file starting empty. About
  50 bytes a pair. Not `data.json`: it is not a setting and changes on every
  first lookup. Obsidian Sync may not carry it, which is fine — each desktop
  builds its own, and nothing is shared that could conflict.

**3. The repair.** Never silent: a key is rewritten only by the reader's
press of a button or a confirmed command.

- **Tracing, in the renderer.** `lookUp` hands the keys Zotero answered
  for and had nothing to `traceRenames`: the index's items for each
  (`setKeyHistory`, fed by `KeyIndexFile.itemsOf`), one `item.citationkey` for
  all of them, and the first item — My Library's first — whose key now is
  another gives `renamed(key)`. A key the index never saw costs no request; a
  Zotero not answering leaves the keys missing as they were. `forgetUnknown()`
  clears it with the rest, and a key found again drops it. Since `load()`
  awaits it, everything that reads `missing()` after a load reads
  `renamed()` too. `tests/keyTrace.test.ts` runs it against a mocked
  `requestUrl` answering as BBT 9.0.71 does.
- **The rewrite** is `src/keyRename.ts` (pure, tested): `keyRenameEdits`
  finds every key place in `proseOf(text)` — bracketed groups through
  `keyMentions`, and standalone `@key`/`-@key` at the start or after a space or
  `(`, which is what the plugin writes with brackets off, but not after a
  letter (an address) or `/` (a link) — and writes the new key through
  `citationKeyToken`, keeping the `-`. Matched with a capture group, not a
  lookbehind, which the Obsidian lint refuses for iOS before 16.4.
  `CitationSuitePlugin.replaceKeys(paths, renames)` applies it: in an open
  `MarkdownView` as one `editor.transaction` (unsaved text kept, one undo),
  otherwise `vault.process`, and only for a note that cites one of the keys.
- **The marks.** `missingKeyLabel` in `src/reading.ts` is the tooltip of a
  missing key in reading view and live preview alike, naming the new key when
  there is one; live preview builds one decoration per distinct label.
- **The pane** splits `notFound` into renamed and missing. "Keys changed in
  Zotero" (`citation-suite-bibliography-renamed`, a class of its own so the
  search's hiding of an emptied section still finds the missing keys' `code`)
  lists each pair — the old key struck through, the new under it after
  `corner-down-right`, since side by side they broke wherever a sidebar ran
  out and ran into the next pair — and "Replace in note" rewrites the note
  and every note it embeds (`expanded.paths`), since the list was read
  through them. The pass that the edit sets off redraws the section away.
- **The command** `replace-changed-keys` (desktop only: `keyIndex` is there)
  reads every note whose library is Zotero's — a note reading from a vault
  file keeps the file's keys whatever Zotero calls the source — collects the
  keys the index knows (`citationKeysIn`), loads them, gives up with the
  unreachable notice if Zotero did not answer, and opens a `ConfirmModal`
  with the counts and the pairs in its `list` (monospace, scrolling past about
  eight lines). Nothing found is a notice.
- **Not covered.** A key cited before the index existed has no pair, and stays
  merely missing; a "which source was @old?" chooser from a quick search on
  the key's parts would be the next step. A key that another item of the same
  library has since taken is found, not missing, and so not traced. Keys in
  `.canvas` text cards are swept but not rewritten. `.bib` libraries are not
  traced at all: a file carries no Zotero identity.
