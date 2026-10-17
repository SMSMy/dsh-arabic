/**
 * check-shimmer-pins.mjs — does the shipped frontend still name the activity layers as pinned?
 *
 * The activity mirror is CSS aimed at another package's DOM, and the frontend build
 * renames every CSS module class: what the source calls `.sweep` reaches the browser
 * as `_sweep_1rdzk_34`. A rename does not break any build — it silently stops the
 * mirror, which is exactly what happened between 0.2.7 and 0.3.0. This reads the
 * hashed names out of the assets the browser actually loads — the stylesheet and
 * script under `@deepseek-ai/dsh-web-frontend/dist/assets/` — and fails, naming the
 * difference, when they move.
 *
 * The module source (`dsh-client-ui-primitives/lib/TextShimmer.module.css`) is checked
 * too when the archive still ships it as its own package, which covers the layout
 * through 0.2.0-rc.2. From 0.2.1-rc.1 that package is compiled into the frontend assets
 * and no longer ships as a directory, so its absence is reported and is not a failure
 * by itself: the served assets above are the real claim. Served assets that are
 * missing are always a failure.
 *
 * It cannot run in CI (no DSH install there), so it is a release step — see
 * docs/releasing.md — while the shapes it protects are asserted in tests/verify-rtl.mjs.
 *
 * Usage: node scripts/check-shimmer-pins.mjs <path-to-app.asar> [--pins other.json]
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { asarFiles, readAsarFile } from './lib/asar.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)
const archive = args.find((a) => !a.startsWith('--'))
const pinsArg = args.indexOf('--pins')
const pinsPath = pinsArg === -1 ? join(ROOT, 'data', 'shimmer-pins.json') : args[pinsArg + 1]

if (!archive) {
  console.error('usage: node scripts/check-shimmer-pins.mjs <path-to-app.asar> [--pins other.json]')
  process.exit(2)
}

const pins = JSON.parse(readFileSync(pinsPath, 'utf8'))
const indexSource = readFileSync(join(ROOT, 'index.js'), 'utf8')
const failures = []
let passes = 0

const pass = (label, detail) => { passes++; console.log(`PASS  ${label}${detail ? `  (${detail})` : ''}`) }
const fail = (label, detail) => { failures.push(label); console.log(`FAIL  ${label}  — ${detail}`) }
const note = (text) => console.log(`note  ${text}`)

/* Minified CSS differs from the source in whitespace and in a dropped leading zero
   (`animation-delay: 0.3s` → `animation-delay:.3s`); neither is a contract change. */
const flat = (text) => text.replace(/\s+/g, '').replace(/:\./g, ':0.')

const files = await asarFiles(archive)

const archiveMeta = async (suffix) => {
  const path = files.find((file) => file.endsWith(suffix))
  if (!path) return null
  return JSON.parse((await readAsarFile(archive, path)).toString('utf8'))
}
const appMeta = await archiveMeta(`${pins.app.package}/package.json`)
const appVersion = appMeta ? appMeta.version : 'an unknown version'

/* 1. the served assets are the source of truth: they are what the browser runs, and
      they exist in both layouts — module shipped separately or compiled into the frontend. */
const servedAsset = (prefix, extension) =>
  files.find((file) =>
    file.includes(pins.served.dir) &&
    file.split('/').pop().startsWith(prefix) &&
    file.endsWith(extension))

const cssAsset = servedAsset(pins.served.css, '.css')
const jsAsset = servedAsset(pins.served.js, '.js')
if (!cssAsset) fail('the served stylesheet is present', `no ${pins.served.css}*.css under ${pins.served.dir}`)
if (!jsAsset) fail('the served script is present', `no ${pins.served.js}*.js under ${pins.served.dir}`)
const cssText = cssAsset ? (await readAsarFile(archive, cssAsset)).toString('utf8') : ''
const jsText = jsAsset ? (await readAsarFile(archive, jsAsset)).toString('utf8') : ''

const namesIn = (text, layer) => {
  const found = new Set()
  for (const match of text.matchAll(new RegExp(`_${layer}_[A-Za-z0-9-]+_\\d+`, 'g'))) found.add(match[0])
  return [...found]
}
for (const [layer, pinnedName] of Object.entries(pins.classes)) {
  const inCss = namesIn(cssText, layer)
  inCss.includes(pinnedName)
    ? pass(`the served stylesheet still names the ${layer} layer`, pinnedName)
    : fail(`the served stylesheet still names the ${layer} layer`, `pinned ${pinnedName} is not there; the stylesheet names ${inCss.join(', ') || 'none'}`)
  const inJs = namesIn(jsText, layer)
  inJs.includes(pinnedName)
    ? pass(`the served script still maps the ${layer} layer`, pinnedName)
    : fail(`the served script still maps the ${layer} layer`, `pinned ${pinnedName} is not there; the script names ${inJs.join(', ') || 'none'}`)
}

/* The stylesheet holds both the class rules and the keyframes; the script only
   holds the class map, because the animation names never travel through JS. */
