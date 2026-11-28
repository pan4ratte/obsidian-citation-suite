# README screenshots

Part of the notes for coding agents. [AGENTS.md](../AGENTS.md) points here.

The README's screenshots (`assets/*.png`, linked from both READMEs by
`raw.githubusercontent.com` URLs on `main`) are taken by a script, never by
hand, so they can be retaken whenever the interface changes:

```bash
npm run screenshots                        # build, then every shot
npm run screenshots -- preview mobile      # only these
npm run screenshots -- --no-build          # skip the build
npm run screenshots -- citing --keep       # leave Obsidian open if a shot fails
```

A full run takes about a minute and a half. Look at every image it writes
before committing: a shot that runs without an error can still frame
something wrong.

## What has to be there

- **Zotero with Better BibTeX, running.** The demo vault's `.bib` and the
  simulated key rename are read from it, and the desktop shots cite through it.
- **Obsidian, installed.** The script finds it in the usual places, or takes
  `OBSIDIAN_EXE`. It runs the newest `obsidian-x.y.z.asar` in Obsidian's
  data folder, the version the developer is on.
- **The Neo theme in the vault this repo lives in** (`../../themes/Neo`),
  which the shots are taken in, on its dark base.
- **The demo vault**: by default `~/Documents/Obsidian/Citation Suite Demo`.
  It is made from the author's thesis, which is not in the repo. The thesis's
  path goes in `scripts/screenshots/config.local.json`, which git ignores
  since the path is the author's own: `{ "thesis": "…", "vault": "…" }`
  (`vault` optional), or in `CITATION_SUITE_DEMO_THESIS` and
  `CITATION_SUITE_DEMO_VAULT`. With the thesis given, its two chapter folders
  are copied in afresh on every run. Without it, an existing vault is used as
  it is.

## What a run does, and what it touches

`scripts/screenshots/`:

- `vault.mjs` prepares the demo vault. Every step can run again and changes
  nothing the second time. It never writes to the thesis. Per run, it:
  - copies the plugin build, Neo and the vault's settings
    (`appearance.json`, `app.json`, the plugin's `data.json`) into the vault;
  - adds `lang: en-US` to the English chapters, since the author's Zotero
    formats citations in Russian and the note's `lang` comes first;
  - makes two edits in Chapter 3. `[@kimTheologyPublicSphere2011, pp. 3–4]`
    becomes `[@kim2011, …]`, and the key index (`citation-keys.json`) gets
    the pair `kim2011` → that item. That is the state Better BibTeX's rename
    leaves, without renaming anything in Zotero. And `smitWhatDoesPublic2007`
    loses an `i`, for the wavy underline;
  - exports the chapter's sources from the group to `Thesis.bib`, and copies
    Chicago's `.csl` from Zotero's styles into the vault, for the phone shot.
    What the shots rely on finding is in `DEMO` at the top of the file.
- `obsidian.mjs` starts a **separate Obsidian**:
  - It runs on its own profile (`citation-suite-screenshots-profile` in the
    temp folder) with `--remote-debugging-port=9333`, so the developer's
    Obsidian, vaults and settings are never touched.
  - It is forced to a device scale factor of 1.5, so the images come out the
    same size whatever the screen.
  - It opens the vault from the picker page with
    `ipcRenderer.sendSync("vault-open", …)` and sets the profile's
    interface to English (`localStorage.language`).
  - It turns community plugins on, since a new profile starts in restricted
    mode.
  - It drives everything over the DevTools protocol, with no dependencies:
    Node's own `WebSocket`, `Runtime.evaluate`, `Input.*` and
    `Page.captureScreenshot`.
- `shots.mjs` holds one function per shot, plus `window.__shot`, the helpers
  installed in the page. Each shot:
  - starts from `__shot.reset()`;
  - measures its crop from the DOM (the lines it shows, the tooltip, the
    menu), not from fixed coordinates;
  - restores the note in a `finally` when it typed into it.
- `run.mjs` frames every panel with rounded corners and a thin light stroke
  on a transparent ground: on a canvas in the page, since there is no image
  library. Panels of one shot sit side by side. It writes `assets/<name>.png`
  and quits the instance, unless `--keep` was given and a shot failed.

**Side effects outside the repo:**
- The demo vault is rewritten as above.
- The `bibliography-select` shot opens the chapter's collection in the
  developer's Zotero window with a `zotero://select` link, since the menu
  offers the collection open there.
- The instance's window appears on screen while it runs. It ignores the real
  mouse (`setIgnoreMouseEvents`) and keeps page focus emulated, so someone
  using the computer meanwhile does not spoil a shot.

## The shots

| File | Section | What it shows |
|---|---|---|
| `citing.png` | §1 | `; @cavana` typed into footnote ch3-17's group, the key suggestions open. The note is clipped above the line the list's bottom edge would cut |
| `preview.png` | §2 | Chicago notes: ch3-12 to ch3-15, short and full forms, the tooltip of the ch3-14 short form, and the mistyped key in `[^1]` |
| `bibliography.png` | §3 | IEEE: the note's `[2, p. 6]`, `[3]`, `[4]` beside the 440 px pane, an entry's context menu open |
| `bibliography-select.png` | §3 | Two panels: the select menu (libraries, then the open collection), and the "Keys changed in Zotero" and "Sources not found" sections |
| `mobile.png` | §4 | Two phone screens (`app.emulateMobile`, 410×880) with `Thesis.bib` as the library: the note, and the citation window with a pill and a search |
| `footnotes.png` | §5 | "Insert footnote without a citation" with the prefix `ch3-`: the popup holding the citation as written, the body below rendering it |

## When a shot breaks

Run it alone with `--keep`. The instance stays open on port 9333, where
`Runtime.evaluate` reaches `app` and `window.__shot`. What has broken so far:

- **A redrawn element under a pointer that has not moved gets no
  `mouseover`.** That is why `preview` hovers in from a corner and retries
  until the tooltip shows.
- **CodeMirror renders only the lines near the viewport.** Scroll to a line
  (`__shot.scrollTo`, then `__shot.align` on its rendered text) before
  measuring it.
- **A click in the pane makes the pane the active leaf.** That is why
  `__shot.editor()` takes the chapter's markdown leaf, not `activeEditor`.
- **Mobile emulation reloads the window.** `reconnect` waits for the new page,
  and the helpers are installed again.
- **`fs.cpSync` fails with ESRCH on the thesis path on Windows**, and
  `copyTree` copies file by file instead.

## Adding a shot

1. Write a function in `shots.mjs` that returns its panels (PNG buffers).
   Return `{ panels, page }` if it reloaded the window.
2. Add it to `SHOTS` with its corner radius.
3. Run it alone and look at the image.
4. Link it from both READMEs, Russian first, by its raw URL.
5. Add a row to the table above.
