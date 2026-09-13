# Citation Suite plugin

<div align="center">
  <img alt="Citation Suite" src="https://shieldcn.dev/header/graph.svg?title=Citation+Suite&subtitle=Your+citation+automation+assistant+inside+Obsidian&size=wide&mode=dark">
</div>

<div align="center">
<br>
<a href="https://pay.cloudtips.ru/p/c0e8eac4"><img alt="badge" src="https://shieldcn.dev/badge/Поддержать%20разработку-(RU%20карты).svg?size=lg&amp;logo=ri%3AFaHeart&amp;logoColor=ef4444&amp;color=09090b&amp;labelTextColor=ef4444"></a>
<br>
<p>Citation Suite is citing sources from your Zotero library in Pandoc format, viewing the bibliography in the sidebar, previewing formatted citations in the note with citation styles, automating footnote creation, and much more.</p>
</div>

<div align="center">
English | <a href="https://github.com/pan4ratte/obsidian-citation-suite/blob/main/README_RU.md">Русский</a>
</div>


## Features

### 1. Citing sources through Zotero

The window opens with a hotkey or from the command palette and lets you set the page, the prefix, the suffix or suppress the author. Once a source is picked, it is inserted into the note in Pandoc format (`[@doe2020, p. 33]`), and several sources into a group separated by `;`.

### 2. Formatted citation preview

In the plugin settings you can choose a citation style from your Zotero library to format the preview of citations in your notes. The citation itself stays in Pandoc format — this is only how it looks, and it has no effect on how the note is exported. Hovering over a citation shows the bibliography entry of each source — these tooltips can be turned off, or their delay changed. Under the list of styles is a preview of how citations look, which you can adjust to your taste: the citation color, the underline style, bold and italic.

### 3. Automatic footnotes

With the setting on, a footnote anchor is placed at the cursor and the citation itself goes into the footnote's body — after the current paragraph, at the end of the current section or at the end of the note. Footnote numbers are written in arabic or roman numerals, and text of your own can be added before and after the number. The citation preview also shows it in a footnote when the option is on. The "Insert footnote without a citation" command creates an empty footnote with the chosen settings without opening the citation window, and the "Renumber footnotes in order" command renumbers every footnote in the note in order.

### 4. Preview of the note's bibliography

A tab in the right sidebar lists every source cited in the note — formatted in the citation style chosen for the preview, following its sorting, numbering and indentation. Above the bibliography are the number of entries, a search of the list and a button that copies the bibliography. Right-clicking an entry opens a menu that lets you reveal the source in Zotero, copy the entry or find its mentions in the note.


## Installation

### First of all, install Zotero and Better BibTeX

