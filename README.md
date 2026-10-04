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
| `@deepseek-ai/dsh مهم جداً` | RTL | one identifier = one word |
| `Hello نص` | RTL | a tie resolves to RTL |
| `The build failed while parsing سلام in the file` | untouched | English prose quoting a word stays LTR |
| `pre`, `code`, inline code | LTR always | code is never judged and never mirrored |
| composer, search boxes | follows typing | RTL while Arabic dominates, otherwise native `auto` |

The browser's own first-strong rule (`dir="auto"`, `unicode-bidi: plaintext`) is
only right when the *first* strong character happens to match the language of the
sentence — which in a developer tool is the exception, not the rule. It is still
used for the value of a composer, where it matches what the user is typing.

If a block's direction is set by the app or by you (`dir="ltr"` in the markup),
this layer never touches it: that is the escape hatch for any block the estimator
gets wrong.

> The word-dominance approach and the "one identifier is one word" rule follow the
> community consensus pioneered by
> [haythamat/dsh-client-ui-rtl](https://github.com/haythamat/dsh-client-ui-rtl);
> this implementation is independent, adds the composer/toggle layer, and is
> covered by its own tests.

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
| `data/overrides.json` | pinned wording where parallel batches disagreed |
| `scripts/extract-catalog.mjs` | regenerates `data/en-catalog.json` from the official upstream sources (`npm run extract`) |
| `scripts/build-client.mjs` | validates the pack and regenerates `lib/client.js` (`--check` for CI) |
| `scripts/assemble-translations.mjs` | merges translation batches into `locales/ar.json` |
| `scripts/lint-consistency.mjs` | reports the same English string translated two ways |
| `CONTRIBUTING.md` | how to add or fix a translation, and the checks CI runs |
| `tests/verify-rtl.mjs` | 12 behavioural checks of the bidi layer on a DOM shim |
| `tests/verify-locales.mjs` | catalog integrity, artifact contract and registration checks |

## Development

```bash
npm test                     # both suites
npm run build                # regenerate lib/client.js
node scripts/build-client.mjs --check    # fail if the pack is incomplete
node scripts/lint-consistency.mjs --strict
```

### Keeping up with upstream

The key set is extracted, not hand-maintained:

```bash
GITHUB_TOKEN=$(gh auth token) npm run extract   # refresh data/en-catalog.json
node scripts/build-client.mjs --check           # list every untranslated key
```

The diff of `data/en-catalog.json` is exactly the new translation worklist, and
keys that are still missing fall back to English at runtime — so a partial
update never breaks the interface. See [CONTRIBUTING.md](CONTRIBUTING.md).

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
