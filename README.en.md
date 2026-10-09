# dsh-arabic

[العربية](README.md) · **English**

**Arabic for DeepSeek Harness — proper bidi/RTL rendering, a full Arabic UI language pack, and thmanyah's serif as the interface font.**

[![CI](https://github.com/SMSMy/dsh-arabic/actions/workflows/ci.yml/badge.svg)](https://github.com/SMSMy/dsh-arabic/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/dsh-arabic)](https://www.npmjs.com/package/dsh-arabic)
[![downloads](https://img.shields.io/npm/dm/dsh-arabic?label=downloads)](https://www.npmjs.com/package/dsh-arabic)
[![license](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

DSH has no RTL support and no Arabic locale. Mixing Arabic prose with English
identifiers, paths and code inside the GUI makes text look scrambled, and every
menu is English-only. This plugin fixes both, without patching the app.

## What it does

### 1. Bidi-safe RTL rendering (works regardless of UI language)

Direction is decided **per block by script dominance**, not by the first strong
character. The tokenizer splits on whitespace only, so `@deepseek-ai/dsh` counts
as *one* word rather than three:

| Content | Direction | Why |
|---|---|---|
| `كيف حالك Hello` | RTL | Arabic words dominate |
| `Hello كيف حالك` | RTL | still Arabic words — `dir="auto"` would get this **wrong** |
| `Error: فشل الاتصال بالخادم` | RTL | the sentence is Arabic, the prefix is not |
| `npm install ثم أعد التشغيل` | RTL | 3 Arabic words vs 2 Latin ones |
| `شغّل npx @deepseek-ai/dsh web` | RTL | the code token binds `npx … web` into **one** unit, so 1 Arabic vs 1 Latin |
| `راجع commit a4c1025b قبل النشر` | RTL | a bare sha does not vote |
| `نسبة النجاح 15/15` | RTL | a ratio is neutral |
| `افتح src/index.ts ثم عدّل الدالة` | RTL | a path does not vote |
| `"C:\Users\…\الخطوط\thmanyahseriftext"` | untouched | a Windows path is a code token even with an Arabic folder inside |
| `@deepseek-ai/dsh مهم جدًا` | RTL | a leading identifier is one unit |
| `Hello نص` | RTL | a tie resolves to RTL |
| `The build failed while parsing سلام in the file` | untouched | English prose quoting a word stays LTR |
| `شغّل "git status"` | RTL | a quotation is **one unit**: the quoted span votes once |
| `pre`, `code`, inline code | LTR always | code is never judged and never mirrored |
| composer, search boxes | follows typing | RTL while Arabic dominates, otherwise native `auto` |

The four rules behind the table:

1. **Code-like tokens do not vote** — URLs, paths (Windows backslashes included),
   `@scope/name`, shas, `15/15`, dotted file names. One URL or sha can otherwise
   outweigh a whole Arabic sentence, and a code token also **binds the Latin words
   around it** into one technical unit. A path whose folder carries Arabic letters
   is still a path: counting it as prose is what used to flip a block of paths to
   RTL, which then re-ordered each path's own Latin runs around that Arabic word.
2. **Words vote, not letters** — an Arabic word against a Latin word, because
   Latin technical terms are longer in characters but fewer in words. A tie goes
   to Arabic; a block with no Arabic word is released.
3. **Hysteresis while streaming** — a block that is already RTL stays RTL until
   the text is clearly Latin (twice as many Latin words), so a growing answer
   cannot flicker between directions.
4. **A quotation is one unit** — `"git status"` is a quoted phrase, a command, a
   title, and votes once, not twice. `شغّل "git status"` therefore reads as the
   Arabic sentence it is, while the same words unquoted stay LTR (see the limits
   below). An unclosed quote — a streamed answer mid-quotation — runs to the end
   of the text, which is the unit its closed form will produce.

**Only text blocks are flipped — chrome never is.** A flex or grid container
reorders its children when it flips, and a row that owns buttons is a toolbar:
both are excluded, so the composer's send button keeps its side even though the
Arabic permission label sits in that same row. The Arabic text inside such a row
lives in its own block and is still handled.

Two shapes needed more than a plain block decision, and both are pinned by tests
and by `data/card-pins.json`:

- **a text cell CSS has blockified.** The question card the assistant uses to ask
  a question draws each option as a flex `<button>`, and its label and description
  are `<span>`s inside it. A genuinely inline span is part of the flow around it,
  but a flex item is a text block of its own: each cell takes RTL, so
  `ادفع fix/rust-flake كما هو` reads in order instead of backwards, while the row
  keeps its number badge on the left;
- **a content card's own `<header>`/`<footer>`.** DSH wraps the question itself in
  a `<header>` (`header` and `footer` are landmarks of the shell, and stay chrome).
  The card's frame carries `data-question-key` — the one app marker this layer
  reads — so a landmark *inside* the card is the card's own part and its question
  is content like any other paragraph. `scripts/check-card-pins.mjs <app.asar>`
  fails, naming the difference, when a build moves that marker or stops building
  the option row as a flex row;
- **what does not move:** the option's number badge, and the controls themselves. A
  row that owns a control is never flipped, and a control is never given a direction
  of its own — a flex button would reverse its icon and label, and a centred label
  would jump to an edge. So the number stays where the design put it, the card's
  buttons keep their layout, and the Arabic text starts beside them: the card is not
  mirrored, its text is.

![Before and after: the question card with and without the layer](https://raw.githubusercontent.com/SMSMy/dsh-arabic/main/docs/question-card.png)

<sub>Rendered by Chromium with the real bidi algorithm: the same card markup and the same
strings on both sides, with the `dir` attributes the layer writes on the right. The number
badge stays on the left in both. Source: [docs/question-card.html](docs/question-card.html).</sub>

If a block's direction is set by the app or by you (`dir="ltr"` in the markup),
this layer never touches it: that is the escape hatch for any block the estimator
gets wrong.

### Known limits (asserted by the tests, not hidden)

- **Bare Latin words still vote.** `شغّل git status` stays LTR: two ordinary
  Latin words outweigh one Arabic word and there is no technical separator to
  glue them. Quoting the command is the reader's remedy — `شغّل "git status"`
  flips — and treating every Latin run as one unit was tried and rejected: it
  flips English paragraphs that quote a single Arabic word.
- **A mixed path inside Arabic prose still follows the bidi algorithm.** The block
  is Arabic and stays RTL, and the path's Latin runs are ordered around its Arabic
  segment. Writing the path between backticks is the reliable form — the stylesheet
  isolates `code` left-to-right, so the path reads in its own order (verified in
  Chromium).
- **The sidebar terminal is not shaped.** DSH's terminal is xterm.js, which does
  not join Arabic letters (`ا ل ع ر ب ي ة`). That is an upstream limitation; this
  plugin documents it instead of pretending otherwise.
- **Plural forms.** DSH's locale dictionaries are flat strings, so an Arabic
  sentence that counts things cannot pick the right form for 1, 2, 3–10, 11+.
  Where it matters, the copy is phrased to be number-agnostic.
- **Chrome stays LTR — by design, not by omission.** The shell (sidebar, menus,
  settings, tab bars) keeps its authored order; only text blocks take a direction.
  A row that owns a control is **never marked**, and a mark is withdrawn the
  moment its subtree gains one — including when the control mounts a level deeper
  than the row. So an Arabic settings label reads right-to-left inside its own
  column while the switch stays exactly where the design put it. Mirroring the
  shell would need the app's layout to be authored with logical CSS; until then a
  half-mirrored panel reads as broken, which is why the direction decision is
  restricted to content. See [docs/roadmap.md](docs/roadmap.md).

> The word-dominance approach, the "one identifier is one word" rule and the
> idea of stripping code-like tokens before counting follow the community
> consensus pioneered by
> [haythamat/dsh-client-ui-rtl](https://github.com/haythamat/dsh-client-ui-rtl)
> and [kfirsch/dsh-hebrew-rtl](https://github.com/kfirsch/dsh-hebrew-rtl)
> (both MIT); this implementation is independent, adds the composer/toggle layer
> and the hysteresis, and is covered by its own tests.

![Before and after: first-strong versus script dominance](https://raw.githubusercontent.com/SMSMy/dsh-arabic/main/docs/direction.png)

<sub>Rendered by Chromium with the real bidi algorithm: both columns contain the same five
lines, each starting with a Latin token. Source: [docs/direction.html](docs/direction.html).</sub>

### 2. Arabic UI language pack

Registered through the official locale service (`ctx.locale.addLanguage` +
`ctx.locale.register`), which is the mechanism the app itself uses — no DOM
string replacement, no monkey-patching:

- **59 namespaces / 3,228 keys** taken from the official DSH source
- keys we do not translate fall back to English automatically (`fallback: 'en'`)
- pick **العربية** in *Settings → General → Language*

Coverage and every non-obvious translation decision are auditable in
[`data/en-catalog.json`](data/en-catalog.json) (official English key set),
[`locales/ar.json`](locales/ar.json) (the Arabic pack) and
[`data/overrides.json`](data/overrides.json) (cross-batch consistency fixes).

### 3. Your choice, not ours

Arabic is **added as an option, never forced**:

- **Settings → General → Language** lists **العربية** next to the built-in
  languages; the selection is stored by the app's own locale service, so a
  reader who prefers the English interface keeps it.
- **Settings → General → Right-to-left text direction** switches the bidi layer
  off and on instantly and remembers the choice (`localStorage`). With it off,
  no block is marked and no composer direction is set — the UI behaves exactly
  as it would without the plugin.

### 4. The interface typography

Three cuts of **thmanyah**, each in the role it was drawn for:

| Role | Cut | Where it lands |
|---|---|---|
| Interface | **Thmanyah Sans** | the default: labels, buttons, chrome, small copy |
| Reading | **Thmanyah Serif Text** | markdown paragraphs, list items, quotations |
| Headings | **Thmanyah Serif Display** | `h1`–`h6` |

One declaration carries the interface role — the plugin re-declares
`--dsw-font-family`, the variable every typography token in the app's theme
resolves through — and two element rules carry the other two. The app's own stack
stays behind every family in the same declaration, the code family is untouched,
and each role goes silent if its files are missing.

The weights live in [`fonts/`](fonts/README.md) — a subfolder of the repository,
never its root, with both license texts — and the plugin serves them from
`/dsh-arabic/fonts/` on the app's own web server: the Desktop shell loads its page
from `http://127.0.0.1:<port>`, so one same-origin URL works in both shells and
the page carries nine short `@font-face` rules instead of a megabyte of base64.
Point `DSH_ARABIC_FONTS` at a directory laid out the same way to supply another
copy, or at an empty one to keep the app's own stack.

Nothing about the interface changes until you choose it.

## Install

```bash
# npm
dsh plugin --profile desktop add dsh-arabic

# or from a checkout (development)
dsh plugin --profile desktop add link:/absolute/path/to/dsh-arabic
```

Or install it inside the app: **Settings → Plugins → Plugin Manager**.

> **Restart DSH after installing.** The Desktop injection table is collected
> once at host startup, so a page refresh alone will not apply the RTL layer.

Then, to use the Arabic interface: **Settings → General → Language → العربية**.
The RTL layer is active for every language as soon as the plugin loads.

## How it works

```
index.js                     host half
  └── webserver/index-inject rows
        ├── { kind: 'style',  text: <bidi CSS> }
        └── { kind: 'script', placement: 'body', text: <marker script> }

lib/client.js                browser half (generated)
  └── window.__ModuleLoader__.load({ id, factory })
        ├── ctx.locale.addLanguage({ id: 'ar', label: 'العربية', fallback: 'en' })
        │   ctx.locale.register(namespace, 'ar', dictionary)   × 59
        └── ctx.slots.inject('settings.general.item', …)
            └── one Switch row → window.__dshArabic.setEnabled()
```

The browser half has **no top-level externals**: `react` and the primitives are
required only when the settings seat exists, and that registration is guarded so
a future slot change can never take the language pack down with it.

## Repository layout

| Path | Purpose |
|---|---|
| `index.js` | host half: the RTL/bidi injection rows |
| `lib/client.js` | generated browser half: the Arabic language pack |
| `locales/ar.json` | the translated dictionaries |
| `data/en-catalog.json` | official English key set extracted from the DSH sources |
| `data/en-catalog.meta.json` | the upstream ref/commit that key set was measured against |
| `data/glossary.yml` | machine-readable terminology (term, ar, avoid, do-not-translate) |
| `data/overrides.json` | pinned wording where parallel batches disagreed |
| `data/term-map.json` | term normalization applied to every value in the pipeline |
| `data/bidi-decisions.json` | every live-status isolation, and every mixed-script value, with its reason |
| `data/shimmer-pins.json` | the hashed class and keyframe names the activity mirror was verified against |
| `scripts/extract-catalog.mjs` | regenerates `data/en-catalog.json` from the official upstream sources (`npm run extract`) |
| `scripts/status.mjs` | coverage against the recorded upstream revision (`npm run status`) |
| `scripts/build-client.mjs` | validates the pack and regenerates `lib/client.js` (`--check` for CI) |
| `scripts/assemble-translations.mjs` | merges translation batches into `locales/ar.json` |
| `scripts/lint-consistency.mjs` | reports the same English string translated two ways |
| `tests/golden-direction.mjs` | 45 golden direction cases, including the code-token probes, the quoted-unit cases and the documented limits |
| `fonts/` | the three thmanyah cuts (Sans, Serif Text, Serif Display), each 400/500/700, plus both license texts — a subfolder of the repo, never its root |
| `docs/roadmap.md` | the three layers, the upstream asks, and the deliberate non-goals |
| `docs/status-bidi.html` · `docs/status-final.html` | how the live status line is spelled and why, rendered in both paragraph directions |
| `docs/shimmer-compare.html` | the activity light frozen at one instant, English next to Arabic |
| `CHANGELOG.md` | what changed in each release, and which report drove it |
| `scripts/check-docs.mjs` | fails when a count in the docs disagrees with the suites |
| `scripts/check-bidi-family.mjs` | fails, naming the key, on an unrecorded live-status isolation |
| `scripts/check-shimmer-pins.mjs` | re-verifies the activity-mirror names against an installed `app.asar` (release step) |
| `AUDIT.md` | how the project was built: every step, command and gate result |
| `CONTRIBUTING.md` | how to add or fix a translation, and the checks CI runs |
| `tests/verify-rtl.mjs` | 67 behavioural checks of the bidi layer on a DOM shim |
| `tests/verify-locales.mjs` | catalog integrity, artifact contract and registration checks |
| `data/card-pins.json` | the question card's shape (marker, landmarks, flex row), re-verified against an installed `app.asar` (release step) |

## Development

```bash
npm test                     # direction (67) + locale (32) + golden matrix (45) + fonts (29)
npm run check                # completeness + consistency lint + golden matrix
npm run build                # regenerate lib/client.js
npm run status               # coverage against the recorded upstream revision
```

### Keeping up with upstream

A weekly workflow ([`.github/workflows/upstream-sync.yml`](.github/workflows/upstream-sync.yml))
re-extracts the official key set and opens a pull request containing only the new
keys, so drift arrives as a reviewable diff instead of a surprise:

```bash
GITHUB_TOKEN=$(gh auth token) npm run extract   # refresh data/en-catalog.json
node scripts/build-client.mjs --check           # list every untranslated key
npm run status                                  # coverage + upstream revision
```

Keys that are still missing fall back to English at runtime, so a partial update
never breaks the interface. See [CONTRIBUTING.md](CONTRIBUTING.md) and the
[roadmap](docs/roadmap.md).

## Compatibility

Built and tested against **DSH 0.2.0-rc.2** on the Desktop app and the served Web
UI. Both surfaces use the same two documented-but-internal seams — the
`webserver/index-inject` event and the client `locale` service — and the plugin
degrades safely if either changes: the direction layer is wrapped so it can never
break an index render, and the language pack simply stops registering. On the
Desktop app the injection table is collected once at host startup, so a restart
(not a page refresh) is what applies it.

**Interactions with other Arabic/RTL plugins.** This one and `dsh-client-ui-rtl`
or `dsh-rtl-fix` both set `dir` on content blocks; installing two of them means
they take turns and the last writer wins. The settings row in *General* turns
this layer off, which is the clean way to combine them. Two plugins registering
the `ar` language (`@mimateinn/dsh-i18n` does, with different coverage) will also
fight over the same language id — pick one.

**Terminology.** `بلاقن` is a deliberate choice: it is the form Arabic-speaking
developers use in speech, while `plugin` stays in the technical namespaces
(package names, paths, CLI output). Prefer the Latin word in the interface? The
dictionary is one edit away — see [CONTRIBUTING.md](CONTRIBUTING.md).

## Credits

- UI strings and key names come from [deepseek-ai/deepseek-harness](https://github.com/deepseek-ai/deepseek-harness) (MIT).
- The word-dominance direction rule and the "one identifier is one word" insight follow the community consensus pioneered by [haythamat/dsh-client-ui-rtl](https://github.com/haythamat/dsh-client-ui-rtl) (MIT); this implementation is independent.
- Arabic translations in this repository are original work, released under MIT.

## License

MIT — see [LICENSE](LICENSE).
