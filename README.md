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

Every text block that contains Arabic gets `data-dsh-arabic-bidi="1"`, and the
injected stylesheet gives it `unicode-bidi: plaintext; text-align: start` — the
CSS form of `dir="auto"`:

| Content | Result |
|---|---|
| Arabic paragraph | right-to-left, aligned right |
| English paragraph | left-to-right, aligned left |
| Arabic + English mixed | ordered by the Unicode bidi algorithm, numbers and paths intact |
| `pre` / `code` / inline code | always LTR — code never gets mirrored |
| Composer, search boxes, `contenteditable` | direction follows what you type |

It does **not** flip the whole shell to RTL. Developer UIs are bilingual by
nature; per-paragraph direction is what keeps both languages readable.

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
        └── ctx.locale.addLanguage({ id: 'ar', label: 'العربية', fallback: 'en' })
            ctx.locale.register(namespace, 'ar', dictionary)   × 59
```

The browser half deliberately has **zero externals** — it only touches the
`locale` service, so it needs no bundler, no React and no module-table
registration. `scripts/build-client.mjs` generates it from
`locales/ar.json`.

## Repository layout

| Path | Purpose |
|---|---|
| `index.js` | host half: the RTL/bidi injection rows |
| `lib/client.js` | generated browser half: the Arabic language pack |
| `locales/ar.json` | the translated dictionaries |
| `data/en-catalog.json` | official English key set extracted from the DSH sources |
| `data/overrides.json` | pinned wording where parallel batches disagreed |
| `scripts/build-client.mjs` | validates the pack and regenerates `lib/client.js` (`--check` for CI) |
| `scripts/assemble-translations.mjs` | merges translation batches into `locales/ar.json` |
| `scripts/lint-consistency.mjs` | reports the same English string translated two ways |
| `tests/verify-rtl.mjs` | 12 behavioural checks of the bidi layer on a DOM shim |
| `tests/verify-locales.mjs` | catalog integrity, artifact contract and registration checks |

## Development

```bash
npm test                     # both suites
npm run build                # regenerate lib/client.js
node scripts/build-client.mjs --check    # fail if the pack is incomplete
node scripts/lint-consistency.mjs --strict
```

## Compatibility

Built against **DSH 0.2.0-rc.2**. The plugin relies on two documented-but-internal
seams: the `webserver/index-inject` event and the client `locale` service. If a
future release changes them, the plugin degrades safely — the RTL layer is
wrapped in `try/catch` and never breaks an index render, and the language pack
simply stops registering. Incompatible versions are reported as issues.

## Credits

- UI strings and key names come from [deepseek-ai/deepseek-harness](https://github.com/deepseek-ai/deepseek-harness) (MIT).
- Arabic translations in this repository are original work, released under MIT.

## License

MIT — see [LICENSE](LICENSE).
