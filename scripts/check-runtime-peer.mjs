/**
 * check-runtime-peer.mjs — does the declared DSH peer range accept the DSH that
 * is actually installed?
 *
 * The host refuses to import a plugin whose `@deepseek-ai/dsh` peer range does
 * not match the running runtime (dsh-app-boot's `evaluatePluginCompatibility`),
 * and the refusal is invisible from inside the plugin: no fiber, no injection,
 * and the page simply never gets the layer. That is exactly how a range recorded
 * against the wrong version took this plugin down for one boot.
 *
 * The version to check is NOT `dsh --version` (that may be another install on
 * PATH). It is the `version` field of
 * `dsh/node_modules/@deepseek-ai/dsh-app-boot/package.json` inside the installed
 * archive — the same file the host reads.
 *
 * Run: node scripts/check-runtime-peer.mjs [path/to/app.asar]
 * Skips (exit 0) when there is no archive, so CI stays meaningful.
 */

import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readAsarFile } from './lib/asar.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const MANIFEST = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'))

/* ------------------------------------------------------------- semver core ---
 * A deliberately small subset: comparators `>=`, `<=`, `>`, `<`, `=` and exact
 * versions, with prerelease ordering per semver. The host evaluates ranges with
 * `includePrerelease: true`, so a prerelease runtime participates in a plain
 * comparison — that is the semantics implemented here.
 *
 * Unsupported syntax is an ERROR, never a pass: a guard that cannot read the
 * range must not report comfort. `test --self` below proves the comparator
 * against the cases that matter before any manifest is judged.
 */

function parseVersion(text) {
  // A comparator may carry a partial version: `<1` means `<1.0.0`, `>=0.2` means
  // `>=0.2.0`. Missing parts read as zero, which is the bound they express.
  const m = /^v?(\d+)(?:\.(\d+))?(?:\.(\d+))?(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/.exec(String(text).trim())
  if (!m) return null
  return {
    major: Number(m[1]),
    minor: m[2] === undefined ? 0 : Number(m[2]),
    patch: m[3] === undefined ? 0 : Number(m[3]),
    pre: m[4] ? m[4].split('.') : []
  }
}

function compareId(a, b) {
  const aNum = /^\d+$/.test(a)
  const bNum = /^\d+$/.test(b)
  if (aNum && bNum) return Number(a) - Number(b)
  if (aNum) return -1
  if (bNum) return 1
  return a < b ? -1 : a > b ? 1 : 0
}

function compareVersions(a, b) {
  for (const k of ['major', 'minor', 'patch']) if (a[k] !== b[k]) return a[k] < b[k] ? -1 : 1
  if (!a.pre.length && !b.pre.length) return 0
  if (!a.pre.length) return 1
  if (!b.pre.length) return -1
  const n = Math.max(a.pre.length, b.pre.length)
  for (let i = 0; i < n; i++) {
    if (a.pre[i] === undefined) return -1
    if (b.pre[i] === undefined) return 1
    const c = compareId(a.pre[i], b.pre[i])
    if (c) return c
  }
  return 0
}

function satisfies(version, range) {
  const versionParsed = parseVersion(version)
  if (!versionParsed) return { ok: false, error: `unreadable runtime version ${JSON.stringify(version)}` }
  const parts = String(range).trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return { ok: false, error: 'empty range' }
  for (const part of parts) {
    const m = /^(>=|<=|>|<|=)?(.+)$/.exec(part)
    const op = m[1] || '='
    const target = parseVersion(m[2])
    if (!target) {
      // A caret, tilde, wildcard, hyphen range or OR is out of scope on purpose.
      return { ok: false, error: `unsupported comparator ${JSON.stringify(part)} — this guard understands plain comparator sets only` }
    }
    const c = compareVersions(versionParsed, target)
    const ok = op === '>=' ? c >= 0 : op === '<=' ? c <= 0 : op === '>' ? c > 0 : op === '<' ? c < 0 : c === 0
    if (!ok) return { ok: false }
  }
  return { ok: true }
}

/* ------------------------------------------------------------- comparator --- */

const SELF_TESTS = [
  ['0.2.0-rc.2', '>=0.2.0-0 <1', true, 'the runtime this plugin was broken on'],
  ['0.2.0-rc.2', '>=0.2.1-0 <1', false, 'the range that took the plugin down'],
  ['0.2.1-alpha.2', '>=0.2.1-0 <1', true, 'the CLI version that misled a manual check'],
  ['0.3.0', '>=0.2.0-0 <1', true, 'a later minor'],
  ['1.0.0', '>=0.2.0-0 <1', false, 'a future major']
]

let comparatorBroken = false
for (const [version, range, expected, why] of SELF_TESTS) {
  const got = satisfies(version, range)
  if (got.error) {
    comparatorBroken = true
    console.error(`self-test: ${why}: ${got.error}`)
  } else if (got.ok !== expected) {
    comparatorBroken = true
    console.error(`self-test: ${why}: expected ${expected} for ${version} in ${range}, got ${got.ok}`)
  }
}
if (comparatorBroken) {
  console.error('runtime-peer: the comparator disagrees with the recorded cases — refusing to judge the manifest')
  process.exit(2)
}

/* ---------------------------------------------------------------- archive --- */

const CANDIDATES = [
  process.argv[2],
  process.env.DSH_ASAR,
  process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, 'Programs', 'DeepSeek Harness', 'resources', 'app.asar'),
  'C:/Program Files/DeepSeek Harness/resources/app.asar',
  '/Applications/DeepSeek Harness.app/Contents/Resources/app.asar',
  '/opt/deepseek-harness/resources/app.asar'
].filter(Boolean)

