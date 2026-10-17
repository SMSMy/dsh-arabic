/**
 * check-runtime-peer.mjs — does the installed DSH runtime fit the declared
 * peer range, and is it inside the range this plugin was exercised against?
 *
 * The host refuses to import a plugin whose `@deepseek-ai/dsh` peer range does
 * not match the running runtime (dsh-app-boot's `evaluatePluginCompatibility`,
 * evaluated with `includePrerelease: true`), and the refusal is invisible from
 * inside the plugin: no fiber, no injection, and the page simply never gets the
 * layer. That is exactly how a range recorded against the wrong version took
 * this plugin down for one boot.
 *
 * The owner's decision for 0.4.5: the declared range has no upper ceiling. Most
 * DSH releases leave this plugin's integration points untouched, and being
 * silently excluded because the runtime moved past an arbitrary ceiling is worse
 * than running against a version that was not exercised. The floor is
 * `0.2.0-0`: everything at or above it is accepted; everything below it is
 * refused. The gate therefore:
 * - fails only when the runtime is older than that floor;
 * - warns (still accepts) when the runtime is newer than the newest version in
 *   `data/tested-runtimes.json`;
 * - passes silently inside the recorded range.
 *
 * npm's default prerelease rule (`includePrerelease: false`) is reported when it
 * excludes the runtime: the peer is optional, so that is an install-time note,
 * never a boot refusal.
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
 * A deliberately small subset: comparator sets joined by whitespace, branches
 * joined by `||`, comparators `>=`, `<=`, `>`, `<`, `=` and exact versions,
 * with prerelease ordering per semver.
 *
 * Two judges read the same range:
 * - the host, with `includePrerelease: true` — a prerelease runtime compares
 *   like any other version;
 * - npm, with its default `includePrerelease: false` — a prerelease only
 *   participates in a branch that names the same major.minor.patch tuple with
 *   a prerelease tag.
 *
 * Unsupported syntax is an ERROR, never a pass: a guard that cannot read the
 * range must not report comfort. The self-tests below prove the comparator
 * against both judges before any manifest is judged.
 */

