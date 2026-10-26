# AGENTS.md — citation-suite

## Commands

| Command | What it does |
|---------|-------------|
| `npm run dev` | esbuild watch mode (no typecheck) |
| `npm test` | Vitest — 367 tests, all passing |
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
read off the disk, and `.csl` files kept in the vault. See
[docs/vault-libraries.md](docs/vault-libraries.md); `Platform.isDesktopApp` is what decides whether
any of the Zotero half is even loaded.

## Where the detail is

How each area works, and why, is in `docs/`, moved there unchanged from this
file. Read an area's file before changing that area. These are the rules in
them that are easiest to break:

- **Talking to Zotero** ([docs/zotero.md](docs/zotero.md)). The notes were
  read out of Better BibTeX 9.0.64's bundle: check them there again before
  changing anything on the wire. CAYW: `format` is always sent (it defaults
  to `latex`); a flag is sent only when on, since `false` reads as true; the
  pick is a POST (a GET drops notes) and minimizing a GET of its own; only
  `probeZotero` has a timeout. JSON-RPC: a key is unique per library, not per
  Zotero, so `fetchItems` asks `item.pandoc_filter` one library at a time and
  exports through Zotero's own CSL JSON translator; do not go back to
  `item.export` without a library, and never send a null parameter.
- **The vault's libraries and styles**
  ([docs/vault-libraries.md](docs/vault-libraries.md)). Only
  `src/zoteroStyles.ts` reaches for Node, loaded with `await import()` behind
  `onDesktop()` — never gate on `Platform.isDesktopApp` alone, which mobile
  emulation leaves true. Nothing desktop-only may throw into `onload`. Every
  render entry point calls `renderer.reading(ref)` first.
- **Rendering** ([docs/rendering.md](docs/rendering.md)). The pane and its
  copy match Zotero's Quick Copy entry for entry; the item data,
  `asZoteroCites` and `zoteroEngine`'s flags are why, so re-run the
  comparison described there before changing them. A citation is written as
  part of its whole note, through `NoteRenderer`, never on its own (the
  settings preview excepted). A note naming `csl` or `lang` is previewed as
  pandoc 3.11 exports it; those rules were read off pandoc, not its manual.
- **Key suggestions** ([docs/suggestions.md](docs/suggestions.md)).
  `getSuggestions` answers for `this.context.query` as it stands when it
  resolves; never name a subclass field `context`.
- **Changed keys** ([docs/changed-keys.md](docs/changed-keys.md)). A key is
  rewritten only by a button press or a confirmed command, never silently.
  The index holds pairs of a key and an item, bounded by the keys the vault
  cites.
- **The pandoc formatter**
  ([docs/pandoc-formatter.md](docs/pandoc-formatter.md)).
  `PLAIN_CITATION_KEY` is copied from Better BibTeX; locator labels are
  written in the words pandoc reads in the note's language; `locatorSuffix`
  differs from Better BibTeX on purpose — read pandoc's citation syntax
  before "aligning" it.
- **Footnotes** ([docs/footnotes.md](docs/footnotes.md)). `footnoteEdit` is
  pure, and both of its edits go in one `editor.transaction`. Inserting never
  renumbers: that is `renumber-footnotes`'s job. Every reader of a footnote
  setting goes through `noteFootnoteSettings`. The footnote rows are drawn
  whatever the toggle says.
- **The bibliography pane**
  ([docs/bibliography-pane.md](docs/bibliography-pane.md)). The "put in the
  sidebar once" flag lives in the vault's local storage, never `data.json`.
  The bar and the search field are built once in `onOpen`, and a pass
  redraws only the body. Hide with `citation-suite-bibliography-hidden`,
  never `hidden`. A state change from the menu or the bar animates; a pass
  redraw never does.
- **The settings tab** ([docs/settings-tab.md](docs/settings-tab.md)).
  Declared through `getSettingDefinitions()`; every setting is a `control`
  except the `render` rows named there (the two lists, the port, the status
  card, the footnote reset). New row CSS goes below the file-order rule. The
  changelog and guide window never carries `markdown-rendered`.
- **Tooling** ([docs/tooling.md](docs/tooling.md)). Lint is 0 errors and 0
  warnings, and CI runs it with `--max-warnings 0`. The sentence-case rule
  cannot be disabled, so write UI text that passes: a bare `@key`, or a
  quoted label with capitals, fails it. Stylelint targets Electron 39, uses
  no `:has`, and runs with `--ignore-disables`. A release follows the steps
  there.

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
  main.ts           — Plugin class, 8 commands, note menus, the bibliography view, settings load/save
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
  keyIndex.ts       — which Zotero item each cited key stood for, and the sweep's rule (pure)
  keyIndexFile.ts   — the key index on disk, and the sweep over the vault
  keyRename.ts      — old citation keys written over with new ones (pure)
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
docs/
  zotero.md         — CAYW and JSON-RPC: what Better BibTeX answers, read out of its bundle
  vault-libraries.md — the vault's library files and styles, the desktop/phone split
  rendering.md      — rendering as Zotero does, a note's citations together, a note's own style
  suggestions.md    — the key suggestions after `@`
  changed-keys.md   — the warning, the key index and the repair
  pandoc-formatter.md — why the formatter is the plugin's own, and where it differs from BBT
  footnotes.md      — footnote insertion, renumbering, a note's own footnote settings
  bibliography-pane.md — the sidebar pane: placement, passes, search, menus, animation
  settings-tab.md   — the declarative tab, the family's CSS, the status card, the document window
  tooling.md        — ESLint, Stylelint, npm audit and the lockfile, release
tests/
  pandoc.test.ts    — the formatter, every form and every field
  cayw.test.ts      — parsing what the endpoint answers, incl. a real answer
  footnote.test.ts  — labels, roman numerals, and where a footnote's text goes
  noteFootnotes.test.ts — a note's footnote settings over the tab's, and following renames
  noteCitations.test.ts — reading order, note numbers, matching a piece to its note
  citationSession.test.ts — incremental updates against a fresh citeproc engine
  suggestion.test.ts — trigger, insertion, sources shown and ranked
  literatureNote.test.ts — which note is a source's, and which of several
  keyIndex.test.ts  — pairs kept, replaced and swept; the file read back; keys a file cites
  keyRename.test.ts — which places a key is rewritten in, and how
  keyTrace.test.ts  — a missing key traced to its new one, against a mocked Better BibTeX
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
  (`### Новые опции` / `### New options`,
  `### Улучшения и исправления багов` /
  `### Enhancements and bug fixes`) and the same bullets in the same
  order. Version numbers, code spans and the markdown itself are not translated.
  Notes stay short. A new option is a bold lead-in and a sentence or two; an
  enhancement or a fix is a plain sentence or two, with no lead-in. Bullets
  under one heading follow each other with no blank line between them.
- `manifest.json`'s `name` and `description` are duplicated by `PLUGIN_NAME` and
  `PLUGIN_DESCRIPTION`, which the plugin browser cannot reach and no translation
  can. Change them together.
