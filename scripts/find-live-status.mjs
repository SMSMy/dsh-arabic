/**
 * find-live-status.mjs — every string that behaves like a live status line.
 *
 * The app's running indicators share one shape: a label that ends with the
 * ellipsis `···`, often with a duration counter that updates every second. In an
 * RTL run that ellipsis falls to the far left, so the movement reads backwards
 * next to English — the defect reported for `chat.deepDivingFor`. This lists the
 * whole family so the fix is applied as a class, not one string at a time.
 *
 * Usage: node scripts/find-live-status.mjs [--json out.json]
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const english = JSON.parse(readFileSync(join(ROOT, 'data', 'en-catalog.json'), 'utf8'))
const arabic = JSON.parse(readFileSync(join(ROOT, 'locales', 'ar.json'), 'utf8'))

const rows = []
for (const [ns, dict] of Object.entries(english)) {
  for (const [key, en] of Object.entries(dict)) {
    const isLive = /···|…\s*$/.test(en)
    const hasCounter = /\{[^}]*\}/.test(en)
    if (!isLive) continue
    const ar = (arabic[ns] || {})[key] ?? ''
    rows.push({ id: `${ns}#${key}`, en, ar, hasCounter, wrapped: ar.startsWith('\u2066') })
  }
}

const wrapped = rows.filter((r) => r.wrapped).length
console.log(`live-status strings : ${rows.length}  (already isolated: ${wrapped})`)
console.log(`with a counter      : ${rows.filter((r) => r.hasCounter).length}`)
for (const r of rows.sort((a, b) => a.id.localeCompare(b.id))) {
  console.log(`\n  ${r.id}${r.hasCounter ? '  [{counter}]' : ''}`)
  console.log(`    en: ${r.en}`)
  console.log(`    ar: ${r.ar || '(missing)'}`)
}

const out = process.argv.indexOf('--json')
if (out !== -1 && process.argv[out + 1]) {
  writeFileSync(process.argv[out + 1], JSON.stringify(rows, null, 2) + '\n')
  console.log(`\nwrote ${process.argv[out + 1]}`)
}
