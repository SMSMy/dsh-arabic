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
 * Latin identifiers, paths and code with Arabic prose, so direction is decided
 * per text block by prose dominance — code-like tokens do not vote and bind the
 * Latin words around them, a tie resolves to Arabic, hysteresis keeps a streamed
 * answer from flickering — and chrome surfaces (dialogs, menus, the shell) are
 * never touched. Code blocks stay LTR. `unicode-bidi: plaintext` (the CSS form of
 * `dir="auto"`, i.e. the first-strong rule) is deliberately NOT used: it gets a
 * line wrong whenever it opens with a Latin token.
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
/* dsh-arabic — direction is decided per block by prose dominance, not by the
   first strong character. The marker attribute means "we set the direction";
   direction and unicode-bidi are declared here as well as written as the dir
   attribute, so the intent is readable in the stylesheet too. */
[data-dsh-arabic-bidi="1"] {
  direction: rtl;
  unicode-bidi: isolate;
  text-align: start;
}

/* Code, paths and terminal output stay LTR inside an RTL block. */
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

/* The composer and search boxes follow what is being typed. */
textarea[dir="rtl"],
input[dir="rtl"] {
  text-align: right;
}

/* Activity animations sweep with the text, not against it.
   The running labels ("جارٍ تشغيل الأوامر", "التفكير العميق جارٍ") draw the word
   twice: .sweep carries a moving mask over tinted glyphs, and .highlight is a
   counter-moving block that keeps the glyphs aligned under that mask. The pair
   travels left to right, so read right-to-left the light moves backwards.
   Both layers are mirrored here with keyframes of their own — reversing only the
   animation direction desynchronises the pair, and the tint then reads as a
   shadow behind the text. Duration, delay and the stepped timing function stay
   the app's, so the motion is exactly as smooth as the English one. */
html:lang(ar) .sweep {
  animation-name: dsh-arabic-shimmer-sweep;
  transform: translateX(100%);
  mask-image: linear-gradient(75deg, transparent 0%, black 40% 60%, transparent 100%);
}
html:lang(ar) .highlight {
  animation-name: dsh-arabic-shimmer-highlight;
  transform: translateX(-100%);
}
@keyframes dsh-arabic-shimmer-sweep {
  0% { transform: translateX(100%); }
  66.6667%, 100% { transform: translateX(-100%); }
}
@keyframes dsh-arabic-shimmer-highlight {
  0% { transform: translateX(-100%); }
  66.6667%, 100% { transform: translateX(100%); }
}

