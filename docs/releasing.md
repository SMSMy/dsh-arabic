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
npm test

# the committed browser half must match its generator
node scripts/build-client.mjs
git diff --exit-code lib/client.js
```

If upstream DSH added strings, translate them first:

```bash
GITHUB_TOKEN=$(gh auth token) npm run extract   # refresh the English key set
node scripts/build-client.mjs --check           # list the new keys
node scripts/assemble-translations.mjs --from translations
npm run build && npm test
```

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
