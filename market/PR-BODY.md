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
- **A full Arabic interface pack** — 3,307 strings across 60 namespaces,
  registered through the official client locale service (`ctx.locale.addLanguage`
  + `ctx.locale.register`), with an English fallback for anything untranslated.
  No DOM text replacement, no monkey-patching.
- **The user's choice, not ours** — Arabic is *added* to the app's own Language
  selector, and a switch in Settings → General turns the RTL layer off and on
  (remembered, fully reverting when off).

**Screenshots**

Direction, before and after — rendered by Chromium with the real bidi engine: both
columns carry the same five lines, each opening with a Latin token. The left column
is the first-strong rule, the right one is prose dominance.

![before and after: the first-strong rule against prose dominance](https://raw.githubusercontent.com/SMSMy/dsh-arabic/main/docs/direction.png)

The question card the assistant asks with, before and after (v0.3.2) — the same
markup and the same strings on both sides, with the `dir` attributes the layer writes
on the right. The option's number badge and the buttons keep their sides in both: the
card is not mirrored, its text is.

![the question card before and after](https://raw.githubusercontent.com/SMSMy/dsh-arabic/main/docs/question-card.png)

The activity light, frozen at one instant of its cycle: English above, Arabic below.
The bright band is mirrored.

![the activity light frozen at one instant: English next to Arabic](https://raw.githubusercontent.com/SMSMy/dsh-arabic/main/docs/shimmer-compare.png)

**Submission requirements**

- `package.json` declares `dsh.bundle` (`{ "bundle": { "patch": "./cordis.patch.yml" } }`) with `cordis.patch.yml` at the repository root.
- The host is an optional peer with no upper ceiling — `>=0.2.0-0 <0.2.1-0 || >=0.2.1-0` — so the `0.2.1-*` line resolves under npm's prerelease rule and any newer DSH is accepted; only a runtime older than `0.2.0` is refused. The peer gate warns — it does not refuse — above the newest runtime recorded in `data/tested-runtimes.json`.
- Real working code, MIT licensed, published on npm as [dsh-arabic](https://www.npmjs.com/package/dsh-arabic) with a new release for every fixed defect, each one through trusted publishing (OIDC) with a provenance attestation.
- Repository is more than a day old at the time of opening this PR.
- No official `@deepseek-ai/*` package is declared as a dependency; the browser
  half touches only the `locale` service and the baseline primitives.

**Released:** [`v0.4.4`](https://github.com/SMSMy/dsh-arabic/releases/tag/v0.4.4) is live on npm with a provenance attestation — the declared peer range now carries the explicit `||` branch on the `0.2.1` tuple, so the `0.2.1-alpha.*` line resolves instead of being silently excluded; the three thmanyah cuts (Sans for the interface, Serif Text for reading, Serif Display for headings) sit *behind* whatever font the app itself is set to; and the path/quotation direction rules are unchanged. The published tarball was re-downloaded and all 20 files match the repository blobs after line-ending normalisation; the package page opens with the Arabic README.

**Verification (all green on 0.4.4)**

- **67** bidi behaviour checks on a DOM shim — marking rules, code isolation,
  composer direction, streamed content, disable/restore, and the chrome cases above.
- **45** golden direction strings (`tests/golden-direction.mjs`): the direction
  each of them must get, including the quoted-unit cases, the Windows-path code
  tokens, the mechanism probes and the two limits asserted on purpose.
- **28** font checks (`tests/verify-fonts.mjs`): no font on the machine emits no
  `@font-face`, declares no variable and registers no route; with fonts present the
  three roles get their variables and element rules — each one named behind the
  app's own font choice, so a family the user picks wins and the shipped cut still
  answers for every glyph it cannot draw — and the `/dsh-arabic/fonts`
  handler serves exactly the declared files: bytes identical, traversal a 404.
- **32** locale checks — catalog completeness against the official key set,
  placeholder integrity, artifact contract, language registration, settings row,
  and the locale gate the browser half writes for the activity mirror.
- CI runs those four suites plus the catalog, documentation-count, bidi-family, bench, browser and coverage gates on Node 20, 22 and 24; the published tarball was re-downloaded, compared with the build, and re-tested.

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
