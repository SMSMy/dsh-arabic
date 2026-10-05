/**
 * assemble-translations.mjs — merge translated chunk files into locales/ar.json.
 *
 * The translation work is split into chunk files (one per batch) so several
 * contributors (or agents) can work in parallel without touching each other.
 * Each chunk is `{ "<namespace>#<key>": "<Arabic>" }`, exactly the ids emitted
 * by scripts/extract-catalog.mjs from the official DSH sources.
 *
 * Run: node scripts/assemble-translations.mjs [--from <dir>]
 *   --from  directory holding *.ar.json chunks (default: ./translations)
 *
 * The command is strict: it fails on unknown ids, missing ids, empty values and
 * placeholder drift, so a broken batch can never reach lib/client.js.
 */

import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const argIndex = process.argv.indexOf('--from')
const FROM = argIndex !== -1 && process.argv[argIndex + 1]
  ? process.argv[argIndex + 1]
  : join(ROOT, 'translations')

const english = JSON.parse(readFileSync(join(ROOT, 'data', 'en-catalog.json'), 'utf8'))

if (!existsSync(FROM)) {
  console.error(`no translation directory at ${FROM}`)
  process.exit(1)
}

const files = readdirSync(FROM).filter((f) => f.endsWith('.ar.json')).sort()
if (!files.length) {
  console.error(`no *.ar.json files in ${FROM}`)
  process.exit(1)
}

/* ---------------------------------------------------------------- merge --- */

const merged = {}
const problems = []
const seen = new Set()
let chunks = 0

for (const file of files) {
  const data = JSON.parse(readFileSync(join(FROM, file), 'utf8'))
  chunks++
  for (const [id, value] of Object.entries(data)) {
    const hash = id.indexOf('#')
    if (hash === -1) { problems.push(`${file}: id without namespace: ${id}`); continue }
    const ns = id.slice(0, hash)
    const key = id.slice(hash + 1)
    if (!english[ns] || !(key in english[ns])) { problems.push(`${file}: unknown id ${id}`); continue }
    if (seen.has(id)) { problems.push(`${file}: duplicate id ${id}`); continue }

    const en = english[ns][key]
    const structuralWhitespace = typeof en === 'string' && en.length > 0 && !en.trim()
    if (structuralWhitespace) {
      // A value that is only whitespace is structure (a separator), not copy:
      // it must keep its exact form in every language.
      merged[ns] = merged[ns] || {}
      merged[ns][key] = en
      seen.add(id)
      continue
    }
    if (typeof en === 'string' && en === '') {
      // No copy at all — an empty translation is the correct translation.
      merged[ns] = merged[ns] || {}
      merged[ns][key] = ''
      seen.add(id)
      continue
    }
    if (typeof value !== 'string' || !value.trim()) { problems.push(`${file}: empty value for ${id}`); continue }
    seen.add(id)
    merged[ns] = merged[ns] || {}
    merged[ns][key] = value.trim()
  }
}

/* ------------------------------------------------- structural whitespace --- */

// A value like "Completed in " carries a deliberate trailing space because the
// app concatenates something after it. Whitespace is structure, not copy: copy
// the English padding onto the Arabic so concatenation never glues words.
let padded = 0
for (const [ns, dict] of Object.entries(merged)) {
  for (const key of Object.keys(dict)) {
    const en = english[ns] && english[ns][key]
    if (typeof en !== 'string' || !en) continue
    const lead = en.match(/^\s*/)[0]
    const trail = en.match(/\s*$/)[0]
    if (!lead && !trail) continue
    const before = dict[key]
    let value = before
    if (lead) value = lead + value.replace(/^\s+/, '')
    if (trail) value = value.replace(/\s+$/, '') + trail
    if (value !== before) { dict[key] = value; padded++ }
  }
}

/* ------------------------------------------------------------- overrides --- */

const overridesPath = join(ROOT, 'data', 'overrides.json')
let applied = 0
if (existsSync(overridesPath)) {
  const overrides = JSON.parse(readFileSync(overridesPath, 'utf8'))
  for (const [id, value] of Object.entries(overrides)) {
    if (id.startsWith('_')) continue
    const hash = id.indexOf('#')
    const ns = id.slice(0, hash)
    const key = id.slice(hash + 1)
    if (!english[ns] || !(key in english[ns])) { problems.push(`override for unknown id: ${id}`); continue }
    if (!seen.has(id)) { problems.push(`override for untranslated id: ${id}`); continue }
    if (merged[ns][key] === value) continue
    merged[ns][key] = value
    applied++
  }
}

