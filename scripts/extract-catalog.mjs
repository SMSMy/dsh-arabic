/**
 * extract-catalog.mjs — rebuild `data/en-catalog.json` from the official sources.
 *
 * The Arabic pack is keyed by the *official* key set, so this script is the
 * authority for what a translation must cover. Run it when DSH ships new UI
 * strings: the diff of `data/en-catalog.json` is exactly the list of keys a
 * translator has to add.
 *
 * What it does:
 *   1. lists the official repo tree and picks every locale dictionary source
 *      (a `locales.ts`, a `locale.ts`, or any file inside a `locales` folder,
 *      excluding tests)
 *   2. finds every `locale.register(...)` call site (GitHub code search) so each
 *      dictionary can be mapped to the namespace it is actually registered under
 *   3. downloads both sets into `.cache/extract/` (cached — re-runs are local)
 *   4. transpiles each dictionary with esbuild (bundling siblings when a file
 *      composes its dictionary from other files) and reads the exported English
 *      dictionary out of a sandboxed evaluation
 *   5. writes `data/en-catalog.json` and prints a coverage report
 *
 * Requirements: Node 20+, network, and a GitHub token for code search
 *   GITHUB_TOKEN=$(gh auth token) node scripts/extract-catalog.mjs
 * `esbuild` is an optional devDependency (npm i -D esbuild) used only here.
 *
 * Upstream: https://github.com/deepseek-ai/deepseek-harness (MIT).
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import vm from 'node:vm'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const CACHE = join(ROOT, '.cache', 'extract')
const OWNER = 'deepseek-ai'
const REPO = 'deepseek-harness'
const REF = process.env.DSH_REF || 'master'
const TOKEN = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || ''

let esbuild = null
try {
  esbuild = await import('esbuild')
} catch (err) {
  console.error('esbuild is required: npm i -D esbuild')
  process.exit(1)
}

const api = async (path) => {
  const response = await fetch(`https://api.github.com${path}`, {
    headers: Object.assign(
      { accept: 'application/vnd.github+json', 'user-agent': 'dsh-arabic-extract' },
      TOKEN ? { authorization: `Bearer ${TOKEN}` } : {}
    )
  })
  if (!response.ok) throw new Error(`GitHub ${response.status} on ${path}: ${(await response.text()).slice(0, 200)}`)
  return response.json()
}

const raw = async (path) => {
  // The cache keeps the real directory structure: composed dictionaries import
  // their siblings by relative path, and the esbuild fallback needs them.
  const cached = join(CACHE, ...path.split('/'))
  if (existsSync(cached)) return readFileSync(cached, 'utf8')
  const response = await fetch(`https://raw.githubusercontent.com/${OWNER}/${REPO}/${REF}/${path}`)
  if (!response.ok) throw new Error(`raw ${response.status} for ${path}`)
  const text = await response.text()
  mkdirSync(dirname(cached), { recursive: true })
  writeFileSync(cached, text)
  return text
}

mkdirSync(CACHE, { recursive: true })

/* ------------------------------------------------------------- 1. the tree --- */

console.log(`1/5  listing ${OWNER}/${REPO}@${REF}`)
const tree = await api(`/repos/${OWNER}/${REPO}/git/trees/${REF}?recursive=1`)
const paths = tree.tree.filter((entry) => entry.type === 'blob').map((entry) => entry.path)
const head = await api(`/repos/${OWNER}/${REPO}/commits/${REF}`)
console.log(`     ${paths.length} paths at ${String(head.sha).slice(0, 12)}`)

const isDictionary = (path) =>
  path.startsWith('packages/') &&
  !/\/tests?\//.test(path) &&
  (/(^|\/)[a-z0-9-]*locales?\.ts$/.test(path) || /\/locales?\/[^/]+\.ts$/.test(path))

const dictionaryPaths = paths.filter(isDictionary).sort()
console.log(`     ${dictionaryPaths.length} dictionary sources`)

/* -------------------------------------------------- 2. register call sites --- */

console.log('2/5  searching for locale.register call sites')
const sites = []
// GitHub code search may return a short page before the result set is empty,
// so paginate until an empty page rather than trusting the first page length.
for (let page = 1; page <= 10; page += 1) {
  const result = await api(`/search/code?q=repo:${OWNER}/${REPO}+%22locale.register%22&per_page=100&page=${page}`)
  const items = result.items || []
  console.log(`     page ${page}: ${items.length} result(s)${page === 1 ? ` of ${result.total_count}` : ''}`)
  for (const item of items) sites.push(item.path)
  if (items.length === 0) break
}
const sitePaths = [...new Set(sites)]
  .filter((path) => /\.(ts|js)$/.test(path) && !/\/tests?\//.test(path))
  .sort()
console.log(`     ${sitePaths.length} call sites`)

/* ------------------------------------------------------------ 3. download --- */

console.log('3/5  fetching sources (cached in .cache/extract)')
const dictionaries = new Map()
const callSites = new Map()
for (const path of dictionaryPaths) dictionaries.set(path, await raw(path))
for (const path of sitePaths) callSites.set(path, await raw(path))

/* ----------------------------------------------------------- 4. evaluation --- */

const isStringDict = (value) =>
  value && typeof value === 'object' && !Array.isArray(value) &&
  Object.keys(value).length > 0 && Object.values(value).every((v) => typeof v === 'string')

const runInVm = (code) => {
  const module = { exports: {} }
  const factory = new vm.Script('(function (exports, module, require) {' + code + '\n})')
  factory.runInThisContext()({}, module, (id) => { throw new Error('runtime import ' + id) })
  return module.exports
}

const evaluate = async (path) => {
  const source = dictionaries.get(path)
  try {
    return runInVm((await esbuild.transform(source, { loader: 'ts', format: 'cjs', target: 'node20' })).code)
  } catch (err) {
    const built = await esbuild.build({
      stdin: { contents: source, loader: 'ts', resolveDir: join(CACHE, dirname(path)), sourcefile: path },
      bundle: true, format: 'cjs', platform: 'node', write: false, logLevel: 'silent'
    })
    return runInVm(built.outputFiles[0].text)
  }
}

console.log('4/5  evaluating dictionaries')
const parsed = []
for (const path of dictionaryPaths) {
  const textConsts = {}
  for (const m of dictionaries.get(path).matchAll(/export const ([A-Za-z_$][A-Za-z0-9_$]*)\s*=\s*'([^']*)'/g)) {
    textConsts[m[1]] = m[2]
  }
  let exportsFace = null
  try { exportsFace = await evaluate(path) } catch (err) { /* composed file without siblings cached */ }
  const dicts = {}
  const consts = { ...textConsts }
  for (const [name, value] of Object.entries(exportsFace || {})) {
    if (isStringDict(value)) dicts[name] = value
    else if (typeof value === 'string') consts[name] = value
  }
  parsed.push({ path, dicts, consts })
}

