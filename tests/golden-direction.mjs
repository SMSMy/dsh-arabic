/**
 * golden-direction.mjs — the direction matrix.
 *
 * One table of real strings from a developer's day, each with the direction the
 * layer must choose. It runs the *real* injected script (classify is exposed for
 * exactly this) and needs no DOM beyond what boot() touches.
 *
 * The two cases marked KNOWN LIMIT are asserted as they are on purpose: a
 * command list with more Latin words than Arabic prose does not flip, and that
 * trade-off is documented rather than hidden.
 *
 * Run: node tests/golden-direction.mjs
 */

import { fileURLToPath } from 'node:url'

/* ------------------------------------------------------------- shim ---- */

const empty = { nodeType: 1, tagName: 'DIV', childNodes: [], attributes: new Map(), parentElement: null }
const head = { nodeType: 1, tagName: 'HEAD', childNodes: [], appendChild() {}, attributes: new Map() }
const document = {
  readyState: 'complete',
  head,
  body: empty,
  documentElement: empty,
  createElement: () => ({ nodeType: 1, tagName: 'STYLE', style: {}, id: '', set textContent(v) {}, appendChild() {} }),
  getElementById: () => null,
  querySelectorAll: () => [],
  createTreeWalker: () => ({ nextNode: () => null }),
  addEventListener: () => {}
}
globalThis.document = document
globalThis.window = { localStorage: { getItem: () => null, setItem: () => {} }, dispatchEvent: () => {} }
globalThis.CustomEvent = class { constructor(type, init) { this.type = type; this.detail = init && init.detail } }
globalThis.NodeFilter = { SHOW_TEXT: 4 }
globalThis.MutationObserver = class { observe() {} }

const { default: plugin } = await import('../index.js')
const rows = []
plugin.apply({ on: (event, handler) => handler(rows) })
const scriptRow = rows.find((r) => r.kind === 'script')
if (!scriptRow) throw new Error('no script row')
new Function(scriptRow.text)()
if (!window.__dshArabic || typeof window.__dshArabic.classify !== 'function') {
  throw new Error('classify() was not exposed')
}

/* ------------------------------------------------------------ matrix ---- */

const matrix = [
  // Arabic sentence, Latin first — the case dir="auto" gets wrong.
  ['Hello كيف حالك', 'rtl', 'Latin-first Arabic sentence'],
  ['Error: فشل الاتصال بالخادم', 'rtl', 'error line'],
  ['npm install ثم أعد التشغيل', 'rtl', 'command then Arabic prose'],
  ['شغّل npx @deepseek-ai/dsh web', 'rtl', 'Arabic instruction with a glued command'],
  ['@deepseek-ai/dsh مهم جدًا', 'rtl', 'leading identifier, one technical unit'],
  ['Hello نص', 'rtl', 'tie resolves to RTL'],
  ['كيف حالك Hello', 'rtl', 'Arabic first'],

  // Code-like tokens must not vote.
  ['راجع commit a4c1025b قبل النشر', 'rtl', 'bare sha does not outvote'],
  ['نسبة النجاح 15/15', 'rtl', 'ratio is neutral'],
  ['افتح src/index.ts ثم عدّل الدالة', 'rtl', 'path does not outvote'],
  ['اقرأ README.md أولًا', 'rtl', 'dotted identifier is one unit'],
  ['الملف config.yml مطلوب', 'rtl', 'file name is one unit'],
  ['تحقق من package.json', 'rtl', 'package name is one unit'],
  ['git+https://git@github.com:SMSMy/dsh-arabic.git#a4c1025', null, 'a URL alone has no Arabic'],
  ['راجع https://example.com/docs قبل البدء', 'rtl', 'URL does not outvote prose'],
  ['الخطأ 404 غير موجود', 'rtl', 'numbers are neutral'],

  // English prose is never flipped, even when it quotes Arabic.
  ['The build failed while parsing سلام in the config file.', null, 'English prose quoting one word'],
  ['This is a long English sentence with one Arabic word كلمة inside it', null, 'same, longer'],
  ['pure english paragraph, should stay untouched', null, 'pure English'],
  ['Run npm install and then restart the server', null, 'plain Latin words still vote'],
  ['git status', null, 'command only'],
  ['Saved', null, 'single word'],
  ['12345', null, 'digits only'],

  // Known limits, asserted on purpose.
  ['شغّل git status', null, 'KNOWN LIMIT: two bare Latin words outweigh one Arabic word'],
  ['شغّل الأوامر التالية: npm test, npm run build', null, 'KNOWN LIMIT: a long command list stays LTR'],
]

let failed = 0
for (const [text, expected, label] of matrix) {
  const actual = window.__dshArabic.classify(text)
  const ok = actual === expected
  if (!ok) failed++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${String(expected).padEnd(4)} ${actual === expected ? '' : `(got ${actual}) `}${label}`)
}

/* -------------------------------------------------- hysteresis + counts ---- */

const sticky = window.__dshArabic.weigh('شغّل npx @deepseek-ai/dsh web')
const plain = window.__dshArabic.weigh('شغّل git status')
console.log(`\nweights: glued command -> rtl=${sticky.rtl} ltr=${sticky.ltr} | bare words -> rtl=${plain.rtl} ltr=${plain.ltr}`)

console.log(`\n${matrix.length - failed}/${matrix.length} golden cases passed — ${fileURLToPath(new URL('..', import.meta.url))}`)
process.exit(failed === 0 ? 0 : 1)
