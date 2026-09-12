# AGENTS.md — zoterik

## Commands

| Command | What it does |
|---------|-------------|
| `npm run dev` | esbuild watch mode (no typecheck) |
| `npm test` | Vitest — 23 tests, all passing |
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
  `brackets=false`, `selected=false` and `minimize=false` are all as true as
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
labelled; `selected=true` is the exception, since there is no window there to
type either into. A real answer is pinned as a fixture in `tests/cayw.test.ts`.

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

## Settings tab

Declared through Obsidian 1.13's `getSettingDefinitions()`. `display()` is gone:
a non-empty array of definitions renders the tab **instead of** it, and
`minAppVersion` is 1.13.0, so nothing reaches it.

Unlike the sibling Classy PDF Extractor, almost every setting here **is** a
control the API describes — two toggles and a number — so each is declared as a
`control` and Obsidian draws it, indexes it for the settings search, and asks the
tab to store the value. Keep it that way; a `render` definition for any of them
would mean hand-drawing something the API already draws, and `render` does not
auto-save.

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

The **citation look** — colour, underline, bold and italic — is not drawn onto
citations. It
is a class on the `<body>` of every window (`src/look.ts`), which styles.css
turns into CSS variables that `.zoterik-citation` reads, so reading view, live
preview and the settings preview all follow it and nothing is rendered again
when it changes. A custom colour is the one value that cannot be a class, so it
rides along as `--zoterik-citation-custom-color`. The underline takes the
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
  (`zoterik-settings-anchor`, named through three classes to outrank the rule
  above), blank that row, kill its `::before` — the group draws its dividers as
  a pseudo-element inset to a padding that lines up with nothing once the card
  is gone — and hide its stock `.setting-item-info` / `.setting-item-control`.
  Every one of the four does exactly this; only the prefix differs (`telegram-`,
  `ex-`, `pdf-annotations-`, `wcp-`).
- **A group whose rows Obsidian draws keeps the card and corrects the row.**
  Two corrections, both of them in the siblings and both in
  `zoterik-settings-rows`:
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
nothing here was forked from another plugin's id.

## Source layout (flat, not a monorepo)

```
src/
  main.ts           — Plugin class, 4 commands, settings load/save
  cayw.ts           — the Better BibTeX CAYW client: probe, pick, parse
  pandoc.ts         — citations → pandoc syntax (pure; no Obsidian, no network)
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
  mocks/obsidian.ts — stands in for the module at import time
styles.css          — the settings header, the banner, the changelog window
CHANGELOG_RU.md     — release notes; the original
CHANGELOG.md        — translated from CHANGELOG_RU.md; the workflow's source
versions.json       — plugin version → the minAppVersion it shipped with
```

`src/main.ts` is the esbuild entry point and the default export is
`ZoterikPlugin`. Files import each other by package-root path (`src/…`,
`lang/…`), resolved through tsconfig's `paths` — not `baseUrl`, which is
deprecated in TypeScript 6 — and by esbuild and Vitest through the aliases in
their own configs. Three places, and they have to agree.

## Testing

Vitest, not the sibling Classy PDF Extractor's Jest: there is no `ts-jest`
layer to configure, and nothing here needs one. `tests/` is **in** the tsconfig
program, so `npm run build` type-checks the tests too and the type-aware lint
rules can read them.

Only the pure halves are tested — the formatter, and the parsing of what CAYW
answers with. The modules they live in still import from `obsidian`, which is
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
  add to them. That is why `Obsidian` is named alongside `Zoterik`, `Zotero` and
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