/* ---------------------------------------------------- 5. namespace + write --- */

console.log('5/5  resolving namespaces')
const packageOf = (path) => path.split('/src/')[0]
const constantsByPackage = new Map()
for (const item of parsed) {
  if (!Object.keys(item.consts).length) continue
  const key = packageOf(item.path)
  const bag = constantsByPackage.get(key) || new Map()
  for (const [name, value] of Object.entries(item.consts)) if (!bag.has(name)) bag.set(name, value)
  constantsByPackage.set(key, bag)
}

const localConstants = new Map()
for (const [path, source] of callSites) {
  const bag = new Map()
  for (const m of source.matchAll(/(?:export\s+)?const\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*=\s*'([^']*)'/g)) bag.set(m[1], m[2])
  // Keyed by full path: many packages own an `index.ts`, so basenames collide.
  localConstants.set(path, bag)
}

const catalog = {}
const used = new Set()
let unresolved = 0
for (const [path, source] of callSites) {
  const pkg = packageOf(path)
  const local = localConstants.get(path)
  const bag = constantsByPackage.get(pkg)
  for (const m of source.matchAll(/locale\.register\(\s*([A-Za-z0-9_$.]+|'[^']*'|"[^"]*")\s*,\s*(\{[^}]*\})/g)) {
    const arg = m[1]
    const short = arg.replace(/^.*\./, '')
    let ns = null
    if (/^['"]/.test(arg)) ns = arg.slice(1, -1)
    else if (local?.has(arg)) ns = local.get(arg)
    else if (local?.has(short)) ns = local.get(short)
    else if (bag?.has(arg)) ns = bag.get(arg)
    else if (bag?.has(short)) ns = bag.get(short)
    if (!ns) {
      unresolved += 1
      if (unresolved <= 5 && process.env.DSH_DEBUG) {
        console.log(`     DEBUG unresolved: pkg=${pkg} arg=${arg}`)
        console.log(`           local consts: ${local ? [...local.keys()].join(',') : '(none)'}`)
        console.log(`           pkg consts  : ${bag ? [...bag.keys()].join(',') : '(none)'}`)
      }
      continue
    }
    const dictNames = [...m[2].matchAll(/\b([A-Za-z_$][A-Za-z0-9_$]*)\s*:/g)].map((x) => x[1])
    for (const item of parsed) {
      if (!item.path.startsWith(pkg + '/') || !Object.keys(item.dicts).length) continue
      const enName = item.dicts.en ? 'en' : Object.keys(item.dicts).find((n) => /en$/i.test(n))
      if (!enName) continue
      if (dictNames.length && !dictNames.includes(enName)) continue
      catalog[ns] = Object.assign(catalog[ns] || {}, item.dicts[enName])
      used.add(item.path)
    }
  }
}

const sorted = {}
for (const ns of Object.keys(catalog).sort()) {
  sorted[ns] = {}
  for (const key of Object.keys(catalog[ns]).sort()) sorted[ns][key] = catalog[ns][key]
}
writeFileSync(join(ROOT, 'data', 'en-catalog.json'), JSON.stringify(sorted, null, 2) + '\n')

const totalKeys = Object.values(sorted).reduce((n, dict) => n + Object.keys(dict).length, 0)
// The revision this key set was measured against, so "stale" has a precise
// meaning for scripts/status.mjs and the weekly sync workflow.
writeFileSync(join(ROOT, 'data', 'en-catalog.meta.json'), JSON.stringify({
  ref: REF,
  commit: head.sha,
  extractedAt: new Date().toISOString(),
  namespaces: Object.keys(sorted).length,
  keys: totalKeys
}, null, 2) + '\n')
console.log(`\nnamespaces ${Object.keys(sorted).length} · keys ${totalKeys} · upstream ${String(head.sha).slice(0, 12)}`)
console.log(`${unresolved} register call(s) unresolved · ${used.size}/${parsed.length} dictionaries used`)
console.log('wrote data/en-catalog.json — the diff against the previous revision is the new translation worklist')
