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

The window opens with a hotkey or from the command palette and lets you set the page, the prefix, the suffix or suppress the author. Once a source is picked, it is inserted into the note in Pandoc format (`[@doe2020, p. 33]`), and several sources into a group separated by `;`. Zotero notes can be picked in the same window too — their text is inserted into the note as Markdown.

### 2. Formatted citation preview

In the plugin settings you can choose a citation style from your Zotero library to format the preview of citations in your notes. The citation itself stays in Pandoc format — this is only how it looks, and it has no effect on how the note is exported. Hovering over a citation shows the bibliography entry of each source — these tooltips can be turned off, or their delay changed. Under the list of styles is a preview of how citations look, which you can adjust to your taste: the citation color, the underline style, bold and italic.

### 3. Automatic footnotes

With the setting on, a footnote anchor is placed at the cursor and the citation itself goes into the footnote's body — after the current paragraph, at the end of the current section or at the end of the note. Footnote numbers are written in arabic or roman numerals, and text of your own can be added before and after the number. The citation preview also shows it in a footnote when the option is on. The "Insert footnote without a citation" command creates an empty footnote with the chosen settings without opening the citation window, and the "Renumber footnotes in order" command renumbers every footnote in the note in order.

### 4. Preview of the note's bibliography

A tab in the right sidebar lists every source cited in the note — formatted in the citation style chosen for the preview, following its sorting, numbering and indentation. Above the bibliography are the number of entries, a search of the list and a button that copies the bibliography. Right-clicking an entry opens a menu that lets you reveal the source in Zotero, copy the entry or find its mentions in the note.


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

You can open this guide right inside Obsidian: with the "Open user guide" command from the command palette, or with the "User guide" button at the top of the plugin settings.

## 1. Requirements

The plugin needs Zotero and Better BibTeX to work.

