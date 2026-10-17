/**
 * check-bench.mjs — the direction layer's cost, asserted against the record.
 *
 * `tests/verify-rtl.mjs --bench` counts the style reads one full pass performs
 * over a page of prose. A style read is a reflow and the count is deterministic
 * in the shim, so it is the number this gate defends; wall time is printed and
 * never asserted, because it moves with the machine and a gate that fails on
 * noise gets switched off. The baseline lives in data/bench-baseline.json with
 * the machine it was recorded on.
 *
 * Run: node scripts/check-bench.mjs [blocks]
 */

import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const baseline = JSON.parse(readFileSync(join(ROOT, 'data', 'bench-baseline.json'), 'utf8'))
const blocks = Number(process.argv[2]) || baseline.blocks

let output = ''
try {
  output = execFileSync(process.execPath, [join(ROOT, 'tests', 'verify-rtl.mjs'), '--bench', String(blocks)], {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  })
} catch (err) {
  // The behaviour suite exits non-zero when a check failed; its tail is the reason.
  const tail = String(err.stdout || '').trim().split('\n').slice(-6).join('\n')
  console.error(tail || String(err.message || err))
  console.error('bench: the behaviour suite did not pass, so its cost means nothing')
  process.exit(1)
}

const reads = /style reads:\s*(\d+)/.exec(output)
const wall = /bench\s+wall:\s*([\d.]+)\s*ms/.exec(output)
if (!reads) {
  console.error(output)
  console.error('bench: could not read the style-read count out of the suite output')
  process.exit(1)
}

const measured = Number(reads[1])
console.log(
  `bench  blocks ${blocks} · style reads ${measured} (baseline ${baseline.styleReads})` +
    (wall ? ` · wall ${wall[1]} ms (recorded ${baseline.wallMs} ms, not asserted)` : '')
)

if (measured > baseline.styleReads) {
  console.error(`bench: REGRESSION — ${measured} style reads, the baseline allows ${baseline.styleReads}.`)
  console.error('bench: if the extra cost is deliberate, raise data/bench-baseline.json in the same change and say why.')
  process.exit(1)
}
console.log('bench: within budget')
