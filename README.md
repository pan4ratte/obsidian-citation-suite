# Citation Suite plugin

<div align="center">
  <img alt="Citation Suite" src="https://shieldcn.dev/header/graph.svg?title=Citation+Suite&subtitle=Your+citation+automation+assistant+inside+Obsidian&size=wide&mode=dark">
</div>

<div align="center">
<br>
<a href="https://pay.cloudtips.ru/p/c0e8eac4"><img alt="badge" src="https://shieldcn.dev/badge/Поддержать%20разработку-(RU%20карты).svg?size=lg&amp;logo=ri%3AFaHeart&amp;logoColor=ef4444&amp;color=09090b&amp;labelTextColor=ef4444"></a>
<br>
<p>With Citation Suite you can cite sources from your Zotero library in Pandoc format, view the bibliography in the sidebar, preview formatted citations in the note with citation styles, automate footnote creation, and much more.</p>
</div>

<div align="center">
English | <a href="https://github.com/pan4ratte/obsidian-citation-suite/blob/main/README_RU.md">Русский</a>
</div>


## Features

### 1. Citing sources through Zotero

Once you pick a source in the familiar citation window, it is inserted into the note in Pandoc format (`[@doe2020, p. 33]`) automatically, and several sources are gathered into a group separated by `;`. Zotero notes can be picked in the same window too, and their text is inserted into the note as Markdown. Keys can also be inserted without opening the window at all, thanks to autocomplete suggestions from your Zotero library after typing `@` in the note editor.

### 2. Formatted citation preview

In the plugin settings you can choose a citation style from your Zotero library to format the preview of citations in your notes. The citation itself stays in Pandoc format — this is only how it looks, and it has no effect on how the note is exported. Hovering over a citation shows the source's bibliography entry, and the look of citations is finely adjustable: their color, the underline style, bold and italic. The preview is built with the context of the whole note in mind: repeated citations are written in their short form, the numbering matches the bibliography, and keys Zotero does not have are underlined with a wavy line.

### 3. Preview of the note's bibliography

A tab in the right sidebar lists every source cited in the note — formatted in the citation style chosen for the preview, following its sorting, numbering and indentation. Above the bibliography is the number of sources, a search of the list and a way to copy the bibliography. Right-clicking an entry opens a context menu that lets you open your note about the source or its PDF, reveal the source in Zotero, copy a single entry or find every mention of the source in the note.

### 4. Citing from a file in the vault, and mobile support

Sources can come not only from Zotero, but also from a `.bib` or CSL JSON file kept in the vault. The shared file is set in the plugin settings, and each individual note can have a file of its own, set in its `bibliography` property. Citation styles can be kept in the vault as well: `.csl` files appear in the list of styles beside Zotero's own. Thanks to this the plugin supports mobile devices, and on the desktop it can be used even without Zotero.

### 5. Automatic footnotes

Optionally, every citation can be placed into a footnote automatically, and where the body of the footnote goes is up to you — after the current paragraph, at the end of the current section or at the end of the note. Footnote numbers are written in arabic or roman numerals, text of your own can be added before and after the number, and all of these settings can be applied either globally or to individual notes. The "Insert footnote without a citation" command creates an empty footnote with the chosen settings without opening the citation window, and the "Renumber footnotes in order" command renumbers every footnote in the note in order and sorts them correctly.


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

## 1. Requirements