1. The plugin takes its sources from Zotero, so install Zotero first, from the official site: [https://www.zotero.org/download/](https://www.zotero.org/download/).

2. Then install the Better BibTeX extension in Zotero — it gives sources their citation keys and opens the citation window when the plugin asks for it. Installation instructions: [https://retorque.re/zotero-better-bibtex/installation/](https://retorque.re/zotero-better-bibtex/installation/).

3. Make sure Zotero's local server is on: *Settings → Advanced → Allow other applications on this computer to communicate with Zotero*. It is on by default.

You can check that everything is ready at the top of the plugin settings: it shows whether Zotero is running, and if Better BibTeX is not installed in it, a warning with a link to the instructions appears.


## 2. Commands

None of the commands is bound to a key out of the box — assign your own in *Settings → Hotkeys*. Anything selected in the editor is replaced by the citation, so a placeholder you typed can be selected and cited over.

| Command | What it does |
| --- | --- |
| **Insert citation** | Opens Zotero's citation window and inserts the pick in Pandoc format: `[@doe2020, p. 33]`. With **Automatically put citations in footnotes** on, the citation goes into a footnote, and the footnote's text opens in a popup so you can write on after the citation at once. Zotero notes picked in the same window are inserted as their text in Markdown, as paragraphs of their own after the citation. A note that holds citations is inserted as those citations: that is how Better BibTeX hands it over. |
| **Insert footnote without a citation** | Inserts an empty footnote: the anchor at the cursor and its text where **Where the footnote text appears** puts it, and opens the text in a popup over the anchor so you can write it at once, as Obsidian itself does. With **Open the new footnote's text in a popup** off, the cursor moves to the text in the note instead. It works with **Automatically put citations in footnotes** off too. |
| **Renumber footnotes in order** | Rewrites the labels of every footnote in the note in the order of their anchors — `[^1]`, `[^2]`, `[^3]`, as the footnote settings write them — and puts the footnote texts that stand together in that order. Named labels such as `[^kuhn]` get numbers too, unless **Do not edit named footnotes when renumbering** is on. One undo reverts it. |
| **Show bibliography** | Brings the closed "Bibliography" tab back to the right sidebar. |
| **View changelog** | Shows what is new in the latest versions of the plugin. |
| **Open user guide** | Opens this guide in an Obsidian window. |

## 3. How citations are written

Citations are inserted in [Pandoc](https://pandoc.org/MANUAL.html#citation-syntax) format, so when you export with `pandoc --citeproc`, Quarto or my [Pandoc GUI](https://github.com/pan4ratte/obsidian-pandoc-gui) plugin, they are formatted according to your bibliography.

| In Zotero's window | In the note |
| --- | --- |
| One item | `[@doe2020]` |
| Page 33 | `[@doe2020, p. 33]` |
| Chapter 2 | `[@doe2020, ch. 2]` |
| Pages 33 and 35 | `[@doe2020{p. 33, 35}]` |
| Prefix "see", suffix "and following" | `[see @doe2020 and following]` |
| Suppress author | `[-@doe2020]` |
| Two items | `[@doe2020, p. 33; @roe2021]` |

The preview also reads citations typed by hand or inserted by other tools: a braced locator after the comma, the way Better BibTeX writes it (`[@doe2020, {pp. 33–35}]`), and locator labels in the plural, spelled out and in any case (`pp.`, `pages`, `vols.`). Only citations in square brackets are formatted.

## 4. Bibliography

The first time the plugin runs, it opens a "Bibliography" tab in the right sidebar with every source cited in the open note — formatted in the chosen preview style the way it formats a reference list, with its sorting, numbering and indentation. A closed tab does not come back on its own on later launches — the **Show bibliography** command opens it.

### Managing the bibliography

* **The "Search the bibliography" button** opens a search field that filters the entries by author, title, year and citation key. `Esc`, or the button again, closes the field and shows the whole list.

* **The "Copy bibliography" button** copies the list the way Zotero's "Copy Bibliography" option does: a word processor pastes it with its italics, indents and numbering, and a plain text field pastes it as text.

* **The "Refresh bibliography" button** asks Zotero for the data again.

**Right-clicking an entry opens a context menu:**

* **The "Reveal in Zotero" option** selects the source in Zotero's window, in the library the entry was taken from.

* **The "Copy entry" option** copies the entry to the clipboard.

* **The "Find in note" option** selects the note's first citation of the source and scrolls to it, and a "Mention 1 / 5" bar appears under the entry that lets you go to the previous and the next mention of the source.

Keys Zotero has no item for are listed under the bibliography, in the "Sources not found in Zotero" section. If Zotero is not responding, a "Zotero is not responding" message appears instead of that section — start Zotero and the bibliography updates by itself.

## 5. Citation preview

In the plugin settings you can choose a style for the citation preview. In the note itself citations always stay Pandoc citations, so this is a purely visual change that does not affect the export. Styles are loaded from your Zotero library, and the chosen style formats the preview of both the citations and the bibliography in the sidebar.

The "Citation preview" option under the list of styles shows how citations will look and lets you set their appearance. The buttons beside the title switch the preview mode, and the buttons above the sample set the look of citations in every note: their color, underline and emphasis.

## 6. Automating footnotes

The plugin lets you not only cite, but also create footnotes at the same time, following rules you set.

* **Put citations in square brackets.** Turn it off if you want citations inserted as `@doe2020, p. 33`, without the brackets around them. Keep in mind that the preview and the "Bibliography" tab only recognise citations in square brackets.

* **Automatically put citations in footnotes.** Turn it on to have a footnote anchor `[^1]` appear at the cursor when you cite, with the citation going into its body: `[^1]: [@doe2020, p. 33]`. Inside an existing footnote the citation is inserted as usual, since a footnote cannot hold another. The related settings let you change where the footnote text appears and how footnotes are numbered, and add text before and after the footnote number.

* **Do not edit named footnotes when renumbering.** Turn it on, and the "Renumber footnotes in order" command will not edit labels with names, such as `[^kuhn]`. A number is arabic numerals, or roman ones if footnotes are numbered in roman numerals of the same case, with the text before and after the number set above. So `[^x]` in a note numbered in arabic stays a name, and so does a footnote written with an earlier prefix.

* **Open the new footnote's text in a popup.** The text of a footnote — one made when you cite, or with the "Insert footnote without a citation" command — opens in a popup over its anchor, the same one footnotes created by Obsidian itself have: you can write on after the citation at once, or fill in an empty footnote. Turn it off, and the cursor moves to the end of an empty footnote's text in the note.

* **Move the cursor to the footnote text after citing.** Shown when the popup is off. After citing, the cursor moves to the end of the footnote's text in the note, so you can write on after the citation at once. Turn it off, and the cursor stays after the footnote anchor.

## 7. Troubleshooting

### The citation window opens behind Obsidian?

Open *Settings → Advanced → Config Editor* and set `extensions.zotero.integration.keepAddCitationDialogRaised` to `true`: Zotero then keeps the window above the others. The setting is off by default, and Windows does not let the window come to the front. It has no effect on macOS.

### The citation window opens off-centre?

The window remembers where it was dragged. Drag it once to where you want it, and it opens there from then on. To reset the position, quit Zotero and delete the `chrome://zotero/content/integration/citationDialog.xhtml` key from `xulstore.json` in the Zotero profile (on Windows, `%APPDATA%\Zotero\Zotero\Profiles\`). Zotero rewrites that file when it quits, so editing it while Zotero runs does nothing.

### "Zotero is not answering" error?

Either Zotero is closed, its local server is off, or Better BibTeX is not installed in it — or it is the beta, and **Zotero port** still says `23119`.

### Cited a source, but the citation preview does not work?

Make sure a citation display style is chosen in the settings, and that the citation is in square brackets. Citations are formatted with Zotero's help: while Zotero is closed, the citation is not formatted. The same happens when Better BibTeX does not know the citation key — a key typed by hand, say, or an item deleted from the library. If Zotero was closed, start it and press "Refresh bibliography" in the sidebar.


# About the Author

My name is Mark Ingrem and I am a Religious Studies scholar. Apart from my main area of study (Protestant Political Theology in Russia), I teach a university course called "Information Technologies in Scientific Research", which is based on my own unique program. This plugin helps me in my research and I use it in my teaching, along with the other plugins I develop, which you can find on [my GitHub profile](https://github.com/pan4ratte/).

Hello to every student who came across this page!


## Third-party licenses

* [citeproc-js](https://github.com/Juris-M/citeproc-js) — © Frank Bennett, licensed under [CPAL-1.0](https://opensource.org/license/cpal-1-0) or [AGPL-3.0](https://www.gnu.org/licenses/agpl-3.0.html), at your option.

* CSL locale files (ru-RU, en-US, en-GB, de-DE, fr-FR) from the [citation-style-language/locales](https://github.com/citation-style-language/locales) repository — licensed under [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/).
