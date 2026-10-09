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
 * Two shapes are handled beyond a plain block of prose, both pinned by tests:
 * a text cell that is an inline tag CSS has blockified (the question card's
 * option label and description are `<span>`s inside a flex `<button>` row) takes
 * a direction of its own without moving the row, and a content card's own
 * `<header>`/`<footer>` do not make its text chrome — see CONTENT_CARD below.
 *
 * Injection channel: `webserver/index-inject`. On the packaged Desktop app the
 * table is collected ONCE at host startup, so the rows are registered
 * synchronously in `apply()` — deferring them behind a service inject would
 * lose them — and a restart (not a page refresh) is what makes them appear.
 */

import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

/* ------------------------------------------------------------------ fonts ---
 * Typography, in the three roles the family itself is cut for:
 *
 *   Sans        the interface default — labels, buttons, chrome, small copy.
 *   Serif Text  long-form reading — markdown paragraphs, list items, quotations.
 *   Display     headings (h1–h6), where a headline face belongs.
 *
 * All three are thmanyah's, shipped unmodified under fonts/ with both license
 * texts (see fonts/README.md), and served by this plugin: a prefix route on the
 * app's own web server, because the Desktop shell loads its page from
 * `http://127.0.0.1:<port>` — its host hands Electron an authenticated URL plus
 * the index injection rows — so a same-origin font URL works in both shells and
 * the page carries nine short @font-face rules instead of a megabyte of base64.
 * A deployment without that server leaves the rules pointing at a 404 and the
 * browser falls through to the app's own stack behind every family.
 *
 * The families are applied by re-declaring `--dsw-font-family`, the single
 * variable every typography token in the app's theme resolves through, plus one
 * element rule for each of the other two roles. `--ds-font-family-code` is
 * deliberately untouched: code stays monospace, the way it stays LTR.
 */
const PLUGIN_ROOT = dirname(fileURLToPath(import.meta.url))
/** Prefix the faces are served under; versioned so a release never serves stale bytes. */
const VERSION = (() => {
  try {
    return JSON.parse(readFileSync(join(PLUGIN_ROOT, 'package.json'), 'utf8')).version || '0'
  } catch (err) {
    return '0'
  }
})()
const FONT_ROUTE = '/dsh-arabic/fonts'
const FONT_URL = FONT_ROUTE + '/v' + VERSION
/**
 * Where the three folders live. An explicit DSH_ARABIC_FONTS replaces the whole
 * search — pointing it at an empty directory is how "no font at all" is pinned,
 * by the suite and by a reader who wants the app's own stack back.
 */
const FONT_ROOT = process.env.DSH_ARABIC_FONTS || join(PLUGIN_ROOT, 'fonts')
const FONT_WEIGHTS = [['Regular', 400], ['Medium', 500], ['Bold', 700]]
const FONT_FAMILIES = [
  { id: 'sans', name: 'Thmanyah Sans', folder: 'thmanyahsans', variable: '--dsh-arabic-sans' },
  { id: 'text', name: 'Thmanyah Serif Text', folder: 'thmanyahseriftext', variable: '--dsh-arabic-serif-text' },
  { id: 'display', name: 'Thmanyah Serif Display', folder: 'thmanyahserifdisplay', variable: '--dsh-arabic-display' }
]
/** The app's own stack, kept behind every family so a missing glyph still lands. */
const FONT_FALLBACK = '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Helvetica Neue", Helvetica, Arial, sans-serif'

/** Every weight actually present, resolved once: the route and the stylesheet share the list. */
function listFaces() {
  const faces = []
  for (const family of FONT_FAMILIES) {
    for (const [weightName, weight] of FONT_WEIGHTS) {
      const file = family.folder + '-' + weightName + '.woff2'
      const at = join(FONT_ROOT, family.folder, file)
      let size = 0
      try {
        size = readFileSync(at).length
      } catch (err) {
        continue
      }
      if (!size) continue
      faces.push({ family, file, weight, weightName, at, url: FONT_URL + '/' + family.folder + '/' + file })
    }
  }
  return faces
}

const FONT_FACES = listFaces()
/** Served pathname → the one file it may read. This map is the whole whitelist. */
const FONT_FILES = new Map(FONT_FACES.map((face) => [new URL(face.url, 'http://x').pathname, face.at]))

