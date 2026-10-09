# Changelog

Every release below is published to npm through trusted publishing (OIDC) with a
provenance attestation, and every one carries the suite results it was cut from.

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
