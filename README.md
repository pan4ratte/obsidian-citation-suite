# Citation Suite plugin

<div align="center">
  <img alt="header" src="https://shieldcn.dev/header/graph.svg?title=Citation+Suite&amp;subtitle=Zotero+citations%2C+bibliography+and+footnotes+in+Obsidian&amp;size=wide&amp;mode=dark" width="100%" />
</div>

<div align="center">
<br>
<a href="https://github.com/pan4ratte/obsidian-citation-suite/releases"><img alt="badge" src="https://shieldcn.dev/github/pan4ratte/obsidian-citation-suite/downloads.svg?color=8a75f0"></a>
<a href="https://retorque.re/zotero-better-bibtex/"><picture><source media="(prefers-color-scheme: dark)" srcset="https://shieldcn.dev/badge/requires-Better%20BibTeX-8a75f0.svg?mode=dark"><img alt="badge" src="https://shieldcn.dev/badge/requires-Better%20BibTeX-8a75f0.svg?mode=light"></picture></a>
<a href="https://github.com/Juris-M/citeproc-js"><picture><source media="(prefers-color-scheme: dark)" srcset="https://shieldcn.dev/badge/built%20with-citeproc--js-8a75f0.svg?mode=dark"><img alt="badge" src="https://shieldcn.dev/badge/built%20with-citeproc--js-8a75f0.svg?mode=light"></picture></a>
<a href="https://pay.cloudtips.ru/p/c0e8eac4"><picture><source media="(prefers-color-scheme: dark)" srcset="https://shieldcn.dev/badge/%D0%9F%D0%BE%D0%B4%D0%B4%D0%B5%D1%80%D0%B6%D0%B0%D1%82%D1%8C%20%D1%80%D0%B0%D0%B7%D1%80%D0%B0%D0%B1%D0%BE%D1%82%D0%BA%D1%83-(RU%20%D0%BA%D0%B0%D1%80%D1%82%D1%8B)-8a75f0.svg?logo=ri%3AFaHeart&amp;mode=dark"><img alt="badge" src="https://shieldcn.dev/badge/%D0%9F%D0%BE%D0%B4%D0%B4%D0%B5%D1%80%D0%B6%D0%B0%D1%82%D1%8C%20%D1%80%D0%B0%D0%B7%D1%80%D0%B0%D0%B1%D0%BE%D1%82%D0%BA%D1%83-(RU%20%D0%BA%D0%B0%D1%80%D1%82%D1%8B)-8a75f0.svg?logo=ri%3AFaHeart&amp;mode=light"></picture></a>
<br>
<p>Cite your Zotero library without leaving the note: a hotkey opens Zotero's own citation window, and the pick is inserted as a pandoc citation. Citations are drawn in any style installed in Zotero, can go into footnotes, and the note's bibliography is always at hand in the right sidebar.</p>
</div>

<div align="center">
English | <a href="https://github.com/pan4ratte/obsidian-citation-suite/blob/main/README_RU.md">Русский</a>
</div>


## Features

### 1. Citing through Zotero's own window

A hotkey opens Zotero's own citation window — the one Zotero's word-processor plugins use — with the page, the prefix, the suffix and the "suppress author" switch. The pick is inserted at the cursor the moment that window closes.

### 2. Citations in pandoc syntax

