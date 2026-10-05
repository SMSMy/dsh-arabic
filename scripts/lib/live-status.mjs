/**
 * live-status.mjs — one definition of the "live status" family.
 *
 * The app's running indicators share one shape: an English value that ends with the
 * ellipsis it animates (`···` or `…`), often with a duration counter. That family is
 * a census of the catalogue, and every tool that reasons about it imports it from
 * here (`scripts/find-live-status.mjs`, `scripts/check-bidi-family.mjs`,
 * `scripts/verify-fixes.mjs`) so "the family" cannot come to mean two things.
 *
 * Isolation — wrapping the value in U+2066 LRI … U+2069 PDI — is **not** a property
 * of the string. Measured in Chrome: in an LTR block it changes nothing at all,
 * while in an RTL block it is what moves the ellipsis from the left edge back to
 * the right of the phrase. Which of the two a string lands in is decided by the
 * surface that renders it, and no catalogue can know that. So every isolated key,
 * and every mixed-script key (visible Latin or digits beside the ellipsis), is a
 * recorded decision in `data/bidi-decisions.json` rather than an inference.
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/** Left-to-right isolate / pop directional isolate, as written into a value. */
export const LRI = '\u2066'
export const PDI = '\u2069'

/** The English side of a live-status string: it ends with the animated ellipsis. */
export const isLiveStatus = (english) => /···|…\s*$/.test(english)

/**
 * Census the family from the extracted key set and the Arabic pack.
 *
 * @param root - repository root.
 * @returns Map of `namespace#key` to `{ english, value, mixed, isolated }`.
 */
export function liveStatusFamily(root) {
  const en = JSON.parse(readFileSync(join(root, 'data', 'en-catalog.json'), 'utf8'))
  const ar = JSON.parse(readFileSync(join(root, 'locales', 'ar.json'), 'utf8'))
  const family = new Map()
  for (const ns of Object.keys(en)) {
    for (const key of Object.keys(en[ns])) {
      const english = en[ns][key]
      if (!isLiveStatus(english)) continue
      const value = (ar[ns] || {})[key] || ''
      // A placeholder such as {count} holds Latin letters without being text; the
      // question is whether *visible* Latin or digits sit beside the ellipsis.
      const visible = value.replace(/\{[^}]*\}/g, '')
      family.set(`${ns}#${key}`, {
        english,
        value,
        mixed: /[A-Za-z0-9]/.test(visible) && /[\u0600-\u06FF]/.test(visible),
        isolated: value.startsWith(LRI),
      })
    }
  }
  return family
}

/** The recorded decisions: `{ isolated, mixedScript }` as Maps of id → reason. */
export function readDecisions(root) {
  const file = JSON.parse(readFileSync(join(root, 'data', 'bidi-decisions.json'), 'utf8'))
  return {
    isolated: new Map(Object.entries(file.isolated || {})),
    mixedScript: new Map(Object.entries(file.mixedScript || {})),
  }
}

/**
 * Compare the census against the record, naming every key that broke it.
 *
 * @param family - result of `liveStatusFamily`.
 * @param decisions - result of `readDecisions`.
 * @returns problem strings, empty when the two agree.
 */
export function familyProblems(family, decisions) {
  const idsWhere = (test) => [...family].filter(([, v]) => test(v)).map(([id]) => id).sort()
  const isolated = idsWhere((v) => v.isolated)
  const mixed = idsWhere((v) => v.mixed)
  const recorded = [...decisions.isolated.keys()].sort()
  const waived = [...decisions.mixedScript.keys()].sort()

  return [
    ...isolated.filter((id) => !recorded.includes(id)).map((id) => `isolated with no recorded decision: ${id}`),
    ...recorded.filter((id) => !isolated.includes(id)).map((id) => `recorded as isolated but it is not: ${id}`),
    ...mixed.filter((id) => !waived.includes(id)).map((id) => `mixed-script and undecided: ${id}`),
    ...waived.filter((id) => !mixed.includes(id)).map((id) => `recorded as mixed-script but it is not: ${id}`),
  ]
}
