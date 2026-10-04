/**
 * verify-locales.mjs — offline checks for the Arabic language pack.
 *
 * Three layers:
 *   1. catalog integrity  — every official key has an Arabic string, and every
 *      placeholder survived translation byte-for-byte.
 *   2. artifact contract  — lib/client.js registers with the shared module
 *      loader, uses no externals, and its factory returns a plugin shape.
 *   3. registration       — running the real client half against a mock locale
 *      service adds the "ar" language once and registers every namespace.
 *
 * Run: node tests/verify-locales.mjs
 */

import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import vm from 'node:vm'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const results = []
const check = (label, ok, extra = '') => results.push({ label, ok, extra })

/* --------------------------------------------------- 1. catalog integrity --- */

const english = JSON.parse(readFileSync(join(ROOT, 'data', 'en-catalog.json'), 'utf8'))
const arabic = JSON.parse(readFileSync(join(ROOT, 'locales', 'ar.json'), 'utf8'))

const vars = (s) => (s.match(/\{[a-zA-Z0-9_.]+\}|%s|\{\{?[a-zA-Z0-9_]+\}?\}/g) || []).sort().join(',')

let total = 0
const missing = []
const placeholderMismatch = []
const identical = []
for (const [ns, enDict] of Object.entries(english)) {
  for (const [key, en] of Object.entries(enDict)) {
    total++
    const ar = arabic[ns] && arabic[ns][key]
    // An empty English value has an empty Arabic value: that IS the translation.
    const hasCopy = typeof en === 'string' && en.trim().length > 0
    if (typeof ar !== 'string' || (hasCopy && !ar.trim())) { missing.push(`${ns}#${key}`); continue }
    if (vars(en) !== vars(ar)) placeholderMismatch.push(`${ns}#${key}`)
    // Identical Arabic is only suspicious for real sentences. A developer tool
    // legitimately keeps many Latin values: URLs, package names, brand and
    // protocol names, app proper names, and slash-command words. Strip those
    // shapes first, then treat a 4+ word string (or one ending in sentence
    // punctuation) as prose that should have been translated.
    const stripped = String(en)
      .replace(/https?:\/\/\S+/g, ' ')        // URLs
      .replace(/\S+@\S+\.\S+/g, ' ')          // emails
      .replace(/\{[a-zA-Z0-9_.]+\}|%s/g, ' ') // placeholders
      .replace(/\S*[/@:._-]\S*/g, ' ')        // identifiers, paths, package names
      .replace(/[^A-Za-z]/g, ' ')
      .trim()
    const words = stripped.split(/\s+/).filter(Boolean)
    const looksLikeSentence = words.length >= 4 || /[.!?]$/.test(String(en).trim())
    if (ar === en && looksLikeSentence) identical.push(`${ns}#${key}`)
  }
}

const namespaces = Object.keys(english).length
check(`catalog covers ${total} keys across ${namespaces} namespaces`, total > 0)
check('no missing translations', missing.length === 0, missing.slice(0, 5).join(', '))
check('placeholders preserved', placeholderMismatch.length === 0, placeholderMismatch.slice(0, 5).join(', '))
check('no untranslated prose left', identical.length === 0, identical.slice(0, 5).join(', '))

/* --------------------------------------------------- 2. artifact contract --- */

const clientPath = join(ROOT, 'lib', 'client.js')
check('lib/client.js exists', existsSync(clientPath))
let captured = null
if (existsSync(clientPath)) {
  const source = readFileSync(clientPath, 'utf8')
  const sandbox = {
    window: { __ModuleLoader__: { load: (mod) => { captured = mod } } },
    require: () => { throw new Error('client half must not require anything') }
  }
  sandbox.window.window = sandbox.window
  vm.createContext(sandbox)
  new vm.Script(source).runInContext(sandbox)
  check('registers with __ModuleLoader__.load', captured !== null && captured.id === 'dsh-arabic')
  check('no external requires', !/\brequire\(/.test(source.replace('factory: function (require)', '')))
}

/* ------------------------------------------------------- 3. registration --- */

if (captured) {
  const moduleObj = { exports: {} }
  const exportsFace = captured.factory(() => { throw new Error('no externals expected') })
  const plugin = exportsFace || moduleObj.exports
  check('factory returns module.exports', !!plugin && typeof plugin === 'object')
  check('plugin declares the locale service', Array.isArray(plugin.inject) && plugin.inject.includes('locale'))
  check('plugin exposes apply()', typeof plugin.apply === 'function')

  const added = []
  const registered = []
  const ctx = {
    effect: (fn) => { const dispose = fn(); return dispose },
    locale: {
      addLanguage: (language) => { added.push(language); return () => {} },
      register: (ns, locale, dict) => { registered.push({ ns, locale, keys: Object.keys(dict).length }); return () => {} }
    }
  }
  if (typeof plugin.apply === 'function') plugin.apply(ctx)

  check('adds the Arabic language once', added.length === 1 && added[0].id === 'ar', JSON.stringify(added))
  check('language label is the Arabic endonym', added[0] && added[0].label === 'العربية', added[0] && added[0].label)
  check('language falls back to English', added[0] && added[0].fallback === 'en')
  check('registers every namespace for ar', registered.length === namespaces, `${registered.length} vs ${namespaces}`)
  check('every registration targets ar', registered.every((r) => r.locale === 'ar'))
  const registeredKeys = registered.reduce((n, r) => n + r.keys, 0)
  check('registered key count matches the catalog', registeredKeys === total, `${registeredKeys} vs ${total}`)
}

/* ----------------------------------------------------------------- report --- */

let failed = 0
for (const r of results) {
  if (!r.ok) failed++
  console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.label}${r.extra ? `  (${r.extra})` : ''}`)
}
console.log(`\n${results.length - failed}/${results.length} locale checks passed`)
process.exit(failed === 0 ? 0 : 1)
