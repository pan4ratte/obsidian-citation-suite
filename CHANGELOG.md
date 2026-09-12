# Changelog

## 1.0.0

### New features

* **Citing through Zotero's own window.** A hotkey or a command opens the same citation window Zotero's word-processor plugins use — with the page, the prefix, the suffix and the "suppress author" switch. The pick is inserted into the note the moment that window closes.
* **Citations in pandoc syntax.** A pick becomes `[@doe2020, p. 33]`, and several sources become one group separated by `;`. A locator holding a comma is written in braces instead, so pandoc does not cut the citation short at it.
* **Inserting what is selected in Zotero.** Another command takes the items selected in Zotero's window and cites them without opening the citation window at all.
* **Citations shown in a Zotero style.** The note still holds the pandoc citation; reading view and live preview draw it as the style chosen in the settings writes it, page, prefix, suffix and suppressed author included. Hovering over a citation shows the bibliography entry of every source it cites. Putting the cursor inside a citation shows it as written.
* **Settings.** The brackets can be turned off, the port of Zotero's local server can be changed (24119 for the beta), and Zotero's window can be minimized as soon as the pick is done.
