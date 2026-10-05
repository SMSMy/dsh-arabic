# dsh-arabic

**Arabic for DeepSeek Harness — proper bidi/RTL rendering plus a full Arabic UI language pack.**

[![CI](https://github.com/SMSMy/dsh-arabic/actions/workflows/ci.yml/badge.svg)](https://github.com/SMSMy/dsh-arabic/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/dsh-arabic)](https://www.npmjs.com/package/dsh-arabic)
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
| `@deepseek-ai/dsh مهم جدًا` | RTL | a leading identifier is one unit |
| `Hello نص` | RTL | a tie resolves to RTL |
| `The build failed while parsing سلام in the file` | untouched | English prose quoting a word stays LTR |
| `pre`, `code`, inline code | LTR always | code is never judged and never mirrored |
| composer, search boxes | follows typing | RTL while Arabic dominates, otherwise native `auto` |

The three rules behind the table:

1. **Code-like tokens do not vote** — URLs, paths, `@scope/name`, shas, `15/15`,
   dotted file names. One URL or sha can otherwise outweigh a whole Arabic
   sentence, and a code token also **binds the Latin words around it** into one
   technical unit.
2. **Words vote, not letters** — an Arabic word against a Latin word, because
   Latin technical terms are longer in characters but fewer in words. A tie goes
   to Arabic; a block with no Arabic word is released.
3. **Hysteresis while streaming** — a block that is already RTL stays RTL until
   the text is clearly Latin (twice as many Latin words), so a growing answer
   cannot flicker between directions.

**Only text blocks are flipped — chrome never is.** A flex or grid container
reorders its children when it flips, and a row that owns buttons is a toolbar:
both are excluded, so the composer's send button keeps its side even though the
Arabic permission label sits in that same row. The Arabic text inside such a row
lives in its own block and is still handled.

If a block's direction is set by the app or by you (`dir="ltr"` in the markup),
this layer never touches it: that is the escape hatch for any block the estimator
gets wrong.

### Known limits (asserted by the tests, not hidden)

- **Bare Latin words still vote.** `شغّل git status` stays LTR: two ordinary
  Latin words outweigh one Arabic word and there is no technical separator to
  glue them. Treating every Latin run as one unit was tried and rejected — it
  flips English paragraphs that quote a single Arabic word.
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
| `scripts/extract-catalog.mjs` | regenerates `data/en-catalog.json` from the official upstream sources (`npm run extract`) |
| `scripts/status.mjs` | coverage against the recorded upstream revision (`npm run status`) |
| `scripts/build-client.mjs` | validates the pack and regenerates `lib/client.js` (`--check` for CI) |
| `scripts/assemble-translations.mjs` | merges translation batches into `locales/ar.json` |
| `scripts/lint-consistency.mjs` | reports the same English string translated two ways |
| `tests/golden-direction.mjs` | 30 golden direction cases, including five that pin what counts as a code token |
| `docs/roadmap.md` | the three layers, the upstream asks, and the deliberate non-goals |
| `docs/status-bidi.html` · `docs/status-final.html` | how the live status line is spelled and why, rendered in both paragraph directions |
| `docs/shimmer-compare.html` | the activity light frozen at one instant, English next to Arabic |
| `CHANGELOG.md` | what changed in each release, and which report drove it |
| `scripts/check-docs.mjs` | fails when a count in the docs disagrees with the suites |
| `AUDIT.md` | how the project was built: every step, command and gate result |
| `CONTRIBUTING.md` | how to add or fix a translation, and the checks CI runs |
| `tests/verify-rtl.mjs` | 52 behavioural checks of the bidi layer on a DOM shim |
| `tests/verify-locales.mjs` | catalog integrity, artifact contract and registration checks |

## Development

```bash
npm test                     # direction (52) + locale (28) + golden matrix (25)
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
