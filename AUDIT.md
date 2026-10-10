# AUDIT.md — how this project was built, step by step

A record of what was done, in what order, with the command that did it and the
evidence it produced. It exists so a future maintainer (or agent) can verify a
claim instead of trusting the commit message, and so the traps that cost time are
written down once.

**Privacy rule for this file:** no personal paths, no tokens, no credentials.
Everything here is reproducible from a clean checkout.

---

## 1. Environment

| Piece | Version / note |
|---|---|
| DSH | `0.2.0-rc.2`, Desktop app, profile `desktop`; `0.2.1-alpha.2`, served Web UI (`dsh web`, profile `web`) |
| Node | 24.x (plugin targets ≥ 20) |
| npm | 11.17.0 |
| `gh` CLI | authenticated as the repository owner |
| Browser | Chrome/Edge headless, used only to render `docs/direction.png` |
| Extra dev dependency | `esbuild` (used by `npm run extract` only) |

## 2. Timeline

### 2.1 Reconnaissance — where the strings actually live

| Step | Command / source | Result |
|---|---|---|
| Count the plugin inventory | DSH plugin manager | 186 rows enabled, all from the two shipped bundles — i.e. the app's own parts, not user plugins |
| Look for a community Arabic/RTL plugin | npm registry search | no dedicated RTL plugin; `dsh-rtl` is a reserved placeholder; `@mimateinn/dsh-i18n` localizes 20 locales but flips the document |
| Find the official locale sources | GitHub API | `deepseek-ai/deepseek-harness` is **public and MIT** — the key set can be extracted instead of reverse-engineered from bundles |
| Measure the surface | code search for `locale.register` | 80 search hits → 57 call sites in non-test sources |

### 2.2 Extraction — `data/en-catalog.json`

`scripts/extract-catalog.mjs` (then `npm run extract`):

1. list the repo tree → **14,988 paths**;
2. select dictionary sources (`locales.ts`, `locale.ts`, `locales/*.ts`) → **69 files**;
3. find every `locale.register(...)` call site → map each dictionary to its real namespace;
4. transpile/bundle each dictionary with esbuild and read the exported English dictionary out of a sandboxed evaluation;
5. resolve namespaces from the call site plus the exported string constants.

Result: **60 namespaces · 3,307 keys · 0 unresolved calls**, recorded against
upstream commit `d74326738864` in `data/en-catalog.meta.json`.

Four real bugs were found and fixed by testing this pipeline against a known
result (it must reproduce the committed catalog exactly):

| Bug | Symptom | Fix |
|---|---|---|
| `*/` inside a JSDoc block | the comment ended early and the file failed to parse | reworded the comment |
| constants keyed by bare file name | every package has an `index.ts`, so namespaces collided → 30 unresolved calls | key by full path |
| code-search pagination stopped on a short page | only 57 of 80 hits were fetched → 29 namespaces instead of 59 | paginate until an empty page |
| the fetch cache ignored the revision | a re-run listed the new tree but re-read the previous commit's files, so a renamed or restructured dictionary read as "no change" (0.2.1-alpha.2's font rows were invisible until the cache was made per-commit) | key the cache directory by the commit being measured |

### 2.3 Translation — `locales/ar.json`

- the key set was split into **17 batches** of ~200 ids (`translations/chunk-NN.ar.json`);
- six parallel workers translated them against one written brief (rules + glossary);
- `scripts/assemble-translations.mjs` merged them with three guarantees that were
  each added because a real defect appeared:
  **structural whitespace** (38 values restored — an English `"Completed in "`
  must keep its trailing space or the Arabic concatenation glues words),
  **overrides** (30 entries pinning the wording where two batches disagreed),
  **term map** (21 replacements, after `code` shipped as both `كود` and `شيفرة` —
  the same English string, two Arabic renderings);
- `scripts/lint-consistency.mjs` reports the same English translated two ways and
  now ends at **0 findings**.

### 2.4 Direction layer — from first-strong to prose dominance

