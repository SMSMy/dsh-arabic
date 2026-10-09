/**
 * check-docs.mjs — the numbers in the docs must match the suites.
 *
 * A critique caught the same count stated three ways (21, 34, 41) while the suite
 * printed something else. Prose cannot run itself, so this reads the suites'
 * own output and compares it with every count the documentation claims.
 *
 * Usage: node scripts/check-docs.mjs
 */

import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

/* --------------------------------------------------------- real numbers --- */

const suiteCount = (file, pattern) => {
  const out = execFileSync(process.execPath, [join(ROOT, 'tests', file)], { encoding: 'utf8' })
  const m = out.match(pattern)
  if (!m) throw new Error(`cannot read a count from tests/${file}`)
  return Number(m[1])
}

const truth = {
  direction: suiteCount('verify-rtl.mjs', /(\d+)\/(\d+) direction checks/),
  locale: suiteCount('verify-locales.mjs', /(\d+)\/(\d+) locale checks/),
  golden: suiteCount('golden-direction.mjs', /(\d+)\/(\d+) golden cases/)
}

/* ---------------------------------------------------- claims in the docs --- */

const CLAIMS = [
  // (?<![\d.]) keeps a section number like "2.4 Direction layer" out of the count.
  { label: 'direction', re: /(?<![\d.])(\d+)\**\s+(?:bidi|dir(?:ection)?)\b/gi },
  { label: 'direction', re: /dir(?:ection)?\s+\((\d+)\)/gi },
  { label: 'direction', re: /(\d+)\/(\d+)\s+dir(?:ection)?\s+checks/gi },
  { label: 'locale', re: /(?<![\d.])(\d+)\**\s+locale\b/gi },
  { label: 'locale', re: /locale\s+\((\d+)\)/gi },
  { label: 'golden', re: /(?<![\d.])(\d+)\**\s+golden\b/gi }
]

const files = []
/**
 * Documents that record history rather than describe the current build: a count
 * in them was true when it was written and must not be rewritten by this check.
 */
const HISTORICAL = new Set(['CHANGELOG.md', 'AUDIT.md'])
const walk = (dir) => {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    // agent-kit is a local, gitignored doctrine folder — it is not this project's
    // documentation and its prose is none of this check's business.
    // Scratch and tooling trees hold drafts and old tarballs, not this project's
    // documentation: .tmp is gitignored working space, .cache is extraction output.
    if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'translations' || entry.name === 'agent-kit' || entry.name === '.tmp' || entry.name === '.cache') continue
    const full = join(dir, entry.name)
    if (entry.isDirectory()) walk(full)
    else if (entry.name.endsWith('.md') && !HISTORICAL.has(entry.name)) files.push(full)
  }
}
walk(ROOT)

const problems = []
let checked = 0
for (const file of files) {
  const text = readFileSync(file, 'utf8')
  const relative = file.slice(ROOT.length + 1)
  for (const claim of CLAIMS) {
    for (const match of text.matchAll(claim.re)) {
      const value = Number(match[match.length - 1])
      checked++
      if (value !== truth[claim.label]) {
        const line = text.slice(0, match.index).split('\n').length
        problems.push(`${relative}:${line} says ${value} ${claim.label}, the suite says ${truth[claim.label]}  ("${match[0].trim()}")`)
      }
    }
  }
}

console.log(`suites   : direction ${truth.direction} · locale ${truth.locale} · golden ${truth.golden}`)
console.log(`claims   : ${checked} number(s) checked across ${files.length} markdown files`)
console.log(`mismatch : ${problems.length}`)
for (const p of problems) console.log(`  ${p}`)
process.exit(problems.length ? 1 : 0)
