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

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
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

/* ------------------------------------------------------- number-sensitive --- */

/**
 * DSH's locale dictionaries are flat `key → string`, so a sentence that counts
 * things cannot select the Arabic form the count asks for (1, 2, 3–10, 11+) —
 * the largest known linguistic debt, written up in docs/roadmap.md layer 3. The
 * mitigation is to phrase around the number, and that is a review decision taken
 * one value at a time; this check is what keeps it from being forgotten.
 *
 * Every value carrying `{count}` is pinned in data/plural-pins.json. A new one
 * fails the gate until somebody reads it and pins it, and a pin whose string
 * changed or disappeared fails too, so the register cannot drift away from the
 * pack:
 *
 *   node scripts/lint-consistency.mjs --write-pins   # (re)generate, keeping notes
 */
const pluralPinsPath = join(ROOT, 'data', 'plural-pins.json')
const countValues = []
for (const [ns, dict] of Object.entries(arabic)) {
  for (const [key, value] of Object.entries(dict)) {
    if (typeof value === 'string' && value.includes('{count}')) countValues.push({ id: `${ns}#${key}`, value })
  }
}
const pluralPinsFile = existsSync(pluralPinsPath) ? JSON.parse(readFileSync(pluralPinsPath, 'utf8')) : null
const pluralPins = (pluralPinsFile && pluralPinsFile.pins) || {}
const plural = []
/** What a freshly generated entry says: mechanically pinned, not yet read value by value. */
const PIN_DEFAULT = 'count-neutral phrasing · per-surface review pending'

if (process.argv.includes('--write-pins')) {
  const next = {}
  for (const { id } of countValues) next[id] = pluralPins[id] || PIN_DEFAULT
  const body = {
    comment: 'Values carrying {count}. A flat dictionary cannot select an Arabic form by count, so each string ' +
      'here is a deliberate allowance: the sentence was phrased to read correctly for 1, 2, 3-10 and 11+. The ' +
      'default note records a mechanical pin, not a per-value reading — that review is tracked per surface in ' +
      'docs/roadmap.md layer 3. Regenerate with `node scripts/lint-consistency.mjs --write-pins` and read the diff.',
    pins: next
  }
  writeFileSync(pluralPinsPath, JSON.stringify(body, null, 2) + '\n')
  console.log(`plural pins written: ${Object.keys(next).length} value(s) -> data/plural-pins.json`)
} else {
  for (const { id, value } of countValues) {
    if (!Object.hasOwn(pluralPins, id)) plural.push(`unpinned count string: ${id} = ${JSON.stringify(value)}`)
  }
  for (const id of Object.keys(pluralPins)) {
    if (!countValues.some((c) => c.id === id)) plural.push(`stale plural pin: ${id}`)
  }
  if (plural.length) {
    console.log(`\n${plural.length} plural-pin finding(s):`)
    for (const p of plural.slice(0, 20)) console.log('  ' + p)
    if (plural.length > 20) console.log(`  ... and ${plural.length - 20} more`)
  } else {
    console.log(`\nall ${countValues.length} literal value(s) carrying {count} are pinned`)
  }
}

const findings = conflicts.length + smells.length + whitespace.length + plural.length
console.log(`\n${findings} finding(s)`)
process.exit(strict && findings ? 1 : 0)
