/**
 * verify-fonts.mjs — the typography layer and the route that serves it.
 *
 * Three thmanyah cuts ship in `fonts/` — Sans for the interface, Serif Text for
 * long-form reading, Serif Display for headings — and `index.js` serves them from
 * a prefix route on the app's own web server, because the Desktop shell loads its
 * page from `http://127.0.0.1:<port>` (its host hands Electron an authenticated
 * URL plus the index injection rows). Both ends of that contract are pinned here:
 *
 *   1. no font on the machine  → no @font-face, no family override, no route;
 *   2. fonts present           → one URL face per weight, the three role variables
 *      and their element rules, a registered `/dsh-arabic/fonts` route whose
 *      handler serves exactly the declared files and nothing else.
 *
 * index.js resolves its directories when it is imported, so every case runs in a
 * child process with DSH_ARABIC_FONTS pinned — an explicit value is the whole
 * search, which is what makes case 1 reproducible on a machine that has the fonts.
 *
 * Run: node tests/verify-fonts.mjs
 */

import { execFileSync, execFile } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const INDEX = pathToFileURL(join(ROOT, 'index.js')).href

let failed = 0
const check = (ok, label, detail) => {
  if (!ok) failed++
  console.log((ok ? 'PASS  ' : 'FAIL  ') + label + (ok || !detail ? '' : '  (' + detail + ')'))
}

/** Import index.js in a child process with DSH_ARABIC_FONTS pointed at one directory. */
function load(dir) {
  const script = [
    "const m = await import(" + JSON.stringify(INDEX) + ");",
    "const out = { CSS: m.CSS, FONT_ROUTE: m.FONT_ROUTE, FONT_FACES: m.FONT_FACES, route: null, registered: 0, probes: null, url: null };",
    "m.default.apply({ on: () => {}, inject: (s, cb) => { out.registered++; cb({ effect: (fn) => fn(), webServer: { register: (r) => { out.route = r; return () => {} } } }) } });",
    "if (m.FONT_FACES.length) {",
    "  out.url = new URL(m.FONT_FACES[0].url, 'http://x').pathname;",
    "  const call = (method, path) => {",
    "    const seen = { status: null, headers: null, body: null };",
    "    m.serveFont({ method, url: path }, {",
    "      writeHead: (status, headers) => { seen.status = status; seen.headers = headers || {} },",
    "      end: (body) => { if (body) seen.body = Buffer.from(body).toString('base64') }",
    "    });",
    "    return seen;",
    "  };",
    "  out.probes = {",
    "    get: call('GET', out.url),",
    "    head: call('HEAD', out.url),",
    "    absent: call('GET', m.FONT_ROUTE + '/absent.woff2'),",
    "    traversal: call('GET', m.FONT_ROUTE + '/../index.js'),",
    "    post: call('POST', out.url)",
    "  };",
    "}",
    "process.stdout.write(JSON.stringify(out))"
  ].join("");
  const raw = execFileSync(process.execPath, ['--input-type=module', '-e', script], {
    encoding: 'utf8',
    env: { ...process.env, DSH_ARABIC_FONTS: dir }
  });
  return JSON.parse(raw);
}

const work = mkdtempSync(join(tmpdir(), 'dsh-arabic-fonts-'))
const empty = join(work, 'empty')
const supplied = join(work, 'supplied')
mkdirSync(empty)
mkdirSync(supplied)

const FAMILIES = [['sans', 'thmanyahsans'], ['text', 'thmanyahseriftext'], ['display', 'thmanyahserifdisplay']]
const WEIGHTS = [['Regular', 400], ['Medium', 500], ['Bold', 700]]
const bodies = new Map()
for (const [id, folder] of FAMILIES) {
  mkdirSync(join(supplied, folder))
  for (const [name, weight] of WEIGHTS) {
    /* Synthetic bytes: nothing here parses a font, and a real one only slows the
       suite down — the bytes only have to come back identical. */
    const body = Buffer.from('wOF2 synthetic ' + folder + ' ' + name + ' ' + weight)
    bodies.set(folder + '/' + folder + '-' + name + '.woff2', body)
    writeFileSync(join(supplied, folder, folder + '-' + name + '.woff2'), body)
  }
}
/* A stray file must be ignored, not guessed at. */
writeFileSync(join(supplied, 'thmanyahsans', 'thmanyahsans-Black.woff2'), Buffer.from('wOF2 synthetic Black 900'))

