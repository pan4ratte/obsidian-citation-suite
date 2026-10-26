# Citation key suggestions

Part of the notes for coding agents. [AGENTS.md](../AGENTS.md) has the rules most changes need and points here; this file holds the detail, moved there from AGENTS.md unchanged.

## Citation key suggestions

`src/citationSuggest.ts` is an `EditorSuggest`; `src/suggestion.ts` holds
what needs neither editor nor Zotero, and is tested. `citationSuggestions` is
on by default.

- **Trigger**: `@` or `-@` at the start of a line or after whitespace, `[`,
  `;` or `(`, followed by key characters of any alphabet — not after a letter
  (an address) or `[[`. Then `proseOf` over the text up to the cursor must
  leave the `@` standing, so code, comments and front matter do not trigger.
- **A file library is read whole**, so a note reading from one is offered
  everything in it (`renderer.allItems`) and filtered here, with nothing to
  ask and nothing to wait for. The rest of this point is Zotero's half, which
  is what the list does when the note's library is Zotero's.
- **No library copy.** Below 3 characters only `renderer.knownItems()` — every
  source looked up since Obsidian started — is offered, the note's own
  (`citedKeys`, read once per opening) first; with nothing typed, only the
  note's own. From 3 characters Zotero is asked (`searchLibrary`, the quick
  search conditions in [zotero.md](zotero.md)) after 150 ms of no typing, and a query extending
  the last answered one is filtered locally (`sourceMatches`, `ё` as `е`)
  instead of asked again; both are dropped when the list reopens.
- **Obsidian applies an async answer whenever it resolves**, with no check
  that it is still the latest (read out of 1.13.7's `EditorSuggest.trigger`):
  so `getSuggestions` always answers for `this.context.query` as it stands when
  it resolves, never for the query it was called with. Do not name a field
  `context` on the subclass: that is the base class's.
- **Ranking**: cited in the note, key starts with the query, first creator
  starts with it, the rest; ties by key. The list shows `@key` and
  "creators · year · title" in Obsidian's `mod-complex` suggestion layout.
- **Insertion** (`keyInsertion`) replaces what was typed and any key
  characters after the cursor: inside an unclosed `[` it is the key alone,
  keeping `-`; outside it is `[@key]` when `brackets` is on, else `@key`. A key
  pandoc would cut short is braced through `citationKeyToken`.
