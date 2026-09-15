# Changelog


## 1.2.1

### UI/UX enhancements and bug fixes

* Fixed a bug that sometimes kept citations in footnote text from showing in Live Preview: a blank space was left in their place, and a citation only appeared after it was clicked.
* Fixed a bug that made a citation broken into parts by a line break cause an editor error.


## 1.2.0

### New features

* **Citation preview that takes the note's context into account.** Citations are now formatted just as they will look after the note is exported: a repeated citation of a source is written in its short form or as "Ibid." if the style says so, and numbered styles number sources in order of first citation, just as the bibliography does.
* **Unknown citation keys are marked.** A key Zotero has no source for — one with a typo, say — is underlined with a wavy line in every view mode, even with no preview style chosen. The marking can be turned off in the settings.
* **Suggestions while typing a citation key.** Typing `@` opens a list of sources from Zotero, filtered by key, title and author. The key picked is inserted in Pandoc format, and the suggestions can be turned off in the settings.
* **New options in the context menu of a source in the bibliography.** The context menu of an entry on the "Bibliography" tab has a new "Open literature note" option — when the vault has a note named `@key` or `key`, or with the key in its `citekey` property. The "Open PDF" option also lets you open the PDF attached to the source in Zotero's reader.
* **Style and language from the note's properties.** When a note's properties give `csl` (or `citation-style`) or `lang`, the preview and the bibliography are styled the way exporting with Pandoc will style them: in that style, in that language and with locator labels in that language — with `lang: ru-RU`, for instance, Pandoc reads `с. 33` as a page and leaves `p. 33` as text. The style file is looked for where Pandoc looks for it, and the bibliography says which style and language come from the properties. This can be turned off in the settings.

### UI/UX enhancements and bug fixes

* Locator labels are now inserted so that Pandoc reads them: in the note's language (`с. 33` with `lang: ru-RU`) and with abbreviations Pandoc recognises (`chap. 2` rather than `ch. 2`). Such locators used to end up in the export as plain text.
* The comma before text after a key that is not a locator (`[@doe2020, and more]`) is now kept in the preview, as Pandoc keeps it.


## 1.1.0

### New features

* **Footnote settings for a single note.** Putting citations in footnotes, where the footnote text goes, the numbering and the text before and after the number can now be set for one note — with the "Footnote settings for the current note" command or from the note's context menu. The "Reset to general settings" button gives the note the plugin's general settings back, and the "Reset the footnote settings of every note" option does it for every note at once after confirmation.
* **Popup for footnotes.** The text of a new footnote can now optionally open in a popup, so there is no need to scroll the page. This can be turned off in the settings, and the cursor position after a footnote is created can then be set (after the footnote anchor or in its text).

### UI/UX enhancements and bug fixes

* Fixed a bug that left the bibliography empty or not updated after switching from one note to another.
* The Zotero port option now has a button that resets the port to the default one.
* The Zotero status card has been reworked, with a better look, a more compact layout and animations.
* When Zotero is not responding, the bibliography pane now says so instead of listing the sources as not found in the library, and updates by itself once Zotero starts.
* The bibliography pane's icon has been updated, and the bibliography refresh button now has an animation.
* A new footnote is now separated from the existing footnotes by a blank line instead of being added right under them.


## 1.0.0

### First release

* **Citing sources through Zotero.** The window opens with a hotkey or from the command palette and lets you set the page, the prefix, the suffix or suppress the author. Once a source is picked, it is inserted into the note in Pandoc format (`[@doe2020, p. 33]`), and several sources into a group separated by `;`. Zotero notes can be picked in the same window too — their text is inserted into the note as Markdown.
* **Formatted citation preview.** In the plugin settings you can choose a citation style from your Zotero library to format the preview of citations in your notes. The citation itself stays in Pandoc format — this is only how it looks, and it has no effect on how the note is exported. Hovering over a citation shows the bibliography entry of each source — these tooltips can be turned off, or their delay changed. Under the list of styles is a preview of how citations look, which you can adjust to your taste: the citation color, the underline style, bold and italic.
* **Automatic footnotes.** With the setting on, a footnote anchor is placed at the cursor and the citation itself goes into the footnote's body — after the current paragraph, at the end of the current section or at the end of the note. Footnote numbers are written in arabic or roman numerals, and text of your own can be added before and after the number. The citation preview also shows it in a footnote when the option is on. The "Insert footnote without a citation" command creates an empty footnote with the chosen settings without opening the citation window, and the "Renumber footnotes in order" command renumbers every footnote in the note in order.
* **Preview of the note's bibliography.** A tab in the right sidebar lists every source cited in the note — formatted in the citation style chosen for the preview, following its sorting, numbering and indentation. Above the bibliography are the number of entries, a search of the list and a button that copies the bibliography. Right-clicking an entry opens a menu that lets you reveal the source in Zotero, copy the entry or find its mentions in the note.
* **Settings.** The square brackets can be turned off, the port of Zotero's local server can be changed (24119 for the beta), and Zotero's window can be minimized as soon as the pick is done. The top of the settings shows whether Zotero is running and whether Better BibTeX is installed in it, and its buttons open the changelog and the user guide — which the "Open user guide" command opens too.