try {
  /* ------------------------------------------------------------ no font ---- */
  const bare = load(empty)
  check(!/@font-face/.test(bare.CSS), 'no font: no @font-face is emitted')
  check(!/--dsh-font-family|--dsw-font-family/.test(bare.CSS), 'no font: no family variable is declared')
  check(/\[data-dsh-arabic-bidi="1"\]/.test(bare.CSS), 'no font: the direction layer is untouched')
  check(bare.FONT_FACES.length === 0, 'no font: no face is listed')
  check(bare.route === null, 'no font: no route is registered')

  /* -------------------------------------------------------------- fonts ---- */
  const withFont = load(supplied)
  check(withFont.FONT_FACES.length === 9, 'fonts: nine faces are listed (three cuts x three weights)', String(withFont.FONT_FACES.length))
  check((withFont.CSS.match(/@font-face/g) || []).length === 9, 'fonts: nine @font-face rules are emitted')
  check(!/data:font/.test(withFont.CSS), 'fonts: the faces are URLs, never inlined base64')
  check(withFont.CSS.includes(withFont.FONT_ROUTE + '/v'), 'fonts: every face is served under the versioned route')
  check(withFont.route !== null && withFont.route.kind === 'prefix' && withFont.route.path === withFont.FONT_ROUTE, 'fonts: the route is registered as a prefix')
  check(withFont.registered === 1, 'fonts: the route is registered exactly once')
  check(!/font-weight: 900/.test(withFont.CSS), 'fonts: the unknown Black weight is not declared')

  /* The three roles: a variable each, one base declaration, two element rules. */
  for (const [id, name] of [['sans', 'Thmanyah Sans'], ['text', 'Thmanyah Serif Text'], ['display', 'Thmanyah Serif Display']]) {
    check(withFont.CSS.includes("--dsh-arabic-" + (id === 'text' ? 'serif-text' : id) + ": '" + name + "'"), 'fonts: the ' + id + ' role has a variable')
  }
  check(/--dsw-font-family: var\(--dsh-arabic-sans\)/.test(withFont.CSS), 'fonts: the interface default is the sans cut')
  check(/html:root :is\(p, li, blockquote, dd\) \{\s*font-family: var\(--dsh-arabic-serif-text\)/.test(withFont.CSS), 'fonts: prose wears the text cut')
  check(/html:root :is\(h1, h2, h3, h4, h5, h6\) \{\s*font-family: var\(--dsh-arabic-display\)/.test(withFont.CSS), 'fonts: headings wear the display cut')
  check(!/--ds-font-family-code\s*:/.test(withFont.CSS), 'fonts: the code family is never declared')
  check(withFont.CSS.indexOf('@font-face') < withFont.CSS.indexOf('[data-dsh-arabic-bidi="1"]'), 'fonts: the font block precedes the direction layer')

  /* The handler: the whitelist, the headers, and the exact bytes. */
  const file = withFont.FONT_FACES[0]
  const probes = withFont.probes
  const expected = bodies.get(file.family.folder + '/' + file.file)
  check(probes.get.status === 200 && probes.get.headers['content-type'] === 'font/woff2', 'route: GET serves the face as font/woff2', String(probes.get.status))
  check(probes.get.body !== null && Buffer.from(probes.get.body, 'base64').equals(expected), 'route: the served bytes are the file, unmodified')
  check(/immutable/.test(String(probes.get.headers['cache-control'])) && /\/v\d/.test(String(withFont.url)), 'route: the versioned URL is immutable-cacheable')
  check(probes.head.status === 200 && probes.head.body === null && Number(probes.head.headers['content-length']) === expected.length, 'route: HEAD answers the headers and no body')
  check(probes.absent.status === 404, 'route: an unknown face is a 404')
  check(probes.traversal.status === 404, 'route: a traversal is a 404, never a file read')
  check(probes.post.status === 405, 'route: a method other than GET/HEAD is a 405')
} finally {
  rmSync(work, { recursive: true, force: true })
}

const total = 4 + 3 + 6 + 8 + 8
console.log('')
console.log((total - failed) + '/' + total + ' font checks passed')
process.exit(failed === 0 ? 0 : 1)