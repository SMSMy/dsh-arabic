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
import { placeholders } from '../scripts/lib/placeholders.mjs'
import vm from 'node:vm'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const results = []
const check = (label, ok, extra = '') => results.push({ label, ok, extra })

/* --------------------------------------------------- 1. catalog integrity --- */

const english = JSON.parse(readFileSync(join(ROOT, 'data', 'en-catalog.json'), 'utf8'))
const arabic = JSON.parse(readFileSync(join(ROOT, 'locales', 'ar.json'), 'utf8'))

const vars = placeholders

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

const fakeReact = {
  useState: (initial) => [typeof initial === 'function' ? initial() : initial, () => {}],
  useEffect: (fn) => { try { fn() } catch (err) {} },
  createElement: (type, props, ...children) => ({ type, props: props || {}, children })
}
const fakeSwitch = (props) => ({ type: 'Switch', props: props || {} })
const externals = {
  react: fakeReact,
  '@deepseek-ai/dsh-client-ui-primitives': { Switch: fakeSwitch }
}

let captured = null
let requiredAtLoad = []
let plugin = null
let sandboxRef = null
if (existsSync(clientPath)) {
  const source = readFileSync(clientPath, 'utf8')
  const sandbox = {
    window: {
      __ModuleLoader__: { load: (mod) => { captured = mod } },
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => {}
    },
    CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init && init.detail } }
  }
  sandbox.window.window = sandbox.window
  sandboxRef = sandbox
  vm.createContext(sandbox)
  new vm.Script(source).runInContext(sandbox)
  check('registers with __ModuleLoader__.load', captured !== null && captured.id === 'dsh-arabic')
  if (captured) {
    plugin = captured.factory((id) => { requiredAtLoad.push(id); return externals[id] })
    check('no external require at load time', requiredAtLoad.length === 0, requiredAtLoad.join(', '))
  }
}

/* ------------------------------------------------------- 3. registration --- */

if (plugin) {
  check('factory returns module.exports', !!plugin && typeof plugin === 'object')
  check('plugin declares the locale service', Array.isArray(plugin.inject) && plugin.inject.includes('locale'))
  check('plugin exposes apply()', typeof plugin.apply === 'function')

  const added = []
  const registered = []
  const localeFace = {
    addLanguage: (language) => { added.push(language); return () => {} },
    register: (ns, locale, dict) => { registered.push({ ns, locale, keys: Object.keys(dict).length }); return () => {} },
    getSnapshot: () => ({ active: 'ar', locales: [], revision: 1 }),
    subscribe: () => () => {}
  }

  // 3a. without a slots seat: the language pack must still install untouched.
  const plainCtx = { effect: (fn) => fn(), locale: localeFace }
  if (typeof plugin.apply === 'function') plugin.apply(plainCtx)
  check('applies with locale only (no slots seat)', added.length === 1 && registered.length === namespaces)
  check('no require when the settings seat is absent', requiredAtLoad.length === 0)

  check('adds the Arabic language once', added.length === 1 && added[0].id === 'ar', JSON.stringify(added))
  check('language label is the Arabic endonym', added[0] && added[0].label === 'العربية', added[0] && added[0].label)
  check('language falls back to English', added[0] && added[0].fallback === 'en')
  check('registers every namespace for ar', registered.length === namespaces, `${registered.length} vs ${namespaces}`)
  check('every registration targets ar', registered.every((r) => r.locale === 'ar'))
  const registeredKeys = registered.reduce((n, r) => n + r.keys, 0)
  check('registered key count matches the catalog', registeredKeys === total, `${registeredKeys} vs ${total}`)

  // 3b. with a slots seat: one General-settings row, registered defensively.
  const injected = []
  const rows = []
  const rowCtx = {
    effect: (fn) => fn(),
    locale: localeFace,
    slots: {
      inject: (name, factory) => { injected.push(name); return factory() },
      register: (options, Component) => { rows.push({ options, Component }); return () => {} }
    }
  }
  let toggled = null
  if (typeof plugin.apply === 'function') plugin.apply(rowCtx)

  check('injects into settings.general.item', injected.includes('settings.general.item'), injected.join(', '))
  check('registers exactly one General row', rows.length === 1)
  check('row id is stable', rows[0] && rows[0].options.id === 'dsh-arabic', rows[0] && rows[0].options.id)
  check('row targets the general item slot', rows[0] && rows[0].options.name === 'settings.general.item')
  check('external require only happens for the row', requiredAtLoad.includes('react') && requiredAtLoad.includes('@deepseek-ai/dsh-client-ui-primitives'), requiredAtLoad.join(', '))

  if (rows[0]) {
    // The row's control talks to the page-level layer through window.__dshArabic.
    // The component runs inside the vm sandbox, so the face must be installed
    // on that realm's window, not on this file's globalThis.
    sandboxRef.window.__dshArabic = {
      isEnabled: () => true,
      setEnabled: (value) => { toggled = value; return value }
    }
    let tree = null
    try { tree = rows[0].Component() } catch (err) { tree = null }
    check('row component renders without throwing', tree !== null)
    const switchNode = tree && tree.children && tree.children.find((c) => c && c.type === fakeSwitch)
    check('row renders the Switch primitive', !!switchNode)
    check('switch is labelled', !!(switchNode && switchNode.props.label), switchNode && switchNode.props.label)
    check('switch reflects the current state', !!(switchNode && switchNode.props.checked === true))
    if (switchNode && typeof switchNode.props.onChange === 'function') {
      switchNode.props.onChange(false)
      check('toggling drives the page layer', toggled === false, String(toggled))
    } else {
      check('toggling drives the page layer', false, 'no onChange')
    }
  }
}

/* ----------------------------------------------------------------- report --- */

let failed = 0
for (const r of results) {
  if (!r.ok) failed++
  console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.label}${r.extra ? `  (${r.extra})` : ''}`)
}
console.log(`\n${results.length - failed}/${results.length} locale checks passed`)
process.exit(failed === 0 ? 0 : 1)

