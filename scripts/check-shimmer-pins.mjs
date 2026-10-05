/**
 * check-shimmer-pins.mjs — does the shipped app still name the activity layers as pinned?
 *
 * The activity mirror is CSS aimed at another package's DOM, and the frontend build
 * renames every CSS module class: what the source calls `.sweep` reaches the browser
 * as `_sweep_1rdzk_34`. A rename does not break any build — it silently stops the
 * mirror, which is exactly what happened between 0.2.7 and 0.3.0. This reads the
 * pinned names out of an installed archive and fails, naming the difference, when
 * they move.
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

const files = await asarFiles(archive)

/* 1. the module source still defines the layers, tilts the mask and owns the timing. */
const cssPath = files.find((file) => file.endsWith(pins.source.module))
if (!cssPath) {
  fail('the pinned module ships', `${pins.source.module} not found in the archive`)
} else {
  const css = (await readAsarFile(archive, cssPath)).toString('utf8')
  const missing = pins.source.layers.filter((name) => !new RegExp(`\\${name}\\s*\\{`).test(css))
  missing.length
    ? fail('the module still defines every layer', `missing ${missing.join(', ')}`)
    : pass('the module still defines every layer', pins.source.layers.join(' '))
  css.includes(pins.source.mask)
    ? pass('the source mask angle is the pinned one', pins.source.mask)
    : fail('the source mask angle is the pinned one', `${pins.source.mask} is gone from the module`)
  const timing = [pins.source.duration, pins.source.delay, pins.source.timing].filter((token) => !css.includes(token))
  timing.length
    ? fail("duration, delay and timing are still the app's", `missing ${timing.join(' / ')}`)
    : pass("duration, delay and timing are still the app's", 'the mirror inherits all three')
}

/* 2. what the browser actually loads still carries the hashed names.
   The stylesheet holds both the class rules and the keyframes; the script only
   holds the class map, because the animation names never travel through JS. */
const distDir = pins.served.dir
const served = [
  ['stylesheet', files.find((file) => file.includes(distDir) && file.split('/').pop().startsWith(pins.served.css) && file.endsWith('.css')), true],
  ['script', files.find((file) => file.includes(distDir) && file.split('/').pop().startsWith(pins.served.js) && file.endsWith('.js')), false]
]
for (const [label, asset, wantsKeyframes] of served) {
  if (!asset) {
    fail(`the served ${label} is present`, `no ${pins.served.css}*.${label === 'stylesheet' ? 'css' : 'js'} under ${distDir}`)
    continue
  }
  const text = (await readAsarFile(archive, asset)).toString('utf8')
  const wanted = [
    ...Object.entries(pins.classes).map(([layer, name]) => [`${layer} class ${name}`, name]),
    ...(wantsKeyframes ? Object.entries(pins.keyframes).map(([layer, name]) => [`${layer} keyframes ${name}`, name]) : [])
  ]
  const missing = wanted.filter(([, name]) => !text.includes(name)).map(([name]) => name)
  missing.length
    ? fail(`the served ${label} still carries the pinned names`, missing.join(', '))
    : pass(`the served ${label} still carries the pinned names`, asset.split('/').pop())
}

/* 3. the mirror itself still targets those names, at the mirrored angle. */
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

const primitivesMeta = files.find((file) => file.endsWith('@deepseek-ai/dsh-client-ui-primitives/package.json'))
if (primitivesMeta) {
  const meta = JSON.parse((await readAsarFile(archive, primitivesMeta)).toString('utf8'))
  console.log(`note  primitives ${meta.version} in this archive (pins verified against ${pins.app.version})`)
}

console.log('')
if (failures.length) {
  console.log(`${passes} passed, ${failures.length} failed — re-verify against the app and update data/shimmer-pins.json`)
  process.exit(1)
}
console.log(`${passes} passed, 0 failed — the mirror still names what the app renders`)
