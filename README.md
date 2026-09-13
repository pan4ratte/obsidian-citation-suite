# Zoterik

<div align="center">

<a href="https://github.com/pan4ratte/obsidian-zoterik/releases"><img alt="badge" src="https://shieldcn.dev/github/pan4ratte/obsidian-zoterik/downloads.svg?color=8a75f0"></a>

<p>Cite your Zotero library without leaving the note. One hotkey opens Zotero's own citation window — the same one its word-processor plugins open, with the page, prefix, suffix and "suppress author" fields — and what you pick is written at the cursor as a pandoc citation.</p>

</div>

<div align="center">
English | <a href="https://github.com/pan4ratte/obsidian-zoterik/blob/main/README_RU.md">Русский</a>
</div>

## How it works

Zotero runs a small HTTP server on your own machine, and [Better BibTeX][bbt] adds a
"cite as you write" endpoint to it. Zoterik asks that endpoint for a citation: Zotero
draws its picker, the request stays open for as long as you are choosing, and the answer
is the citation you built. Nothing leaves your computer, and no library is duplicated
into the vault.

[bbt]: https://retorque.re/zotero-better-bibtex/

## Requirements

- **Zotero**, running, with **Better BibTeX** installed.
- Zotero's local server enabled — *Settings → Advanced → Allow other applications on this
  computer to communicate with Zotero*. It is on by default.
- A citation key for anything you cite. Better BibTeX gives every item one; an item
  without a key is left out of the citation, and Zoterik says so.

Zoterik is desktop-only: it talks to a Zotero running beside it.

## Commands

None of them is bound to a key out of the box — pick your own in *Settings → Hotkeys*.

| Command | What it inserts |
| --- | --- |
| **Insert citation** | `[@doe2020, p. 33]` — the parenthetical citation, from a pick in Zotero's window. |
| **Insert a citation for the items selected in Zotero** | The same parenthetical citation, built from whatever is selected in Zotero's middle pane. No window is opened, and there is nowhere to type a page. |
| **Insert footnote without a citation** | An empty footnote: the anchor at the cursor and its text where the footnote settings put it, with the cursor in the text so you can write it at once. It works with **Put citations in footnotes** off too. |
| **Renumber footnotes in order** | Nothing: it rewrites the labels of every footnote in the note in the order of their anchors — `[^1]`, `[^2]`, `[^3]`, as the footnote settings write them — and puts the footnote texts that stand together in that order. Named labels such as `[^kuhn]` get numbers too, unless **Keep named footnotes when renumbering** is on. One undo reverts it. |
| **Show bibliography** | Nothing: it brings the note's bibliography back to the right sidebar once its tab was closed — see below. |
| **View changelog** | What the version you are running brought. |

Anything selected in the editor is replaced by the citation, so a placeholder you typed
earlier can be selected and cited over.

## What comes out

The citation is written the way [pandoc][pandoc] reads one, so `pandoc --citeproc` (or
Quarto, or the [Pandoc GUI][pandoc-gui] plugin) renders it against your bibliography and
builds the reference list.

| In Zotero's window | In the note |
| --- | --- |
| One item | `[@doe2020]` |
| Page 33 | `[@doe2020, p. 33]` |
| Chapter 2 | `[@doe2020, ch. 2]` |
| Pages 33 and 35 | `[@doe2020{p. 33, 35}]` |
| Prefix "see", suffix "and following" | `[see @doe2020 and following]` |
| Suppress author | `[-@doe2020]` |
| Two items | `[@doe2020, p. 33; @roe2021]` |

A locator holding a comma or a semicolon goes in braces, because pandoc would otherwise
end the citation at that character and leave the rest as stray text in your sentence.

[pandoc]: https://pandoc.org/MANUAL.html#citation-syntax
[pandoc-gui]: https://github.com/pan4ratte/obsidian-pandoc-gui

## Bibliography

The first time the plugin runs, it opens a tab in the right sidebar with every source the
open note cites, written as the chosen style writes a reference list: with its sorting,
numbering and indentation. A numbered style that does not sort its entries numbers them in
the order the note first cites them. The list follows the note you are working in and
updates as you type; citations in code, in properties and in comments are left out of it.
Until a style is chosen, the tab asks you to choose one. Once closed, the tab does not come back
by itself on later launches — the **Show bibliography** command opens it again.

Above the list are the number of entries in it and three buttons:

- **Search** opens a field under the heading that keeps only the entries holding every
  word typed, in any order and any case: `kuhn 1962` finds Kuhn's book of 1962. It searches
  authors, titles, years and citation keys, and `е` finds `ё`. While a search is on, the
  heading shows how many entries were found out of all of them. `Esc`, or the button
  again, closes the field and shows the whole list.
- **Copy** copies the list the way Zotero's "Copy Bibliography" does: a word processor
  pastes it with its italics, indents and numbering, and a plain text field pastes it as
  text. The whole list is copied, even while the search hides some of it.
- **Refresh** asks Zotero again.

Right-clicking an entry opens its menu:

- **Reveal in Zotero** selects the source in Zotero's window, in the library the entry
  was taken from.
- **Copy entry** copies just that entry the way the copy button copies the whole list,
  with the number it has in the list.
- **Find in note** selects the note's first citation of the source and scrolls to it, and
  a "Mention 1 / 5" bar appears under the entry. Its arrows go to the previous and the
  next citation, counting from the cursor, and go back to the first after the last. The
  count updates as you type, and the bar closes with its cross, with `Esc`, or when you
  move to another note.

