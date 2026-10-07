## SMSMy/dsh-arabic — Arabic interface and bidi-safe RTL for DSH

**The gap.** DSH ships an English-only interface with no RTL support. Mixing Arabic
prose with English identifiers, paths and code inside the GUI scrambles the text
order, and every menu is English. The catalog already carries an RTL layer for
Hebrew (`kfirsch/dsh-hebrew-rtl`) and an i18n plugin that registers `ar` with a
different coverage (`mimateinn/dsh-i18n`); what is missing is the Arabic half as a
language pack, plus a direction layer that keeps developer text — paths, commands,
shas — readable while it flips the prose.

**What the plugin does**

- **Direction decided per text block, by prose dominance.** Not `dir="auto"`:
  the first-strong rule gets a developer's line wrong whenever it opens with a
  Latin token (`Error: فشل الاتصال`). Instead, each block is weighed in words —
  Arabic against Latin — and:
  - **code-like tokens do not vote** (URLs, paths, `@scope/name`, shas, `15/15`,
    dotted file names) and they bind the Latin words around them into **one**
    technical unit, so `شغّل npx @deepseek-ai/dsh web` reads as Arabic;
  - a tie resolves to Arabic, and a block with **no Arabic word is released** —
    English prose quoting one Arabic word stays LTR;
  - **hysteresis** keeps a streamed answer from flickering (a block that is
    already RTL stays RTL until the text is clearly Latin);
  - **chrome is never flipped**: flex/grid containers and rows owning interactive
    controls are excluded, because flipping one reorders icons and buttons — the
    Arabic label in the composer's toolbar must not move the send button. The text
    inside such a row lives in its own block and is still handled: a blockified text
    cell (the question card's option label) takes its own direction and reads in
    order, while a control never does — the card's number badge and buttons keep the
    sides the design gave them;
  - a `dir` set by the app or the author is **never** overridden.
- **A full Arabic interface pack** — 3,228 strings across 59 namespaces,
  registered through the official client locale service (`ctx.locale.addLanguage`
  + `ctx.locale.register`), with an English fallback for anything untranslated.
  No DOM text replacement, no monkey-patching.
- **The user's choice, not ours** — Arabic is *added* to the app's own Language
  selector, and a switch in Settings → General turns the RTL layer off and on
  (remembered, fully reverting when off).

**Submission requirements**

- `package.json` declares `dsh.bundle` (`{ "bundle": { "patch": "./cordis.patch.yml" } }`) with `cordis.patch.yml` at the repository root.
- Real working code, MIT licensed, published on npm as [dsh-arabic](https://www.npmjs.com/package/dsh-arabic) with a new release for every fixed defect, each one through trusted publishing (OIDC) with a provenance attestation.
- Repository is more than a day old at the time of opening this PR.
- No official `@deepseek-ai/*` package is declared as a dependency; the browser
  half touches only the `locale` service and the baseline primitives.

**Verification (all green on 0.3.2)**

- **63** bidi behaviour checks on a DOM shim — marking rules, code isolation,
  composer direction, streamed content, disable/restore, and the chrome cases above.
- **30** golden direction strings (`tests/golden-direction.mjs`): the direction
  each of them must get, including the two limits asserted on purpose.
- **32** locale checks — catalog completeness against the official key set,
  placeholder integrity, artifact contract, language registration, settings row,
  and the locale gate the browser half writes for the activity mirror.
- CI runs the three suites plus a strict consistency lint on Node 20, 22 and 24; the
  published tarball was re-downloaded, compared byte-for-byte with the build, and
  re-tested.

**Maintenance, not just a drop**

`data/en-catalog.json` is **extracted** from the official sources rather than
hand-written, `scripts/status.mjs` reports coverage against the recorded upstream
commit, and a weekly workflow re-extracts and opens a PR containing only the new
keys. Terminology is pinned in `data/glossary.yml` and enforced by
`data/term-map.json`, so the same English string cannot ship two ways. Two shapes
this plugin depends on in DSH itself are pinned and re-verified against an installed
`app.asar` before every release — the hashed activity-mirror classes
(`data/shimmer-pins.json`) and the question card's markup (`data/card-pins.json`) —
because both fail silently when a build renames them.

**Category:** `ui` — it changes how the interface renders and speaks.