| Version | Rule | Why it changed |
|---|---|---|
| 0.1.0 | `unicode-bidi: plaintext` (`dir="auto"`) | shipped, then reviewed: this is the first-strong rule (UAX #9 P2/P3) and a developer's line usually starts with a Latin token |
| 0.1.1 | word dominance, one identifier = one word, tie → RTL, hysteresis absent | fixed `Hello كيف حالك`, `Error: …`, `npm install ثم …`; tests went 12 → 34 |
| 0.2.0 | code-like tokens do not vote **and bind the Latin words around them**; hysteresis for streaming; `direction` + `isolate` declared in CSS | fixed `شغّل npx @deepseek-ai/dsh web`; added the 25-case golden matrix |
| 0.2.1 | **chrome is excluded from the decision**: flex/grid containers and rows owning interactive controls are never flipped | reported from real use — an Arabic permission label in the composer's toolbar flipped the row and moved the send button to the other side; tests went 34 → 37 |

Two outside reviews drove 0.1.1 and 0.2.0. Every claim in them was verified before
being acted on — including one that did **not** hold: the Hebrew plugin's
code-token regex requires a leading Latin letter, so it never matches
`@deepseek-ai/dsh`; the predicate here was widened to any token carrying a
technical separator.

Known limits are asserted in the test suite rather than hidden: bare Latin words
still vote (`شغّل git status` stays LTR), the sidebar terminal is xterm.js and does
not shape Arabic, flat dictionaries cannot select Arabic plural forms, and chrome
stays LTR until upstream adopts logical CSS.

### 2.5 Host half — the injection seam

`index.js` pushes two rows into the page through `webserver/index-inject`:
`{ kind: 'style', text }` and `{ kind: 'script', placement: 'body', text }`.

Two facts were established by reading how a shipped community plugin does it (and
are now load-bearing):

- on the packaged Desktop app the injection table is collected **once at host startup**, so
  the rows must be registered synchronously in `apply()` and a **restart** (not a
  page refresh) is what applies them;
- a client script serialized with `toString()` must be **self-contained**: the
  first version referenced a module-scope constant, threw `ReferenceError` inside
  a `try/catch`, and shipped silently doing nothing. The behavior test caught it.

### 2.6 Releases

| Version | How it was published | Evidence |
|---|---|---|
| 0.1.0 | manual, `npm publish` | registry metadata, tarball re-downloaded and re-tested |
| 0.1.1 | manual, `npm publish` | same, plus the fixed strings verified **inside the published tarball** |
| 0.2.0 | **GitHub Actions OIDC**, no token | `dist.attestations.provenance` present; sigstore transparency log entry |

Each publish was followed by: download the published tarball → compare
`index.js`, `lib/client.js`, `locales/ar.json`, `package.json` byte-for-byte with
the build → run all three suites against the extracted package.

### 2.7 Automation added along the way

| Artifact | Purpose |
|---|---|
| `.github/workflows/ci.yml` | Node 20 + 22: completeness gate, consistency lint, three suites, coverage report |
| `.github/workflows/publish.yml` | release → OIDC publish with provenance; skips when the version already exists |
| `.github/workflows/upstream-sync.yml` | weekly: re-extract and open a PR containing only the new keys |
| `scripts/status.mjs` | coverage against the recorded upstream ref/commit, printed into the CI summary |
| `data/glossary.yml` | machine-readable terminology with an explicit *avoid* list |
| `docs/roadmap.md` | the three layers, the upstream asks, the deliberate non-goals |
| `docs/direction.html` | source of the rendered before/after image in the README |
| `market/SMSMy__dsh-arabic.yml` | one-file submission for the curated plugin catalogue |
| `.github/ISSUE_TEMPLATE/*` | translation correction + bug report |

## 3. Gate results (final)

| Gate | Command | Result |
|---|---|---|
| Direction behaviour | `node tests/verify-rtl.mjs` | 67/67 |
| Locale, artifact and registration | `node tests/verify-locales.mjs` | 32/32 |
| Golden direction matrix | `node tests/golden-direction.mjs` | 45/45 |
| Completeness | `node scripts/build-client.mjs --check` | 3,307/3,307 translated, 0 missing |
| Cross-batch consistency | `node scripts/lint-consistency.mjs --strict` | 0 findings |
| Published artifact | download + compare + re-run suites | byte-identical, suites green |

## 4. Traps worth writing down

### npm publishing

1. **`E403 … two-factor authentication or granular access token with bypass 2fa
   enabled is required`** — an account with 2FA disabled cannot publish at all.
2. **The trusted-publisher form in the npm UI is not saved by filling it**: the
   `Allow npm publish` box must be ticked and `Set up connection` pressed.
   Otherwise nothing exists and publishing fails with a generic `404` that looks
   like a wrong repository name. `npm trust list <pkg>` is the only reliable
   check — it answers `No trust configurations found` or lists the connection.
3. **In a non-interactive shell npm masks the browser-auth URL** (`https://www.npmjs.com/auth/cli/***`),
   so account operations (`npm trust`, `npm publish` with OTP) must run in an
   interactive terminal. Automation cannot complete them.
4. `npm trust` returning **`E409 Conflict`** means the connection already exists.
5. Trusted publishers have **separate** `--allow-publish` and `--allow-stage-publish`
   permissions; a stage-only connection cannot run `npm publish`.

### Tooling

6. **Community plugin installs can hang for 600 s and then report failure** even
   though pnpm finished; the manager rolls `package.json` back and a retry
   usually succeeds (leftovers stay in `node_modules`).
7. **`webpack`-style `*/` in comments** and **basename collisions** are the two
   bug classes that silently produced wrong catalogs (see 2.2).
8. A DOM shim used for behaviour tests must implement `removeAttribute`, or the
   "cleanup" assertions pass/fail for the wrong reason.

## 5. What is deliberately not done

Chrome RTL by injection, DOM-level string replacement, extra languages, a terminal
Arabic shaping layer, an in-chat proofreader, themes, or a dashboard. Each has a
reason recorded in `docs/roadmap.md`; the short version is that they trade the
differentiator for surface area.

## 6. Open items

- Listing follow-through in the curated catalogue (`market/` is prepared).
- Screenshots of the running app in the README — pending an app session; the
  committed image is a Chromium render of text samples and says so.
- Plural forms: needs a plural-capable locale contract from DSH, noted in the
  roadmap with the current mitigation.
- Chrome RTL after upstream adopts logical CSS.
