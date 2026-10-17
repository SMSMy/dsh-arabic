# Changelog

Every release below is published to npm through trusted publishing (OIDC) with a
provenance attestation, and every one carries the suite results it was cut from.

## 0.4.6 — 2026-10-17

The settings row's host modules are now explicitly optional, and its failure is
visible instead of silent.

- **the browser half takes `react` and the UI primitives behind a guard.**
  `registerSettingsRow` is the only code in the artifact that needs them, and the
  two `require` calls used to run bare inside it: a build that stopped shipping
  either module aborted the function, and only the call-site `try` kept the reason
  from ever being reported. The two calls now share one `try`; a failure prints a
  single `console.warn` line carrying the loader's own message and skips the
  General-settings row, while `addLanguage`/`register` — which never run through
  that function — keep installing all 60 namespaces / 3,307 keys. A module that
  resolves without a usable `Switch` takes the same branch, so neither a missing
  module nor a renamed primitive can turn a dead row into an unexplained one.
- **the question-card pins were re-verified on `0.2.1-rc.1`.** `data/card-pins.json`
  now records `0.2.1-rc.1` / 2026-10-17: the installed archive still carries the
  `data-question-key` frame, the card's own `<header>`/`<footer>` and the flex
  option cells (`scripts/check-card-pins.mjs`: 9 passed, 0 failed). The shimmer
  record stays at `0.2.0-rc.2`: on `0.2.1-rc.1` the primitives package no longer
  ships as its own directory inside `app.asar` — the frontend compiles it into its
  assets — so `scripts/check-shimmer-pins.mjs` cannot find the pinned module source
  and fails that one assertion; its served-name checks still pass 5/5, because the
  hashed classes and keyframes are unchanged in the shipped stylesheet and script.

> **Follow-up, same day (`49cdf92`):** that limitation was removed rather than
> lived with. `scripts/check-shimmer-pins.mjs` now reads the hashed names from the
> assets the frontend actually serves (`dist/assets/index-*.{css,js}`), normalises
> the minified spacing, and treats the package-source file as an optional probe —
> named explicitly in the output when absent, never a failure on its own. The
> record therefore moved to `0.2.1-rc.1` / 2026-10-17: 15 assertions pass on the
> installed `0.2.1-rc.1` archive, and 18 on an archive laid out the old way
> (`0.2.0-rc.2`, module source present), where the source probe still runs.

> **Runtime record, same day:** `0.2.1-rc.2` was audited by comparing the published
> packages — peer gate COMPATIBLE, every contract unchanged, question card 9/9,
> shimmer 15/15, no code change — and the records now name it.

## 0.4.5 — 2026-10-17

Any newer DSH is accepted; only a runtime older than the floor is refused.

- **the peer range has no upper ceiling.** `peerDependencies` is now
  `>=0.2.0-0 <0.2.1-0 || >=0.2.1-0`. Most DSH releases leave the integration
  points this plugin touches untouched, and being silently excluded because the
  runtime moved past an arbitrary ceiling is worse than running against a
  version that was not exercised. Everything at or above `0.2.0-0` is accepted
  (`0.2.1-rc.1`, `0.3.0`, `1.0.0`, `2.5.0`); everything below it is refused.
- **`check-runtime-peer` is now a floor-and-warning gate.** It fails only when
  the installed runtime is older than `0.2.0-0`; it succeeds with a warning when
  the runtime is newer than the newest entry in `data/tested-runtimes.json`
  (recorded: `0.2.0-rc.2`, `0.2.1-alpha.2`, `0.2.1-alpha.5`, `0.2.1-rc.1`); and
  it passes silently inside that recorded range. npm's default prerelease rule
  is reported as an install-time note, not a boot refusal, because the peer is
  optional. The self-tests now assert the policy itself (`1.0.0` and `2.5.0`
  accepted and warned about, `0.1.9` refused) as well as the comparator.

## 0.4.4 — 2026-10-17

The host accepted the 0.2.1 prerelease line; npm still excluded it.

- **the declared peer range carries an explicit branch for the 0.2.1 tuple.** npm
  judges a peer range with semver's default prerelease rule
  (`includePrerelease: false`): a prerelease version only participates when some
  comparator names the same major.minor.patch tuple with a prerelease tag. The
  former `>=0.2.0-0 <1` names no 0.2.1 comparator, so every `0.2.1-alpha.*`
  runtime was excluded at install time even though the host — evaluating with
  `includePrerelease: true` — accepted it. The range is now
  `>=0.2.0-0 <0.2.1-0 || >=0.2.1-0 <1`. Measured against semver 7.8.5: the old
  range rejects `0.2.1-alpha.2` and `0.2.1-alpha.5`; the new one accepts both,
  accepts `0.2.0-rc.2` / `0.2.5` / `0.3.0`, and still rejects `1.0.0`.
