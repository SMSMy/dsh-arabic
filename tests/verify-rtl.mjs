/**
 * verify-rtl.mjs — offline behaviour check for the bidi/RTL layer.
 *
 * The client payload normally runs inside the DSH page; there is no browser
 * here, so this test installs a minimal DOM shim and runs the *real* injected
 * script against it, then asserts the marking rules.
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

  closest(selector) {
    const parts = selector.split(',').map((s) => s.trim().toLowerCase())
    let node = this
    while (node && node.nodeType === 1) {
      for (const part of parts) {
        if (part.startsWith('[') && part.endsWith(']')) {
          if (node.attributes.has(part.slice(1, -1))) return node
        } else if (node.tagName === part.toUpperCase()) return node
      }
      node = node.parentElement
    }
    return null
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

const arabicBlock = el('div')
const arabicPara = el('p')
arabicPara.appendChild(text('السلام عليكم، هذا اختبار mixed with English.'))
arabicBlock.appendChild(arabicPara)

const englishBlock = el('div')
const englishPara = el('p')
englishPara.appendChild(text('pure english paragraph, should stay untouched'))
englishBlock.appendChild(englishPara)

const codeBlock = el('pre')
const codeInner = el('code')
codeInner.appendChild(text('const greeting = "مرحبا"'))
codeBlock.appendChild(codeInner)

const inlineCodePara = el('p')
inlineCodePara.appendChild(text('شغّل الأمر '))
const inlineCode = el('code')
inlineCode.appendChild(text('node verify.mjs'))
inlineCodePara.appendChild(inlineCode)
const inlineCodeBlock = el('div')
inlineCodeBlock.appendChild(inlineCodePara)

const composer = el('textarea')
composer.value = 'اكتب هنا بالعربية'

const inlineSpan = el('span')
inlineSpan.display = 'inline'
inlineSpan.appendChild(text('عنوان مختلط'))
const spanHost = el('div')
spanHost.appendChild(inlineSpan)

for (const node of [arabicBlock, englishBlock, codeBlock, inlineCodeBlock, composer, spanHost]) {
  document.body.appendChild(node)
}

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
const MARK = 'data-dsh-arabic-bidi'

check('Arabic paragraph is marked', arabicPara.getAttribute(MARK) === '1' || arabicBlock.getAttribute(MARK) === '1')
check('English paragraph is untouched', !englishBlock.getAttribute(MARK) && !englishPara.getAttribute(MARK))
check('pre/code is never marked', !codeBlock.getAttribute(MARK) && !codeInner.getAttribute(MARK))
check('inline code does not block marking of its prose', inlineCodeBlock.getAttribute(MARK) === '1' || inlineCodePara.getAttribute(MARK) === '1')
check('composer switches to rtl', composer.getAttribute('dir') === 'rtl', `dir=${composer.getAttribute('dir')}`)
check('inline span walks up to its block host', spanHost.getAttribute(MARK) === '1')
check('style element injected', document.getElementById('dsh-arabic-style') !== null)
check('CSS keeps code LTR', styleRow.text.includes('direction: ltr'))
check('CSS derives direction from content', styleRow.text.includes('unicode-bidi: plaintext'))
check('observer attached for streamed content', MutationObserver.instances.length === 1)

const lateBlock = el('div')
const latePara = el('p')
latePara.appendChild(text('نص وصل متأخراً'))
lateBlock.appendChild(latePara)
document.body.appendChild(lateBlock)
const observer = MutationObserver.instances[0]
if (observer) {
  observer.callback([{ type: 'childList', addedNodes: [lateBlock] }])
  await new Promise((resolve) => setTimeout(resolve, 120))
  check('streamed Arabic node is marked', lateBlock.getAttribute(MARK) === '1' || latePara.getAttribute(MARK) === '1')
} else {
  check('streamed Arabic node is marked', false, 'no observer instance')
}

const inputHandler = document._listeners.find((l) => l.type === 'input')
if (inputHandler) {
  composer.value = 'now english'
  inputHandler.handler({ target: composer })
  check('composer flips back to auto for English', composer.getAttribute('dir') === 'auto', `dir=${composer.getAttribute('dir')}`)
} else {
  check('composer flips back to auto for English', false, 'no input listener')
}

/* ------------------------------------------- the settings-row control face --- */

check('layer exposes a control face on window', !!window.__dshArabic && typeof window.__dshArabic.setEnabled === 'function')
check('layer starts enabled', !!(window.__dshArabic && window.__dshArabic.isEnabled()))

if (window.__dshArabic) {
  window.__dshArabic.setEnabled(false)
  check('disabling clears existing marks', document.body.getAttribute(MARK) === null && arabicPara.getAttribute(MARK) === null)
  check('disabling restores composer direction', composer.getAttribute('dir') === null, `dir=${composer.getAttribute('dir')}`)
  check('disabling is persisted', store.get('dsh-arabic:rtl') === 'off')

  const whileOff = el('div')
  const pOff = el('p')
  pOff.appendChild(text('نص عربي بعد الإيقاف'))
  whileOff.appendChild(pOff)
  document.body.appendChild(whileOff)
  if (observer) {
    observer.callback([{ type: 'childList', addedNodes: [whileOff] }])
    await new Promise((resolve) => setTimeout(resolve, 120))
  }
  check('no marking while disabled', whileOff.getAttribute(MARK) === null && pOff.getAttribute(MARK) === null)

  window.__dshArabic.setEnabled(true)
  check('enabling re-marks existing content', arabicPara.getAttribute(MARK) === '1')
  check('enabling re-marks content added while off', whileOff.getAttribute(MARK) === '1' || pOff.getAttribute(MARK) === '1')
  check('enabling is persisted', store.get('dsh-arabic:rtl') === 'on')
}

let failed = 0
for (const r of results) {
  if (!r.ok) failed++
  console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.label}${r.extra ? `  (${r.extra})` : ''}`)
}
console.log(`\n${results.length - failed}/${results.length} RTL checks passed — ${fileURLToPath(new URL('..', import.meta.url))}`)
process.exit(failed === 0 ? 0 : 1)
