# Settings tab, changelog and user guide

Part of the notes for coding agents. [AGENTS.md](../AGENTS.md) has the rules most changes need and points here; this file holds the detail, moved there from AGENTS.md unchanged.

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
  between them; `chosenStyle()` reads it back. See [vault-libraries.md](vault-libraries.md).
- The **bibliography**, in a section of its own above "Citation format": the
  Zotero library first — named "No bibliography chosen" on a phone, where there
  is no Zotero to ask — then every `.bib` and CSL JSON file the vault holds.
  The section is left out of the definitions altogether when the vault holds
  none and none is chosen, since there would be nothing in it to choose.
  `getSettingDefinitions()` starts the scan for those files, which Obsidian
  runs on every open of the tab, and the scan calls `update()` only when what
  it found has changed — otherwise it would draw the tab forever.

The **note footnote reset** row is also a `render`, for its destructive
button; see [footnotes.md](footnotes.md).

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
  plugin's prefix: a card to each thing it is read for, a `--size-4-3` gap
  apart, in `citation-suite-status-card`, a wrapper with no look of its own.
  Top to bottom: one row of three cards — `actionButton`s in a wrapping flex
  row, each `flex: 1 1 13rem`, so three across on a desktop pane, one on a
  phone, and a card left alone on a line takes the whole of it — each one
  row, to the start edge: the icon in a
  rounded-square badge tinted in the accent (`--interactive-accent-hsl` at
  0.1, 0.18 on hover, no outline; the icon in `--text-accent`), and beside it,
  centred against it, a semibold `--font-ui-small` title over a muted
  `--font-ui-smaller` line where there is one: Zotero's state, and the
  release's version under the changelog; the user guide has none. Titles
  stay on one line (an ellipsis if a card is ever too narrow) — 13rem is what
  "Список изменений" needs beside its badge — except the user guide's, which
  `actionButton`'s `wrap` lets onto a second (`is-wrapping`). Every rule on
  the button is `.citation-suite-status-card` before the doubled class:
  Obsidian 1.14.5's `.is-tablet button:not(.clickable-icon)` (0,2,1) sets
  the padding of every button on a phone or a tablet, and beat the doubled
  class alone, so the cards stood squashed there. The icon has a span of
  its own inside the badge, so the status spins the icon and not the badge:
  the Zotero status, which checks again when pressed (`refresh-cw`; its title
  is "Zotero status" and under it the state as words with no icon and no
  fill, in `--text-success` or `--text-warning`, muted while checking), then the changelog and
  the user guide — and last a
  notice in a card across the whole width only when Better BibTeX is missing
  or still starting.
  On a phone (`onDesktop()` false) the card is still drawn, as the changelog
  and the user guide alone: the settings pass `zotero: null`, and
  `renderStatusCard` draws no status, asks nothing and draws no notice or
  warning — the warning's preference is read off Zotero's disk, which a
  phone does not have.
  Under the card, a card of its own to each warning — so far the one that
  Better BibTeX regenerates keys on every edit (see [changed-keys.md](changed-keys.md)) — in `citation-suite-status-warnings`.
  Notices and warnings are both drawn by `drawCallout()`, one layout in two
  colours: the status card's own class plus `citation-suite-status-info`
  (`--color-blue-rgb`, Obsidian's info callout) or
  `citation-suite-status-warning` (`--color-orange-rgb`, its warning
  callout), set as `--citation-suite-callout-rgb` at 0.08 fill and 0.3
  border; the sign (`info` or `triangle-alert`) in a round 0.15 badge, the
  title in `--text-normal` a size up from the muted text — coloured words on
  a tint of their colour read worst — and, on a warning only, the close
  button, all centred in the card's height. A notice has no close button: it
  goes when Zotero's state does. The missing Better BibTeX notice ends in an
  "Install" `ButtonComponent` that opens Better BibTeX's installation page.
  Each check's cards go through `sync()`, keyed by `data-callout`: a card
  still wanted stays as it is, a card no longer wanted collapses, and a new
  one opens. The cards stay up while Zotero is being asked, and change only
  when it answers. When the tab is drawn from the last check, the cards are
  simply there, with no animation. `expand()` and `collapse()` both measure
  the card's height into `--citation-suite-callout-height`, and the keyframes
  take it from or to nothing, with the margin above and the border. A closing
  card is removed once its animations finish, and under reduced motion
  nothing plays. Closing a warning collapses it the same way. The margin is on
  each card, not a gap on the wrapper, for notices as for warnings, so it
  opens and collapses too; for the same reason the status card itself has no
  gap. The close animation was checked in headless Chrome against 1.14.5's
  `app.css`, both themes, 680 and 400 px, and paused mid-close.
  Each card carries `citation-suite-status-panel` (the settings groups'
  border, radius and fill) or, for the three cards, the same look of its own.
  Zotero's version is deliberately not shown. Better BibTeX deliberately has no
  panel of its own: it is only worth a line when something is wrong with it.
  There is no changelog notice: it only duplicated the changelog panel, and
  the panel announces a release itself (below).
- **While the running release's changelog is unread, the changelog panel's
  icon is Animate UI's sparkles** (`@animate-ui/icons-sparkles`, from the
  shadcn registry); once it is read, Lucide's `scroll-text`, swapped in on
  the click that opens it. The original is a React component animated by
  Motion; `sparklesIcon()` draws its SVG by hand, a class on each moving part, and
  styles.css ports its `default` animation (0.75 s) to keyframes — the
  timings are written over them — and loops it, the star held still: only the
  plus and the dot wink. While unread the panel carries `is-unread`, which
  styles.css no longer draws anything for: the badge is tinted as the others
  are, and the sparkles alone announce the release. The click that opens the
  changelog takes it off. Under reduced motion nothing plays. Give `createSvg` its classes as an array:
  unlike `createEl`, it hands `cls` to `classList.add()` as it is, which
  throws on a space-separated string (the typings allow one) — and a throw
  there left the tab blank after the status panel. Check the registry's
  `https://animate-ui.com/r/icons-sparkles.json` before touching the timings.
- `checkZotero()` in `src/cayw.ts` asks two things, and neither opens anything:
  Zotero's own `/connector/ping` (200 when Zotero runs, whether or not Better
  BibTeX is installed), then the CAYW `probe`. Zotero
  answers a path nothing registered with `404 No endpoint found`, which is how
  a Zotero without Better BibTeX is told from one that is not running. The
  answer is kept on the tab (`lastCheck`) so that a redraw from `update()` does
  not ask again; `hide()` drops it, and a port change asks again.
- Opening the changelog — from the panel or the `show-changelog` command, both
  through `plugin.openChangelog()` — writes `manifest.version` into
  `dismissedChangelogVersion`, a settings field the tab never draws, and the
  panel stops announcing. The next release is a version that no longer
  matches, so it announces again. The field keeps its old name, since it is
  in every installed `data.json`.

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