- **`check-runtime-peer` reads `||` and judges the range twice.** Any branch
  satisfies, and unsupported syntax stays an error. The comparator is
  semver-faithful at partial bounds (`<1` is `<1.0.0-0`; `<`, `<=` and `>` widen a
  partial before comparing; partial exact versions are refused), which closes a
  false pass on a `1.0.0` prerelease. Its self-tests are 13 recorded version/range
  cases — 11 asserted under both the host and npm, two against the one judge whose
  verdict is the recorded fact — plus 9 unsupported syntaxes that must stay
  refused.
- `screenshots.json` lists the two repository-relative images the plugin listing
  shows, and the repository description was refreshed to the current 3,307-string
  count (metadata only; no repository file changed).

## 0.4.3 — 2026-10-17

The release that made the host contract explicit and put a gate behind the numbers
the package states by hand.

- **the host is a declared, optional peer.** `@deepseek-ai/dsh >=0.2.0-0 <1` is
  now in `peerDependencies` (optional), because the host evaluates peer ranges at
  boot (`dsh-app-boot`) and excludes an out-of-range plugin silently: no fiber, no
  injection, and nothing on the page explains why. `scripts/check-runtime-peer.mjs`
  reads the version the installed `app.asar` actually ships — `dsh-app-boot`'s own
  `package.json`, not `dsh --version` — and refuses a range the host would reject;
  it skips cleanly when no archive is installed.
- **four evidence gates joined `npm run check`.** `scripts/check-bench.mjs` +
  `data/bench-baseline.json` defend the direction pass's cost: 1,034 deterministic
  style reads over 1,000 blocks, with wall time printed but never asserted.
  `tests/browser-bidi.mjs` renders the golden matrix in headless Chromium and reads
  glyph order back from Range rects, because a DOM shim cannot prove what a bidi
  engine does; a machine without Chrome skips. `lint-consistency.mjs --write-pins`
  signs off every value carrying `{count}` (103, recorded in
  `data/plural-pins.json`), so a new one is a review rather than an accident. CI
  runs all of them.
- **`index.js` was hardened without changing a single direction decision.** Font
  bytes are read once at import and served from memory instead of per request;
  every `dir` this layer writes is tracked in a `WeakMap` and only its own value is
  released; the skip-subtree answer is memoised per pass (`insideSkip`); a silent
  queue-cap drop became one full rescan, so a dropped node cannot keep a stale
  direction; long composer values are re-decided at most every 120 ms with a
  trailing call; and the running build is exposed as `window.__dshArabic.version`.
- **`./locales/*` is exported**, the local `.dsh/` state directory is ignored, and
  the new gates are documented in `CONTRIBUTING.md`.

## 0.4.2

Support for DSH **0.2.1-alpha.2**, whose General settings gained a font role per
surface (interface text, code, sidebar terminal), together with that release's key
set and its Arabic translations.

- **the shipped cuts became a default instead of a value.** 0.2.1 makes
  `--dsw-font-family` an indirection of the app's own: on `body` it carries
  `--dsh-font-family-text` — the family chosen in General settings — ahead of the
  built-in stack, and the boot script writes that variable only while the field is
  not empty. Each of the three roles now names its cut *after* that variable
  (`var(--dsh-font-family-text, var(--dsh-arabic-sans)), var(--dsh-arabic-sans)`,
  and the same shape for the reading and display roles), which is the app's own
  "list then stack" order: a chosen family leads, the cut still answers for every
  glyph that family cannot draw (Arabic, usually, when the choice is a Latin one),
  and an empty field leaves thmanyah in front. The variable is read and never
  declared, so an explicit choice is never shadowed. On `0.2.0-rc.2`, where the
  variable does not exist, every declaration resolves to the cut as before.
- **the English key set was re-extracted** for upstream `d7432673`: 60 namespaces
  / 3,307 keys (was 59 / 3,228) — 85 additions and 6 removals. The additions are
  the new font rows, the work-details collapse setting, the whole
  `cotTranslation` namespace of the experimental reasoning-translation plugin, and
  plugin-manager, microphone, subagent and workspace strings; all 85 are
  translated in `translations/chunk-17.ar.json`, and the six obsolete entries were
  dropped from the chunks that owned them. Coverage is 3,307/3,307 again.
