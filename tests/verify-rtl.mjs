/**
 * verify-rtl.mjs — offline behaviour check for the direction layer.
 *
 * The client payload normally runs inside the DSH page; there is no browser
 * here, so this test installs a minimal DOM shim and runs the *real* injected
 * script against it, then asserts the direction decisions.
 *
 * The cases that matter most are the ones the first-strong rule (dir="auto",
 * `unicode-bidi: plaintext`) gets wrong: a line that starts with a Latin
 * identifier but is an Arabic sentence.
 *
 * Run: node tests/verify-rtl.mjs
 */

import { fileURLToPath } from 'node:url'

/* ------------------------------------------------------------------ shim --- */

class FakeNode {
  constructor(nodeType, tagName) {
    this.nodeType = nodeType
    this.tagName = tagName ? tagName.toUpperCase() : ''
    this.childNodes = []
    this.parentElement = null
    this.parentNode = null
    this.nodeValue = ''
    this.attributes = new Map()
    this.display = 'block'
    this.value = undefined
    this.isContentEditable = false
  }

  appendChild(child) {
    child.parentNode = this
    child.parentElement = this
    this.childNodes.push(child)
    return child
  }

  get textContent() {
    if (this.nodeType === 3) return this.nodeValue
    return this.childNodes.map((c) => c.textContent).join('')
  }

  set textContent(v) { this.nodeValue = v }

  getAttribute(name) { return this.attributes.has(name) ? this.attributes.get(name) : null }
  setAttribute(name, value) { this.attributes.set(name, String(value)) }
  removeAttribute(name) { this.attributes.delete(name) }
  hasAttribute(name) { return this.attributes.has(name) }

  closest(selector) {
    const parts = selector.split(',').map((s) => s.trim().toLowerCase())
    let node = this
    while (node && node.nodeType === 1) {
      for (const part of parts) {
        const attr = part.match(/^\[([^\]=\]]+)(?:="([^"]*)")?\]$/)
        if (attr) {
          if (node.attributes.has(attr[1]) && (attr[2] === undefined || node.attributes.get(attr[1]) === attr[2])) return node
        } else if (node.tagName === part.toUpperCase()) return node
      }
      node = node.parentElement
    }
    return null
  }

  /** First matching descendant — enough for the selectors this layer uses. */
  querySelector(selector) {
    const parts = selector.split(',').map((s) => s.trim())
    let found = null
    walkAll(this, (n) => {
      if (found || n === this || n.nodeType !== 1) return
      for (const part of parts) {
        const attr = part.match(/^\[([^\]=\]]+)(?:="([^"]*)")?\]$/)
        if (attr) {
          if (n.attributes.has(attr[1]) && (attr[2] === undefined || n.attributes.get(attr[1]) === attr[2])) { found = n; return }
        } else if (n.tagName === part.toUpperCase()) { found = n; return }
      }
    })
    return found
  }
}

const el = (tag) => new FakeNode(1, tag)
const text = (value) => { const n = new FakeNode(3); n.nodeValue = value; return n }

function walkAll(root, visit) {
  visit(root)
  for (const child of root.childNodes) walkAll(child, visit)
}

const document = {
  readyState: 'complete',
  head: el('head'),
  documentElement: el('html'),
  body: el('body'),
  _listeners: [],
  createElement: (tag) => el(tag),
  getElementById: (id) => {
    let found = null
    walkAll(document.head, (n) => { if (n.nodeType === 1 && n.id === id) found = n })
    return found
  },
  querySelectorAll: (selector) => {
    const parts = selector.split(',').map((s) => s.trim())
    const out = []
    walkAll(document.body, (n) => {
      if (n.nodeType !== 1) return
      for (const part of parts) {
        const attr = part.match(/^\[([^\]=\]]+)\]$/)
        if (attr) {
          if (n.attributes.has(attr[1])) { out.push(n); return }
        } else if (n.tagName === part.toUpperCase()) { out.push(n); return }
      }
    })
    return out
  },
  createTreeWalker: (root) => {
    const nodes = []
    walkAll(root, (n) => { if (n.nodeType === 3) nodes.push(n) })
    let index = 0
    return { nextNode: () => (index < nodes.length ? nodes[index++] : null) }
  },
  addEventListener: (type, handler) => { document._listeners.push({ type, handler }) }
}

