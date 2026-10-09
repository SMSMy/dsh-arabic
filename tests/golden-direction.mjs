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

  // A Windows path that runs through an Arabic folder name is a path, not prose:
  // the backslash is a technical separator, so the token does not vote — which is
  // what keeps a block of paths LTR (otherwise its own Latin runs get re-ordered
  // around the Arabic segment, and the path reads backwards).
  ['"C:\\Users\\hshli\\Downloads\\Compressed\\الخطوط\\thmanyahseriftext"', null, 'a quoted Windows path through an Arabic folder is a code token'],
  ['D:\\مشروع\\الواجهة\\assets\\logo.svg', null, 'the same path without quotes'],
  ['افتح C:\\Code-backup\\dsh-arabic\\الخطوط ثم عدّل', 'rtl', 'the same path inside Arabic prose does not vote'],
  ['نسخ الملفات إلى D:\\مشروع\\الواجهة\\assets فورًا', 'rtl', 'Arabic prose carrying a mixed path still flips'],

  // English prose is never flipped, even when it quotes Arabic.
  ['The build failed while parsing سلام in the config file.', null, 'English prose quoting one word'],
  ['This is a long English sentence with one Arabic word كلمة inside it', null, 'same, longer'],
  ['pure english paragraph, should stay untouched', null, 'pure English'],
  ['Run npm install and then restart the server', null, 'plain Latin words still vote'],
  ['git status', null, 'command only'],
  ['Saved', null, 'single word'],
  ['12345', null, 'digits only'],

  // A double-quoted span is ONE unit: a quotation is an object inside the
  // sentence, not a heap of words that can outvote it.
  ['شغّل "git status"', 'rtl', 'a quoted command is one unit, not two Latin words'],
  ['افتح "npm run build" ثم أعد المحاولة', 'rtl', 'quoted words do not outvote the prose'],
  ['"مرحبا بكم في التطبيق"', 'rtl', 'a quoted Arabic phrase is Arabic'],
  ['شغّل "git status', 'rtl', 'an unclosed quotation is the same unit while streaming'],
  ['أرسل "continue" ليواصل الموديل.', 'rtl', 'a quoted English word inside an Arabic notice'],
  ['The field says "سلام" and stops', null, 'English prose quoting one Arabic word stays LTR'],

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

/* What counts as a code token, pinned at the mechanism level. A separator only
   makes a token code-like when there is a word character on both sides of it, so
   a label such as `Note:` still votes while `src/index.ts` still does not. */
const probes = [
  ['Note:', 1, 'a trailing colon is punctuation, not code — the word still votes'],
  ['Error:', 1, 'same for an error label'],
  ['src/index.ts', 0, 'a real path is still a code token'],
  ['@deepseek-ai/dsh', 0, 'a scoped package name is still a code token'],
  ['15/15', 0, 'a ratio is still a code token'],
  ['"git status"', 1, 'a quoted span is one unit — one Latin word, not two'],
  ['git status', 2, 'the same words unquoted still vote twice'],
  ['"C:\\Users\\hshli\\Downloads\\Compressed\\الخطوط\\thmanyahseriftext"', 0, 'a Windows path with an Arabic folder votes for nothing'],
  ['D:\\مشروع\\الواجهة\\assets\\logo.svg', 0, 'a path is a path even when two of its segments are Arabic'],
  ['ملف.نهائي', 0, 'an Arabic word with a dot is prose, not a code token']
]
for (const [text, expectedLtr, label] of probes) {
  const w = window.__dshArabic.weigh(text)
  const ok = w.ltr === expectedLtr
  failed += ok ? 0 : 1
  console.log(`${ok ? 'PASS' : 'FAIL'}  ltr=${w.ltr} ${ok ? '' : `(want ${expectedLtr}) `}${label}`)
}

console.log(`\n${matrix.length + probes.length - failed}/${matrix.length + probes.length} golden cases passed — ${fileURLToPath(new URL('..', import.meta.url))}`)
process.exit(failed === 0 ? 0 : 1)
