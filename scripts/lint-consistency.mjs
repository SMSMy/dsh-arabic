/**
 * lint-consistency.mjs — cross-chunk terminology consistency for the Arabic pack.
 *
 * Parallel translators produce parallel styles. The most visible defect is the
 * same English string translated two different ways in two places, so this
 * script reports exactly that, plus a few cheap smell checks.
 *
 * Run: node scripts/lint-consistency.mjs [--strict]
 *   --strict  exit 1 on any reported finding (used by CI once the pack is clean)
 */

import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const strict = process.argv.includes('--strict')

const english = JSON.parse(readFileSync(join(ROOT, 'data', 'en-catalog.json'), 'utf8'))
const arPath = join(ROOT, 'locales', 'ar.json')
if (!existsSync(arPath)) {
  console.error('locales/ar.json not found — run scripts/assemble-translations.mjs first')
  process.exit(1)
}
const arabic = JSON.parse(readFileSync(arPath, 'utf8'))

/** Technical strings that may legitimately stay Latin. */
const TECHNICAL = /^[A-Za-z0-9 .,_:/#()\-+%·×*{}]+$/
/**
 * The same coverage the direction layer and the pack use: the Arabic block plus
 * the supplement, the extended-A range (where the Persian and Urdu letters live)
 * and the presentation forms. A narrower test would read an Arabic string as
 * "no Arabic here" and skip exactly the strings that need checking.
 */
const hasArabic = (s) => /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF]/.test(s)

/* ----------------------------------------------- same English, same Arabic --- */

const byEnglish = new Map()
for (const [ns, dict] of Object.entries(arabic)) {
  for (const [key, value] of Object.entries(dict)) {
    const en = english[ns] && english[ns][key]
    if (typeof en !== 'string' || !en.trim()) continue
    if (TECHNICAL.test(en)) continue          // identifiers, numbers, symbols
    if (!hasArabic(value)) continue           // deliberately Latin values
    if (!byEnglish.has(en)) byEnglish.set(en, [])
    byEnglish.get(en).push({ id: `${ns}#${key}`, value })
  }
}

const conflicts = []
for (const [en, uses] of byEnglish) {
  const variants = [...new Set(uses.map((u) => u.value))]
  if (variants.length > 1) conflicts.push({ en, variants, uses })
}

/* --------------------------------------------- identical English = identical --- */

console.log(`consistency lint — ${Object.keys(arabic).length} namespaces, ` +
  `${Object.values(arabic).reduce((n, d) => n + Object.keys(d).length, 0)} translated keys`)

if (conflicts.length) {
  console.log(`\n${conflicts.length} English string(s) translated more than one way:`)
  for (const c of conflicts.slice(0, 25)) {
    console.log(`\n  EN  ${JSON.stringify(c.en)}`)
    for (const v of c.variants) {
      const where = c.uses.filter((u) => u.value === v).map((u) => u.id)
      console.log(`    AR ${JSON.stringify(v)}  ←  ${where.slice(0, 4).join(', ')}${where.length > 4 ? ` (+${where.length - 4})` : ''}`)
    }
  }
  if (conflicts.length > 25) console.log(`\n  ... and ${conflicts.length - 25} more`)
} else {
  console.log('\nno conflicting translations for the same English string')
}

/* ---------------------------------------------------------- smell checks --- */

const smells = []
const whitespace = []
for (const [ns, dict] of Object.entries(arabic)) {
  for (const [key, value] of Object.entries(dict)) {
    const en = english[ns] && english[ns][key]
    if (typeof en !== 'string') continue
    // Format-only values ("{from}–{to}", "~{months}mo") carry no prose to translate.
    const wordish = en.replace(/\{[a-zA-Z0-9_.]+\}|%s|[^A-Za-z]/g, ' ')
    if (!/[A-Za-z]{3,}/.test(wordish)) continue
    if (!hasArabic(value) && en.length > 3 && !TECHNICAL.test(en)) {
      smells.push(`untranslated prose: ${ns}#${key} = ${JSON.stringify(en)} -> ${JSON.stringify(value)}`)
    }
    if (/^[a-z]/.test(value) && hasArabic(value)) {
      smells.push(`starts with a Latin letter: ${ns}#${key} = ${JSON.stringify(value)}`)
    }
    if (value.endsWith('..') && !en.endsWith('..')) {
      smells.push(`suspicious ellipsis: ${ns}#${key} = ${JSON.stringify(value)}`)
    }
    // Structural whitespace: values that pad, join or separate must keep it.
    const enLead = en.match(/^\s*/)[0]
    const enTrail = en.match(/\s*$/)[0]
    const arLead = value.match(/^\s*/)[0]
    const arTrail = value.match(/\s*$/)[0]
    if ((enLead.length > 0 || enTrail.length > 0) && (enLead !== arLead || enTrail !== arTrail)) {
      whitespace.push(`${ns}#${key}: en ${JSON.stringify(en)} -> ar ${JSON.stringify(value)}`)
    }
  }
}

if (whitespace.length) {
  console.log(`\n${whitespace.length} structural-whitespace mismatch(es):`)
  for (const w of whitespace.slice(0, 25)) console.log('  ' + w)
  if (whitespace.length > 25) console.log(`  ... and ${whitespace.length - 25} more`)
}

if (smells.length) {
  console.log(`\n${smells.length} smell(s):`)
  for (const s of smells.slice(0, 20)) console.log('  ' + s)
  if (smells.length > 20) console.log(`  ... and ${smells.length - 20} more`)
} else {
  console.log('no smell findings')
}

const findings = conflicts.length + smells.length + whitespace.length
console.log(`\n${findings} finding(s)`)
process.exit(strict && findings ? 1 : 0)