/* Keep LTR chrome inside an RTL block from inheriting RTL flow. */
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
  var INPUT_MARK = 'data-dsh-arabic-input'
  var STYLE_ID = 'dsh-arabic-style'
  var STORE_KEY = 'dsh-arabic:rtl'
  var INSTALL_FLAG = '__dshArabicInstalled'

  // Strong RTL scripts: Hebrew, Arabic, Syriac, Thaana, NKo, Samaritan,
  // Arabic Extended-A and the Arabic presentation forms. Persian and Urdu sit
  // inside the Arabic blocks.
  var RTL_CHAR = /[\u0590-\u05FF\u0600-\u06FF\u0700-\u074F\u0750-\u077F\u0780-\u07BF\u07C0-\u07FF\u0800-\u083F\u08A0-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF]/
  /** Strong left-to-right letters, used only to weigh against RTL. */
  var LATIN_CHAR = /[A-Za-z\u00C0-\u024F]/
  /**
   * Word separator: whitespace only, deliberately not punctuation. Splitting on
   * non-letters breaks identifiers into their parts, so `@deepseek-ai/dsh` would
   * count as three Latin words and could outvote the Arabic sentence holding it.
   * One identifier is one word.
   */
  var SEPARATOR = /\s+/u
  /** Elements whose direction is meaningful as authored — never touched. */
  var SKIP = {
    CODE: 1, PRE: 1, KBD: 1, SAMP: 1, VAR: 1, TT: 1,
    SCRIPT: 1, STYLE: 1, NOSCRIPT: 1, TEMPLATE: 1,
    INPUT: 1, TEXTAREA: 1, SELECT: 1, OPTION: 1,
    SVG: 1, PATH: 1, CANVAS: 1, IMG: 1, VIDEO: 1, AUDIO: 1
  }
  /** Containers judged on their whole subtree: a list only moves its markers
   *  when the list itself flips, and a table only reorders when it flips. */
  var CONTAINER = { TABLE: 1, UL: 1, OL: 1, DL: 1 }
  /**
   * Interactive chrome. A row that owns controls is a toolbar, not prose:
   * flipping it reverses its children and moves the send button to the wrong
   * side. The composer's control row carries an Arabic permission label, so this
   * is not a hypothetical case.
   */
  var INTERACTIVE = 'button,select,[role="button"],[role="combobox"],[role="menuitem"],[role="tab"],[role="switch"],[role="checkbox"]'
  /**
   * Chrome surfaces: the shell, its menus and its dialogs. Text inside them is
   * never given a direction of its own, because a per-block decision inside a
   * layout that is authored LTR produces ragged alignment — the reported "once
   * centered, once right, once left" in the settings window, where every label
   * was right-aligned inside its own width instead of sharing one margin.
   *
   * DSH marks its panels with `role="dialog"` and `aria-modal`, and its shell
   * uses the usual landmarks, so this is a semantic test rather than a guess
   * about class names. Content (messages, tool output, documents) is not inside
   * these, and the composer is handled by its own code path.
   */
  var CHROME = '[role="dialog"],[aria-modal="true"],nav,aside,header,footer,[role="navigation"],[role="menu"],[role="menubar"],[role="tablist"],[role="toolbar"],[role="listbox"],[role="banner"],[role="complementary"],[role="form"]'
  var SKIP_SELECTOR = 'pre,code,kbd,samp,var,tt,script,style,noscript,template,input,textarea,select,option,svg,path,canvas,img,video,audio'

  try {
    if (window[INSTALL_FLAG]) return
    window[INSTALL_FLAG] = true

    var enabled = true
    try { enabled = window.localStorage.getItem(STORE_KEY) !== 'off' } catch (err) {}

    function ensureStyle() {
      if (document.getElementById(STYLE_ID)) return
      var style = document.createElement('style')
      style.id = STYLE_ID
      style.textContent = window.__dshArabicCss || ''
      ;(document.head || document.documentElement).appendChild(style)
    }

    /**
     * Code-like tokens are replaced before counting, because one URL, path or
     * commit sha can outweigh a whole Arabic sentence: a 40-char sha alone is
     * forty Latin letters. They are replaced by a glue character rather than
     * deleted, so the Latin words around them merge into one technical unit —
     * `npx @deepseek-ai/dsh web` becomes a single Latin word instead of three,
     * which is what lets an Arabic instruction containing a command still read
     * as Arabic.
     *
     * Order matters: URL first, then any token carrying a technical separator
     * — which is what catches `@deepseek-ai/dsh`, a package scope that does not
     * start with a letter and would otherwise slip past a leading-letter rule —
     * then a bare hex run (a sha without separators), then a ratio, then a
     * dotted identifier. An ordinary Latin word standing alone is deliberately
     * NOT matched.
     */
    var CODEISH = /https?:\/\/\S+|\S*[._/:+@#]\S*|\b[0-9a-f]{6,}\b|\b\d+\/\d+\b|\b[\w-]+\.[\w-]{2,}\b/g

    /** True when one whitespace token looks like code, a path, a URL or a sha. */
    function isCodeish(token) {
      CODEISH.lastIndex = 0
      return CODEISH.test(token)
    }

    /**
     * Weigh a block's prose: code-like tokens do not vote, words do.
     *
     * - Unit: one whitespace-delimited token.
     * - A token holding any RTL character is an Arabic word; otherwise a token
     *   holding a Latin letter is a Latin word; a token with neither (numbers,
     *   punctuation) counts as neither.
     * - A code-like token votes for nothing, and it makes the Latin word that
     *   follows it part of the same technical unit, so `npx @deepseek-ai/dsh web`
     *   is one unit instead of three. The flag is set by the code token alone:
     *   two ordinary Latin words side by side still count twice, or an English
     *   paragraph quoting an Arabic word would tie and flip.
     *
     * @param text - Text to weigh.
     * @returns the count of Arabic and Latin prose words.
     */
    function weigh(text) {
      var out = { rtl: 0, ltr: 0 }
      if (!text) return out
      var tokens = String(text).split(SEPARATOR)
      var glued = false
      for (var i = 0; i < tokens.length; i++) {
        var token = tokens[i]
        if (!token) continue
        if (RTL_CHAR.test(token)) {
          out.rtl++
          glued = false
          continue
        }
        if (isCodeish(token)) {
          glued = true
          continue
        }
        if (LATIN_CHAR.test(token)) {
          if (!glued) out.ltr++
          glued = false
          continue
        }
        glued = false
      }
      return out
    }

    /**
     * Decide a block's direction, with hysteresis so a streamed answer cannot
     * flicker: a block that is already RTL stays RTL until the text is clearly
     * Latin (twice as many Latin words), while a block with no verdict yet turns
     * RTL as soon as Arabic words match the Latin ones. A block with no Arabic
     * word at all is released, so English prose quoting one Arabic word never
     * flips.
     *
     * `npm install ثم أعد التشغيل`, `Error: فشل الاتصال` and
     * `شغّل npx @deepseek-ai/dsh web` all start Latin but are Arabic sentences:
     * the first-strong rule gets every one of them wrong.
     *
     * @param text - Block text.
     * @param currentlyRtl - Whether this plugin already set RTL on the block.
     * @returns true when the block should be RTL.
     */
    function isRtlDominant(text, currentlyRtl) {
      var counts = weigh(text)
      if (!counts.rtl) return false
      if (currentlyRtl) return counts.ltr < counts.rtl * 2
      return counts.rtl >= counts.ltr
    }

    /** Text of a block, ignoring anything inside a skipped element (code, inputs…). */
    function blockText(el) {
      var out = ''
      var walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null)
      var node
      while ((node = walker.nextNode())) {
        var parent = node.parentElement
        if (parent && parent.closest && parent.closest(SKIP_SELECTOR)) continue
        out += node.nodeValue || ''
        out += ' '
      }
      return out
    }

    function containsRtl(el) {
      var walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null)
      var node
      while ((node = walker.nextNode())) {
        if (RTL_CHAR.test(node.nodeValue || '')) return true
      }
      return false
    }

    /**
     * Only text blocks are direction candidates — and only in content.
     *
     * Chrome is excluded by three tests, in order of how much damage getting it
     * wrong does:
     *   1. it lives inside a chrome surface (a dialog, a menu, the shell) — a
     *      per-block decision there produces ragged alignment, so chrome keeps
     *      the layout's own alignment and only the text runs follow bidi;
     *   2. its computed display is flex or grid — flipping one reorders children;
     *   3. it owns interactive controls — that is a toolbar, not prose.
     *
     * The Arabic text inside those rows is still handled when it sits in a normal
     * block of its own, so an Arabic permission label reads correctly without
     * moving the composer's send button.
     */
    function isBlockCandidate(el) {
      if (!el || el.nodeType !== 1 || SKIP[el.tagName]) return false
      try {
        if (el.closest && el.closest(CHROME)) return false
      } catch (err) {}
      if (CONTAINER[el.tagName]) return true
      var display = ''
      try { display = getComputedStyle(el).display || '' } catch (err) { display = '' }
      if (!display || display.indexOf('inline') === 0) return false
      if (display === 'flex' || display === 'grid') return false
      if (el.querySelector && el.querySelector(INTERACTIVE)) return false
      return true
    }

    /** Nearest block (or container) ancestor, starting at the node itself. */
    function blockOf(node) {
      var el = node && node.nodeType === 1 ? node : (node ? node.parentElement : null)
      var fallback = null
      while (el && el !== document.body && el !== document.documentElement) {
        if (SKIP[el.tagName]) { el = el.parentElement; continue }
        if (CONTAINER[el.tagName]) return el
        if (!fallback) {
          var display = ''
          try { display = getComputedStyle(el).display || '' } catch (err) { display = '' }
          if (display && display.indexOf('inline') !== 0) fallback = el
        }
        el = el.parentElement
      }
      return fallback
    }

    /**
     * Set, keep or withdraw the direction for one block. A `dir` we did not set
     * is left alone: that is the opt-out for any block this estimator gets
     * wrong.
     */
    function reconcile(el) {
      if (!enabled || !el || el.nodeType !== 1) return
      var ours = el.getAttribute(MARK) === '1'
      if (!isBlockCandidate(el)) {
        // The block stopped qualifying — it gained an interactive control (a
        // switch, a checkbox, a button) or turned into a flex row. It is chrome
        // now, so a mark we set earlier must be withdrawn: leaving it flips the
        // row and misplaces the control's own layout (the reported broken
        // toggle). A `dir` the app set is untouched, as always.
        if (ours) {
          el.removeAttribute(MARK)
          el.removeAttribute('dir')
        }
        return
      }
      if (el.getAttribute('dir') && !ours) return
      var want = isRtlDominant(blockText(el), ours)
      if (want && !ours) {
        el.setAttribute(MARK, '1')
        el.setAttribute('dir', 'rtl')
      } else if (!want && ours) {
        el.removeAttribute(MARK)
        el.removeAttribute('dir')
      }
    }

    /** Reconcile the blocks touched by a subtree (or one text node). */
    function scan(root) {
      if (!enabled || !root) return
      if (root.nodeType === 3) {
        reconcile(blockOf(root))
        return
      }
      if (root.nodeType !== 1 && root.nodeType !== 9 && root.nodeType !== 11) return
      var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null)
      var seen = []
      var node
      while ((node = walker.nextNode())) {
        if (!RTL_CHAR.test(node.nodeValue || '')) continue
        var parent = node.parentElement
        if (!parent || (parent.closest && parent.closest(SKIP_SELECTOR))) continue
        var block = blockOf(parent)
        if (!block || seen.indexOf(block) !== -1) continue
        seen.push(block)
        reconcile(block)
      }
    }

    /** Composer, search boxes and any editable surface follow what is typed. */
    function syncInput(el) {
      if (!enabled || !el || !el.getAttribute) return
      var ours = el.getAttribute(INPUT_MARK) === '1'
      if (el.getAttribute('dir') && !ours) return
      var value = el.isContentEditable ? el.textContent : el.value
      var text = String(value == null ? '' : value)
      // Hysteresis, like the block path: a composer that is already RTL keeps its
      // direction until the text is clearly Latin, otherwise typing mixed content
      // makes it flicker on every keystroke.
      var want = isRtlDominant(text, el.getAttribute('dir') === 'rtl') ? 'rtl' : 'auto'
      if (el.getAttribute('dir') !== want) el.setAttribute('dir', want)
      if (!ours) el.setAttribute(INPUT_MARK, '1')
    }

    /** Text-like inputs only: a checkbox, radio, file or hidden input has no
     *  direction of its own, and setting one can move its own control. */
    var TEXT_INPUT = { text: 1, search: 1, url: 1, email: 1, tel: 1, password: 1, number: 1 }

    function editable(el) {
      if (!el || el.nodeType !== 1) return false
      if (el.isContentEditable === true) return true
      if (el.tagName === 'TEXTAREA') return true
      if (el.tagName !== 'INPUT') return false
      var type = String((el.getAttribute && el.getAttribute('type')) || 'text').toLowerCase()
      return TEXT_INPUT[type] === 1
    }

    function allEditable() {
      var out = []
      try { out = document.querySelectorAll('textarea,input,[contenteditable]') } catch (err) { out = [] }
      return out
    }

    function unmarkAll() {
      var marked = []
      try { marked = document.querySelectorAll('[' + MARK + ']') } catch (err) { marked = [] }
      for (var i = 0; i < marked.length; i++) {
        try { marked[i].removeAttribute(MARK); marked[i].removeAttribute('dir') } catch (err) {}
      }
      var inputs = []
      try { inputs = document.querySelectorAll('[' + INPUT_MARK + ']') } catch (err) { inputs = [] }
      for (var j = 0; j < inputs.length; j++) {
        try {
          var dir = inputs[j].getAttribute('dir')
          if (dir === 'rtl' || dir === 'auto') inputs[j].removeAttribute('dir')
          inputs[j].removeAttribute(INPUT_MARK)
        } catch (err) {}
      }
    }

    var queue = []
    var forced = []
    var timer = null

    function schedule(node, force) {
      if (!enabled || !node) return
      if (force) {
        if (forced.length < 200 && forced.indexOf(node) === -1) forced.push(node)
      } else if (queue.length < 500 && queue.indexOf(node) === -1) {
        queue.push(node)
      }
      if (timer !== null) return
      timer = setTimeout(flush, 60)
    }

    function flush() {
      timer = null
      if (!enabled) { queue.length = 0; forced.length = 0; return }
      var forcedItems = forced.slice()
      forced.length = 0
      var items = queue.slice()
      queue.length = 0
      var i
      for (i = 0; i < forcedItems.length; i++) {
        try {
          var el = forcedItems[i]
          if (!el || el.nodeType !== 1) continue
          var block = blockOf(el)
          if (block) reconcile(block)
          if (containsRtl(el) === false) reconcile(el)
          // A control can mount deeper than the block it belongs to (a dropdown
          // inside a wrapper inside the row). A mark set before it arrived would
          // stay and mirror the whole row, which is what made the settings panel
          // look half-flipped — so re-check every marked ancestor too.
          var up = el.parentElement
          var guard = 0
          while (up && guard++ < 40) {
            if (up.getAttribute && up.getAttribute(MARK) === '1') reconcile(up)
            up = up.parentElement
          }
        } catch (err) {}
      }
      for (i = 0; i < items.length; i++) {
        try { scan(items[i]) } catch (err) {}
      }
    }

    function boot() {
      ensureStyle()
      if (enabled) {
        try { scan(document.body) } catch (err) {}
        var inputs = allEditable()
        for (var i = 0; i < inputs.length; i++) syncInput(inputs[i])
      }

      document.addEventListener('input', function (event) {
        if (!enabled) return
        var target = event.target
        if (editable(target)) syncInput(target)
      }, true)

      var observer = new MutationObserver(function (records) {
        if (!enabled) return
        for (var r = 0; r < records.length; r++) {
          var record = records[r]
          if (record.type === 'characterData') {
            schedule(record.target)
            continue
          }
          if (record.target && record.target.nodeType === 1) schedule(record.target, true)
          for (var a = 0; a < record.addedNodes.length; a++) schedule(record.addedNodes[a])
        }
      })
      // Attributes are deliberately not observed: this layer writes attributes,
      // and watching them would feed its own writes back in.
      observer.observe(document.body, { childList: true, subtree: true, characterData: true })
    }

    /** Apply or fully revert the layer, and remember the choice. */
    function setEnabled(next) {
      enabled = !!next
      try { window.localStorage.setItem(STORE_KEY, enabled ? 'on' : 'off') } catch (err) {}
      if (enabled) {
        try { scan(document.body) } catch (err) {}
        var inputs = allEditable()
        for (var i = 0; i < inputs.length; i++) syncInput(inputs[i])
      } else {
        queue.length = 0
        forced.length = 0
        unmarkAll()
      }
      try {
        window.dispatchEvent(new CustomEvent('dsh-arabic:change', { detail: { enabled: enabled } }))
      } catch (err) {}
      return enabled
    }

    // Public face: used by this plugin's own settings row, by the tests, and by
    // anyone who wants to script the layer. Kept tiny on purpose.
    window.__dshArabic = {
      isEnabled: function () { return enabled },
      setEnabled: setEnabled,
      toggle: function () { return setEnabled(!enabled) },
      /** Decision for one string: 'rtl' or null. Exposed for tests and debugging. */
      classify: function (text) { return isRtlDominant(text) ? 'rtl' : null },
      /** The raw counts behind the decision, for diagnostics. */
      weigh: function (text) { return weigh(text) }
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
