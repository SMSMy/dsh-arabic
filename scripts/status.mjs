/**
 * status.mjs — translation debt in one screen.
 *
 * Answers the question a language pack lives or dies by: how far is this pack
 * from the upstream key set, and against which upstream revision was that
 * measured? `data/en-catalog.meta.json` records the ref and commit that
 * `scripts/extract-catalog.mjs` last pulled, so "stale" has a precise meaning.
 *
 * Run: node scripts/status.mjs [--check]
 *   --check  exit 1 when any key is untranslated (used by the sync workflow)
 */

import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const check = process.argv.includes('--check')

const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'))
const english = JSON.parse(readFileSync(join(ROOT, 'data', 'en-catalog.json'), 'utf8'))
const metaPath = join(ROOT, 'data', 'en-catalog.meta.json')
const meta = existsSync(metaPath) ? JSON.parse(readFileSync(metaPath, 'utf8')) : null
const arPath = join(ROOT, 'locales', 'ar.json')
const arabic = existsSync(arPath) ? JSON.parse(readFileSync(arPath, 'utf8')) : {}

let total = 0
const missing = []
for (const [ns, dict] of Object.entries(english)) {
  for (const [key, en] of Object.entries(dict)) {
    total++
    const value = arabic[ns] && arabic[ns][key]
    if (typeof value !== 'string' || (en.trim() && !value.trim())) missing.push(`${ns}#${key}`)
  }
}
const translated = total - missing.length
const coverage = total ? ((translated / total) * 100).toFixed(1) : '0.0'

const lines = [
  `dsh-arabic ${pkg.version}`,
  '',
  `upstream ref     : ${meta ? meta.ref : 'unknown'}`,
  `upstream commit  : ${meta ? String(meta.commit).slice(0, 12) : 'unknown'}`,
  `extracted at     : ${meta ? meta.extractedAt : 'unknown'}`,
  '',
  `namespaces       : ${Object.keys(english).length}`,
  `keys             : ${total}`,
  `translated       : ${translated}`,
  `coverage         : ${coverage}%`,
]
if (missing.length) {
  lines.push('', `untranslated (${missing.length}) — they fall back to English at runtime:`)
  for (const id of missing.slice(0, 25)) lines.push(`  ${id}`)
  if (missing.length > 25) lines.push(`  … and ${missing.length - 25} more`)
}

const report = lines.join('\n')
console.log(report)

// GitHub Actions job summary, when running in CI.
if (process.env.GITHUB_STEP_SUMMARY) {
  const out = ['## dsh-arabic coverage', '', '```', report, '```', ''].join('\n')
  try { await import('node:fs/promises').then((fs) => fs.appendFile(process.env.GITHUB_STEP_SUMMARY, out)) } catch {}
}

process.exit(check && missing.length ? 1 : 0)
