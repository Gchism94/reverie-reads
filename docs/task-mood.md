# Task: Mood — A Reader-Assigned Dimension

**Branch:** `feat/mood`
**Repo:** book-corpus
**Dependencies:** `feat/taxonomy-neutral` (#69) merged first — the derived "vibe" chip must
be gone before mood arrives, or the two concepts collide in the UI.

## Context & the governing principle

The old "vibe" chip was **model-derived** — `deriveBoyfriend()` inferred an archetype from
tags and stamped "🃏 Charming Rogue vibe" on the book without the reader asking. It was
removed in #69 precisely because that inference was unwanted. Mood replaces the *idea* of
"how this book feels" but inverts the *authority*: **mood is reader-assigned. The reader
attaches it because they felt it. The model may, at most, suggest — it must never
auto-apply, never derive, never stamp a default.**

This is the anti-consensus thesis in its purest form: tropes describe what is *in* a book
(objective-ish, suggestible); mood describes how it *landed on the reader* (subjective,
personal, theirs alone). Keep the two concepts cleanly separate — mood is NOT a trope
facet.

## 1. Data model

- A reader-assigned mood dimension on the book record. Multi-select (a book can feel
  several ways). Owner-scoped, RLS-consistent, like every other personal signal.
- A small **canonical mood vocabulary** the reader picks from — e.g. cozy, unsettling,
  melancholy, propulsive, tender, bleak, whimsical, tense, hopeful, atmospheric.
  Propose the full starter set in the completion report for review; keep it small and
  evocative, not exhaustive. **Personal moods are first-class** — the reader can coin
  their own, same pattern as personal tropes (owner-scoped, optional alias to a
  canonical).
- **No derivation, ever.** There is no function that computes a mood from tags, subgenre,
  or anything else. A book with no reader-assigned mood simply has none — absence is a
  valid, quiet state, never backfilled with a guess.

## 2. Assignment

- Reader assigns moods where they assign other impressions: the edit form, the book
  detail page, and the "just finished" sheet (the natural moment — you close a book
  feeling something). A small, quick multi-select in each.
- **The "just finished" sheet is already a consolidated, skippable surface** (trope
  quick-tag + next-in-series prompt, from #53/#52). Mood joins it as one more skippable
  element in the same sheet — do NOT create a competing post-read dialog. The whole sheet
  stays dismissible in one gesture; the acceptance test that exactly one post-read sheet
  ever appears must still hold.
- **Suggestions are allowed but strictly opt-in, and this needs your veto before it
  ships:** the model MAY offer mood suggestions (e.g. surfacing moods the reader has
  applied to similar books), but only as a dismissible "you might feel:" prompt the
  reader taps to accept — identical discipline to Hardcover trope suggestions. Nothing
  auto-applies. If building suggestions adds meaningful complexity, SKIP them for v1 and
  ship pure reader-assignment only — a reader-assigned mood with no suggestions is the
  correct minimum, and better than an over-eager suggester. Report which you did and
  flag the suggestion behavior for Greg's explicit approval before enabling it.

## 3. Display

- Mood chips render through skin tokens, distinct from trope chips (different concept,
  different visual register — mood is felt, tropes are structural). Pass the
  registry-keyed contrast test across all nine skins.
- On book detail, moods sit in their own small area, clearly the reader's own
  impression — not mixed in with the descriptive trope chips.

## 4. Mood pages (light, optional if it fits)

- If cheap: a mood is navigable — tapping it shows the reader's other books that felt the
  same way. Same pattern as trope pages. This is the payoff that makes assigning worth
  it. Cut if it balloons scope; report either way.

## Explicitly out of scope

- Any model-derived mood. No inference logic of any kind.
- Aggregating moods across users, or showing how *others* felt about a book — mood is
  private and personal, never a consensus signal. This is a hard line.
- **Match result pills (from #72) are NOT mood.** Those pills describe the matched book's
  genre/subgenre/tropes — descriptive metadata about the book. Reader-assigned mood is a
  separate, subjective dimension. Do not wire reader-mood into Match's descriptive pills,
  and do not derive Match pills from mood. Keep the two cleanly separate.
- The `vibe` trope facet → `mood` rename (separate ledger task; do not conflate the
  trope facet with this reader-assigned dimension — if the naming overlap is confusing,
  flag it, but this task creates the reader dimension regardless of what the facet is
  called).

## Acceptance / eyeball checklist

- [ ] Reader assigns multiple moods to a book from the just-finished sheet and the edit
      form; they persist and render distinctly from tropes
- [ ] A book with no assigned mood shows none — no default, no derived value anywhere
- [ ] Personal mood creation works (coin a custom mood)
- [ ] If suggestions were built: nothing auto-applies; suggestions are dismissible and
      require a tap to accept — and this is flagged for Greg's approval before enabling
- [ ] Mood chips eyeballed in ≥3 skins; contrast test, axe, full suite, `pnpm build` green

## Completion report

Report: schema, the proposed canonical mood vocabulary for review, whether suggestions
were built (and if so, confirmation they're opt-in and flagged for approval), whether
mood pages shipped or were cut, and surfaces eyeballed. Confirm explicitly that NO
derivation logic exists anywhere in the mood path.