- **the extractor's cache is keyed by the commit it measures.** It reused cached
  file bodies across revisions, so a re-run listed the new tree but re-read the
  previous commit's files: 0.2.1-alpha.2's restructured `settings.theme`
  dictionary read as "no change", and 47 keys stayed invisible until the cache was
  made per-commit. Found by measuring the same release twice.
- **verified on the served build itself**, not only against published assets: the
  activity mirror's hashed names are unchanged in the 0.2.1-alpha.2 stylesheet,
  the question card still carries `data-question-key`, builds its own
  `<header>`/`<footer>` and keeps flex option cells — and the layer marks the two
  text cells of an option (`data-dsh-arabic-bidi`, `dir="rtl"`,
  `unicode-bidi: isolate`) while leaving the option control and its number badge
  alone. The composer takeover still reports `dir="auto"` kept, our marker set and
  `direction: rtl`.

## 0.4.1

The composer's own paragraphs carry a direction the app wrote: Lexical puts
`dir="auto"` on every one of them, and `auto` means "browser, decide by the first
strong character". So a line that opened with a Latin token or a quotation —
`"npm install" ثم أعد التشغيل` — stayed left-to-right and left-aligned although the
sentence is Arabic, which is what the report showed and what the earlier
"quotation" fix could not reach: that one decided whole blocks, and the composer
keeps its own value that this layer had been told never to touch.

`auto` is not an authored direction, it is a delegation — and this layer exists to
decide better than the first strong character. Inside a `contenteditable` the
estimator now takes that decision over: the marker's `direction`/`unicode-bidi`
beat the attribute, which is only a presentational hint, and the app's own value
is left exactly where it was, so restoring the original or switching the layer off
gives the line back untouched. Nothing else changes: a paragraph that is Arabic
already was RTL, and an English paragraph in the same composer stays as it is.

