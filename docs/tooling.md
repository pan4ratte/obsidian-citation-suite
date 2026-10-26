# Lint, dependencies and release

Part of the notes for coding agents. [AGENTS.md](../AGENTS.md) has the rules most changes need and points here; this file holds the detail, moved there from AGENTS.md unchanged.

## Lint

`eslint.config.mjs` extends `eslint-plugin-obsidianmd`'s
`recommendedWithLocalesEn`, which bundles `eslint:recommended`,
typescript-eslint `recommended-type-checked`, `import`, `depend` and
`no-unsanitized`, and adds the sentence-case check over `lang/en.ts`. Lint is
**clean**: 0 errors and 0 warnings, and CI runs it with `--max-warnings 0`. Keep
it that way.

Three things about this config are load-bearing:

- **`files` covers `**/*.mts` as well as `**/*.ts`.** The preset parses `.mts`
  as TypeScript and turns the type-checked rules on for it, and a rule of that
  kind **fails to load** rather than reporting when no project service is wired
  up for the file it is asked about — the whole run dies on
  `vitest.config.mts` with a message about `await-thenable`. `*.mts` is in
  tsconfig's `include` for the same reason.
- **`brands` and `ignoreWords` replace the rule's default lists**, they do not
  add to them. That is why `Obsidian` is named alongside `Citation Suite`, `Zotero` and
  `Better BibTeX`: dropping it would lowercase it.
- **`Pandoc` is a brand in `lang/en.ts`.** The interface text writes it with its
  capital, as `manifest.json`, the READMEs and `ru.ts` do, so the locale-module
  rule keeps it that way. The plain `sentence-case` rule still ignores the
  lowercase `pandoc`, which names the command in code.

The sentence-case rule also **bans the disable comment for itself**, so there is
no exempting a string — write UI text that passes. It reads a value as one
literal, so a concatenated string is silently unchecked, and it objects to a
bare `@key` in prose (it reads the `@` as a handle): `SETTING_BRACKETS_DESC`
shows the bracketed example and describes the other rather than printing it.

### CSS

`stylelint.config.mjs` extends `stylelint-config-obsidianmd`, Obsidian's own
CSS ruleset and the one the review scanner runs over `styles.css`. It is a
separate package from the ESLint plugin, and ESLint never looks at CSS, so an
up-to-date `eslint-plugin-obsidianmd` alone lets the scanner's CSS findings
through. Lint is clean here as well, and CI runs it with `--max-warnings 0`.

- **The browser target is Electron 39 (Obsidian 1.11.4), not the preset's 43.**
  That is the version the scanner reported against. `browsers` replaces the
  preset's options rather than merging with them, so `ignore` is restated too.
- **`:has` is not used.** The scanner advises against it for its invalidation
  cost. The slider row it once found is sized by `white-space: nowrap` on the
  value alone; measured in Chromium against Obsidian's own `app.css`, the row
  came out the same at every width.
- **The scanner ignores `stylelint-disable` comments**, so `lint:css` runs with
  `--ignore-disables` and a warning has to be designed out, not silenced. Two
  were, both false positives in caniuse's data (partial support there means
  `text-decoration-skip` values and `text-indent`'s `hanging` / `each-line`
  keywords, none of which the stylesheet uses):
  - `text-decoration-*` longhands are flagged, but a `text-decoration`
    shorthand whose parts are all `var()`s is not. `text-decoration-skip-ink:
    none` is replaced by `text-underline-position: under` with a `0.05em`
    offset: below the descenders there is nothing to skip. Screenshots with
    skip-ink `auto` and `none` came out pixel-identical across 20 Windows
    fonts, 6 sizes and all three line styles.
  - `text-indent` for the hanging indent is replaced by padding on the entry
    and a negative margin on its `::first-letter`. Measured in Chromium, lines
    fall in the same places. It also stopped the indent being inherited by the
    mention bar, whose label it had pulled out of its box and clipped.

## npm audit and the lockfile

`npm audit` reports **0 vulnerabilities**, and there is no `overrides` block
keeping it there — unlike the sibling Classy PDF Extractor, which needs one.

The sibling's **"package-lock.json must be generated on Linux"** rule does
**not** apply here, and it is worth knowing why before someone copies the CI
guard across. That trap is `@unrs/resolver`, a native binding pulled in by a
newer `eslint-plugin-import`, whose optional `@emnapi/*` dependencies Windows
never hoists to the top level. This tree has no `@unrs/resolver` at all:
`eslint-plugin-import` is nested under `eslint-plugin-obsidianmd` at a version
that predates it. Check before assuming that still holds:

```bash
node -e 'const l=require("./package-lock.json");console.log(Object.keys(l.packages).filter(k=>k.includes("unrs")||k.includes("emnapi")))'
```

An empty array means a lockfile written on Windows is complete everywhere. If
that ever prints something, `npm ci` will start failing on Linux with "Missing:
@emnapi/core from lock file" and the lockfile has to be regenerated under WSL —
read that repo's AGENTS.md, which documents the whole trap and its remedy.

## Release

`manifest.json` is the source of truth. `.github/workflows/main.yml` releases
automatically when its `version` changes on `main` — **no manual tagging and no
`npm version`**; the release creates the tag.

To cut a release, in one commit:

1. Bump `version` in **`manifest.json` and `package.json`** to the same value —
   the workflow fails the run if they disagree
2. Rename `## Не выпущено` in **`CHANGELOG_RU.md`** and `## Unreleased` in
   **`CHANGELOG.md`** to that version. Both are shipped inside `main.js` and the
   plugin picks between them by locale, so a version renamed in one file and not
   the other leaves half the readers on a heading that says the release is
   unreleased. The workflow checks both and greps `## <version>` in
   `CHANGELOG.md` for the release notes
3. Add the new version to `versions.json`, mapped to the `minAppVersion` this
   release ships with — that file is what lets an older Obsidian keep offering
   the last release it can actually run. It is read from the repository, not
   from the release assets, so it only has to be committed. The workflow fails
   the run if the version is missing from it
4. Push

The workflow then runs `npm ci` and `npm run build`, attests build provenance
for `main.js` / `manifest.json` / `styles.css`, creates the release with those
three assets, and verifies the attestations. It skips if that version is already
released, so unrelated `manifest.json` edits are harmless.

`.github/workflows/ci.yml` is what runs lint, tests and the build on every push
and pull request; the release workflow does not. Still run `npm run lint` and
`npm test` before pushing — CI is the backstop, not the first look.