The entries are what Zotero itself writes: the plugin takes each item in the form Zotero
hands it to citeproc, and sets citeproc up the way Zotero does. Of the CSL locales, the
plugin carries Russian, American and British English, German and French — enough for the
multilingual GOST styles "(ru, en, de, fr)", which write each source's entry in its own
language. A style that needs any other language is written with the American English one.

Sources are looked for in every Zotero library — My Library first, then the groups — so a
key that is in several is taken from the first. Citation keys Zotero has no item for are
listed under the bibliography. If Zotero was
closed when they were looked up, start it and press the refresh button above the list.

## Settings

- **Show citations in style** — the note always keeps the pandoc citation, and that is
  what pandoc sees when the document is built. The default is `Leave as written`. Choose
  one of the styles installed in Zotero and reading view and live preview will draw
  `(Doe, 2020, p. 33)` where the note says `[@doe2020, p. 33]`, as that style writes it.
  The note itself does not change: put the cursor inside a citation and it shows itself as
  it is. The list of styles is read from Zotero's data folder when Obsidian starts, so a
  style you have just installed appears after a restart.
- **Wrap citations in brackets** — on by default. Turn it off to insert
  `@doe2020, p. 33` without the brackets around it.
- **Put citations in footnotes** — off by default. Turn it on and a footnote anchor `[^1]`
  is placed at the cursor, with the citation as its text: `[^1]: [@doe2020, p. 33]`.
  Inside an existing footnote the citation is inserted as usual, since a footnote cannot
  hold another. The settings under it apply both to such citations and to the footnote
  commands, so they are always shown:
  - **Where the footnote text goes** — after the current paragraph, at the end of the
    current section (before the next heading), or at the end of the note, which is the
    default. A new footnote goes after the ones already there.
  - **Footnote numbering** — arabic numerals, lowercase roman numerals or uppercase roman
    numerals. The number is one higher than the highest already in the note.
  - **Text before the number** and **Text after the number** — for example, `n` before the
    number gives `[^n1]`. Spaces and the characters `[ ] ^ \ |` would break the footnote,
    so they cannot be typed.
  - **Keep named footnotes when renumbering** — off by default. Turn it on and the
    **Renumber footnotes in order** command leaves labels with names, such as `[^kuhn]`,
    as they are and numbers only the rest, counting past the named ones. A number is
    arabic numerals, or roman ones if footnotes are numbered in roman numerals of the same
    case, with the text before and after the number set above. So `[^x]` in a note
    numbered in arabic stays a name, and so does a footnote written with an earlier prefix.
- **Zotero port** — `23119`, which is where Zotero listens. The Zotero beta runs its
  server one port up, on `24119`, so both can be open at once.
- **Minimize Zotero after picking** — sends Zotero's window away as soon as the citation
  window closes, so focus lands back in Obsidian.

## Installing

From a release, until it is in the community plugin browser: download `main.js`,
`manifest.json` and `styles.css` from the [latest release][releases] into
`<your vault>/.obsidian/plugins/zoterik/`, then enable *Zoterik* in
*Settings → Community plugins*. [BRAT][brat] installs the same files and keeps them
updated.

[releases]: https://github.com/pan4ratte/obsidian-zoterik/releases
[brat]: https://github.com/TfTHacker/obsidian42-brat

## The citation window

The window is Zotero's own, not Zoterik's, so where it opens is Zotero's to decide.

- **It opens behind Obsidian.** Open *Settings → Advanced → Config Editor* and set
  `extensions.zotero.integration.keepAddCitationDialogRaised` to `true`: Zotero will then
  keep the window above the others. It is off by default, and Windows will not let the
  window to the front on its own. It has no effect on macOS.
- **It does not open centered.** The window remembers where it was left. Drag it once to
  where you want it and that is where it will open. To reset the place, close Zotero and
  delete the `chrome://zotero/content/integration/citationDialog.xhtml` key from
  `xulstore.json` in the Zotero profile (on Windows, `%APPDATA%\Zotero\Zotero\Profiles\`).
  Zotero rewrites that file on exit, so editing it while Zotero runs achieves nothing.

## When nothing is inserted

- **"Zotero is not answering."** Zotero is closed, its local server is off, Better BibTeX
  is not installed in it, or it is the beta and the port setting still says `23119`.
- **"Better BibTeX is still starting up."** It is indexing the library after launch, which
  a large one takes a moment over. Try again.
- **A citation is not being styled.** The rendering takes its data from Zotero, so with
  Zotero closed a citation stays as the note writes it. The same happens when Better
  BibTeX does not know the citation key — one typed by hand, say, or one whose item has
  been removed from the library. If Zotero was closed, start it and press the refresh
  button in the bibliography tab.
- **Nothing at all, no message.** The citation window was closed without picking
  anything, which is not an error.

## Building

```bash
npm install
npm run dev     # watch build
npm run build   # type-check, then production bundle
npm run lint
npm test
```

## License

[AGPL-3.0](LICENSE).

The build includes [citeproc-js][citeproc] (CPAL-1.0 / AGPL), which does the rendering —
the same engine Zotero and pandoc run — and the CSL locale files (CC BY-SA 3.0) from
[citation-style-language/locales][locales].

[citeproc]: https://github.com/Juris-M/citeproc-js
[locales]: https://github.com/citation-style-language/locales
