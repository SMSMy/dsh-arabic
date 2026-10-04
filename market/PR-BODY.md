# Pull request body for the awesome-dsh-plugin submission

## SMSMy/dsh-arabic — Arabic interface and bidi-safe RTL for DSH

**The gap.** DSH ships an English-only interface with no RTL support. Mixing
Arabic prose with English identifiers, paths and code inside the GUI scrambles the
text order, and every menu is English. There is no plugin in the catalog that
addresses either half of that.

**What the plugin does**

- **Per-paragraph direction.** Every text block containing Arabic derives its own
  direction (`unicode-bidi: plaintext`, the CSS form of `dir="auto"`): Arabic
  paragraphs read right-to-left, English ones left-to-right, mixed text is ordered
  by the Unicode bidi algorithm, and code blocks stay LTR. The shell is never
  flipped, so bilingual developer text stays readable.
- **A full Arabic interface pack** — 3,228 strings across 59 namespaces,
  registered through the official client locale service (`ctx.locale.addLanguage`
  + `ctx.locale.register`), with an English fallback for anything untranslated.
  No DOM text replacement and no monkey-patching.
- **The user's choice, not ours** — Arabic is *added* to the app's own Language
  selector, and a switch in Settings → General turns the RTL layer off and on
  (remembered, and fully reverting when off).

**Submission requirements**

- `package.json` declares `dsh.bundle` (`{ "bundle": { "patch": "./cordis.patch.yml" } }`) with `cordis.patch.yml` at the repository root.
- Real working code, MIT licensed, published on npm as
  [`dsh-arabic`](https://www.npmjs.com/package/dsh-arabic).
- Repository is more than a day old at the time of opening this PR.
- No official `@deepseek-ai/*` package is declared as a dependency; the browser
  half touches only the `locale` service and the baseline primitives.

**Verification**

- 21 bidi behaviour checks on a DOM shim (marking rules, code isolation, composer
  direction, streamed content, disable/restore).
- 28 locale checks (catalog completeness against the official key set, placeholder
  integrity, artifact contract, language registration, settings-row rendering and
  wiring).
- CI runs both suites plus a strict cross-batch consistency lint on Node 20 and 22.
- The published tarball was re-downloaded and both suites were run against it.

**Category:** `ui` — it changes how the interface renders and speaks.