/**
 * Serve one font file from the whitelist above. Nothing is parsed out of the
 * request, so no request can reach a file that is not a declared face; a method
 * that is not GET/HEAD, an unknown path and a vanished file are all answered
 * without throwing into the server.
 */
function serveFont(req, res) {
  try {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405)
      res.end()
      return
    }
    const pathname = new URL(String(req.url || '/'), 'http://x').pathname
    const file = FONT_FILES.get(pathname)
    if (!file) {
      res.writeHead(404)
      res.end()
      return
    }
    const body = readFileSync(file)
    res.writeHead(200, {
      'content-type': 'font/woff2',
      'content-length': body.length,
      'cache-control': 'public, max-age=31536000, immutable'
    })
    res.end(req.method === 'HEAD' ? undefined : body)
  } catch (err) {
    try {
      res.writeHead(404)
      res.end()
    } catch (inner) {}
  }
}

const FONT_CSS = FONT_FACES.length === 0 ? '' : (() => {
  const families = FONT_FAMILIES.filter((family) => FONT_FACES.some((face) => face.family === family))
  const lines = ['/* dsh-arabic — thmanyah typography, in three roles. See fonts/README.md. */']
  for (const face of FONT_FACES) {
    lines.push('@font-face {')
    lines.push("  font-family: '" + face.family.name + "';")
    lines.push('  font-style: normal;')
    lines.push('  font-weight: ' + face.weight + ';')
    lines.push('  font-display: swap;')
    lines.push('  src: url(' + face.url + ") format('woff2');")
    lines.push('}')
  }
  lines.push('')
  lines.push('/* One harness for all three roles: the app resolves every typography token')
  lines.push('   through --dsw-font-family, and the two role variables carry the reading and')
  lines.push('   the heading cut. Two selectors because the app declares the base variable on')
  lines.push('   :root and the desktop shell re-declares it on body; html:root outranks the')
  lines.push('   first and the body selector the second, neither depending on stylesheet')
  lines.push("   order (this row is injected before the app's own CSS). */")
  lines.push('html:root,')
  lines.push('html:root body {')
  for (const family of families) {
    lines.push('  ' + family.variable + ": '" + family.name + "', " + FONT_FALLBACK + ';')
  }
  const base = families.find((family) => family.id === 'sans') || families[0]
  lines.push('  --dsw-font-family: var(' + base.variable + ');')
  lines.push('}')
  if (families.some((family) => family.id === 'text')) {
    lines.push('')
    lines.push('/* Long-form reading: markdown paragraphs, list items and quotations. */')
    lines.push('html:root :is(p, li, blockquote, dd) {')
    lines.push('  font-family: var(--dsh-arabic-serif-text);')
    lines.push('}')
  }
  if (families.some((family) => family.id === 'display')) {
    lines.push('')
    lines.push('/* Headings wear the display cut. */')
    lines.push('html:root :is(h1, h2, h3, h4, h5, h6) {')
    lines.push('  font-family: var(--dsh-arabic-display);')
    lines.push('}')
  }
  lines.push('')
  return lines.join('\n')
})()

const MARK = 'data-dsh-arabic-bidi'
const STYLE_MARK = 'dsh-arabic'
const INSTALL_FLAG = '__dshArabicInstalled'

