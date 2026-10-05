/**
 * placeholders.mjs — one definition of "a placeholder that must survive".
 *
 * Three scripts used to carry their own copy of this pattern. They happened to be
 * identical, which is exactly the kind of thing that drifts silently: a fourth
 * call site or a key that uses `%d` would be validated in one path and not the
 * other. Everything now imports this module.
 *
 * Covered forms:
 *   {name}  {name.deep}  {{name}}   — the pack's own substitution syntax
 *   %s  %d  %@  %1$s               — printf forms, positional or not
 */

/** Matches every placeholder form the packs use, in any order. */
export const PLACEHOLDER_PATTERN = /\{[a-zA-Z0-9_.]+\}|\{\{?[a-zA-Z0-9_]+\}?\}|%[0-9]*[$]?[sd@]/g

/** The placeholders inside a string, sorted, as one comparable signature. */
export const placeholders = (value) => (String(value).match(PLACEHOLDER_PATTERN) || []).sort().join(',')

/** True when two strings carry exactly the same placeholders. */
export const samePlaceholders = (a, b) => placeholders(a) === placeholders(b)
