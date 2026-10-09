# Roadmap and deliberate non-goals

This started as a bidi fix and grew a language pack. The plan below keeps it
from becoming a platform: **three layers, each with its own bar**, and a short
list of things this project will not do.

## Layer 1 — direction decisions (shipped, still hardening)

What exists today:

- direction is chosen **per block by prose dominance** over whitespace tokens,
  never by the first strong character;
- **code-like tokens do not vote** (URLs, paths, `@scope/name`, shas, `15/15`,
  dotted identifiers) and they bind the Latin words around them into one
  technical unit, so `شغّل npx @deepseek-ai/dsh web` reads as Arabic;
- a tie resolves to RTL; a block with **no Arabic word is released**;
- **hysteresis** keeps a streamed answer from flickering: a block that is
  already RTL stays RTL until the text is clearly Latin;
- tables, lists and definition lists are judged as **containers**, so their
  markers move with them;
- a text cell that CSS has **blockified** (the question card's option label and
  description are spans inside a flex `<button>`) is a block of its own, so it
  takes RTL without moving the row's number badge;
- a content card's own `<header>`/`<footer>` do not read as shell chrome
  (`data-question-key` marks the composer's question card), while every landmark
  outside such a card still does;
- a double-quoted span is **one unit**, so a quoted command cannot outvote the
  Arabic sentence holding it;
- a Windows path is a **code token** even when a folder inside it is Arabic, so a
  block of paths stays LTR instead of re-ordering each path around that word;
- a `dir` set by the app or the author is **never overridden**;
- `pre`, `code`, inline code and the composer are handled explicitly.

Covered by `tests/golden-direction.mjs` (45 golden strings, including the two
documented limits) and `tests/verify-rtl.mjs` (64 DOM behaviour checks), with the
question card's shape pinned in `data/card-pins.json` and re-read from an installed
archive by `scripts/check-card-pins.mjs`.

Known limits, asserted rather than hidden:

- **Bare Latin words still vote.** `شغّل git status` stays LTR: two ordinary
  Latin words outweigh one Arabic word, and there is no technical separator to
  glue them. Treating a run of Latin words as one unit was tried and rejected —
  it flips English paragraphs that quote a single Arabic word.
- **A Latin-heavy list stays LTR** for the same reason.
- **`unicode-bidi: plaintext` is not used for blocks.** Isolation of inline code
  is ours; isolating *plain Latin identifiers inside Arabic prose* needs markup
  (`<bdi>`), which only the renderer that produces it can add — see the upstream
  asks below.

## Layer 2 — chrome vs content (the next real product step)

UI chrome (sidebar, menus, settings) and content (messages, tool output, files)
are different problems and get different rules:

| Surface | Rule |
|---|---|
| chrome | should follow the **selected language** (`html[dir=rtl]` + logical CSS) |
| content | follows **prose dominance**, exactly as it does now |
| code, terminal, diffs | LTR, always |

**Chrome RTL is not implemented here on purpose.** Flipping the shell by
injecting a `dir` attribute produces mirrored columns, arrows pointing the wrong
way and clipped icons when the layout was authored with physical properties
(`margin-left`, `padding-right`), which is worse than an LTR shell. The honest
path is upstream first:

1. DSH adopts **CSS logical properties** in the shell.
2. Then an optional *chrome RTL* mode can be offered by this plugin, off by
   default, tied to the selected language.

Until then the plugin ships content direction only, and the README says so.

## Layer 3 — translation governance

Already in place: extracted key set (never hand-written), batch assembly,
overrides for cross-batch fixes, a machine-readable [glossary](../data/glossary.yml),
a term map that stops terminology splits, a strict consistency lint, a
completeness gate, and a weekly upstream-sync workflow that opens a PR with the
new keys.

Still missing, in priority order:

1. **Plural forms.** DSH's locale dictionaries are flat `key → string`, so an
   Arabic sentence that counts things cannot select the right form for 1, 2,
   3–10, 11+ (ICU MessageFormat / Fluent solve this; the locale service does
   not expose it). Mitigation today: prefer number-agnostic phrasings
   (`الوكلاء: {count}`). This is the largest known linguistic debt.
2. **Review by surface, not by batch.** The 17 chunks are good for building and
   bad for reviewing. Review should proceed: always-visible labels → errors →
   long prose. The `translation` issue template exists for that.
3. **Screenshots per key** for reviewers, which today means the DSH UI itself.

## Upstream asks (DSH)

These are the changes that would let this plugin become small again:

1. **Logical CSS in the shell** — the precondition for a chrome RTL mode that
   does not break the layout.
2. **`dir` metadata per block from the producer** — a Markdown renderer knows
   whether a paragraph is Arabic; `dir` on that element beats any heuristic
   ([W3C string-meta](https://www.w3.org/TR/string-meta/) prefers metadata over
   inference). If that lands, dominance becomes the fallback, not the source of
   truth.
3. **Isolates for inline Latin runs** — wrapping identifiers in `<bdi>` (or
   `unicode-bidi: isolate`) so punctuation next to them cannot reorder Arabic
   prose ([W3C inline bidi](https://www.w3.org/International/articles/inline-bidi-markup/)).

## Deliberate non-goals

- **More languages.** This is an Arabic pack. Hebrew and Persian already benefit
  from the direction layer because they share the RTL ranges; shipping their
  dictionaries is a different project with different reviewers.
- **Dialects.** The interface is technical MSA, and stays that way.
- **Themes, a TUI, a dashboard, a "localization platform".** Scope that kills the
  differentiator.
- **Flipping other editors.** VS Code, Cursor and friends are out of scope; DSH
  is the target.
- **An in-chat Arabic proofreader.** A different product.

## Coordination, not competition

- [haythamat/dsh-client-ui-rtl](https://github.com/haythamat/dsh-client-ui-rtl)
  owns direction-only; the word-dominance idea came from there and is credited.
- [dsh-rtl-fix](https://github.com/ahmedtohamy1/dsh-rtl-fix) owns a different
  heuristic; two direction layers installed together take turns, and the settings
  row is the off switch.
- [@mimateinn/dsh-i18n](https://github.com/mimateinn/dsh-i18n) registers `ar` too,
  with different coverage; only one plugin should own the language id.

## The terminal

DSH's sidebar terminal is xterm.js, which **does not shape Arabic**: letters
render disconnected (`ا ل ع ر ب ي ة`). That is an upstream terminal limitation,
not a bug this plugin can fix from the outside, and it is documented in the
README rather than papered over.