const DIRECTION_CSS = `
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
   the app's: this block only renames an animation, so it can never re-enable one
   the app turned off for prefers-reduced-motion.

   Two things decide whether any of it lands, and both were measured against the
   shipped app rather than assumed:
   - the class names. The build renames every CSS module class, so the app's
     .sweep reaches the DOM as _sweep_1rdzk_34 and a bare .sweep selector matches
     nothing in production. The attribute pattern below is what matches; the plain
     class is kept for the DOM shim and for builds that keep the names, and
     data/shimmer-pins.json records what this was verified against;
   - the locale gate. html:lang(ar) works because the app points the html lang
     attribute at the active locale — the right semantic source. The
     data-dsh-arabic-locale attribute is ours, written by the browser half from the
     same locale snapshot, so a change upstream cannot quietly kill the mirror. */
html:lang(ar) :is(.sweep, [class*="_sweep_"]),
[data-dsh-arabic-locale="ar"] :is(.sweep, [class*="_sweep_"]) {
  animation-name: dsh-arabic-shimmer-sweep;
  transform: translateX(100%);
  mask-image: linear-gradient(75deg, transparent 0%, black 40% 60%, transparent 100%);
}
html:lang(ar) :is(.highlight, [class*="_highlight_"]),
[data-dsh-arabic-locale="ar"] :is(.highlight, [class*="_highlight_"]) {
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
  var LATIN_CHAR = /\p{Script=Latin}/u
/**
   * Unit splitter. Whitespace separates — punctuation deliberately does not, so
   * `@deepseek-ai/dsh` stays one word instead of three — but a double-quoted
   * span is one unit regardless of what is inside it:
   *
   *   git status     two Latin words
   *   "git status"   one quotation — a phrase, a command, a title
   *
   * A quotation is an object inside the sentence, so counting its words
   * separately is what left `شغّل "git status"` LTR (two Latin words against one
   * Arabic word) although the sentence around it is Arabic. Following the quote
   * is also what the reader sees: the marks travel with the text between them.
   *
   * An unclosed quote — a streamed answer, mid-quotation — runs to the end of the
   * text, which is the unit its closed form will produce, so nothing flickers
   * when the closing mark arrives. A unit that is only \`""\` votes for nothing.
   */
  var SEPARATOR = /\s+/u

  function units(text) {
    var out = []
    var value = String(text == null ? '' : text)
    var current = ''
    var quoted = false
    for (var i = 0; i < value.length; i++) {
      var ch = value.charAt(i)
      if (ch === '"') {
        current += ch
        if (quoted) {
          out.push(current)
          current = ''
          quoted = false
        } else {
          quoted = true
        }
        continue
      }
      if (!quoted && SEPARATOR.test(ch)) {
        SEPARATOR.lastIndex = 0
        if (current) {
          out.push(current)
          current = ''
        }
        continue
      }
      current += ch
    }
    SEPARATOR.lastIndex = 0
    if (current) out.push(current)
    return out
  }
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
   * Tags that are inline by default. Walking past them needs no style read, which
   * is the difference between one reflow per element and one per paragraph: a page
   * of prose is mostly spans inside blocks. If one of these is styled block after
   * all, its nearest block ancestor takes the decision — the text is inside that
   * ancestor either way, so the outcome is the same and nothing is mislaid.
   */
  var INLINEISH = {
    SPAN: 1, A: 1, B: 1, I: 1, EM: 1, STRONG: 1, SMALL: 1, SUB: 1, SUP: 1, LABEL: 1,
    ABBR: 1, CITE: 1, MARK: 1, U: 1, S: 1, BDI: 1, BDO: 1, TIME: 1, BR: 1, WBR: 1, Q: 1, DFN: 1
  }
  /**
   * Interactive chrome. A row that owns controls is a toolbar, not prose:
   * flipping it reverses its children and moves the send button to the wrong
   * side. The composer's control row carries an Arabic permission label, so this
   * is not a hypothetical case.
   */
  var INTERACTIVE = 'button,select,[role="button"],[role="combobox"],[role="menuitem"],[role="tab"],[role="switch"],[role="checkbox"]'
  /**
   * The element is *itself* a control. Its own copy is the control's label and
   * keeps the control's layout: a flex button reverses its icon and label when
   * its direction flips, and a centred label jumps to an edge when the alignment
   * is overridden — the same family as the send button that moved sides. So a
   * control is never a candidate for a direction of its own; the text blocks
   * inside it still are (the question card's option label is a cell of its own).
   */
  var CONTROL = INTERACTIVE + ',[role="radio"]'
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
   *
   * The two halves are kept apart because the *tags* are weaker evidence than
   * the roles: a card may draw its own `<header>`/`<footer>` and mean "the top
   * and bottom of this card", not "a landmark of the shell".
   */
  var CHROME_ROLE = '[role="dialog"],[aria-modal="true"],[role="navigation"],[role="menu"],[role="menubar"],[role="tablist"],[role="toolbar"],[role="listbox"],[role="banner"],[role="complementary"],[role="form"]'
  var CHROME_TAG = 'nav,aside,header,footer'
  /**
   * Content cards that draw their own `<header>`/`<footer>`.
   *
   * DSH builds the composer's question card — the panel that asks the reader to
   * pick an option — as a `<section>` whose question sits in an authored
   * `<header>` and whose pager and buttons sit in a `<footer>`. Those tags are
   * the card's own parts, so its question is content and may take a direction
   * like any other block; only the landmark tags *outside* such a card are
   * chrome. The frame carries `data-question-key`; the marker is pinned in
   * data/card-pins.json and re-read from the shipped archive by
   * scripts/check-card-pins.mjs, because a rename upstream would silently send
   * the question back to LTR.
   */
  var CONTENT_CARD = '[data-question-key]'
  var SKIP_SELECTOR = 'pre,code,kbd,samp,var,tt,script,style,noscript,template,input,textarea,select,option,svg,path,canvas,img,video,audio'

  try {
    if (window[INSTALL_FLAG]) return
    window[INSTALL_FLAG] = true

    var enabled = true
    try { enabled = window.localStorage.getItem(STORE_KEY) !== 'off' } catch (err) {}

    /**
     * The host injects this same stylesheet as an index row — a bare <style> with
     * no id of its own — so a style element carrying exactly this text *is* the
     * stylesheet, and a second copy must not be pasted over it: with the embedded
     * faces that copy would be a third of a megabyte duplicated in every page.
     * Anywhere else (a static deployment that dropped the row, a test, a page
     * assembled by hand) the layer still installs its own copy, which is what
     * keeps the row optional.
     */
    function ensureStyle() {
      var css = window.__dshArabicCss || ''
      try {
        var present = document.querySelectorAll('style')
        for (var i = 0; i < present.length; i++) {
          if (present[i].textContent === css) return
        }
      } catch (err) {}
      if (document.getElementById(STYLE_ID)) return
      var style = document.createElement('style')
      style.id = STYLE_ID
      style.textContent = css
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
    /**
     * A technical token: a URL, a path, a scoped package name, a sha, a ratio, a
     * dotted file name. The separator only counts when a word character sits on
     * **both** sides of it — otherwise a label such as `Note:` or `Error:` would
     * be read as code, stop voting, and glue the Latin words after it into a unit
     * they do not belong to. The behaviour is pinned in the golden matrix.
     */
    var CODEISH = /https?:\/\/\S+|\S*[\w][._/:+@#\\]+[\w]\S*|\b[0-9a-f]{6,}\b|\b\d+\/\d+\b|\b[\w-]+\.[\w-]{2,}\b/g

    /** True when one whitespace token looks like code, a path, a URL or a sha. */
    function isCodeish(token) {
      CODEISH.lastIndex = 0
      return CODEISH.test(token)
    }

    /**
     * Weigh a block's prose: code-like tokens do not vote, words do.
     *
     * - Unit: one whitespace-delimited token — or one double-quoted span, which
     *   is a single object however many words it holds (see units()).
     * - A token holding any RTL character is an Arabic word; otherwise a token
     *   holding a Latin letter is a Latin word; a token with neither (numbers,
     *   punctuation) counts as neither.
     * - A code-like token votes for nothing — **including one that carries Arabic
     *   letters**, such as a Windows path through an Arabic folder name, which is a
     *   path and not Arabic prose — and it makes the Latin word that
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
      var tokens = units(text)
      var glued = false
      for (var i = 0; i < tokens.length; i++) {
        var token = tokens[i]
        if (!token) continue
        // Code first: a path or URL that happens to carry an Arabic folder name
        // is one technical token, not an Arabic word — and counting it as prose is
        // what flipped a block of pure paths to RTL, which then re-ordered each
        // path's own Latin runs around that word. A block of paths stays LTR.
        if (isCodeish(token)) {
          glued = true
          continue
        }
        if (RTL_CHAR.test(token)) {
          out.rtl++
          glued = false
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

    /* ------------------------------------------------------------ pass cache ---
     * One pass visits the same ancestors and the same blocks many times, and every
     * style read is a reflow in a real browser. These caches live exactly one pass:
     * created at the top, dropped at the end, so nothing can go stale when a class
     * change turns a block into a flex row between passes.
     */
    var passCache = null

    function beginPass() { passCache = { display: new Map(), interactive: new Map() } }
    function endPass() { passCache = null }

    function computedDisplay(el) {
      if (passCache) {
        var hit = passCache.display.get(el)
        if (hit !== undefined) return hit
      }
      var value = ''
      try { value = getComputedStyle(el).display || '' } catch (err) { value = '' }
      if (passCache) passCache.display.set(el, value)
      return value
    }

    function ownsInteractive(el) {
      if (passCache) {
        var hit = passCache.interactive.get(el)
        if (hit !== undefined) return hit
      }
      var value = false
      try { value = !!(el.querySelector && el.querySelector(INTERACTIVE)) } catch (err) { value = false }
      if (passCache) passCache.interactive.set(el, value)
      return value
    }

    /** The element itself is a control, not a block of prose. */
    function isControl(el) {
      try {
        return !!(el.closest && el.closest(CONTROL) === el)
      } catch (err) {
        return false
      }
    }

    /**
     * A block's text and whether it carries Arabic, in one walk. The previous shape
     * walked every subtree twice — once to weigh it, once to ask whether it held
     * Arabic at all.
     */
    function blockInfo(el) {
      var out = ''
      var hasRtl = false
      var walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null)
      var node
      while ((node = walker.nextNode())) {
        var parent = node.parentElement
        if (parent && parent.closest && parent.closest(SKIP_SELECTOR)) continue
        var value = node.nodeValue || ''
        if (!hasRtl && RTL_CHAR.test(value)) hasRtl = true
        out += value
        out += ' '
      }
      return { text: out, hasRtl: hasRtl }
    }

    /**
     * Is this element inside a chrome surface? Roles settle it; tags settle it
     * only outside a content card, so a card's own `<header>` does not make its
     * question chrome.
     */
    function inChrome(el) {
      try {
        if (el.closest && el.closest(CHROME_ROLE)) return true
      } catch (err) {}
      var landmark = null
      try {
        landmark = el.closest ? el.closest(CHROME_TAG) : null
      } catch (err) { landmark = null }
      if (!landmark) return false
      try {
        return !(landmark.closest && landmark.closest(CONTENT_CARD))
      } catch (err) {
        return true
      }
    }

    /**
     * An inline-by-default tag that CSS has blockified — a flex or grid item, or
     * an explicit `display` — is a text cell in its own right, not part of the
     * flow around it. The question card is the case that matters: each option is
     * a flex `<button>` whose label and description are `<span>`s, and walking
     * past them lands on the row (flex, owns a control) and gives up, leaving a
     * mixed `ادفع fix/rust-flake كما هو` in LTR run order. `display: contents`
     * keeps the tag's own box out of the layout, so it stays inline here.
     */
    function isBlockifiedInline(el) {
      var display = computedDisplay(el)
      return !!display && display !== 'contents' && display.indexOf('inline') !== 0
    }

    /**
     * Only text blocks are direction candidates — and only in content.
     *
     * Chrome is excluded by four tests, in order of how much damage getting it
     * wrong does:
     *   1. it lives inside a chrome surface (a dialog, a menu, the shell) — a
     *      per-block decision there produces ragged alignment, so chrome keeps
     *      the layout's own alignment and only the text runs follow bidi;
     *   2. its computed display is flex or grid — flipping one reorders children;
     *   3. it owns interactive controls — that is a toolbar, not prose;
     *   4. it *is* a control — its label belongs to the control's layout.
     *
     * The Arabic text inside those rows is still handled when it sits in a normal
     * block of its own — or in a blockified inline cell such as an option label —
     * so an Arabic permission label reads correctly without moving the composer's
     * send button.
     */
    function isBlockCandidate(el) {
      if (!el || el.nodeType !== 1 || SKIP[el.tagName]) return false
      if (INLINEISH[el.tagName] && !isBlockifiedInline(el)) return false
      if (inChrome(el)) return false
      if (isControl(el)) return false
      if (CONTAINER[el.tagName]) return true
      var display = computedDisplay(el)
      if (!display || display.indexOf('inline') === 0) return false
      if (display === 'flex' || display === 'grid') return false
      if (ownsInteractive(el)) return false
      return true
    }

    /**
     * Nearest block (or container) ancestor, starting at the node itself.
     *
     * Inline-by-default tags are walked past without a style read — a page of
     * prose is mostly spans inside blocks, and every read is a reflow — but the
     * first one seen is kept unread: a text cell that CSS has blockified (a flex
     * item such as an option label) is the block when nothing above it qualifies.
     * Asking is a read, so it is asked only when the walk found nothing usable,
     * which keeps prose exactly as cheap as it was.
     */
    function blockOf(node) {
      var el = node && node.nodeType === 1 ? node : (node ? node.parentElement : null)
      var fallback = null
      var inlineish = null
      while (el && el !== document.body && el !== document.documentElement) {
        if (SKIP[el.tagName]) { el = el.parentElement; continue }
        if (CONTAINER[el.tagName]) return el
        if (INLINEISH[el.tagName]) {
          if (!inlineish) inlineish = el
          el = el.parentElement
          continue
        }
        if (!fallback) {
          var display = computedDisplay(el)
          if (display && display.indexOf('inline') !== 0) fallback = el
        }
        el = el.parentElement
      }
      if (!inlineish || (fallback && isBlockCandidate(fallback))) return fallback
      var cell = inlineish
      while (cell && cell !== document.body && cell !== document.documentElement) {
        if (INLINEISH[cell.tagName] && isBlockifiedInline(cell) && isBlockCandidate(cell)) return cell
        cell = cell.parentElement
      }
      return fallback
    }

    /**
     * Set, keep or withdraw the direction for one block. A `dir` we did not set
     * is left alone: that is the opt-out for any block this estimator gets
     * wrong.
     */
    /**
     * Is this element inside a surface the reader types into? The composer is a
     * Lexical contenteditable whose every paragraph carries `dir="auto"` — the one
     * app-set direction that is not an authored direction but a delegation to the
     * browser's first-strong rule, which is precisely the rule this layer replaces.
     */
    function inEditable(el) {
      try {
        return !!(el.closest && el.closest('[contenteditable]'))
      } catch (err) {
        return false
      }
    }

    function reconcile(el, info) {
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
          if (el.getAttribute('dir') === 'rtl') el.removeAttribute('dir')
        }
        return
      }
      var dir = el.getAttribute('dir')
      // An authored direction is the opt-out and stays untouched. `auto` is not an
      // authored direction — it hands the decision to the browser's first-strong
      // rule — so inside the composer (Lexical writes `auto` on every paragraph),
      // the estimator takes that decision over: the marker's stylesheet beats the
      // attribute, which is only a presentational hint.
      if (dir && !ours && !(dir === 'auto' && inEditable(el))) return
      var facts = info || blockInfo(el)
      // No Arabic anywhere in the block releases it without weighing the text.
      var want = facts.hasRtl && isRtlDominant(facts.text, ours)
      if (want && !ours) {
        el.setAttribute(MARK, '1')
        // `auto` stays where it is: our `direction`/`unicode-bidi` win over the
        // hint, so the app's own value is intact the moment the mark is withdrawn.
        if (dir !== 'auto') el.setAttribute('dir', 'rtl')
      } else if (!want && ours) {
        el.removeAttribute(MARK)
        if (el.getAttribute('dir') === 'rtl') el.removeAttribute('dir')
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
      var seen = new Set()
      var node
      while ((node = walker.nextNode())) {
        if (!RTL_CHAR.test(node.nodeValue || '')) continue
        var parent = node.parentElement
        if (!parent || (parent.closest && parent.closest(SKIP_SELECTOR))) continue
        var block = blockOf(parent)
        if (!block || seen.has(block)) continue
        seen.add(block)
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
      beginPass()
      try {
        for (i = 0; i < forcedItems.length; i++) {
          try {
            var el = forcedItems[i]
            if (!el || el.nodeType !== 1) continue
            var facts = blockInfo(el)
            var block = blockOf(el)
            if (block) reconcile(block, block === el ? facts : null)
            if (!facts.hasRtl) reconcile(el, facts)
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
      } finally {
        endPass()
      }
    }

    function boot() {
      ensureStyle()
      if (enabled) {
        beginPass()
        try { scan(document.body) } catch (err) {} finally { endPass() }
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
        beginPass()
        try { scan(document.body) } catch (err) {} finally { endPass() }
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

/** The injected stylesheet: the font layer first, then the direction layer. */
const CSS = FONT_CSS + DIRECTION_CSS

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

    /* The faces are served, not inlined. `inject` waits for the service, so a
       composition without a web server never registers this route and the
       stylesheet's font URLs fall through to the app's own stack. */
    if (FONT_FACES.length && typeof root.inject === 'function') {
      try {
        root.inject(['webServer'], (webCtx) => {
          webCtx.effect(
            () => webCtx.webServer.register({ kind: 'prefix', path: FONT_ROUTE, handler: serveFont }),
            'dsh-arabic: font route'
          )
        })
      } catch (err) {
        // A composition without the service keeps the app's own stack; never throw.
      }
    }
  }
}

export { CSS, MARK, STYLE_MARK, FONT_ROUTE, FONT_FACES, FONT_FAMILIES, serveFont }
