/**
 * browser-bidi.mjs — the direction layer, rendered by a real bidi engine.
 *
 * The shim suite (tests/verify-rtl.mjs) proves what the layer *decides*; it
 * cannot prove what the browser *does* with that decision. Run order, the
 * interaction of a Latin run with an Arabic sentence and the placement of the
 * first glyph are engine work, so this test renders a page in headless Chromium,
 * reads the direction back out of the layout (the x position of the first and
 * last glyph of every fixture, via Range rects) and compares it with what the
 * golden matrix says the reading should be.
 *
 * A missing browser is a SKIP, not a failure: the gate is about the engine, and
 * a machine without Chromium has nothing to prove. Set CHROME_PATH to choose one.
 *
 * Run: node tests/browser-bidi.mjs
 */

import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { CSS, CLIENT_TEXT } from '../index.js'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(ROOT, '.tmp', 'browser-bidi')

/* ------------------------------------------------------------------ chrome --- */

const CANDIDATES = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, 'Google/Chrome/Application/chrome.exe'),
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium-browser',
  '/usr/bin/chromium',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
].filter(Boolean)

const chrome = CANDIDATES.find((candidate) => existsSync(candidate))
if (process.env.CHROME_PATH && !existsSync(process.env.CHROME_PATH)) {
  // An explicit path that is not there is a skip, not a fallback: the caller said
  // which browser to use, and quietly using another one answers a question nobody
  // asked.
  console.log(`browser-bidi: SKIP — CHROME_PATH points at nothing (${process.env.CHROME_PATH})`)
  process.exit(0)
}
if (!chrome) {
  console.log('browser-bidi: SKIP — no Chrome/Chromium found (set CHROME_PATH to run this gate)')
  process.exit(0)
}

/* ---------------------------------------------------------------- fixtures --- */

/**
 * Every fixture is one of the golden matrix's decisions, rendered rather than
 * simulated. `rtl: true` means both the mark and the laid-out order must read
 * right-to-left; `rtl: false` means the block is released and stays LTR.
 */
const FIXTURES = [
  { id: 'arabic-first', html: '<p>كيف حالك Hello</p>', rtl: true },
  { id: 'latin-first-arabic', html: '<p>Hello كيف حالك</p>', rtl: true },
  { id: 'error-line', html: '<p>Error: فشل الاتصال بالخادم</p>', rtl: true },
  { id: 'npm-then-arabic', html: '<p>npm install ثم أعد التشغيل</p>', rtl: true },
  { id: 'command-glued', html: '<p>شغّل npx @deepseek-ai/dsh web</p>', rtl: true },
  { id: 'quoted-command', html: '<p>شغّل "git status"</p>', rtl: true },
  { id: 'english-quoting-arabic', html: '<p>The build failed while parsing سلام in the file</p>', rtl: false },
  { id: 'bare-latin-limit', html: '<p>شغّل git status</p>', rtl: false },
  { id: 'code-block', html: '<pre>const x = 1 // عربي</pre>', rtl: false },
  {
    id: 'card-option-cell',
    html: '<section data-question-key="q"><header><p>أي فرع تدفع؟</p></header>' +
      '<button style="display:flex"><span style="display:block">ادفع fix/rust-flake كما هو</span></button></section>',
    rtl: true,
    selector: 'span'
  }
]

const MARK = 'data-dsh-arabic-bidi'

