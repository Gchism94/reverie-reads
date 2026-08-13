# Task: docs/discover-recuration-followup

Branch: `docs/discover-recuration-followup` off `main`.
Depends on: `feat/discover-curated-candidates` (Phase 1 resolution + Phase 2 injection —
`packages/core/src/discoverCurated.ts`, its Deno mirror `supabase/functions/releases/curated.ts`,
and the `curated: true` provenance marker). Not yet merged to `main` as of this task's writing.

## What this governs

`feat/discover-curated-candidates` closed the audit's finding
(`docs/audits/discover-recency.md`): recent trade frontlist carries the bare Google category
`['Fiction']` and is structurally invisible to `subject:` queries, so Romance, Fantasy, Science
fiction and Mystery measured 0% 2020+ at fn depth. Phase 2 injected 41 hand-resolved candidates
(38 of them 2020+) into those four categories' pools, ranked by the same year-tier logic as every
live candidate — not pinned, not a separate rail.

That injection is a snapshot, not a feed. Phase 3 of the curated-candidates task was report-only
by design and recommended **(a) hand re-curation on a 6-month cadence + (c) provenance-informed
measurement**, with **(b) a standing pipeline explicitly deferred** to the corpus-freshness premium
feature already scoped in `docs/decisions/decision-monetization-boundary.md` (see note below).

> **Note: that file does not exist in this repo as of this task's writing.** Both the
> original curated-candidates task spec and its Phase 3 report reference it as "already scoped";
> a repo-wide search (`docs/decisions/`, `CLAUDE.md`, and a general grep for "monetiz"/"premium")
> turns up nothing under that name or any other. Item 5 below still points to it, because that is
> where the corpus-freshness decision belongs when it is written — but whoever picks up that
> pointer should not assume the doc is there without checking first.

This task file is what governs the _next_ re-curation cycle — cadence, mechanism, the measurement
that has to happen first, and an early-trigger condition independent of the calendar. It is not
itself a re-curation; no titles are chosen and no code changes here.

## 1. Cadence

Re-curate every **6 months** by default — or sooner, if the measurement step (item 3) shows a
category decaying faster than that. The 6-month number is a starting estimate, not a measured
constant: it exists so the cycle has a default heartbeat before any real decay data has been
collected.

The reason 6 months rather than something looser: the ranking's "fresh" tier is a rolling **2-year**
window (`tierDiscoverShelf` — last 2 years newest-first, next 6 as filler, then everything older).
The 2025-heavy curated set built in Phase 2 starts sliding out of the fresh tier and into filler
around **2027**, and a title that ages out of "fresh" without a fresher replacement behind it is
exactly the failure mode this whole feature exists to prevent. Six months gives three
opportunities to catch that slide before any category goes quiet, rather than one.

## 2. Mechanism — as already built, not reinvented

The pipeline from title to shipped candidate already exists; a re-curation cycle runs it again,
end to end, per category:

1. **Re-run the research prompt** for new titles in the category (the same prompt shape that
   produced `docs/research/discover-2020plus-titles.md` — popular/cult/indie buckets, author,
   year, subgenre, rationale). Scope to the four categories this feature covers: Romance, Fantasy,
   Science fiction, Mystery. A category whose curated share hasn't decayed (item 3) doesn't need a
   fresh research pass — re-curation is per-category, not all-four-at-once by default.
2. **Resolve via the Phase 1 process**: Open Library + Google Books, the same two sources, the
   same title/author closeness matching, the same "carry the original publication year, not the
   edition date" rule that keeps reprints from inflating recency. Hand-verify any risky match —
   common titles, ASIN-only/KU-heavy flags, author-unconfirmed entries — exactly as Phase 1 did
   for Bonds of Hercules, Outlier, and Metal Slinger. Report resolution failures per title; a title
   that won't resolve cleanly doesn't ship rather than shipping wrong.
3. **Regenerate `discoverCurated.ts` and its mirror `curated.ts`.** Both files are generated
   output with a fixed shape (`CuratedHit[]` per category) — a re-curation replaces the relevant
   category's array in both files, by the same generation step Phase 2 used, not by hand-editing
   two files in parallel and hoping they agree.
4. **The parity test confirms they match.** `discoverCuratedParity.test.ts` already asserts core
   and the Deno mirror produce identical data and identical blend/tier output; it is the guard
   that catches a re-curation that updated one file and not the other. It must pass before the
   re-curation PR is anything but a draft.

## 3. Measurement — required before every re-curation, not optional context

Before choosing what to re-curate, a script reads `releases_cache` for the `discover:{genre}` keys
of the four in-scope categories and reports, per category:

- **How often curated titles actually surfaced** — of the cached hits for that genre, what
  fraction carry `curated: true`. A category where curated titles rarely make the cached top-12
  (because live candidates now outrank them) needs a different kind of attention than one where
  they dominate the shelf.
- **How the 2020+ share has decayed since the last curation**, using the audit's own methodology
  (`docs/audits/discover-recency.md` §1–2) so the number is comparable release over release: same
  definition of "surfaced," same year cutoff, same fn-depth measurement point.

This is the step that turns "every 6 months" from a guess into a reading. The measurement's actual
numbers get reported at the start of each re-curation cycle, and they are what justifies moving
the cadence up or down for the _next_ cycle — not a fixed schedule followed regardless of what the
data says.

No measurement script is implemented in this task. Building it is in scope for whichever task
actually runs the first re-curation cycle, not this one — this file specifies what the script must
report, not the script itself.

## 4. Early-trigger condition, independent of the calendar

If measurement (item 3) shows a category's curated share has decayed below a threshold before the
6-month mark, re-curate **that category** early rather than waiting for the scheduled cycle. This
is deliberately per-category: a category whose curated titles are aging out fast (heavy release
cadence in that genre, or a category where live candidates have caught up and are crowding
curated ones out of the surfaced set) can need attention while the other three are still healthy.

The specific decay threshold is not fixed here — it should be set from the FIRST real measurement
pass, once there is an actual decay curve to calibrate against rather than a guess. Fixing a
number now, before any real data exists, would be exactly the mistake the 6-month default above
is trying to avoid repeating at a smaller scale.

## 5. Explicit non-scope

**This task is never a standing pipeline.** Hand re-curation on a measured cadence is the whole
of what it governs. If measurement data ever makes a continuously-updating pipeline look
justified — because manual re-curation can't keep pace with what the data shows, for instance —
that is **its own product-decision task**, referencing `docs/decisions/decision-monetization-boundary.md`
(write it first if it still doesn't exist by then), not an automatic escalation from this one. A
pipeline changes the cost, privacy, and maintenance shape of the feature; that decision belongs to
whoever owns the monetization boundary, made deliberately, not backed into because a manual
process felt tedious on a Tuesday.

## Standing

Docs-only. No measurement script, no re-curation, no code in this branch. The next re-curation
cycle is a separate task that reads this file, runs the measurement step first, and reports actual
numbers before touching any candidate list.