class MutationObserver {
  constructor(callback) { this.callback = callback }
  observe() { MutationObserver.instances.push(this) }
}
MutationObserver.instances = []

const store = new Map()
globalThis.window = {
  localStorage: {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => { store.set(key, String(value)) }
  },
  dispatchEvent: () => {}
}
globalThis.CustomEvent = class CustomEvent {
  constructor(type, init) { this.type = type; this.detail = init && init.detail }
}
globalThis.document = document
globalThis.NodeFilter = { SHOW_TEXT: 4 }
globalThis.MutationObserver = MutationObserver
globalThis.getComputedStyle = (node) => ({ display: node.display })

/* ---------------------------------------------------------------- fixture --- */

const MARK = 'data-dsh-arabic-bidi'

/** Build a paragraph with one text child and return both. */
function paragraph(value, tag = 'p') {
  const block = el(tag)
  const node = text(value)
  block.appendChild(node)
  document.body.appendChild(block)
  return { block, node }
}

// Arabic-first (the easy case the old tests only covered).
const arabicFirst = paragraph('كيف حالك Hello')
// Latin-first Arabic sentence: the case dir="auto" gets wrong.
const latinFirst = paragraph('Hello كيف حالك')
const errorLine = paragraph('Error: فشل الاتصال بالخادم')
const commandLine = paragraph('npm install ثم أعد التشغيل')
const identifierLine = paragraph('@deepseek-ai/dsh مهم جداً')
// A tie (one Latin word, one Arabic word) must resolve to RTL.
const tieLine = paragraph('Hello نص')
// English prose quoting one Arabic word must NOT flip.
const englishBody = paragraph('The build failed while parsing the Arabic word سلام in the config file.')
const pureEnglish = paragraph('pure english paragraph, should stay untouched')

// Code is never judged and never flipped.
const codeBlock = el('pre')
const codeInner = el('code')
codeInner.appendChild(text('const greeting = "مرحبا"'))
codeBlock.appendChild(codeInner)
document.body.appendChild(codeBlock)

// Arabic prose containing inline code: the code must not count as Latin words.
const inlineCodeBlock = el('div')
const inlineCodePara = el('p')
inlineCodePara.appendChild(text('شغّل الأمر '))
const inlineCode = el('code')
inlineCode.appendChild(text('node verify.mjs'))
inlineCodePara.appendChild(inlineCode)
inlineCodeBlock.appendChild(inlineCodePara)
document.body.appendChild(inlineCodeBlock)

// A list is judged as a container, so its markers move with it.
const list = el('ul')
const item1 = el('li'); item1.appendChild(text('عنصر أول'))
const item2 = el('li'); item2.appendChild(text('عنصر ثانٍ'))
list.appendChild(item1); list.appendChild(item2)
document.body.appendChild(list)

// A blockquote of Arabic prose.
const quote = el('blockquote')
const quotePara = el('p'); quotePara.appendChild(text('اقتباس عربي'))
quote.appendChild(quotePara)
document.body.appendChild(quote)

// An author-set direction on the block itself is the opt-out: never touched.
const authorBlock = el('div')
authorBlock.setAttribute('dir', 'ltr')
authorBlock.appendChild(text('نص عربي هنا'))
document.body.appendChild(authorBlock)

// Inline wrapper inside a block host.
const spanHost = el('div')
const inlineSpan = el('span')
inlineSpan.display = 'inline'
inlineSpan.appendChild(text('عنوان مختلط'))
spanHost.appendChild(inlineSpan)
document.body.appendChild(spanHost)