const probe = `
(function () {
  var FIXTURES = ${JSON.stringify(FIXTURES.map((f) => ({ id: f.id, rtl: f.rtl, selector: f.selector || null })))};
  var MARK = ${JSON.stringify(MARK)};

  function rectOf(node, start, end) {
    var range = document.createRange();
    range.setStart(node, start);
    range.setEnd(node, end);
    return range.getBoundingClientRect();
  }

  /** Where the first glyph sits relative to the last: the engine's own verdict. */
  function visualOrder(el) {
    var walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null);
    var node;
    while ((node = walker.nextNode())) {
      var text = node.nodeValue || '';
      var first = text.search(/\\S/);
      if (first < 0) continue;
      var last = text.length - 1;
      while (last > first && /\\s/.test(text.charAt(last))) last--;
      try {
        var a = rectOf(node, first, first + 1);
        var b = rectOf(node, last, last + 1);
        if (!a.width || !b.width) continue;
        if (a.left > b.left + 0.5) return 'rtl';
        if (a.left < b.left - 0.5) return 'ltr';
        return 'unknown';
      } catch (err) {
        return 'error';
      }
    }
    return 'empty';
  }

  function run() {
    var root = document.getElementById('fixtures');
    var results = [];
    for (var i = 0; i < FIXTURES.length; i++) {
      var spec = FIXTURES[i];
      var host = document.getElementById(spec.id);
      var el = spec.selector ? host.querySelector(spec.selector) : host.firstElementChild;
      var marked = el.getAttribute(MARK) === '1';
      var computed = window.getComputedStyle(el).direction;
      var visual = visualOrder(el);
      var ok = spec.rtl
        ? marked && computed === 'rtl' && visual === 'rtl'
        : !marked && computed === 'ltr' && visual === 'ltr';
      results.push({
        id: spec.id,
        expect: spec.rtl ? 'rtl' : 'ltr',
        marked: marked,
        dir: el.getAttribute('dir'),
        computed: computed,
        visual: visual,
        ok: ok
      });
    }
    document.getElementById('results').textContent = JSON.stringify(results);
    document.title = results.every(function (r) { return r.ok; }) ? 'ok' : 'fail';
  }

  // The layer debounces observer work by 60 ms; one frame more than that is
  // enough for the boot scan plus the mutation queue. The layer also honours a
  // stored on/off choice, and this gate is about layout rather than the setting,
  // so it starts from enabled whatever the page inherited.
  setTimeout(function () {
    try {
      if (window.__dshArabic && !window.__dshArabic.isEnabled()) window.__dshArabic.setEnabled(true);
    } catch (err) {}
    run();
  }, 400);
})();
`

const page = `<!doctype html>
<html lang="ar">
<head>
<meta charset="utf-8">
<title>pending</title>
<style>${CSS}</style>
</head>
<body>
<div id="fixtures">
${FIXTURES.map((f) => `  <div id="${f.id}">${f.html}</div>`).join('\n')}
</div>
<pre id="results">pending</pre>
<script>${CLIENT_TEXT}</script>
<script>${probe}</script>
</body>
</html>
`

mkdirSync(OUT, { recursive: true })
// A fresh browser profile every run. The layer stores its on/off choice in
// localStorage, so a profile left behind by an earlier run can switch the layer
// off and make this gate fail for a reason that has nothing to do with layout.
const profileDir = join(OUT, 'profile')
rmSync(profileDir, { recursive: true, force: true })
mkdirSync(profileDir, { recursive: true })
const pagePath = join(OUT, 'page.html')
writeFileSync(pagePath, page)

/* ------------------------------------------------------------------- run it --- */

let dom = ''
try {
  dom = execFileSync(
    chrome,
    [
      '--headless=new',
      '--disable-gpu',
      '--no-first-run',
      '--no-default-browser-check',
      '--hide-scrollbars',
      '--window-size=1400,2000',
      '--virtual-time-budget=6000',
      // Runners execute as a user the sandbox cannot set up for; the page is our
      // own generated file, so the wider flag is confined to CI.
      ...(process.env.CI ? ['--no-sandbox'] : []),
      '--user-data-dir=' + profileDir,
      '--dump-dom',
      pathToFileURL(resolve(pagePath)).href
    ],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 90000, maxBuffer: 64 * 1024 * 1024 }
  )
} catch (err) {
  const detail = String(err.stderr || err.message || err).trim().split('\n').slice(-8).join('\n')
  console.error(detail)
  console.error('browser-bidi: chromium did not return a document')
  process.exit(1)
}

const captured = /<pre id="results">([\s\S]*?)<\/pre>/.exec(dom)
if (!captured) {
  console.error('browser-bidi: the page did not report results (probe did not run?)')
  process.exit(1)
}

let results
try {
  results = JSON.parse(captured[1])
} catch (err) {
  console.error('browser-bidi: unreadable result payload: ' + captured[1].slice(0, 200))
  process.exit(1)
}

let failed = 0
for (const r of results) {
  if (!r.ok) failed++
  console.log(
    `${r.ok ? 'PASS' : 'FAIL'}  ${r.id}  expect=${r.expect} marked=${r.marked} dir=${r.dir} ` +
      `computed=${r.computed} laid-out=${r.visual}`
  )
}
console.log(`\n${results.length - failed}/${results.length} fixtures laid out correctly — ${chrome}`)
process.exit(failed === 0 ? 0 : 1)
