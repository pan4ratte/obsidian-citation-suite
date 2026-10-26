# The pandoc formatter

Part of the notes for coding agents. [AGENTS.md](../AGENTS.md) has the rules most changes need and points here; this file holds the detail, moved there from AGENTS.md unchanged.

## The pandoc formatter

`src/pandoc.ts` is the plugin's own, not a call into BBT's `format=pandoc`, and
that is a decision rather than an oversight: the endpoint formats one way per
request, and both forms the plugin offers — bracketed and not, parenthetical and
narrative — have to come out of a single pick. Writing it here also makes every
rule testable without Zotero running.

Two things follow from that, and both have to be kept:

- **`PLAIN_CITATION_KEY` is copied from BBT** (the key regex in its `pandoc`
  formatter), so a key reads the same whichever tool wrote it. If BBT changes
  it, this file is what drifts.
- **Locator labels are written in the words pandoc reads, not BBT's.** BBT's
  `shortLabel` abbreviations (`LOCATOR_LABELS`) were what the plugin wrote until
  pandoc was asked: it reads `ch.`, `vrs.` and `sv.` in no language, and in a
  note with `lang: ru-RU` not even `p.` — each was exported as plain text.
  `formatCitations` now takes a `LabelWriter`, and `main.ts` hands it
  `renderer.labelWriter(await noteStyles.pandocLocale(path))`: the locale
  pandoc reads the note in (`lang`, else the language of the style `csl`
  names, else `en-US` — read whatever the preview settings say), its short
  term, or long where the short is not one word, in the plural when the
  locator names more than one (`pluralLocator`: `-–—,;&` or "and"). A language
  the plugin does not carry gets the CSL name (`page 33`), which pandoc reads in
  every language. The fifteen locators pandoc reads are `PANDOC_LOCATORS`;
  anything else (sub verbo, appendix, Juris-M's) is read by pandoc in no form,
  and keeps BBT's abbreviation. `sub verbo`, as Zotero's window names it, is
  looked up as `sub-verbo`. Checked by writing all fifteen, one and several, in
  en-US, en-GB, ru-RU, de-DE, fr-FR and an uncarried es-ES, and running them
  through pandoc with a label-printing style: 210 of 210 read with the right
  label. `LOCATOR_LABELS` stays for reading back notes written with it
  (`ENGLISH_LABELS`).
- **`locatorSuffix` deliberately differs from BBT.** BBT wraps a locator in
  `{…}` *after* the comma whenever brackets are on — `[@doe2020, {p. 33}]` —
  which the pandoc manual does not document as a locator at all. Here the braces
  are used only where the plain form would break: a locator holding `,`, `;` or
  a bracket, which pandoc would otherwise read as the end of the citation,
  leaving the rest as stray text. Everything else comes out as plain
  `[@doe2020, p. 33]`. Do not "align this with BBT" without reading pandoc's
  citation syntax section first.

The narrative form brackets the *locator*, not the citation — `@doe2020 [p. 33]`
— so the `brackets` setting does not reach it. There is a test that says so.
