# Task: De-Romance the Taxonomy & Remove Vibes Entirely

> **Status: shipped in #69.** This is the brief the work was built against, not a description of
> how the app behaves today. Subgenres stopped being scoped to the primary genre in #82 (the
> cross-genre disclosure). For current behavior, read the code and `docs/reference/DATA_MODEL.md`.

**Branch:** `feat/taxonomy-neutral`
**Repo:** book-corpus
**Dependencies:** none hard, but coordinate with `feat/add-flow-parity` (both touch the
trope/subgenre pickers) — sequence them, don't run them simultaneously on the same files.

## Context

Reverie is positioned as a genre-neutral reading platform, but it was originally built
around romance and the taxonomy still shows it. Tester feedback: _"Subgenres are still
only narrowly romance focused"_, _"Only a small selection of tropes"_, and _"Keeps adding
weird vibe tags"_ with an example of an auto-generated `🃏 Charming Rogue vibe` chip.

Two confirmed decisions:

1. **Vibes are removed completely** — the derived boyfriend/archetype "vibe" concept and
   its chips are deleted, not hidden or made optional. They go along with the tags they
   were derived from, per the owner.
2. **The subgenre and trope vocabularies are broadened** beyond romance so the app is
   genuinely genre-neutral.

## 1. Remove vibes

- Find every producer and consumer of the derived boyfriend/archetype/"vibe" concept:
  the derivation logic, storage (column, computed field, or derived-at-render), the chip
  component and its emoji rendering, any filter or stat keyed off it, and any copy that
  references it.
- Remove all of it. If a stored column exists, drop it in a migration (report what data
  is lost — it's derived, so this should be lossless in principle; confirm).
- Ensure nothing that consumed vibes breaks: taste/adaptive scoring, Wrapped, Discover,
  skin copy. Report anything that turns out to depend on it.

## 2. Broaden subgenres

- Audit `GENRE_SUBGENRES` against the nine primary genres from #51 (Romance, Fantasy,
  Science fiction, Horror, Mystery, Literary, Cozy, Nonfiction, Young adult). Report the
  current per-genre counts — the imbalance is the evidence.
- Fill out the thin genres with a conservative, recognizable set per genre (e.g. Horror:
  cosmic, gothic, splatterpunk, psychological, folk; Mystery: cozy, procedural, noir,
  legal, historical; Nonfiction: memoir, history, science, essays, true crime, self —
  adjust to what actually fits). Do **not** invent hundreds; aim for a usable, credible
  set per genre and propose the full list in the completion report for review.
- Preserve every existing subgenre value and its `SUBGENRE_PRIMARY_GENRE` mapping —
  this is additive. Extend the drift-pinning test from #51 to cover the additions.

## 3. Broaden tropes

- The #53 seed was 163 canonical tropes derived from the existing (romance-heavy)
  vocabulary. Audit facet and genre-affinity coverage across the nine primaries and
  report which genres are underserved.
- Add canonical tropes for the underserved genres, using the same four-facet structure
  (`dynamics | plot | characters | setting_world | vibe`) — note that the facet named
  `vibe` here is part of the trope taxonomy and is **unrelated** to the removed
  boyfriend/archetype "vibe" chips; do not remove the facet. If the naming collision is
  confusing, propose a rename in the report rather than doing it unilaterally.
- Additive only: no existing trope is renamed or removed; personal tropes untouched.
- Propose the additions in the completion report for review before treating them final.

## Out of scope

Changing the primary genre list (settled in #51). Content warnings as a distinct field
(still a recommended future addition, not built here). Auto-tagging books with the new
tropes.

## Acceptance / eyeball checklist

- [ ] No vibe chip appears anywhere in the app; no code path produces one
- [ ] A horror, mystery, and nonfiction book can each be given credible subgenres and
      tropes without reaching for romance vocabulary
- [ ] Existing books' subgenres and tropes are unchanged
- [ ] Drift-pinning test extended and green
- [ ] Full suite, lint, `pnpm build` green; eyeballed in ≥3 skins

## Completion report

Report: everything removed for vibes (and anything that unexpectedly depended on it), the
before/after per-genre subgenre counts, the proposed subgenre and trope additions in full
for review, and any recommendation about the `vibe` facet naming collision.
