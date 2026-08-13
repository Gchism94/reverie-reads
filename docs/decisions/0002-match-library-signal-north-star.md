# ADR 0002 — Match's north star is library-signal-driven, not a fixed quiz

**Status:** accepted · 2026-07-21
**Context:** `fix/match-deromance` (docs/archive/task-match-deromance.md), following `feat/taxonomy-neutral` (#69)

## Decision

The Match feature's long-term direction is to lean **primarily on the reader's own library and
embedding signal** — their loved/rated/reread books and the taste centroid derived from them —
rather than a fixed questionnaire. Match should reflect what a reader actually owns and loves.

The five-question **quiz is an interim mechanism**, not the destination. This ADR records the
direction so it isn't lost; it is **approach (b)** in the de-romance task, and it is deliberately
**not built here**.

## What this task did instead (approach (a))

`fix/match-deromance` kept the quiz and made it genre-neutral end to end:

- **Questions** span all nine primary genres instead of romance moods ("Dark, eerie & unsettling",
  "A mystery to unravel", "Thoughtful & true to life", …).
- **Answer weights** are keyed off the lowercased primary-genre keys (`fantasy`, `horror`,
  `literary`, …) that `book.genre` stores, so the profile's `subWeights` steer any genre through the
  matcher's `subWeights[book.subgenre] ?? subWeights[book.genre]` resolution — the romance-only
  `arts`/`subs` mapping (and the "any dark answer → Dark Romance" hack) is gone.
- **Result vocabulary** is derived from the actually-matched books (dominant subgenre/genre, their
  real tropes, a representative intensity) rather than a fixed romance script; the leftover
  vibe-style pills ("🌶 Sweet / dark romance / fast burn") are gone. Intensity renders as spice only
  when the match is romance-leaning.

This makes Match _capable_ of surfacing horror, literary, nonfiction, etc. — but it is still a
questionnaire the reader fills in fresh each time.

## Why (b) is the north star

The quiz asks the reader to re-state their mood from scratch on every visit, and the core matcher
already learns a far richer signal — `buildTasteProfile` distills ratings, rereads, faves and DNFs
into per-tag and per-world affinities, and the embedding sweep gives every book a vector and the
reader a taste centroid. Today the quiz sits _on top_ of that (Tier 0 mood over Tier 1 taste); the
"skip the quiz — match my standing taste" path and the free-text vibe search already prove the
library signal can carry Match alone. The direction is to make that signal the primary driver:
Match opens on library-derived picks, and the quiz (or a lighter mood nudge) becomes an optional
_adjustment_ to a baseline the reader never has to re-enter.

## Where the extension attaches later

- `buildTasteProfile` / `TasteProfile` (`packages/core/src/tasteProfile.ts`) and the embedding
  centroid are the standing signal to lead with.
- `buildQuizProfile` (`apps/web/src/library/quiz.ts`) is the interim mood→profile bridge; a
  library-first Match would start from the taste profile and let a mood layer perturb it, rather
  than building the profile solely from quiz answers.
- The matcher (`scoreMatch` / `MATCH_WEIGHTS`) already blends quiz cravings, learned tag/world taste,
  series momentum and novelty — rebalancing those weights toward the learned signal is the lever, no
  new scoring machinery required.

## Out of scope for (b) when it happens (and untouched here)

The embedding sweep, the taste-centroid math, and the tier calibration are separate and working. The
mood feature (reader-assigned, distinct from these result pills) is its own track.