1. The plugin takes its sources from Zotero, so install Zotero first, from the official site: [https://www.zotero.org/download/](https://www.zotero.org/download/).

2. Then install the Better BibTeX extension in Zotero — it gives sources their citation keys and opens the citation window when the plugin asks for it. Installation instructions: [https://retorque.re/zotero-better-bibtex/installation/](https://retorque.re/zotero-better-bibtex/installation/).

3. Make sure Zotero's local server is on: *Settings → Advanced → Allow other applications on this computer to communicate with Zotero*. It is on by default.

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

## 1. How it works

Zotero runs a small HTTP server on your computer, and Better BibTeX adds a "cite as you write" endpoint to it. Citation Suite asks that endpoint for a citation: Zotero opens its citation window, the request stays open for as long as you are picking a source, and the answer is the citation you put together. For the preview, the plugin likewise asks Better BibTeX for the data of the cited sources and formats them with citeproc-js — the same engine that runs inside Zotero. Nothing leaves your computer, and the library is not copied into the vault.

Citation Suite is desktop-only: it talks to a Zotero running beside it. Everything you cite needs a citation key. Better BibTeX gives every item one; an item without a key is left out of the citation, and the plugin says so.

## 2. Commands

None of the commands is bound to a key out of the box — assign your own in *Settings → Hotkeys*. Anything selected in the editor is replaced by the citation, so a placeholder you typed can be selected and cited over.

| Command | What it does |
| --- | --- |
| **Insert citation** | Opens Zotero's citation window and inserts the pick in Pandoc format: `[@doe2020, p. 33]`. With **Automatically put citations in footnotes** on, the citation goes into a footnote. |
| **Insert footnote without a citation** | Inserts an empty footnote: the anchor at the cursor and its text where **Where the footnote text appears** puts it, with the cursor in the text so you can write it at once. It works with **Automatically put citations in footnotes** off too. |
| **Renumber footnotes in order** | Rewrites the labels of every footnote in the note in the order of their anchors — `[^1]`, `[^2]`, `[^3]`, as the footnote settings write them — and puts the footnote texts that stand together in that order. Named labels such as `[^kuhn]` get numbers too, unless **Do not edit named footnotes when renumbering** is on. One undo reverts it. |
| **Show bibliography** | Brings the closed "Bibliography" tab back to the right sidebar. |
| **View changelog** | Shows what is new in the version you are running. |

## 3. How citations are written

A citation is written the way [Pandoc](https://pandoc.org/MANUAL.html#citation-syntax) reads it, so when you export with `pandoc --citeproc`, Quarto or the [Pandoc GUI](https://github.com/pan4ratte/obsidian-pandoc-gui) plugin, it is formatted from your bibliography.

| In Zotero's window | In the note |
| --- | --- |
| One item | `[@doe2020]` |
| Page 33 | `[@doe2020, p. 33]` |
| Chapter 2 | `[@doe2020, ch. 2]` |
| Pages 33 and 35 | `[@doe2020{p. 33, 35}]` |
| Prefix "see", suffix "and following" | `[see @doe2020 and following]` |
| Suppress author | `[-@doe2020]` |
| Two items | `[@doe2020, p. 33; @roe2021]` |

A locator holding a comma or a semicolon is written in braces: otherwise Pandoc would end the citation at that character, and the rest would be left in the sentence as stray text.

The preview also reads citations typed by hand or inserted by other tools: a braced locator after the comma, the way Better BibTeX writes it (`[@doe2020, {pp. 33–35}]`), and locator labels in the plural, spelled out and in any case (`pp.`, `pages`, `vols.`). Only citations in square brackets are formatted.

## 4. Bibliography

The first time the plugin runs, it opens a "Bibliography" tab in the right sidebar with every source cited in the open note — formatted in the chosen preview style the way it formats a reference list, with its sorting, numbering and indentation. A numbered style that does not sort its entries numbers them in the order the note first cites them. The list follows the note you are working in and updates as you type; citations in code, in properties and in comments are left out of it. Until a style is chosen, the tab asks you to choose one in the settings. A closed tab does not come back on its own on later launches — the **Show bibliography** command opens it.

**Above the list are the number of sources in the note and three buttons:**

* **Search the bibliography** opens a field that keeps only the entries holding every word typed, in any order and any case: `kuhn 1962` finds Kuhn's book of 1962. It searches authors, titles, years and citation keys, and `е` finds `ё`. While a search is on, the count above the list shows how many entries were found out of all of them. `Esc`, or the button again, closes the field and shows the whole list.

* **Copy bibliography** copies the list the way Zotero's "Copy Bibliography" does: a word processor pastes it with its italics, indents and numbering, and a plain text field pastes it as text. The whole list is copied, even while the search hides some of it.

* **Refresh bibliography** asks Zotero for the data again.

**Right-clicking an entry opens its menu:**

* **Reveal in Zotero** selects the source in Zotero's window, in the library the entry was taken from.

* **Copy entry** copies just that entry the way the copy button copies the whole list, with the number it has in the list.

* **Find in note** selects the note's first citation of the source and scrolls to it, and a "Mention 1 / 5" bar appears under the entry. Its arrows go to the previous and the next mention, counting from the cursor, and go back to the first after the last. The count updates as you type, and the bar closes with its cross, with `Esc`, or when you move to another note.

The entries are what Zotero itself writes: the plugin receives items in the form Zotero hands them to the citeproc engine, and sets the engine up the way Zotero does. Of the CSL locales, the plugin carries Russian, American and British English, German and French — enough for the multilingual GOST "(ru, en, de, fr)" styles, which write each source's entry in the source's own language. A style that needs another language is formatted with the American English locale.

Sources are looked up in every Zotero library — My Library first, then the group libraries — so a key found in several is taken from the first. Keys Zotero has no item for are listed under the list, in the "Sources not found in Zotero" section. If Zotero was closed when they were looked up, start it and press **Refresh bibliography**.

## 5. Settings

**Citation format:**

* **Choose a citation display style** — `Do not style the preview` by default. The note always keeps the Pandoc citation, and that is what Pandoc gets when you export. Choose one of the styles installed in Zotero, and reading view and live preview will show `(Doe, 2020, p. 33)` where the note says `[@doe2020, p. 33]`, as that style writes it. The note itself does not change: put the cursor inside a citation and it shows itself as written, and source mode does not format citations at all. The list of styles is read from Zotero's data folder when Obsidian starts, so a style you just installed appears after a restart.

* **Citation preview** — under the list of styles is a sample citation in the chosen style, in a footnote if footnotes are on. The buttons beside the title switch the preview mode: **Reading view**, **Source mode** or **Live preview** (the default). The buttons above the sample set the look of citations in every note: **Citation color** (**Accent color** by default, **Body text color** or **Custom color…**), **Citation underline** (dotted by default, solid, squiggly or no underline) and **Citation emphasis** (**Bold**, **Italic**).

* **Show the bibliography entry on hover** — on by default. Hovering over a styled citation shows the bibliography entry of every source it cites. Turn it off if the tooltips get in the way of reading.

* **Tooltip delay** — from 100 to 2000 ms, 1000 ms by default, like every tooltip in Obsidian. This is how long the cursor has to rest on a citation before the entry appears. The setting is shown only while tooltips are on.

* **Put citations in square brackets** — on by default. Turn it off to insert `@doe2020, p. 33` without the brackets around it. Keep in mind that the preview and the "Bibliography" tab only recognise citations in square brackets.

**Footnotes** — these settings apply both to citations in footnotes and to the footnote commands, so they are always shown:

* **Automatically put citations in footnotes** — off by default. Turn it on and a footnote anchor `[^1]` is placed at the cursor, with the citation as its text: `[^1]: [@doe2020, p. 33]`. Inside an existing footnote the citation is inserted as usual, since a footnote cannot hold another.

* **Where the footnote text appears** — **After the current paragraph**, **At the end of the current section** (before the next heading) or **At the end of the note** (the default). A new footnote goes after the ones already there.

* **Footnote numbering** — **Arabic numerals** (the default), **Lowercase roman numerals** or **Uppercase roman numerals**. A new footnote's number is one higher than the highest already in the note.

* **Text before the footnote number** and **Text after the footnote number** — for example, `n` before the number gives `[^n1]`, and `-cite` after it gives `[^1-cite]`. Spaces and the characters `[ ] ^ \ |` would break the footnote, so they cannot be typed.

* **Do not edit named footnotes when renumbering** — off by default. Turn it on and the **Renumber footnotes in order** command leaves labels with names, such as `[^kuhn]`, as they are and numbers only the rest, counting past the named ones. A number is arabic numerals, or roman ones if footnotes are numbered in roman numerals of the same case, with the text before and after the number set above. So `[^x]` in a note numbered in arabic stays a name, and so does a footnote written with an earlier prefix.

**Connection to Zotero:**

* **Zotero port** — `23119` by default, which is where Zotero runs. The Zotero beta runs its server one port up, on `24119`, so both can be open at once.

* **Minimize Zotero after picking a source** — off by default. Turn it on and Zotero's window is minimized as soon as the citation window closes, and focus returns to Obsidian.

## 6. The citation window

Zotero draws the window, not Citation Suite, so where it opens is Zotero's call too.

* **It opens behind Obsidian.** Open *Settings → Advanced → Config Editor* and set `extensions.zotero.integration.keepAddCitationDialogRaised` to `true`: Zotero then keeps the window above the others. The setting is off by default, and Windows does not let the window come to the front. It has no effect on macOS.

* **It opens off-centre.** The window remembers where it was left. Drag it once to where you want it, and it opens there from then on. To reset the position, quit Zotero and delete the `chrome://zotero/content/integration/citationDialog.xhtml` key from `xulstore.json` in the Zotero profile (on Windows, `%APPDATA%\Zotero\Zotero\Profiles\`). Zotero rewrites that file when it quits, so editing it while Zotero runs does nothing.

## 7. If something goes wrong

* **"Zotero is not answering".** Zotero is closed, its local server is off, Better BibTeX is not installed — or it is the beta, and **Zotero port** still says `23119`.

* **"Better BibTeX is still starting up".** It indexes the library after launch, and a large library takes a while. Try again in a few seconds.

* **"None of the picked items has a citation key".** The pick was Zotero notes, or items Better BibTeX has not given a citation key yet. If only some of the items have no key, the rest are inserted, and the plugin warns you.

* **A citation is not formatted.** Check that a style is chosen in **Choose a citation display style** and that the citation is in square brackets. The formatting takes its data from Zotero: while Zotero is closed, the citation stays as it is written in the note. The same happens when Better BibTeX does not know the citation key — a key typed by hand, say, or an item deleted from the library. If Zotero was closed, start it and press **Refresh bibliography** in the "Bibliography" tab.

* **Nothing, and no message.** The citation window was closed without a pick — that is not an error.


# About the Author

My name is Mark Ingrem and I am a Religious Studies scholar. Apart from my main area of study (Protestant Political Theology in Russia), I teach a university course called "Information Technologies in Scientific Research", which is based on my own unique program. This plugin helps me in my research and I use it in my teaching, along with the other plugins I develop, which you can find on [my GitHub profile](https://github.com/pan4ratte/).

Hello to every student who came across this page!


## Credits

The plugin bundle includes third-party components:

* [citeproc-js](https://github.com/Juris-M/citeproc-js) — © Frank Bennett, licensed under [CPAL-1.0](https://opensource.org/license/cpal-1-0) or [AGPL-3.0](https://www.gnu.org/licenses/agpl-3.0.html), at your option.

* CSL locale files (ru-RU, en-US, en-GB, de-DE, fr-FR) from the [citation-style-language/locales](https://github.com/citation-style-language/locales) repository — licensed under [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/).
