# Footnotes

Part of the notes for coding agents. [AGENTS.md](../AGENTS.md) has the rules most changes need and points here; this file holds the detail, moved there from AGENTS.md unchanged.

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
