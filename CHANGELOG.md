# Changelog

Every release below is published to npm through trusted publishing (OIDC) with a
provenance attestation, and every one carries the suite results it was cut from.

## 0.2.8

Robustness pass over the internals, plus one documentation guard.

- **Direction layer**
  - a mark is now withdrawn when a block stops qualifying, and marked ancestors
    are re-checked when a control mounts deeper than the row that owns it;
  - chrome surfaces (dialogs, menus, the shell landmarks) are never given a
    direction of their own, so the settings window keeps one alignment;
  - composer hysteresis: an RTL composer stays RTL until the Latin side is
    clearly ahead, instead of flickering on every keystroke;
  - only text-like fields take a direction — a checkbox, radio or hidden input is
    left alone.
- **Build and extraction**
  - the generated browser half escapes `<` (U+003C) and the JS line separators, so
    a future translation containing `</script>` cannot break the injection row;
  - upstream dictionaries are evaluated in an empty `vm` context instead of the
    extractor's own global object;
  - the term map matches whole Arabic words only, and its boundary class excludes
    Arabic punctuation (a comma after a term used to block the replacement).
- **Governance**
  - `scripts/check-docs.mjs` compares every count the documentation claims with
    what the suites print, and CI fails on a mismatch — the same number had drifted
    to 21, 34 and 41 in three files;
  - CI runs the consistency lint and the doc check, on Node 20/22/24;
  - the weekly upstream-sync branch name includes the run id, so two manual
    dispatches on one day cannot collide;
  - `npm run check` now runs the completeness gate, the lint, the doc check and
    every suite; `engines.node >= 20` is declared.

## 0.2.7

- the activity shimmer is **mirrored**, not reversed: both layers (the moving mask
  and its counter-moving highlight) get their own keyframes, so the light travels
  with the text instead of inverting into a shadow.

## 0.2.6

- Arabic wording for the live status: **التفكير العميق جارٍ منذ {duration} ···**;
- the activity animation runs right-to-left for Arabic (`html:lang(ar)`).

## 0.2.5

- the status wording stopped calquing the English shape. A live counter needs the
  present continuous, not the past tense a suggestion had proposed.

## 0.2.4

- text inside a chrome surface is never given a direction: one label centered, one
  right and one left was the reported symptom;
- the live status line is wrapped in an LTR isolate, so its ellipsis stays where
  English puts it. The spelling was chosen by rendering the candidates in both
  paragraph directions.

## 0.2.3

- a control mounting deeper than the block it belongs to now releases the mark on
  the block above it.

## 0.2.2

- a mark is withdrawn when a block stops being prose (the settings toggle case);
- `{duration}` is isolated so a live counter cannot re-sequence.

## 0.2.1

- **chrome is never flipped**: flex/grid containers and rows owning interactive
  controls are excluded, because flipping one reorders its children — the reported
  case moved the composer's send button.

## 0.2.0

- code-like tokens no longer vote, and bind the Latin words around them into one
  technical unit (`شغّل npx @deepseek-ai/dsh web` now reads as Arabic);
- hysteresis while streaming, `classify()`/`weigh()` exposed, and the 25-case
  golden matrix that pins the direction of real strings.

## 0.1.1

- direction by word dominance instead of the first strong character;
- a tie resolves to Arabic and a block with no Arabic word is released.

## 0.1.0

- first release: a full Arabic interface pack (3,228 strings, 59 namespaces)
  registered through the official locale service, an optional language entry, and
  a settings switch that turns the direction layer off and reverts completely.