// Composer.
const composer = el('textarea')
composer.value = 'اكتب هنا بالعربية'
document.body.appendChild(composer)

// The composer's control row: a flex toolbar whose Arabic permission label must
// NOT flip the row, or the send button swaps sides. This is the reported bug.
const toolbar = el('div')
toolbar.display = 'flex'
const toolbarLabel = el('span')
toolbarLabel.display = 'inline'
toolbarLabel.appendChild(text('وصول كامل'))
const toolbarSend = el('button')
toolbarSend.appendChild(text('↑'))
const toolbarModel = el('span')
toolbarModel.display = 'inline'
toolbarModel.appendChild(text('DeepSeek-V41-Flash'))
toolbar.appendChild(toolbarLabel)
toolbar.appendChild(toolbarSend)
toolbar.appendChild(toolbarModel)
document.body.appendChild(toolbar)

// A block row that owns a control is chrome too, but the prose block inside it is
// still a direction candidate.
const cardRow = el('div')
cardRow.display = 'block'
const cardText = el('p')
cardText.appendChild(text('رسالة عربية داخل بطاقة فيها زر'))
const cardButton = el('button')
cardButton.appendChild(text('Copy'))
cardRow.appendChild(cardText)
cardRow.appendChild(cardButton)
document.body.appendChild(cardRow)

/* ------------------------------------------------------------------- run --- */

const { default: plugin } = await import('../index.js')
const rows = []
plugin.apply({ on: (event, handler) => handler(rows) })

const styleRow = rows.find((r) => r.kind === 'style')
const scriptRow = rows.find((r) => r.kind === 'script')
if (!styleRow || !scriptRow) throw new Error('expected one style row and one script row')

// The payload swallows its own errors by design; surface them while testing.
const instrumented = scriptRow.text.replace(/catch \(err\) \{\}/g, 'catch (err) { globalThis.__dshArabicError = err }')
new Function(instrumented)()
if (globalThis.__dshArabicError) {
  console.error('CLIENT SCRIPT THREW:', globalThis.__dshArabicError.stack)
  process.exit(2)
}

/* ---------------------------------------------------------------- asserts --- */

const results = []
const check = (label, ok, extra = '') => results.push({ label, ok, extra })
const rtl = (block) => block.getAttribute('dir') === 'rtl' && block.getAttribute(MARK) === '1'
const untouched = (block) => block.getAttribute('dir') === null && block.getAttribute(MARK) === null

check('Arabic-first sentence becomes RTL', rtl(arabicFirst.block), `dir=${arabicFirst.block.getAttribute('dir')}`)
check('Latin-first Arabic sentence becomes RTL (first-strong would fail)', rtl(latinFirst.block), `dir=${latinFirst.block.getAttribute('dir')}`)
check('"Error: فشل الاتصال" becomes RTL', rtl(errorLine.block))
check('"npm install ثم أعد التشغيل" becomes RTL', rtl(commandLine.block))
check('a leading identifier counts as one word', rtl(identifierLine.block))
check('a tie resolves to RTL', rtl(tieLine.block), `dir=${tieLine.block.getAttribute('dir')}`)
check('English prose quoting one Arabic word stays untouched', untouched(englishBody.block), `dir=${englishBody.block.getAttribute('dir')}`)
check('pure English stays untouched', untouched(pureEnglish.block))
check('pre/code is never flipped', untouched(codeBlock) && untouched(codeInner))
check('inline code does not count as Latin words', rtl(inlineCodePara) || rtl(inlineCodeBlock))
check('a list container flips as a whole', rtl(list), `dir=${list.getAttribute('dir')}`)
check('list items are left to inherit', untouched(item1) && untouched(item2))
check('a blockquote flips', rtl(quote) || rtl(quotePara))
// An author-set direction on the block itself is the opt-out: never touched.
check(
  'an author-set dir is never overridden',
  authorBlock.getAttribute('dir') === 'ltr' && authorBlock.getAttribute(MARK) === null,
  `dir=${authorBlock.getAttribute('dir')} mark=${authorBlock.getAttribute(MARK)}`
)
check('an inline wrapper walks up to its block host', rtl(spanHost))
check('composer switches to rtl for Arabic', composer.getAttribute('dir') === 'rtl', `dir=${composer.getAttribute('dir')}`)

