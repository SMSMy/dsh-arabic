/**
 * check-bidi-family.mjs — the live-status family stays a recorded decision.
 *
 * The family is censused in `scripts/lib/live-status.mjs` and the decisions live in
 * `data/bidi-decisions.json`. This gate compares the two and fails on the exact key
 * that broke the record — an isolation nobody recorded, a record whose value is no
 * longer isolated, or a mixed-script value that has not been decided yet.
 *
 * Why a gate at all: wrapping one value in LRI/PDI looks harmless and is not. In an
 * LTR block it changes nothing; in an RTL block it moves the ellipsis. A "fix the
 * whole family" pass would therefore alter every content string at once, silently.
 * The gate does not forbid isolation — it demands that each one is chosen and
 * explained.
 *
 * Usage: node scripts/check-bidi-family.mjs
 */

import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { liveStatusFamily, readDecisions, familyProblems } from './lib/live-status.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const family = liveStatusFamily(ROOT)
const decisions = readDecisions(ROOT)
const problems = familyProblems(family, decisions)

const count = (test) => [...family].filter(([, v]) => test(v)).length

if (problems.length) {
  console.error(`FAIL  live-status family: ${problems.length} problem(s) against data/bidi-decisions.json`)
  for (const problem of problems) console.error(`        ${problem}`)
  process.exit(1)
}

console.log(
  `PASS  live-status family ${family.size} · isolated ${count((v) => v.isolated)} · ` +
  `mixed-script ${count((v) => v.mixed)} — every one on record`
)