const archive = CANDIDATES.find((candidate) => existsSync(candidate))
if (!archive) {
  console.log('runtime-peer: SKIP — no installed app.asar found (pass one as an argument to check it)')
  process.exit(0)
}

const appBootPath = 'dsh/node_modules/@deepseek-ai/dsh-app-boot/package.json'
let runtimeVersion = ''
try {
  const manifest = JSON.parse(await readAsarFile(archive, appBootPath))
  runtimeVersion = manifest.version
} catch (err) {
  console.error(`runtime-peer: could not read ${appBootPath} out of ${archive}: ${err.message}`)
  process.exit(1)
}
if (!runtimeVersion) {
  console.error(`runtime-peer: ${appBootPath} carries no version`)
  process.exit(1)
}

/* ------------------------------------------------------------------ peers --- */

const peers = Object.entries(MANIFEST.peerDependencies || {}).filter(
  ([name]) => name === '@deepseek-ai/dsh' || name.startsWith('@deepseek-ai/dsh-')
)

console.log(`runtime-peer: dsh ${runtimeVersion} (${archive})`)
if (!peers.length) {
  console.log('runtime-peer: no @deepseek-ai/dsh peer is declared — nothing the host can refuse')
  process.exit(0)
}

let failed = 0
for (const [name, range] of peers) {
  const result = satisfies(runtimeVersion, range)
  if (result.error) {
    console.error(`runtime-peer: ${name} ${JSON.stringify(range)} — ${result.error}`)
    failed++
  } else if (!result.ok) {
    console.error(`runtime-peer: ${name} ${JSON.stringify(range)} does NOT accept dsh ${runtimeVersion}`)
    console.error('runtime-peer: the host would refuse to import this plugin at boot. Widen the range, or')
    console.error(`runtime-peer: grant an exact-version exemption (dsh plugin allow-version) before shipping.`)
    failed++
  } else {
    console.log(`runtime-peer: ${name} ${JSON.stringify(range)} accepts dsh ${runtimeVersion}`)
  }
}
process.exit(failed ? 1 : 0)
