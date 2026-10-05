/**
 * find-live-status.mjs — every string that behaves like a live status line.
 *
 * The app's running indicators share one shape: a label that ends with the
 * ellipsis `···`, often with a duration counter that updates every second. In an
 * RTL run that ellipsis falls to the far left, so the movement reads backwards
 * next to English — the defect reported for `chat.deepDivingFor`. This lists the
 * whole family so any fix is applied as a class, not one string at a time.
 *
 * The family itself is defined once in `scripts/lib/live-status.mjs`, so this
 * census, the gate (`scripts/check-bidi-family.mjs`) and the readback
 * (`scripts/verify-fixes.mjs`) can never disagree about what the family is.
 *
 * Usage: node scripts/find-live-status.mjs [--json out.json]
 */

import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { liveStatusFamily } from './lib/live-status.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

const rows = [...liveStatusFamily(ROOT)]
  .map(([id, entry]) => ({
    id,
    en: entry.english,
    ar: entry.value,
    hasCounter: /\{[^}]*\}/.test(entry.english),
    wrapped: entry.isolated,
    mixed: entry.mixed,
  }))
  .sort((a, b) => a.id.localeCompare(b.id))

console.log(`live-status strings : ${rows.length}  (already isolated: ${rows.filter((r) => r.wrapped).length})`)
console.log(`with a counter      : ${rows.filter((r) => r.hasCounter).length}`)
console.log(`mixed-script        : ${rows.filter((r) => r.mixed).length}`)
for (const r of rows) {
  const tags = `${r.hasCounter ? '  [{counter}]' : ''}${r.mixed ? '  [mixed]' : ''}`
  console.log(`\n  ${r.id}${tags}`)
  console.log(`    en: ${r.en}`)
  console.log(`    ar: ${r.ar || '(missing)'}`)
}

const out = process.argv.indexOf('--json')
if (out !== -1 && process.argv[out + 1]) {
  writeFileSync(process.argv[out + 1], JSON.stringify(rows, null, 2) + '\n')
  console.log(`\nwrote ${process.argv[out + 1]}`)
}