function parseVersion(text) {
  // A comparator may carry a partial version (`<1`, `>=0.2`). Missing parts are
  // remembered, because semver widens an operator over a partial before it
  // compares — `<1` is `<1.0.0-0`, not `<1.0.0`.
  const m = /^v?(\d+)(?:\.(\d+))?(?:\.(\d+))?(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/.exec(String(text).trim())
  if (!m) return null
  return {
    major: Number(m[1]),
    minor: m[2] === undefined ? 0 : Number(m[2]),
    patch: m[3] === undefined ? 0 : Number(m[3]),
    minorMissing: m[2] === undefined,
    patchMissing: m[3] === undefined,
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

/** One branch of a range: a whitespace-joined comparator set, parsed or refused. */
function parseComparatorSet(text) {
  const parts = String(text).trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return { error: 'empty comparator set' }
  const comparators = []
  for (const part of parts) {
    const m = /^(>=|<=|>|<|=)?(.+)$/.exec(part)
    let op = m[1] || '='
    const target = parseVersion(m[2])
    if (!target) {
      // A caret, tilde, wildcard or hyphen range is out of scope on purpose.
      return { error: `unsupported comparator ${JSON.stringify(part)} — this guard understands plain comparator sets and || only` }
    }
    if (target.minorMissing || target.patchMissing) {
      // semver's X-range rewrite, for the operators this guard supports.
      if (op === '=') {
        return { error: `partial comparator ${JSON.stringify(part)} — X-ranges are out of scope; send an explicit version` }
      } else if (op === '>') {
        op = '>='
        if (target.minorMissing) { target.major += 1; target.minor = 0 } else { target.minor += 1 }
        target.patch = 0
      } else if (op === '>=') {
        target.minor = 0
        target.patch = 0
      } else if (op === '<') {
        target.minor = target.minorMissing ? 0 : target.minor
        target.patch = 0
        target.pre = ['0']
      } else {
        op = '<'
        if (target.minorMissing) { target.major += 1; target.minor = 0 } else { target.minor += 1 }
        target.patch = 0
        target.pre = ['0']
      }
    }
    comparators.push({ op, target })
  }
  return { comparators }
}

/**
 * One comparator set under one judge. npm's default rule: a prerelease runtime
 * is only considered by a set that names its major.minor.patch tuple with a
 * prerelease tag; the host lets it compare like any other version. Every
 * comparator still has to hold.
 */
function comparatorSetAllows(version, comparators, includePrerelease) {
  if (!includePrerelease && version.pre.length) {
    const sameTuple = comparators.some(({ target }) =>
      target.major === version.major && target.minor === version.minor && target.patch === version.patch && target.pre.length > 0
    )
    if (!sameTuple) return false
  }
  for (const { op, target } of comparators) {
    const c = compareVersions(version, target)
    const ok = op === '>=' ? c >= 0 : op === '<=' ? c <= 0 : op === '>' ? c > 0 : op === '<' ? c < 0 : c === 0
    if (!ok) return false
  }
  return true
}

/**
 * `includePrerelease: true` is the host's judge, `false` is npm's. Any `||`
 * branch may satisfy the range, and a branch that cannot be read is an error
 * for the whole range — a guard must not pass on syntax it does not understand.
 */
function satisfies(version, range, { includePrerelease = true } = {}) {
  const versionParsed = parseVersion(version)
  if (!versionParsed) return { ok: false, error: `unreadable runtime version ${JSON.stringify(version)}` }
  const branches = String(range).split('||')
  const sets = []
  for (const branch of branches) {
    const parsed = parseComparatorSet(branch)
    if (parsed.error) return { ok: false, error: parsed.error }
    sets.push(parsed.comparators)
  }
  return { ok: sets.some((comparators) => comparatorSetAllows(versionParsed, comparators, includePrerelease)) }
}

/* ---------------------------------------------------------------- policy --- */

/** The oldest DSH this plugin supports. Everything at or above it is accepted. */
const FLOOR = '0.2.0-0'

/**
 * The runtimes this plugin has actually been exercised against. A newer runtime
 * is accepted by design; this list only decides whether the gate can stay
 * silent about it.
 */
function loadTested() {
  let body
  try {
    body = JSON.parse(readFileSync(join(ROOT, 'data', 'tested-runtimes.json'), 'utf8'))
  } catch (err) {
    return { error: `cannot read data/tested-runtimes.json — ${err.message}` }
  }
  const entries = Array.isArray(body) ? body : body.runtimes
  if (!Array.isArray(entries) || !entries.length) return { error: 'data/tested-runtimes.json records no runtimes' }
  const tested = []
  for (const entry of entries) {
    const version = typeof entry === 'string' ? entry : entry && entry.version
    if (!version || !parseVersion(version)) return { error: `unreadable recorded runtime ${JSON.stringify(entry)}` }
    tested.push(version)
  }
  return { tested }
}
const recorded = loadTested()
if (recorded.error) {
  console.error(`runtime-peer: ${recorded.error}`)
  process.exit(2)
}
const TESTED = recorded.tested
const NEWEST = TESTED.reduce((newest, version) => {
  const parsed = parseVersion(version)
  return !newest || compareVersions(parsed, newest.parsed) > 0 ? { parsed, text: version } : newest
}, null)

/**
 * The verdict for one runtime under one declared range:
 * - `fail` below the floor, or when the manifest rejects a runtime above it
 *   (that would be a broken range, not a runtime to refuse);
 * - `warn` above the newest recorded runtime — accepted, not exercised;
 * - `pass` inside the recorded range.
 */
function judge(runtime, range) {
  const parsed = parseVersion(runtime)
  if (!parsed) return { level: 'fail', reason: `unreadable runtime version ${JSON.stringify(runtime)}` }
  if (compareVersions(parsed, parseVersion(FLOOR)) < 0) {
    return { level: 'fail', reason: `dsh ${runtime} is older than the supported floor ${FLOOR}` }
  }
  const host = satisfies(runtime, range, { includePrerelease: true })
  const npm = satisfies(runtime, range, { includePrerelease: false })
  if (host.error || npm.error) return { level: 'fail', reason: host.error || npm.error }
  if (!host.ok) {
    return {
      level: 'fail',
      reason: `the declared range ${JSON.stringify(range)} rejects dsh ${runtime} although it is at or above the floor — the manifest and the no-ceiling policy disagree`
    }
  }
  return {
    level: compareVersions(parsed, NEWEST.parsed) > 0 ? 'warn' : 'pass',
    npmAccepted: npm.ok,
    newest: NEWEST.text
  }
}

/* ------------------------------------------------------------- comparator --- */

const OLD_RANGE = '>=0.2.0-0 <1'
/** The declared range since 0.4.5: two branches, no upper ceiling. */
const RANGE = '>=0.2.0-0 <0.2.1-0 || >=0.2.1-0'

/*
 * Each case records the judge it is asserted against: `both` when the two
 * judges agree, `npm` / `host` where that disagreement is the recorded fact.
 */
const SELF_TESTS = [
  ['0.2.0-rc.2', OLD_RANGE, true, 'the runtime this plugin was broken on'],
  ['0.2.0-rc.2', '>=0.2.1-0 <1', false, 'the range that took the plugin down'],
  ['0.2.1-alpha.2', '>=0.2.1-0 <1', true, 'the CLI version that misled a manual check'],
  ['0.3.0', OLD_RANGE, true, 'a later minor'],
  ['1.0.0', OLD_RANGE, false, 'a future major under the old ceiling'],
  ['0.2.1-alpha.5', OLD_RANGE, false, 'npm default semantics: without an OR branch the whole 0.2.1 prerelease line is excluded', 'npm'],
  ['0.2.1-alpha.5', OLD_RANGE, true, 'the host accepts it where npm does not — the install gap the OR branch closes', 'host'],
  ['0.2.1-alpha.5', RANGE, true, 'the 0.2.1 branch exists for this line'],
  ['0.2.0-rc.2', RANGE, true, 'the first branch covers it'],
  ['0.2.1-rc.1', RANGE, true, 'the installed runtime'],
  ['0.2.5', RANGE, true, 'a later patch'],
  ['0.3.0', RANGE, true, 'a later minor'],
  ['1.0.0', RANGE, true, 'the no-ceiling range accepts a future major'],
  ['2.5.0', RANGE, true, 'and a far-future one'],
  ['0.1.9', RANGE, false, 'below the floor'],
  ['1.0.0-beta', RANGE, true, 'a future prerelease: the host accepts it; npm note only, because the peer is optional', 'host'],
  ['0.3.0-beta.2', RANGE, true, 'a new-line prerelease: host accepts, npm note only', 'host']
]

let comparatorBroken = false
for (const [version, range, expected, why, judges = 'both'] of SELF_TESTS) {
  for (const [judgeName, includePrerelease] of [['host', true], ['npm', false]]) {
    if (judges !== 'both' && judges !== judgeName) continue
    const got = satisfies(version, range, { includePrerelease })
    if (got.error) {
      comparatorBroken = true
      console.error(`self-test (${judgeName}): ${why}: ${got.error}`)
    } else if (got.ok !== expected) {
      comparatorBroken = true
      console.error(`self-test (${judgeName}): ${why}: expected ${expected} for ${version} in ${range}, got ${got.ok}`)
    }
  }
}

/* The 0.4.5 policy: newer is warned about, never refused; only below the floor
 * is a failure. */
const POLICY_TESTS = [
  ['0.1.9', 'fail', 'below the 0.2.0-0 floor'],
  ['0.2.0-rc.2', 'pass', 'recorded'],
  ['0.2.1-alpha.2', 'pass', 'recorded'],
  ['0.2.1-alpha.5', 'pass', 'recorded'],
  ['0.2.1-rc.1', 'pass', 'the newest recorded runtime'],
  ['0.2.1', 'warn', 'the stable of the tested line is newer than its rc'],
  ['1.0.0', 'warn', 'a future major: accepted, not exercised'],
  ['2.5.0', 'warn', 'a far-future major: accepted by design'],
  ['0.3.0-beta.2', 'warn', 'a new-line prerelease: accepted, npm note only']
]
for (const [version, expected, why] of POLICY_TESTS) {
  const verdict = judge(version, RANGE)
  if (verdict.level !== expected) {
    comparatorBroken = true
    console.error(`self-test (policy): expected ${expected} for ${version} (${why}), got ${verdict.level}${verdict.reason ? ' — ' + verdict.reason : ''}`)
  }
}

/* Unsupported syntax stays an error, never a pass: caret, tilde, wildcard,
 * hyphen range, partial exact versions, an empty set and a dangling OR. */
const UNSUPPORTED = ['^0.2.0', '~0.2.0', '0.2.x', '0.2.0 - 0.3.0', '*', '', '>=0.2.0 ||', '0.2', '=0.2']
for (const unsupported of UNSUPPORTED) {
  for (const includePrerelease of [true, false]) {
    if (!satisfies('0.2.1', unsupported, { includePrerelease }).error) {
      comparatorBroken = true
      console.error(`self-test: unsupported range ${JSON.stringify(unsupported)} was accepted — the guard must refuse syntax it cannot read`)
    }
  }
}
if (comparatorBroken) {
  console.error('runtime-peer: the self-tests disagree with the recorded cases — refusing to judge the manifest')
  process.exit(2)
}
console.log(`runtime-peer: comparator self-tests pass (${SELF_TESTS.length} version/range cases over both judges, ${UNSUPPORTED.length} unsupported syntaxes refused)`)
console.log(`runtime-peer: policy self-tests pass (${POLICY_TESTS.length} runtimes; floor ${FLOOR}, newest recorded ${NEWEST.text})`)

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
let warned = 0
for (const [name, range] of peers) {
  const verdict = judge(runtimeVersion, range)
  if (verdict.level === 'fail') {
    console.error(`runtime-peer: ${name} ${JSON.stringify(range)} — ${verdict.reason}`)
    if (/older than the supported floor/.test(verdict.reason)) {
      console.error('runtime-peer: the host would refuse to import this plugin at boot. Lower the floor (or widen')
      console.error('runtime-peer: the supported range), or grant an exact-version exemption (dsh plugin allow-version).')
    }
    failed++
    continue
  }
  console.log(`runtime-peer: ${name} ${JSON.stringify(range)} accepts dsh ${runtimeVersion} (no upper ceiling)`)
  if (!verdict.npmAccepted) {
    console.log("runtime-peer: note — npm's default prerelease rule excludes this runtime; the peer is optional, so this is an install-time note, not a boot refusal")
  }
  if (verdict.level === 'warn') {
    warned++
    console.warn(`runtime-peer: WARNING — dsh ${runtimeVersion} is newer than the newest recorded runtime ${verdict.newest}; it was not exercised, but it is accepted by design. Record it in data/tested-runtimes.json after a check.`)
  } else {
    console.log(`runtime-peer: dsh ${runtimeVersion} is inside the recorded range (newest ${verdict.newest})`)
  }
}
if (!failed && !warned) console.log('runtime-peer: OK — the installed runtime is supported and was exercised')
process.exit(failed ? 1 : 0)