Citations are written the way pandoc reads them: `[@doe2020, p. 33]`, and several sources as one group separated by `;`. So a note is built into a document with a bibliography by `pandoc --citeproc`, Quarto or the [Pandoc GUI](https://github.com/pan4ratte/obsidian-pandoc-gui) plugin, and the note's text itself stays portable.

### 3. Citations drawn in a Zotero style

The note keeps the pandoc citation, and reading view and live preview draw it in any style installed in Zotero — page, prefix, suffix and suppressed author included. Hovering over a citation shows the bibliography entry of every source it cites. The style is chosen from a list like the one in Zotero's "Document preferences" window, with a sample citation under it, and the colour, underline and weight of citations are set with the buttons above the sample.

### 4. Citations in footnotes

A citation can be inserted as a footnote — after the current paragraph, at the end of the section or at the end of the note, numbered in arabic or roman numerals, with text of your own before and after the number. By the same settings you can insert an empty footnote without a citation and renumber all the footnotes of a note in order, leaving named ones alone if you wish.

### 5. Bibliography in the right sidebar

A tab lists every source the open note cites, in the chosen style — with its sorting, numbering and indentation, entry for entry as Zotero itself writes them. The list updates as you type, can be searched by author, title, year and citation key, and once copied pastes into a word processor with its formatting. Right-clicking an entry reveals the source in Zotero, copies the entry or finds every mention of it in the note. Sources are taken from all Zotero libraries, group libraries included.


## Installation

### Option 1: Obsidian plugin store

1. In Obsidian settings open the tab "Community plugins" and click "Browse" button.

2. In the search bar type `Citation Suite`, click on the result, then "Install" and "Enable" buttons.

Alternatively, you can install the plugin by following the link to the community website: [https://community.obsidian.md/plugins/citation-suite](https://community.obsidian.md/plugins/citation-suite)

### Option 2: BRAT plugin

If you want to test beta-versions of the plugin or use previous versions, you can do that with `BRAT` plugin:

1. Install `BRAT` plugin from the official Obsidian plugin store.

2. In the `BRAT` settings, find the "Beta plugin list" section and click on the "Add beta plugin" button.

3. In the window that appears, paste the link to the `Citation Suite` plugin repository: [https://github.com/pan4ratte/obsidian-citation-suite](https://github.com/pan4ratte/obsidian-citation-suite)

4. Under "Select a version" choose the desired version and click the "Add plugin" button. The plugin will be automatically installed and will be ready to use.


# User guide

## 1. How it works and what it needs

Zotero runs a small HTTP server on your computer, and [Better BibTeX](https://retorque.re/zotero-better-bibtex/) adds a "cite as you write" endpoint to it. Citation Suite asks that endpoint for a citation: Zotero draws its own picker, the request stays open for as long as you are choosing, and the answer is the citation you built. Nothing leaves your computer, and your library is not copied into the vault.

**What it needs:**

* Zotero running, with Better BibTeX installed.

* Zotero's local server enabled — *Settings → Advanced → Allow other applications on this computer to communicate with Zotero*. It is on by default.

* A citation key on everything you cite. Better BibTeX gives every item one; an item without a key is left out of the citation, and the plugin says so.

Citation Suite is desktop-only: it talks to a Zotero running beside it.

## 2. Commands

None of the commands is bound to a key out of the box — pick your own in *Settings → Hotkeys*. Anything selected in the editor is replaced by the citation, so a placeholder you typed can be selected and cited over.

| Command | What it does |
| --- | --- |
| **Insert citation** | Inserts `[@doe2020, p. 33]` — the parenthetical citation, from a pick in Zotero's window. |
| **Insert footnote without a citation** | Inserts an empty footnote: the anchor at the cursor and its text where the footnote settings put it, with the cursor in the text so you can write it at once. It works with **Put citations in footnotes** off too. |
| **Renumber footnotes in order** | Rewrites the labels of every footnote in the note in the order of their anchors — `[^1]`, `[^2]`, `[^3]`, as the footnote settings write them — and puts the footnote texts that stand together in that order. Named labels such as `[^kuhn]` get numbers too, unless **Keep named footnotes when renumbering** is on. One undo reverts it. |
| **Show bibliography** | Brings the note's bibliography tab back to the right sidebar once it was closed. |
| **View changelog** | Shows what the version you are running brought. |

## 3. How citations are written

A citation is written the way [pandoc](https://pandoc.org/MANUAL.html#citation-syntax) reads it, so `pandoc --citeproc` (or Quarto, or the [Pandoc GUI](https://github.com/pan4ratte/obsidian-pandoc-gui) plugin) resolves it against your bibliography and builds the reference list.

| In Zotero's window | In the note |
| --- | --- |
| One item | `[@doe2020]` |
| Page 33 | `[@doe2020, p. 33]` |
| Chapter 2 | `[@doe2020, ch. 2]` |
| Pages 33 and 35 | `[@doe2020{p. 33, 35}]` |
| Prefix "see", suffix "and following" | `[see @doe2020 and following]` |
| Suppress author | `[-@doe2020]` |
| Two items | `[@doe2020, p. 33; @roe2021]` |

A locator holding a comma or a semicolon is written in braces: otherwise pandoc would end the citation at that character and leave the rest in the sentence as stray text.

## 4. Bibliography

The first time the plugin runs, it opens a tab in the right sidebar with every source the open note cites, written as the chosen style writes a reference list: with its sorting, numbering and indentation. A numbered style that does not sort its entries numbers them in the order the note first cites them. The list follows the note you are working in and updates as you type; citations in code, in properties and in comments are left out of it. Until a style is chosen, the tab asks you to choose one. Once closed, the tab does not come back by itself on later launches — the **Show bibliography** command opens it again.

**Above the list are the number of entries in it and three buttons:**

* **Search** opens a field under the heading that keeps only the entries holding every word typed, in any order and any case: `kuhn 1962` finds Kuhn's book of 1962. It searches authors, titles, years and citation keys, and `е` finds `ё`. While a search is on, the heading shows how many entries were found out of all of them. `Esc`, or the button again, closes the field and shows the whole list.

* **Copy** copies the list the way Zotero's "Copy Bibliography" does: a word processor pastes it with its italics, indents and numbering, and a plain text field pastes it as text. The whole list is copied, even while the search hides some of it.

* **Refresh** asks Zotero again.

**Right-clicking an entry opens its menu:**

* **Reveal in Zotero** selects the source in Zotero's window, in the library the entry was taken from.

* **Copy entry** copies just that entry the way the copy button copies the whole list, with the number it has in the list.

* **Find in note** selects the note's first citation of the source and scrolls to it, and a "Mention 1 / 5" bar appears under the entry. Its arrows go to the previous and the next citation, counting from the cursor, and go back to the first after the last. The count updates as you type, and the bar closes with its cross, with `Esc`, or when you move to another note.

The entries are what Zotero itself writes: the plugin takes each item in the form Zotero hands it to citeproc, and sets citeproc up the way Zotero does. Of the CSL locales, the plugin carries Russian, American and British English, German and French — enough for the multilingual GOST styles "(ru, en, de, fr)", which write each source's entry in its own language. A style that needs any other language is written with the American English one.

Sources are looked for in every Zotero library — My Library first, then the groups — so a key that is in several is taken from the first. Citation keys Zotero has no item for are listed under the bibliography. If Zotero was closed when they were looked up, start it and press the refresh button above the list.

## 5. Settings

**Citation format:**

* **Show citations in style** — the note always keeps the pandoc citation, and that is what pandoc sees when the document is built. The default is `Leave as written`. Choose one of the styles installed in Zotero and reading view and live preview will draw `(Doe, 2020, p. 33)` where the note says `[@doe2020, p. 33]`, as that style writes it. The note itself does not change: put the cursor inside a citation and it shows itself as written again. The list of styles is read from Zotero's data folder when Obsidian starts, so a style you just installed appears after a restart.

* **Wrap citations in brackets** — on by default. Turn it off to insert `@doe2020, p. 33` without the brackets around it.

**Footnotes** — these settings apply both to citations in footnotes and to the footnote commands, so they are always shown:

* **Put citations in footnotes** — off by default. Turn it on and a footnote anchor `[^1]` is placed at the cursor, with the citation as its text: `[^1]: [@doe2020, p. 33]`. Inside an existing footnote the citation is inserted as usual, since a footnote cannot hold another.

* **Where the footnote text goes** — after the current paragraph, at the end of the current section (before the next heading), or at the end of the note, which is the default. A new footnote goes after the ones already there.

* **Footnote numbering** — arabic numerals, lowercase roman numerals or uppercase roman numerals. The number is one higher than the highest already in the note.

* **Text before the number** and **Text after the number** — for example, `n` before the number gives `[^n1]`. Spaces and the characters `[ ] ^ \ |` would break the footnote, so they cannot be typed.

* **Keep named footnotes when renumbering** — off by default. Turn it on and the **Renumber footnotes in order** command leaves labels with names, such as `[^kuhn]`, as they are and numbers only the rest, counting past the named ones. A number is arabic numerals, or roman ones if footnotes are numbered in roman numerals of the same case, with the text before and after the number set above. So `[^x]` in a note numbered in arabic stays a name, and so does a footnote written with an earlier prefix.

**Connection to Zotero:**

* **Zotero port** — `23119`, which is where Zotero listens. The Zotero beta runs its server one port up, on `24119`, so both can be open at once.

* **Minimize Zotero after picking** — sends Zotero's window away as soon as the citation window closes, so focus lands back in Obsidian.

## 6. The citation window

The window is Zotero's own, not Citation Suite's, so where it opens is Zotero's to decide.

* **It opens behind Obsidian.** Open *Settings → Advanced → Config Editor* and set `extensions.zotero.integration.keepAddCitationDialogRaised` to `true`: Zotero then keeps the window above the others. The setting is off by default, and Windows does not let the window come to the front. It has no effect on macOS.

* **It opens off-centre.** The window remembers where it was left. Drag it once to where you want it, and it opens there from then on. To reset the position, quit Zotero and delete the `chrome://zotero/content/integration/citationDialog.xhtml` key from `xulstore.json` in the Zotero profile (on Windows, `%APPDATA%\Zotero\Zotero\Profiles\`). Zotero rewrites that file when it quits, so editing it while Zotero runs does nothing.

## 7. When nothing is inserted

* **"Zotero is not answering".** Zotero is closed, its local server is off, Better BibTeX is not installed — or it is the beta, and the settings still say `23119`.

* **"Better BibTeX is still starting up".** It indexes the library after launch, and a large library takes a while. Try again.

* **A citation is not drawn in its style.** The rendering takes its data from Zotero: while Zotero is closed, the citation stays as it is written in the note. The same happens when Better BibTeX does not know the citation key — a key typed by hand, say, or an item deleted from the library. If Zotero was closed, start it and press the refresh button in the bibliography tab.

* **Nothing, and no message.** The citation window was closed without a pick — that is not an error.


# About the Author

My name is Mark Ingrem and I am a Religious Studies scholar. Apart from my main area of study (Protestant Political Theology in Russia), I teach a university course called "Information Technologies in Scientific Research", which is based on my own unique program. This plugin helps me in my research and I use it in my teaching, along with the other plugins I develop, which you can find on [my GitHub profile](https://github.com/pan4ratte/).

Hello to every student who came across this page!


## Credits

Citations and bibliographies are written by [citeproc-js](https://github.com/Juris-M/citeproc-js) (CPAL-1.0 / AGPL) — the same engine that runs inside Zotero and pandoc. The build includes the CSL locale files (CC BY-SA 3.0) from the [citation-style-language/locales](https://github.com/citation-style-language/locales) repository. The citation window and the citation-key data come from [Better BibTeX](https://retorque.re/zotero-better-bibtex/) by Emiliano Heyns. The plugin itself is licensed under [AGPL-3.0](LICENSE).

---

In compliance with the Obsidian community guidelines, all external network calls should be disclosed in the plugin README and only made with user knowledge. This plugin makes no external network calls: it only talks to the local Zotero server on your computer (`127.0.0.1`, on the port set in the settings).
