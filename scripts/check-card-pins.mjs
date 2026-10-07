/**
 * check-card-pins.mjs — does the shipped app still build the question card the way the layer assumes?
 *
 * The composer's question card is the one surface where text takes a direction
 * without moving a control: its question lives inside the card's own
 * `<header>`/`<footer>` (so those tags must not read as shell landmarks), and
 * each option is a flex `<button>` whose label and description are `<span>`
 * cells (so those cells must be recognized as blockified text blocks). Both are
 * contracts with DSH internals, and both fail silently — the card then reads
 * exactly as it does without this plugin, which is how it shipped broken. This
 * reads the pinned facts out of an installed archive and fails, naming the
 * difference, when a build moves them.
 *
 * It cannot run in CI (no DSH install there), so it is a release step — see
 * docs/releasing.md — while the shapes it protects are asserted in
 * tests/verify-rtl.mjs.
 *
 * Usage: node scripts/check-card-pins.mjs <path-to-app.asar> [--pins other.json]
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { asarFiles, readAsarFile } from './lib/asar.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)
const archive = args.find((a) => !a.startsWith('--'))
const pinsArg = args.indexOf('--pins')
const pinsPath = pinsArg === -1 ? join(ROOT, 'data', 'card-pins.json') : args[pinsArg + 1]

if (!archive) {
  console.error('usage: node scripts/check-card-pins.mjs <path-to-app.asar> [--pins other.json]')
  process.exit(2)
}

const pins = JSON.parse(readFileSync(pinsPath, 'utf8'))
const indexSource = readFileSync(join(ROOT, 'index.js'), 'utf8')
const failures = []
let passes = 0

const pass = (label, detail) => { passes++; console.log(`PASS  ${label}${detail ? `  (${detail})` : ''}`) }
const fail = (label, detail) => { failures.push(label); console.log(`FAIL  ${label}  — ${detail}`) }

const files = await asarFiles(archive)
const modulePath = files.find((file) => file.endsWith(pins.module))
if (!modulePath) {
  fail('the question-card module ships', `${pins.module} not found in the archive`)
  console.log('')
  console.log(`0 passed, ${failures.length} failed — update data/card-pins.json against the app you are packaging for`)
  process.exit(1)
}
const bundle = (await readAsarFile(archive, modulePath)).toString('utf8')

/* 1. the frame still carries the marker the layer keys on. */
bundle.includes(pins.frame.source)
  ? pass('the card frame still carries its marker', pins.frame.attribute)
  : fail('the card frame still carries its marker', `${pins.frame.source} is gone: the card's own <header> would read as shell chrome again`)

/* 2. the card still draws its own header and footer, which is why the exemption exists. */
for (const [tag, needle] of Object.entries(pins.landmarks)) {
  if (tag === 'note') continue
  bundle.includes(needle)
    ? pass(`the card still builds its own <${tag}>`, needle)
    : fail(`the card still builds its own <${tag}>`, `${needle} is gone: re-check whether index.js still needs the exemption`)
}

/* 3. the option row is still a flex row, so its label and description cells are
      blockified text blocks rather than inline runs. */
const classOf = {}
for (const key of pins.cells.classes) {
  const match = bundle.match(new RegExp(`"${key}": "([^"]+)"`))
  if (match) classOf[key] = match[1]
}
const missingCells = pins.cells.classes.filter((key) => !classOf[key])
missingCells.length
  ? fail('the option markup still names its cells', `missing class map entries: ${missingCells.join(', ')}`)
  : pass('the option markup still names its cells', pins.cells.classes.join(' '))

for (const key of pins.cells.flex) {
  const className = classOf[key]
  if (!className) continue
  const rule = bundle.match(new RegExp(`\\.${className}\\{[^}]*\\}`))
  const isFlex = rule !== null && rule[0].includes(pins.cells.hint)
  isFlex
    ? pass(`the option ${key} is still a flex container`, `${pins.cells.hint} in .${className}`)
    : fail(`the option ${key} is still a flex container`, `no ${pins.cells.hint} rule for .${className}: the cells would stay inline and lose their direction`)
}

/* 4. this plugin still carries both halves of the contract. */
const wanted = [
  ['the layer still exempts the card through its marker', pins.plugin.marker],
  ['the layer still probes for a blockified cell', pins.plugin.probe],
  ['the walk still prefers a real candidate', 'isBlockCandidate']
]
for (const [label, needle] of wanted) {
  indexSource.includes(needle)
    ? pass(label, needle)
    : fail(label, `${needle} is missing from index.js`)
}

const metaPath = files.find((file) => file.endsWith(`${pins.app.package}/package.json`))
if (metaPath) {
  const meta = JSON.parse((await readAsarFile(archive, metaPath)).toString('utf8'))
  console.log(`note  ${meta.name} ${meta.version} in this archive (pins verified against ${pins.app.version})`)
}

console.log('')
if (failures.length) {
  console.log(`${passes} passed, ${failures.length} failed — re-verify against the app and update data/card-pins.json`)
  process.exit(1)
}
console.log(`${passes} passed, 0 failed — the question card still has the shape the layer handles`)