1. Install Zotero: [https://www.zotero.org/download/](https://www.zotero.org/download/).

2. Install the Better BibTeX extension in Zotero — it gives sources their citation keys: [https://retorque.re/zotero-better-bibtex/installation/](https://retorque.re/zotero-better-bibtex/installation/).

3. Check that *Settings → Advanced → Allow other applications on this computer to communicate with Zotero* is on in Zotero. It is on by default.

The panel at the top of the plugin settings shows Zotero's status and whether the plugin is ready to work.

Zotero is only needed on the desktop. Where there is none — on a phone or tablet, or simply with Zotero closed — name a `.bib` or CSL JSON file kept in the vault in the plugin settings, and sources will be read from it. A note can name a file of its own in its `bibliography` property: it is looked for beside the note first and then from the vault's root, and there can be several — where two hold the same key, the source in the last of them is the one cited, as Pandoc does it. Where Zotero cannot be reached, the "Insert citation" command opens a list of the sources in that file instead of Zotero's citation window; a page number or any other addition to the citation is then yours to type. Opening a PDF and showing a source in Zotero are not shown on mobile.


## 2. Commands

By default Obsidian assigns no hotkeys to the commands. To set them, go to *Settings → Hotkeys → Citation Suite*.

| Command | What it does |
| --- | --- |
| **Insert citation** | Opens Zotero's citation window and inserts the citation in Pandoc format. Selected text is replaced by the citation. Zotero notes picked in the window are inserted as Markdown text. Where Zotero cannot be reached — on a phone, or with the program closed — it opens a list of the sources in the note's bibliography file instead. |
| **Insert footnote without a citation** | Inserts an empty footnote following your footnote settings. |
| **Renumber footnotes in order** | Renumbers the footnotes in the order they appear in the note. One undo reverts it. |
| **Footnote settings for the current note** | Sets footnote settings for this note only. The same window opens from the note's context menu. |

## 3. How citations are written

Citations are inserted in [Pandoc](https://pandoc.org/MANUAL.html#citation-syntax) format, so when you export with `pandoc --citeproc`, Quarto or my [Pandoc GUI](https://github.com/pan4ratte/obsidian-pandoc-gui) plugin, they are formatted in your citation style.

| In Zotero's window | In the note |
| --- | --- |
| One item | `[@doe2020]` |
| Page 33 | `[@doe2020, p. 33]` |
| Chapter 2 | `[@doe2020, chap. 2]` |
| Pages 33 and 35 | `[@doe2020{pp. 33, 35}]` |
| Prefix "see", suffix "and following" | `[see @doe2020 and following]` |
| Suppress author | `[-@doe2020]` |
| Two items | `[@doe2020, p. 33; @roe2021]` |

Locator labels are written in the note's language, because that is how Pandoc reads them: with `lang: ru-RU` in the note's properties you get `[@doe2020, с. 33]`, and without `lang` — `[@doe2020, p. 33]`.

The preview and the "Bibliography" tab recognise only citations in square brackets. Keep this in mind if you turn off **Put citations in square brackets**.

You can also insert a key without opening Zotero's citation window: type `@` and the start of a key, a title, an author's surname or a year. Inside square brackets only the key is inserted, so you can type a citation of several sources in one go. Sources from your Zotero library appear from the third character on.

## 4. Bibliography

The "Bibliography" tab in the right sidebar shows every source cited in the open note, formatted according to the chosen style. If you closed the tab, you can bring it back with the **Show bibliography** command.

The "Copy bibliography" button copies the list with its formatting, as Zotero does: a word processor pastes it with italics, indents and numbering, if the style has them.

Right-clicking an entry opens a context menu. Two of its items need explaining:

* **Open literature note** opens a note named `@key` or `key`, or one with the key in its `citekey`, `citationKey` or `citation-key` property. The item appears only when such a note exists. Hold `Ctrl` (`Cmd` on macOS) to open the note in a new tab.

* **Open PDF** opens the source's PDF in Zotero, along with your annotations.

## 5. Citation preview

Choose a style from your Zotero library in the plugin settings — it formats the citations in your notes and the bibliography. In the note itself citations stay in Pandoc format, so the export is not affected.

Citations are formatted with the note's context in mind, just as they will look after export: a repeated citation is shortened or written as "Ibid." and the like, numbered styles number sources in order of first citation, and so on.

Keys Zotero does not have are underlined with a wavy line, even with no preview style chosen.

### Style and language from the note's properties

If the note's properties set `csl` (or `citation-style`) or `lang`, the preview and the bibliography are formatted the way Pandoc will format them on export:

* **`csl`** is the style file. It is looked for next to the note, in the vault's root and in the `csl` folder of Pandoc's data directory (on Windows, `%APPDATA%\pandoc\csl`). The `.csl` extension can be left out. A style URL such as `https://www.zotero.org/styles/apa` is taken from Zotero's styles.

* **`lang`** is the language, and it wins over the style's own language. Russian, English, German and French are supported.

The style and language in use are shown above the bibliography.

## 6. Automating footnotes

Turn on **Automatically put citations in footnotes**, and citations go into footnotes: the `[^1]` anchor appears at the cursor, and `[^1]: [@doe2020, p. 33]` in the footnote text. The same section of the settings controls where the footnote text goes, how footnotes are numbered and where the cursor moves.

You can also set footnote settings for a single note — with the "Footnote settings for the current note" command or from the note's context menu. Other notes keep using the general settings. A note keeps its settings when it is renamed or moved.

## 7. Troubleshooting

### The citation window opens behind Obsidian?

In Zotero, open *Settings → Advanced → Config Editor* and set `extensions.zotero.integration.keepAddCitationDialogRaised` to `true`. This setting has no effect on macOS.

### The citation window opens off-centre?

The window remembers where you left it: drag it once to where you want it, and it will open there from then on. To reset the position completely, quit Zotero and delete the `chrome://zotero/content/integration/citationDialog.xhtml` key from `xulstore.json` in the Zotero profile (on Windows, `%APPDATA%\Zotero\Zotero\Profiles\`).

### "Zotero is not answering" error?

Make sure Zotero is running, Better BibTeX is installed in it and the local server is on (see "Requirements"). If you use the Zotero beta, **Zotero port** must be set to the matching port, not `23119`.

### The citation preview does not work?

Check that a preview style is chosen in the settings, the citation is in square brackets, and Zotero is running. If Zotero has no such key — say, it has a typo — the citation is not formatted and the key is underlined with a wavy line.

### A key is underlined with a wavy line, but the source is in Zotero?

If you added the source or changed its key after opening the note, press "Refresh bibliography" in the sidebar.


# About the Author

My name is Mark Ingrem and I am a Religious Studies scholar. Apart from my main area of study (Protestant Political Theology in Russia), I teach a university course called "Information Technologies in Scientific Research", which is based on my own unique program. This plugin helps me in my research and I use it in my teaching, along with the other plugins I develop, which you can find on [my GitHub profile](https://github.com/pan4ratte/).

Hello to every student who came across this page!


## Third-party licenses

* [citeproc-js](https://github.com/Juris-M/citeproc-js) — © Frank Bennett, licensed under [CPAL-1.0](https://opensource.org/license/cpal-1-0) or [AGPL-3.0](https://www.gnu.org/licenses/agpl-3.0.html), at your option.

* CSL locale files (ru-RU, en-US, en-GB, de-DE, fr-FR) from the [citation-style-language/locales](https://github.com/citation-style-language/locales) repository — licensed under [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/).