Measured in a real browser against a running web session (Arabic UI): a line
typed as `"npm install" ثم أعد التشغيل بعد التثبيت` reports
`dir="auto"` (the app's, kept), our marker set, `direction: rtl`,
`unicode-bidi: isolate`, `text-align: start`.

## 0.4.0

Three cuts of thmanyah, and two reading rules that the bidi layer had backwards.

- **the interface wears three thmanyah cuts, each in the role it was drawn for.**
  Sans is the interface default (labels, buttons, chrome, small copy), Serif Text
  carries long-form reading (markdown paragraphs, list items, quotations) and Serif
  Display takes the headings. The roles are bound to `--dsw-font-family` — the one
  variable every typography token in the app's theme resolves through — plus one
  element rule each for the other two, so one declaration moves the whole
  interface whatever the language is; the app's own stack stays behind every family
  and the code family is untouched. The nine weights ship unmodified in `fonts/` —
  a subfolder of the repository, never its root, with both license texts — and the
  plugin **serves them over the app's own web server** (`/dsh-arabic/fonts/…`)
  instead of inlining base64: the Desktop shell loads its page from
  `http://127.0.0.1:<port>`, so one same-origin URL covers both shells and the page
  carries nine short `@font-face` rules. Point `DSH_ARABIC_FONTS` at a directory
  laid out the same way for another copy, or at an empty one to keep the app's own
  stack. See [fonts/README.md](fonts/README.md);
- **a Windows path is a code token even when a folder inside it is Arabic.** The
  separator class knew `/` but not `\`, and the RTL test ran before the code test, so
  `"C:\Users\…\الخطوط\thmanyahseriftext"` counted as Arabic prose: a block of
  such paths flipped to RTL and the bidi algorithm re-ordered each path's own Latin
  runs around that Arabic segment, which is what made a list of paths read
  backwards. Code now votes before prose and the backslash is a technical
  separator, so a block of paths stays LTR and each path reads in its own order; a
  mixed path inside Arabic prose is still a paragraph-level decision, and writing
  it between backticks isolates it left-to-right;
- **a double-quoted span counts as one unit.** `"git status"` is a phrase, a
  command, a title — one object inside the sentence — but the splitter counted its
  words, so `شغّل "git status"` stayed LTR: two Latin words against one Arabic
  word. The tokenizer now follows the quotation, the way it already follows a
  scoped package name: whitespace inside quotes does not split, and an unclosed
  quote — a streamed answer, mid-quotation — runs to the end of the text, which is
  the unit its closed form will produce, so nothing flickers when the closing mark
  lands. `شغّل git status` unquoted is unchanged, and still a documented limit;
- **the browser half stops pasting a second copy of the stylesheet** the host
  already injected as an index row (that row carries no id), which with the
  embedded faces would have been a third of a megabyte duplicated in every page.

Confirmed live in the Desktop app after a restart: the three cuts land on their
roles (sans for the interface, serif text for prose, serif display for headings)
and the quoted Windows path that used to read backwards reads in order.

Suites behind this release: 64 bidi + 32 locale + **45** golden direction + **29**
font checks (`npm test`), plus the completeness, consistency, doc-count,
bidi-family and card/shimmer pin gates in `npm run check`.

## 0.3.2

The question card the assistant asks with was the one content surface the layer
never reached: it stayed LTR while everything around it was Arabic. Confirmed live
in the Desktop app after a restart — the same question that read backwards in the
report now reads in order, with mixed punctuation and Latin tokens mid-sentence.

- **a blockified text cell now takes a direction of its own.** DSH draws each option
  as a flex `<button>` whose label and description are `<span>`s, and the walk
  treated every inline-by-default tag as part of the flow around it — landing on the
  button, which is a flex row that owns a control, and giving up. A flex item is a
  text block in its own right: each cell is marked, so `ادفع fix/rust-flake كما هو`
  reads in order instead of backwards, and the row keeps its number badge where the
  design put it. The probe reads a style only when the walk found nothing usable, so
  prose costs exactly what it did (`--bench 1000`: 2,031 → 1,031 style reads over
  2,000 elements, against 1,026 before the change);
- **a content card's own `<header>`/`<footer>` no longer read as shell chrome.** The
  question sits in the card's `<header>`, so the landmark-tag half of the chrome test
  was suppressing it — the question stayed left-aligned and its mixed runs stayed in
  LTR order. Roles still settle chrome first; the tags now yield inside a card whose
  frame carries `data-question-key`, the one app marker this layer reads. Every
  landmark outside the card — the session header, the sidebar, the settings panels —
  is unchanged (a shell `<header>` is asserted untouched in the suite);
- **a control is never given a direction of its own.** Exempting the card's
  `<footer>` exposed the next shape: its action buttons are blockified flex items
  carrying Arabic, so they became candidates — and a marked flex button reverses its
  icon and label, while a centred label jumps to an edge when the alignment is
  overridden. Buttons, selects and `role=button/radio/switch/…` now stop the walk for
  the text inside them but are never marked themselves. Measured on a regression board
  in Chromium: four text cells gained a direction and **no element moved**, including
  the composer's send button and the card's pager;
- `data/card-pins.json` + `scripts/check-card-pins.mjs <app.asar>` record what this
  was verified against in the shipped app (the marker, the card's landmark tags, and
  the flex row whose cells are spans) and fail, naming the difference, when a build
  moves any of them — a rename here is otherwise silent, which is how this shipped
  broken. `tests/verify-rtl.mjs` grows eight checks around the same shapes: 55 → 63.

## 0.3.1

The activity light was mirrored in the stylesheet and never in the browser.

- **the mirror reaches the DOM again.** The frontend build renames every CSS module
  class, so the app's `.sweep` ships as `_sweep_1rdzk_34`: the selectors added in
  0.2.7 matched nothing, and the light kept travelling left to right in Arabic. They
  now take the hashed stem (`[class*="_sweep_"]`) as well as the plain class, and
  `data/shimmer-pins.json` records the names this was verified against —
  `scripts/check-shimmer-pins.mjs <app.asar>` fails, naming the difference, when a
  build renames them, while `tests/verify-rtl.mjs` fails if the selector shape is
  dropped;
- **the locale gate has an owner.** `html:lang(ar)` depends on the app pointing
  `<html lang>` at the active locale — it does, and that is the right source. The
  browser half now also writes `data-dsh-arabic-locale` from the same snapshot and
  removes it on unload, so a change on that internal cannot kill the mirror silently;
- `docs/shimmer-compare.html` renders the class names the frontend ships. The old
  figure compared two mock cells, so it would have shown a mirror that did not exist;
  measured now: at a frozen instant the bright band covers 19–56% of the English line
  and 46–82% of the Arabic one;
- `prefers-reduced-motion` stays the app's: the mirror only renames an animation, so
  the app's `animation: none` still owns duration and delay, and a test now forbids
  this plugin from declaring timing of its own. Forced colours is handled neither
  here nor upstream — the Arabic layers behave exactly as the English ones;
- the live-status comment says the ellipsis keeps to the *logical* end (the right
  inside an LTR isolate), which is what the isolate actually does.

## 0.3.0

The performance pass, measured before it was written.

- **one walk per block**: `blockInfo()` answers both questions — the text to weigh
  and whether the block holds Arabic — where two functions walked every subtree
  twice;
- **pass-scoped caches** for the computed display and for the interactive-control
  query. They are created at the top of a pass and dropped at the end, so nothing
  can go stale when a class change turns a block into a flex row between passes;
- **inline-by-default tags are walked past without a style read**: a page of prose
  is mostly spans inside blocks, and each read is a reflow in a browser;
- `scan()` uses a `Set` instead of a linear `indexOf` over blocks;
- `LATIN_CHAR` uses `\p{Script=Latin}` instead of a hand-written range.

Measured with `node tests/verify-rtl.mjs --bench` over 2,000 elements: **style
reads 3,546 → 2,027** (−43%). Wall time on the offline shim is unchanged and that
is expected — the shim's style read costs nothing, which is exactly why the count,
not the shim's clock, is the number that matters.

## 0.2.9

- **what counts as a code token is narrower and now pinned**: a separator only
  makes a token technical when a word character sits on both sides of it, so a
  label such as `Note:` or `Error:` votes again instead of being swallowed and
  gluing the words after it. Five golden probes assert the mechanism directly
  (`Note:` → 1 Latin word, `src/index.ts` → 0);
- **one definition of a placeholder**: `scripts/lib/placeholders.mjs` replaces the
  three identical copies, and covers `%d`, `%@` and `%1$s` — forms the old pattern
  would have validated in one path and missed in another.

## 0.2.8

Robustness pass over the internals, plus one documentation guard.

- **Direction layer**
  - a mark is now withdrawn when a block stops qualifying, and marked ancestors
    are re-checked when a control mounts deeper than the row that owns it;
  - chrome surfaces (dialogs, menus, the shell landmarks) are never given a
    direction of their own, so the settings window keeps one alignment;
  - composer hysteresis: an RTL composer stays RTL until the Latin side is
    clearly ahead, instead of flickering on every keystroke;
  - only text-like fields take a direction — a checkbox, radio or hidden input is
    left alone.
- **Build and extraction**
  - the generated browser half escapes `<` (U+003C) and the JS line separators, so
    a future translation containing `</script>` cannot break the injection row;
  - upstream dictionaries are evaluated in an empty `vm` context instead of the
    extractor's own global object;
  - the term map matches whole Arabic words only, and its boundary class excludes
    Arabic punctuation (a comma after a term used to block the replacement).
- **Governance**
  - `scripts/check-docs.mjs` compares every count the documentation claims with
    what the suites print, and CI fails on a mismatch — the same number had drifted
    to 21, 34 and 41 in three files;
  - CI runs the consistency lint and the doc check, on Node 20/22/24;
  - the weekly upstream-sync branch name includes the run id, so two manual
    dispatches on one day cannot collide;
  - `npm run check` now runs the completeness gate, the lint, the doc check and
    every suite; `engines.node >= 20` is declared.

## 0.2.7

- the activity shimmer is **mirrored**, not reversed: both layers (the moving mask
  and its counter-moving highlight) get their own keyframes, so the light travels
  with the text instead of inverting into a shadow.

## 0.2.6

- Arabic wording for the live status: **التفكير العميق جارٍ منذ {duration} ···**;
- the activity animation runs right-to-left for Arabic (`html:lang(ar)`).

## 0.2.5

- the status wording stopped calquing the English shape. A live counter needs the
  present continuous, not the past tense a suggestion had proposed.

## 0.2.4

- text inside a chrome surface is never given a direction: one label centered, one
  right and one left was the reported symptom;
- the live status line is wrapped in an LTR isolate, so its ellipsis stays where
  English puts it. The spelling was chosen by rendering the candidates in both
  paragraph directions.

## 0.2.3

- a control mounting deeper than the block it belongs to now releases the mark on
  the block above it.

## 0.2.2

- a mark is withdrawn when a block stops being prose (the settings toggle case);
- `{duration}` is isolated so a live counter cannot re-sequence.

## 0.2.1

- **chrome is never flipped**: flex/grid containers and rows owning interactive
  controls are excluded, because flipping one reorders its children — the reported
  case moved the composer's send button.

## 0.2.0

- code-like tokens no longer vote, and bind the Latin words around them into one
  technical unit (`شغّل npx @deepseek-ai/dsh web` now reads as Arabic);
- hysteresis while streaming, `classify()`/`weigh()` exposed, and the 25-case
  golden matrix that pins the direction of real strings.

## 0.1.1

- direction by word dominance instead of the first strong character;
- a tie resolves to Arabic and a block with no Arabic word is released.

## 0.1.0

- first release: a full Arabic interface pack (3,228 strings, 59 namespaces)
  registered through the official locale service, an optional language entry, and
  a settings switch that turns the direction layer off and reverts completely.