// Chrome must not flip: the toolbar keeps its order, a row owning a button is
// left alone, and the prose block inside such a row is still given RTL.
check('a flex toolbar is never flipped', untouched(toolbar), `dir=${toolbar.getAttribute('dir')}`)
check('a row owning a button is never flipped', cardRow.getAttribute('dir') === null && cardRow.getAttribute(MARK) === null, `dir=${cardRow.getAttribute('dir')}`)
check('the prose block inside such a row is still flipped', rtl(cardText), `dir=${cardText.getAttribute('dir')}`)

check('style element injected', document.getElementById('dsh-arabic-style') !== null)
check('CSS keeps code LTR', styleRow.text.includes('direction: ltr'))
check('CSS mirrors the activity shimmer for Arabic', /html:lang\(ar\)\s*\.sweep/.test(styleRow.text) && /dsh-arabic-shimmer-sweep/.test(styleRow.text))
check('CSS mirrors both shimmer layers together', /html:lang\(ar\)\s*\.highlight/.test(styleRow.text) && /dsh-arabic-shimmer-highlight/.test(styleRow.text) && !/animation-direction:\s*reverse/.test(styleRow.text))
check('CSS no longer defers to the first strong character', !/unicode-bidi:\s*plaintext/.test(styleRow.text))
check('observer attached for streamed content', MutationObserver.instances.length === 1)

const observer = MutationObserver.instances[0]

// Chrome surfaces are never touched: text inside a dialog, a nav or the shell
// keeps the layout's own alignment, so the settings window cannot end up with one
// label centered, another right and a third left. Every fixture here is pushed
// through the observer, so the assertion is about the rule and not about timing.
const dialog = el('div')
dialog.setAttribute('role', 'dialog')
dialog.setAttribute('aria-modal', 'true')
dialog.display = 'block'
const dialogLabel = el('div')
dialogLabel.display = 'block'
dialogLabel.appendChild(text('حجم الخط'))
dialog.appendChild(dialogLabel)
document.body.appendChild(dialog)

const nav = el('nav')
nav.display = 'block'
const navItem = el('div')
navItem.display = 'block'
navItem.appendChild(text('الموديلات'))
nav.appendChild(navItem)
document.body.appendChild(nav)

// Content outside chrome must still flip, or the exclusion would swallow the
// feature it protects.
const contentOutside = el('div')
contentOutside.display = 'block'
contentOutside.appendChild(text('نص محتوى عربي خارج الهيكل'))
document.body.appendChild(contentOutside)

const domCase = el('div')
domCase.display = 'block'
domCase.appendChild(text('نص عربي آخر للتأكيد'))
document.body.appendChild(domCase)

if (observer) {
  observer.callback([{ type: 'childList', addedNodes: [dialogLabel, navItem, contentOutside, domCase], target: document.body }])
  await new Promise((resolve) => setTimeout(resolve, 140))
}
check('a dialog block is never marked', untouched(dialogLabel), `dir=${dialogLabel.getAttribute('dir')}`)
check('a nav block is never marked', untouched(navItem), `dir=${navItem.getAttribute('dir')}`)
check('content outside chrome is still marked', rtl(contentOutside), `dir=${contentOutside.getAttribute('dir')}`)

