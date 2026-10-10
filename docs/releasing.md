# Releasing

Two publishers exist for this package: a manual one (works today) and trusted
publishing through GitHub Actions (one-time setup, no tokens afterwards).

## 1. Prepare the release

```bash
# bump the version
npm version 0.1.1 --no-git-tag-version

# gates: the pack must be complete and self-consistent
node scripts/build-client.mjs --check
node scripts/lint-consistency.mjs --strict
node scripts/check-bidi-family.mjs
npm test

# the committed browser half must match its generator
node scripts/build-client.mjs
git diff --exit-code lib/client.js

# the activity mirror aims at another package's DOM, and the frontend build
# renames every class (data/shimmer-pins.json records the names it was verified
# against) — re-verify against an installed app. This cannot run in CI, which has
# no DSH install.
node scripts/check-shimmer-pins.mjs "$LOCALAPPDATA/Programs/DeepSeek Harness/resources/app.asar"

# the question card is the one content surface whose chrome exemption and whose
# text cells both depend on the shape DSH builds (data/card-pins.json) — same
# reason, same place to check.
node scripts/check-card-pins.mjs "$LOCALAPPDATA/Programs/DeepSeek Harness/resources/app.asar"
```

When the Desktop app is not yet on the build you are packaging for, the same two
contracts can be read from a **served instance** instead — both pins are names in
the app's own assets, and `dsh web` serves exactly those files:

```bash
# a profile with this plugin installed, on a free port
dsh web --port 19400 --no-open      # the printed ?token= URL is the authenticated one
# then fetch the page, take its /assets/index-*.css, and grep for the names in
# data/shimmer-pins.json and data/card-pins.json. The question card's shape is
# verifiable live in that page: `data-question-key` on the frame, its own
# <header>/<footer>, and option cells that carry the layer's marker while the
# row's control does not.
```

If upstream DSH added strings, translate them first:

```bash
GITHUB_TOKEN=$(gh auth token) npm run extract   # refresh the English key set
node scripts/build-client.mjs --check           # list the new keys
node scripts/assemble-translations.mjs --from translations
npm run build && npm test
```

The extractor caches its sources under `.cache/extract/<commit>/`, so a re-run
after an upstream release fetches every changed file again instead of measuring
the previous revision.

Missing keys are safe at runtime (they fall back to English), so a partial
translation can ship.

## 2a. Publish manually

```bash
npm publish --access public --otp=<code>
```

The account must have 2FA enabled: npm requires two-factor authentication or a
granular access token with bypass 2FA enabled to create and publish packages,
and the maintainer's account must have 2FA turned on.

## 2b. Publish with trusted publishing (no token)

One-time setup on npmjs.com → the package → **Settings → Trusted Publisher**:

| Field | Value |
|---|---|
| Publisher | GitHub Actions |
| Organization or user | `SMSMy` |
| Repository | `dsh-arabic` |
| Workflow filename | `publish.yml` |

Then every GitHub **release** publishes automatically through
[`.github/workflows/publish.yml`](../.github/workflows/publish.yml), which runs
the same gates and adds a **provenance attestation** linking the tarball to the
commit. You can also trigger it manually from the Actions tab.

> npm has no "pending" publisher for a package that does not exist yet, which is
> why the first publish is manual and trusted publishing is configured after it.

## 3. Tag and release

```bash
git commit -am "release: v0.1.1"
git tag -a v0.1.1 -m "dsh-arabic 0.1.1"
git push && git push origin v0.1.1
gh release create v0.1.1 --title "dsh-arabic 0.1.1" --notes-file <notes>
```

Creating the release triggers the publish workflow when trusted publishing is
configured.

## 4. Verify what users get

```bash
npm view dsh-arabic version dist.tarball

# download the published tarball and run the suites against it
tmp=$(mktemp -d) && cd "$tmp" && npm pack dsh-arabic@latest --silent | tail -1 | xargs tar -xzf
cd package && node -e "console.log(require('./package.json').version)"
```

## 5. Listing in the visual market

The market (`dshmarket`) only installs plugins listed in the curated
[awesome-dsh-plugin](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin)
registry. The entry for this plugin is
[`market/SMSMy__dsh-arabic.yml`](../market/SMSMy__dsh-arabic.yml) — copy it to
`data/plugins/SMSMy__dsh-arabic.yml` in a fork of that repository and open a pull
request. Two rules matter there:

- the submission repository must be **at least one day old**;
- `package.json` must declare `dsh.bundle` (this one does).