/* ------------------------------------------------------- term normalization --- */

// A glossary is a promise across batches. These replacements enforce the few
// decisions that a parallel batch can silently split (code, system prompt).
const termMapPath = join(ROOT, 'data', 'term-map.json')
let termsApplied = 0
const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
/**
 * Arabic LETTERS only — not the whole block. Punctuation (the Arabic comma
 * U+060C, Arabic-Indic digits) sits inside \u0600-\u06FF, so a block-wide test
 * refuses to match a term followed by «،» and silently skips it.
 */
const AR_LETTER = '[\\u0620-\\u064A\\u066E-\\u06D3\\u06D5\\u06EE-\\u06EF\\u06FA-\\u06FF\\u0750-\\u077F\\u08A0-\\u08FF\\uFB50-\\uFDFF\\uFE70-\\uFEFF]'
if (existsSync(termMapPath)) {
  const { terms = [] } = JSON.parse(readFileSync(termMapPath, 'utf8'))
  for (const [from, to] of terms) {
    // Arabic-aware boundaries. A blind split/join rewrites the term inside any
    // longer word it happens to sit in, so a future compound would silently ship
    // corrupted copy. The term now only matches as a word of its own; the list
    // stays ordered longest-first, which is what makes الشيفرة win over شيفرة.
    const pattern = new RegExp('(?<!' + AR_LETTER + ')' + escapeRegExp(from) + '(?!' + AR_LETTER + ')', 'g')
    for (const [ns, dict] of Object.entries(merged)) {
      for (const key of Object.keys(dict)) {
        if (typeof dict[key] === 'string' && pattern.test(dict[key])) {
          pattern.lastIndex = 0
          dict[key] = dict[key].replace(pattern, to)
          termsApplied++
        }
        pattern.lastIndex = 0
      }
    }
  }
}

/* ------------------------------------------------------------- validate --- */

const vars = (s) => (s.match(/\{[a-zA-Z0-9_.]+\}|%s|\{\{?[a-zA-Z0-9_]+\}?\}/g) || []).sort().join(',')
for (const [ns, dict] of Object.entries(english)) {
  for (const key of Object.keys(dict)) {
    const id = `${ns}#${key}`
    if (!seen.has(id)) continue
    if (vars(dict[key]) !== vars(merged[ns][key])) {
      problems.push(`placeholder drift: ${id} — en:[${vars(dict[key])}] ar:[${vars(merged[ns][key])}]`)
    }
  }
}

const totalKeys = Object.values(english).reduce((n, d) => n + Object.keys(d).length, 0)
const doneKeys = seen.size
const coverage = ((doneKeys / totalKeys) * 100).toFixed(1)

console.log(`chunks merged      : ${chunks}`)
console.log(`namespaces covered : ${Object.keys(merged).length} / ${Object.keys(english).length}`)
console.log(`keys covered       : ${doneKeys} / ${totalKeys} (${coverage}%)`)
console.log(`overrides applied  : ${applied}`)
console.log(`term replacements  : ${termsApplied}`)
console.log(`padding restored   : ${padded}`)

if (problems.length) {
  console.error(`\n${problems.length} problem(s):`)
  for (const p of problems.slice(0, 30)) console.error('  ' + p)
  if (problems.length > 30) console.error(`  ... and ${problems.length - 30} more`)
  process.exit(1)
}

/* ----------------------------------------------------------------- write --- */

const sorted = {}
for (const ns of Object.keys(merged).sort()) {
  sorted[ns] = {}
  for (const key of Object.keys(merged[ns]).sort()) sorted[ns][key] = merged[ns][key]
}

mkdirSync(join(ROOT, 'locales'), { recursive: true })
writeFileSync(join(ROOT, 'locales', 'ar.json'), JSON.stringify(sorted, null, 2) + '\n')
console.log(`\nwrote locales/ar.json (${Object.keys(sorted).length} namespaces)`)
if (doneKeys < totalKeys) {
  console.log(`note: ${totalKeys - doneKeys} keys still untranslated — they fall back to English at runtime`)
}