// Streamed Arabic arriving in a fresh element.
const lateBlock = paragraph('نص وصل متأخراً')
if (observer) {
  observer.callback([{ type: 'childList', addedNodes: [lateBlock.block], target: document.body }])
  await new Promise((resolve) => setTimeout(resolve, 120))
  check('streamed Arabic node is marked', rtl(lateBlock.block))
} else {
  check('streamed Arabic node is marked', false, 'no observer instance')
}

// A block that starts English-only and later receives Arabic must flip.
const growing = paragraph('Installing packages')
check('growing block starts untouched', untouched(growing.block))
growing.node.nodeValue = 'Installing packages ثم نكمل'
if (observer) {
  observer.callback([{ type: 'characterData', target: growing.node }])
  await new Promise((resolve) => setTimeout(resolve, 120))
  check('appended Arabic flips a growing block', rtl(growing.block), `dir=${growing.block.getAttribute('dir')}`)
}

// A row that is marked before its switch mounts must be released. React renders
// the Arabic label first and the control second, so the mark is set while the row
// still looks like prose; leaving it flips the row and misplaces the toggle —
// the reported broken switch in Settings.
const lateRow = el('div')
lateRow.display = 'block'
const lateLabel = el('span')
lateLabel.display = 'inline'
lateLabel.appendChild(text('رفع سجل الجلسة عند استخدام الموديل الرسمي'))
lateRow.appendChild(lateLabel)
document.body.appendChild(lateRow)
if (observer) {
  observer.callback([{ type: 'childList', addedNodes: [lateRow], target: document.body }])
  await new Promise((resolve) => setTimeout(resolve, 120))
  check('an Arabic settings row is marked while it is still prose', rtl(lateRow), `dir=${lateRow.getAttribute('dir')}`)

  const lateSwitch = el('button')
  lateSwitch.setAttribute('role', 'switch')
  const lateThumb = el('span')
  lateThumb.display = 'inline'
  lateSwitch.appendChild(lateThumb)
  lateRow.appendChild(lateSwitch)
  observer.callback([{ type: 'childList', addedNodes: [lateSwitch], target: lateRow }])
  await new Promise((resolve) => setTimeout(resolve, 120))
  check('the mark is withdrawn once the row owns a control', untouched(lateRow), `dir=${lateRow.getAttribute('dir')}`)

  // A control can mount one level deeper than the row: the wrapper is the
  // mutation target, and the marked row above it must still be released.
  const deepRow = el('div')
  deepRow.display = 'block'
  const deepLabel = el('span')
  deepLabel.display = 'inline'
  deepLabel.appendChild(text('صف إعدادات عربي آخر'))
  const deepWrap = el('div')
  deepWrap.display = 'block'
  deepRow.appendChild(deepLabel)
  deepRow.appendChild(deepWrap)
  document.body.appendChild(deepRow)
  observer.callback([{ type: 'childList', addedNodes: [deepRow], target: document.body }])
  await new Promise((resolve) => setTimeout(resolve, 120))
  check('a second prose row is marked', rtl(deepRow), `dir=${deepRow.getAttribute('dir')}`)

  const deepControl = el('button')
  deepControl.setAttribute('role', 'switch')
  deepWrap.appendChild(deepControl)
  observer.callback([{ type: 'childList', addedNodes: [deepControl], target: deepWrap }])
  await new Promise((resolve) => setTimeout(resolve, 120))
  check('a control mounting deeper releases the marked ancestor', untouched(deepRow), `dir=${deepRow.getAttribute('dir')}`)
}

// …and a block that becomes English-only again must be released.
growing.node.nodeValue = 'Installing packages now'
if (observer) {
  observer.callback([{ type: 'characterData', target: growing.node }])
  await new Promise((resolve) => setTimeout(resolve, 120))
  check('a block that becomes English-only is released', untouched(growing.block), `dir=${growing.block.getAttribute('dir')}`)
}