const declaredKeyframes = new Set()
for (const match of cssText.matchAll(/@keyframes\s+([A-Za-z0-9_-]+)/g)) declaredKeyframes.add(match[1])
for (const [layer, pinnedName] of Object.entries(pins.keyframes)) {
  declaredKeyframes.has(pinnedName)
    ? pass(`the served stylesheet still declares the ${layer} keyframes`, pinnedName)
    : fail(`the served stylesheet still declares the ${layer} keyframes`, `pinned ${pinnedName} is not declared; the stylesheet declares ${[...declaredKeyframes].filter((name) => name.includes('row-shimmer')).join(', ') || 'no row-shimmer keyframes'}`)
}

/* 2. the tilt and the timing the mirror compensates for are still the app's. */
const flatCss = flat(cssText)
const flatPins = {
  mask: flat(pins.source.mask),
  duration: flat(pins.source.duration),
  delay: flat(pins.source.delay)
}
flatCss.includes(flatPins.mask)
  ? pass('the served stylesheet still tilts the mask at the pinned angle', pins.source.mask)
  : fail('the served stylesheet still tilts the mask at the pinned angle', `${pins.source.mask} is not in the served stylesheet`)
flatCss.includes(flatPins.duration)
  ? pass("the served duration is still the app's", pins.source.duration)
  : fail("the served duration is still the app's", `${pins.source.duration} is not in the served stylesheet`)
flatCss.includes(flatPins.delay)
  ? pass("the served delay is still the app's", pins.source.delay)
  : fail("the served delay is still the app's", `${pins.source.delay} is not in the served stylesheet`)
flatCss.includes('steps(48')
  ? pass('the served animation is still stepped', 'steps(48…)')
  : fail('the served animation is still stepped', 'steps(48 is not in the served stylesheet')

/* 3. the module source, when the archive still ships it separately (through 0.2.0-rc.2).
      From 0.2.1-rc.1 it is compiled into the frontend assets: say so plainly, and let
      the served checks above carry the verification instead of failing the assumption. */
const moduleAsset = files.find((file) => file.endsWith(pins.source.module))
if (!moduleAsset) {
  note(`${pins.source.module} is not shipped separately — merged into ${pins.app.package} at ${appVersion}; the served assets above are the source of truth`)
} else {
  const moduleCss = (await readAsarFile(archive, moduleAsset)).toString('utf8')
  const flatModule = flat(moduleCss)
  const missing = pins.source.layers.filter((name) => !new RegExp(`\\${name}\\s*\\{`).test(moduleCss))
  missing.length
    ? fail('the module still defines every layer', `missing ${missing.join(', ')}`)
    : pass('the module still defines every layer', pins.source.layers.join(' '))
  flatModule.includes(flatPins.mask)
    ? pass('the source mask angle is the pinned one', pins.source.mask)
    : fail('the source mask angle is the pinned one', `${pins.source.mask} is gone from the module`)
  const timing = [pins.source.duration, pins.source.delay, pins.source.timing].filter((token) => !flatModule.includes(flat(token)))
  timing.length
    ? fail("duration, delay and timing are still the app's", `missing ${timing.join(' / ')}`)
    : pass("duration, delay and timing are still the app's", 'the mirror inherits all three')
}

/* 4. the mirror itself still targets those names, at the mirrored angle. */
const sourceAngle = Number((pins.source.mask.match(/\((\d+)deg/) || [])[1])
const mirrorAngle = Number((pins.mirror.mask.match(/\((\d+)deg/) || [])[1])
if (!sourceAngle || !mirrorAngle) {
  fail('the pins carry both mask angles', 'source.mask or mirror.mask has no angle')
} else if (sourceAngle + mirrorAngle !== 180) {
  fail("the mirror angle is the supplement of the app's", `${sourceAngle} + ${mirrorAngle} != 180`)
} else if (!indexSource.includes(pins.mirror.mask)) {
  fail('index.js still tilts the mask to the mirrored angle', `${pins.mirror.mask} is not in index.js`)
} else {
  pass("the mirror angle is the supplement of the app's", `${sourceAngle} + ${mirrorAngle} = 180, and index.js carries it`)
}
for (const layer of pins.mirrored) {
  const className = pins.classes[layer]
  if (!className) {
    fail(`the pins name the ${layer} class`, 'no classes entry')
    continue
  }
  const stem = `_${className.split('_')[1]}`               // _sweep_1rdzk_34 -> _sweep
  const selector = `[class*="${stem}_"]`
  indexSource.includes(selector)
    ? pass(`index.js matches the ${layer} layer by its hashed stem`, selector)
    : fail(`index.js matches the ${layer} layer by its hashed stem`, `${selector} is missing: the mirror would be dead in production`)
}

if (appMeta) {
  note(`${appMeta.name} ${appMeta.version} in this archive (pins verified against ${pins.app.version})`)
}

console.log('')
if (failures.length) {
  console.log(`${passes} passed, ${failures.length} failed — re-verify against the app and update data/shimmer-pins.json`)
  process.exit(1)
}
console.log(`${passes} passed, 0 failed — the mirror still names what the app renders`)
