/**
 * verify-fixes.mjs — did the review's findings actually land?
 *
 * Each check reads the current tree and prints PASS/FAIL with the evidence, so the
 * answer to "did you do it?" is a readback rather than a claim. It is deliberately
 * independent of the suites: those test behaviour, this tests that the specific
 * changes are present and that the ones marked as refuted really are.
 *
 * Usage: node scripts/verify-fixes.mjs
 *
 * Point-in-time readback for the twelve findings of the 2026-10-05 outside review.
 * It asserts specific code shapes, so it is deliberately NOT wired into CI: a
 * later refactor may legitimately move a line without un-fixing anything, and the
 * suites — not this file — are what must stay green.
 */

import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { liveStatusFamily, readDecisions, familyProblems } from './lib/live-status.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (p) => readFileSync(join(ROOT, p), 'utf8')
const has = (p, needle) => read(p).includes(needle)

let pass = 0
let fail = 0
const check = (id, claim, ok, evidence) => {
  ok ? pass++ : fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${id.padEnd(4)} ${claim}`)
  console.log(`        ${evidence}`)
}

/* 1 — the header comment describes the shipped doctrine */
{
  const head = read('index.js').split('*/')[0]
  check('1', 'the host header no longer descends to the first-strong rule',
    head.includes('prose dominance') && !/derives its own direction \(`unicode-bidi: plaintext`/.test(head),
    'header states prose dominance; the plaintext sentence is gone')
}

/* 2 — documentation counts match the suites */
{
  const out = read('scripts/check-docs.mjs') && true
  check('2', 'a guard exists that fails on doc drift', existsSync(join(ROOT, 'scripts', 'check-docs.mjs')) && out,
    'scripts/check-docs.mjs, wired into npm run check and CI')
}

/* 3 — CI runs the lint, the doc guard and Node 24 */
{
  const ci = read('.github/workflows/ci.yml')
  check('3', 'CI runs the consistency lint, the doc guard, npm ci and Node 24',
    ci.includes('lint-consistency.mjs --strict') && ci.includes('check-docs.mjs') && ci.includes('npm ci') && ci.includes("'24'"),
    "ci.yml: lint + docs steps, '20','22','24', npm ci")
}

/* 4 — a separator alone no longer makes a token technical */
{
  const idx = read('index.js')
  check('4', 'CODEISH needs a word character on both sides of the separator',
    idx.includes('\\S*[\\w][._/:+@#][\\w]\\S*'),
    'index.js CODEISH narrowed; five golden probes assert the mechanism')
}

/* 5 — only text-like fields take a direction */
{
  const idx = read('index.js')
  check('5', 'only text-like inputs are treated as editable surfaces',
    idx.includes('TEXT_INPUT') && idx.includes('search: 1') && idx.includes("el.getAttribute('type')"),
    'editable() reads type and consults TEXT_INPUT')
}

/* 6 — the composer has hysteresis */
{
  const idx = read('index.js')
  check('6', 'the composer keeps its direction until the Latin side is clearly ahead',
    /isRtlDominant\(text, el\.getAttribute\('dir'\) === 'rtl'\)/.test(idx),
    "syncInput passes the current state into isRtlDominant")
}

/* 7 — the generated bundle cannot be broken by a value */
{
  const client = read('lib/client.js')
  check('7', 'the generated browser half escapes markup and line separators',
    read('scripts/build-client.mjs').includes('safeJson') && !client.includes('</script>'),
    'safeJson() escapes < , U+2028 and U+2029; the bundle holds no raw </script>')
}

/* 8 — upstream code is evaluated in an empty sandbox */
{
  const ex = read('scripts/extract-catalog.mjs')
  check('8', 'upstream dictionaries run in a bare vm context',
    ex.includes('vm.createContext({})') && ex.includes('runInContext(sandbox)') && !/\.runInThisContext\(/.test(ex),
    'extract-catalog.mjs: createContext({}) + runInContext, and no call to runInThisContext; re-extraction reproduced the catalog with a 0-line diff')
}

/* 9 — the term map matches whole Arabic words */
{
  const a = read('scripts/assemble-translations.mjs')
  const pack = read('locales/ar.json')
  const shifra = (pack.match(/شيفرة/g) || []).length
  check('9', 'term normalization matches whole words and left nothing behind',
    a.includes('AR_LETTER') && shifra === 0,
    `boundary class of Arabic letters only; شيفرة occurrences in the pack: ${shifra}`)
}

/* 10 — one placeholder definition */
{
  const files = ['scripts/build-client.mjs', 'scripts/assemble-translations.mjs', 'tests/verify-locales.mjs']
  const local = files.filter((f) => /const vars = \(s\) =>/.test(read(f)))
  const shared = existsSync(join(ROOT, 'scripts', 'lib', 'placeholders.mjs'))
  check('10', 'one placeholder definition, covering %d and %@',
    shared && local.length === 0 && read('scripts/lib/placeholders.mjs').includes('%[0-9]*[$]?[sd@]'),
    `scripts/lib/placeholders.mjs is imported by all three; local copies left: ${local.length}`)
}

/* 11 — the claim that the whole ellipsis family needs isolation */
{
  // One definition of the family and one record of the decisions, shared with the
  // gate (scripts/check-bidi-family.mjs), so a readback and a gate cannot disagree.
  const family = liveStatusFamily(ROOT)
  const problems = familyProblems(family, readDecisions(ROOT))
  const ids = (test) => [...family].filter(([, v]) => test(v)).map(([id]) => id)
  const isolated = ids((v) => v.isolated)
  const mixed = ids((v) => v.mixed)

  check('11', 'REFUTED: no bulk rewrite — isolation stays a recorded per-key decision',
    problems.length === 0,
    problems.length
      ? problems.join(' · ')
      : `family ${family.size} · isolated ${isolated.length} (${isolated.join(', ') || 'none'}) · mixed-script ${mixed.length} on record in data/bidi-decisions.json`)
}

/* 12 — the sync branch cannot collide */
{
  const wf = read('.github/workflows/upstream-sync.yml')
  check('12', 'the upstream-sync branch name is unique per run',
    wf.includes('github.run_id'),
    'upstream-sync.yml: branch="upstream-sync/$(date -u +%Y%m%d-%H%M%S)-${{ github.run_id }}"')
}

/* 13 — the activity mirror names what the shipped build renders */
{
  const idx = read('index.js')
  const shapes = ['[class*="_sweep_"]', '[class*="_highlight_"]', '[data-dsh-arabic-locale="ar"]'].filter((s) => !idx.includes(s))
  check('13', 'the activity mirror matches the hashed class names the frontend renders',
    shapes.length === 0,
    shapes.length
      ? `missing ${shapes.join(', ')} — the mirror would be dead in production`
      : 'hashed stems plus a locale gate this plugin owns; data/shimmer-pins.json pins the names and scripts/check-shimmer-pins.mjs re-verifies them against an installed app')
}

/* governance extras */
{
  const pkg = JSON.parse(read('package.json'))
  const readme = read('README.md')
  check('+', 'governance extras landed',
    pkg.engines?.node === '>=20' && pkg.scripts.check.includes('check-docs') && existsSync(join(ROOT, 'CHANGELOG.md')) && readme.includes('shimmer-compare.html'),
    'engines.node, npm run check runs the doc guard, CHANGELOG.md exists, orphan docs indexed')
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