// Composer follows the language being typed.
const inputHandler = document._listeners.find((l) => l.type === 'input')
if (inputHandler) {
  composer.value = 'now english'
  inputHandler.handler({ target: composer })
  check('composer returns to auto for English', composer.getAttribute('dir') === 'auto', `dir=${composer.getAttribute('dir')}`)

  // Hysteresis, exactly like the block path: a composer that is already RTL keeps
  // its direction until the Latin side is clearly ahead, otherwise a mixed line
  // makes it flicker on every keystroke.
  composer.value = 'اكتب هنا بالعربية'
  inputHandler.handler({ target: composer })
  check('composer turns rtl for Arabic', composer.getAttribute('dir') === 'rtl', `dir=${composer.getAttribute('dir')}`)

  composer.value = 'مرحبا بك npm install build'
  inputHandler.handler({ target: composer })
  check('composer keeps rtl while the Latin side is not clearly ahead', composer.getAttribute('dir') === 'rtl', `dir=${composer.getAttribute('dir')}`)

  composer.value = 'this is now clearly english text with several latin words'
  inputHandler.handler({ target: composer })
  check('composer releases rtl once the text is clearly Latin', composer.getAttribute('dir') === 'auto', `dir=${composer.getAttribute('dir')}`)

  // Only text-like fields take a direction: a checkbox, radio or hidden input has
  // none of its own, and writing one can move the control itself.
  const search = el('input')
  search.setAttribute('type', 'search')
  search.value = 'بحث بالعربية'
  document.body.appendChild(search)
  const checkbox = el('input')
  checkbox.setAttribute('type', 'checkbox')
  document.body.appendChild(checkbox)
  const hidden = el('input')
  hidden.setAttribute('type', 'hidden')
  document.body.appendChild(hidden)
  inputHandler.handler({ target: search })
  inputHandler.handler({ target: checkbox })
  inputHandler.handler({ target: hidden })
  check('a search field follows the typed language', search.getAttribute('dir') === 'rtl', `dir=${search.getAttribute('dir')}`)
  check('a checkbox is never given a direction', checkbox.getAttribute('dir') === null, `dir=${checkbox.getAttribute('dir')}`)
  check('a hidden input is never given a direction', hidden.getAttribute('dir') === null, `dir=${hidden.getAttribute('dir')}`)
} else {
  check('composer returns to auto for English', false, 'no input listener')
}

/* ------------------------------------------- the settings-row control face --- */

check('layer exposes a control face on window', !!window.__dshArabic && typeof window.__dshArabic.setEnabled === 'function')
check('layer starts enabled', !!(window.__dshArabic && window.__dshArabic.isEnabled()))

if (window.__dshArabic) {
  window.__dshArabic.setEnabled(false)
  check('disabling clears existing marks', untouched(latinFirst.block) && untouched(arabicFirst.block))
  check('disabling restores composer direction', composer.getAttribute('dir') === null, `dir=${composer.getAttribute('dir')}`)
  check('disabling is persisted', store.get('dsh-arabic:rtl') === 'off')

  const whileOff = paragraph('نص عربي بعد الإيقاف')
  if (observer) {
    observer.callback([{ type: 'childList', addedNodes: [whileOff.block], target: document.body }])
    await new Promise((resolve) => setTimeout(resolve, 120))
  }
  check('no direction while disabled', untouched(whileOff.block))

  window.__dshArabic.setEnabled(true)
  check('enabling re-marks existing content', rtl(arabicFirst.block) && rtl(latinFirst.block))
  check('enabling re-marks content added while off', rtl(whileOff.block))
  check('enabling is persisted', store.get('dsh-arabic:rtl') === 'on')
}

let failed = 0
for (const r of results) {
  if (!r.ok) failed++
  console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.label}${r.extra ? `  (${r.extra})` : ''}`)
}
console.log(`\n${results.length - failed}/${results.length} direction checks passed — ${fileURLToPath(new URL('..', import.meta.url))}`)
process.exit(failed === 0 ? 0 : 1)
