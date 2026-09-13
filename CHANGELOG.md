# Changelog

## 1.0.0

### First release

* **Citing sources through Zotero.** The window opens with a hotkey or from the command palette and lets you set the page, the prefix, the suffix or suppress the author. Once a source is picked, it is inserted into the note in Pandoc format (`[@doe2020, p. 33]`), and several sources into a group separated by `;`.
* **Formatted citation preview.** In the plugin settings you can choose a citation style from your Zotero library to format the preview of citations in your notes. The citation itself stays in Pandoc format — this is only how it looks, and it has no effect on how the note is exported. Hovering over a citation shows the bibliography entry of each source. Under the list of styles is a preview of how citations look, which you can adjust to your taste: the citation color, the underline style, bold and italic.
* **Automatic footnotes.** With the setting on, a footnote anchor is placed at the cursor and the citation itself goes into the footnote's body — after the current paragraph, at the end of the current section or at the end of the note. Footnote numbers are written in arabic or roman numerals, and text of your own can be added before and after the number. The citation preview also shows it in a footnote when the option is on. The "Insert footnote without a citation" command creates an empty footnote with the chosen settings without opening the citation window, and the "Renumber footnotes in order" command renumbers every footnote in the note in order.
* **Preview of the note's bibliography.** A tab in the right sidebar lists every source cited in the note — formatted in the citation style chosen for the preview, following its sorting, numbering and indentation. Above the bibliography are the number of entries, a search of the list and a button that copies the bibliography. Right-clicking an entry opens a menu that lets you reveal the source in Zotero, copy the entry or find its mentions in the note.
* **Settings.** The square brackets can be turned off, the port of Zotero's local server can be changed (24119 for the beta), and Zotero's window can be minimized as soon as the pick is done.
