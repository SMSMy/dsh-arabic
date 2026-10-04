/**
 * dsh-arabic — host half.
 *
 * Two jobs:
 *  1. Push the RTL/bidi layer into the Web/Desktop index so mixed Arabic and
 *     English text is ordered and aligned per paragraph instead of being forced
 *     into one direction.
 *  2. Ship the client half (`./client`), which registers the Arabic language
 *     pack through the official locale service.
 *
 * The RTL layer deliberately does NOT flip the shell to RTL: developer UIs mix
 * Latin identifiers, paths and code with Arabic prose, so every paragraph
 * derives its own direction (`unicode-bidi: plaintext`, the CSS form of
 * `dir="auto"`), while code blocks stay LTR.
 *
 * Injection channel: `webserver/index-inject`. On the packaged Desktop app the
 * table is collected ONCE at host startup, so the rows are registered
 * synchronously in `apply()` — deferring them behind a service inject would
 * lose them — and a restart (not a page refresh) is what makes them appear.
 */

const MARK = 'data-dsh-arabic-bidi'
const STYLE_MARK = 'dsh-arabic'
const INSTALL_FLAG = '__dshArabicInstalled'

const CSS = `
/* dsh-arabic — paragraph direction comes from the paragraph, not the shell. */
[data-dsh-arabic-bidi="1"] {
  unicode-bidi: plaintext;
  text-align: start;
}

/* Code, paths, terminal output and identifiers stay LTR inside RTL prose. */
pre,
code,
kbd,
samp,
[data-dsh-arabic-bidi="1"] pre,
[data-dsh-arabic-bidi="1"] code,
[data-dsh-arabic-bidi="1"] kbd,
[data-dsh-arabic-bidi="1"] samp {
  direction: ltr;
  unicode-bidi: isolate;
  text-align: left;
}

/* Composer, search boxes and other inputs follow what is being typed. */
textarea[dir="rtl"],
input[dir="rtl"] {
  text-align: right;
}

textarea[dir="auto"],
input[dir="auto"],
[contenteditable][dir="auto"] {
  unicode-bidi: plaintext;
  text-align: start;
}

/* Keep LTR chrome inside a marked block from inheriting RTL flow. */
[data-dsh-arabic-bidi="1"] button,
[data-dsh-arabic-bidi="1"] input,
[data-dsh-arabic-bidi="1"] select,
[data-dsh-arabic-bidi="1"] [role="button"] {
  unicode-bidi: isolate;
}
`

/** Runs in the page. Serialized with toString(), so it must be self-contained. */
function dshArabicClient() {
  var MARK = 'data-dsh-arabic-bidi'
  var STYLE_ID = 'dsh-arabic-style'
  var INSTALL_FLAG = '__dshArabicInstalled'
  // Strong-RTL characters: Arabic, Arabic Supplement/Extended, presentation
  // forms, Hebrew, Syriac, Thaana, NKo.
  var STRONG_RTL = /[\u0591-\u05F4\u0600-\u06FF\u0700-\u074F\u0750-\u077F\u0780-\u07BF\u08A0-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF]/
  var SKIP_TAGS = {
    SCRIPT: 1, STYLE: 1, NOSCRIPT: 1, TEXTAREA: 1, INPUT: 1,
    SVG: 1, MATH: 1, PRE: 1, CODE: 1, KBD: 1, SAMP: 1
  }
  var BLOCKED_SELECTOR = 'pre,code,kbd,samp,textarea,input,script,style,svg,[contenteditable]'

  try {
    if (window[INSTALL_FLAG]) return
    window[INSTALL_FLAG] = true

    function ensureStyle() {
      if (document.getElementById(STYLE_ID)) return
      var style = document.createElement('style')
      style.id = STYLE_ID
      style.textContent = window.__dshArabicCss || ''
      ;(document.head || document.documentElement).appendChild(style)
    }

    function isBlocked(el) {
      return !!(el && el.closest && el.closest(BLOCKED_SELECTOR))
    }

    function blockOf(el) {
      var node = el
      while (node && node !== document.body && node !== document.documentElement) {
        if (!SKIP_TAGS[node.tagName]) {
          var display = ''
          try { display = getComputedStyle(node).display || '' } catch (err) { display = '' }
          if (display && display.indexOf('inline') !== 0) return node
        }
        node = node.parentElement
      }
      return null
    }

    function markSubtree(root) {
      if (!root) return
      if (root.nodeType === 1) {
        if (SKIP_TAGS[root.tagName] || isBlocked(root)) return
      } else if (root.nodeType !== 3 && root.nodeType !== 9 && root.nodeType !== 11) {
        return
      }
      var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null)
      var node
      while ((node = walker.nextNode())) {
        var text = node.nodeValue
        if (!text || !STRONG_RTL.test(text)) continue
        var parent = node.parentElement
        if (!parent || isBlocked(parent)) continue
        var block = blockOf(parent)
        if (block && block.getAttribute(MARK) !== '1') block.setAttribute(MARK, '1')
      }
    }

    function syncInput(el) {
      if (!el || !el.getAttribute) return
      var value = el.isContentEditable ? el.textContent : el.value
      var dir = STRONG_RTL.test(value || '') ? 'rtl' : 'auto'
      if (el.getAttribute('dir') !== dir) el.setAttribute('dir', dir)
    }

    var queue = []
    var timer = null

    function flush() {
      timer = null
      var items = queue.slice()
      queue.length = 0
      for (var i = 0; i < items.length; i++) {
        try { markSubtree(items[i]) } catch (err) {}
      }
    }

    function schedule(node) {
      if (!node) return
      if (queue.length > 500) return
      queue.push(node)
      if (timer !== null) return
      timer = setTimeout(flush, 60)
    }

    function boot() {
      ensureStyle()
      try { markSubtree(document.body) } catch (err) {}
      var inputs = document.querySelectorAll('textarea,input,[contenteditable]')
      for (var i = 0; i < inputs.length; i++) syncInput(inputs[i])

      document.addEventListener('input', function (event) {
        var target = event.target
        if (target && (target.tagName === 'TEXTAREA' || target.tagName === 'INPUT' || target.isContentEditable)) {
          syncInput(target)
        }
      }, true)

      var observer = new MutationObserver(function (records) {
        for (var r = 0; r < records.length; r++) {
          var record = records[r]
          if (record.type === 'childList') {
            for (var a = 0; a < record.addedNodes.length; a++) schedule(record.addedNodes[a])
          } else if (record.type === 'characterData') {
            schedule(record.target)
          }
        }
      })
      observer.observe(document.body, { childList: true, subtree: true, characterData: true })
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot)
    else boot()
  } catch (err) {}
}

const CLIENT_TEXT = 'window.__dshArabicCss=' + JSON.stringify(CSS) + ';(' + dshArabicClient.toString() + ')();'

export default {
  name: 'dsh-arabic',

  apply(root) {
    root.on('webserver/index-inject', (table) => {
      try {
        if (!Array.isArray(table)) return
        let hasStyle = false
        let hasScript = false
        for (const row of table) {
          if (!row) continue
          if (row.kind === 'style' && typeof row.text === 'string' && row.text.includes(STYLE_MARK)) hasStyle = true
          if (row.kind === 'script' && typeof row.text === 'string' && row.text.includes(INSTALL_FLAG)) hasScript = true
        }
        if (!hasStyle) table.push({ kind: 'style', text: CSS })
        if (!hasScript) table.push({ kind: 'script', placement: 'body', text: CLIENT_TEXT })
      } catch (err) {
        // Never break an index render because of this plugin.
      }
    })
  }
}

export { CSS, MARK, STYLE_MARK }
