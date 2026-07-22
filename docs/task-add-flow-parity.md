# Task: Add-Flow Parity — Bring Add Book Up to Edit Book

**Branch:** `feat/add-flow-parity`
**Repo:** book-corpus
**Dependencies:** `feat/ownership-v2` (four-state ownership) and `fix/ownership-legibility`
(plain-label + subtitle treatment) both merged — the add form's ownership and read-status
controls come from them. The genre model (#51), cover picker (#50), and trope system (#53)
are all merged and are the components to reuse.

## Context

A scoping error across #50/#51/#53: the genre model, cover picker, and trope system were
all specified and verified against the **edit form and book detail**, and the **add flow
never received any of them.** Tester feedback confirms it — adding a book offers one
genre, a small trope selection, no way to change a fetched cover, and forced field
choices. This task brings Add to full parity with Edit.

## Scope

Everything below already exists elsewhere in the app. **Reuse the existing components —
do not build parallel implementations.** If a component is too coupled to the edit form
to reuse, extract it rather than duplicating (and report the extraction).

1. **Genre model (from #51):** required primary genre single-select + multi-select
   subgenres. Same taxonomy, same `SUBGENRE_PRIMARY_GENRE` inference, same gentle prompt
   when a primary can't be inferred. Includes the broadened nine-genre subgenre set from
   #69. The add form currently offers a single genre choice.

2. **Trope picker (from #53, broadened in #69):** the full search-first, facet-grouped,
   alias-aware picker with frequent-tropes section, inline personal-trope creation, and
   pin toggles. The add form currently shows a small subset.

3. **Cover chooser (from #50):** the cover sheet must be reachable **during add, before
   save.** The specific reported failure: "when you 'fetch details' it can give you a
   wrong cover and will not let you change it while adding the book details." Enrichment
   picks a cover; the user must be able to override it in the same flow — editions
   chooser, camera, upload, URL paste, all available pre-save. Covers must route through
   `CoverImage` so the Google no-cover plate is rejected (per the #70 fix — do not
   reintroduce a raw `<img>` cover path in the add flow).

4. **Fetch-details refinement:** the enrichment that runs on "fetch details" is choosing
   wrong covers. Investigate its match confidence — is it matching on title+author too
   loosely, ignoring ISBN when present, or taking the first result without scoring?
   Report findings. At minimum: when confidence is low, present the choice rather than
   silently picking, and always allow override.

5. **Four-state ownership + unset read status (from ownership-v2 / #71):** the add form's
   ownership control offers all four states — Owned / Borrowed / Wishlist / Not set —
   using the plain-label + skin-subtitle treatment from #71, defaulting to **Not set**
   (or the context-sensitive default: library-context add may default owned, shelf/
   wishlist-context add may default wishlist — match ownership-v2's established
   context defaults). Read status offers an unset "Not set" option and defaults to it.
   The add form must NOT force either choice.

6. **No other forced fields:** audit the whole add form for other required fields that
   shouldn't be — report anything found, change only ownership/read-status plus anything
   obviously coercive.

## Out of scope

Changing taxonomy contents (done in #69). Barcode scanning. Bulk add. The Match/mood work.

## Acceptance / eyeball checklist

- [ ] Add a book: set a primary genre and three subgenres — persists identically to the
      edit form
- [ ] Add a book: full trope picker available, including personal-trope creation and
      pinning
- [ ] Fetch details returns a wrong cover → change it in the same flow before saving,
      via editions chooser and via upload; no Google no-cover plate renders as a cover
- [ ] Add a book with ownership Not set and read status Not set — saves cleanly with both
      unset; can also set Borrowed/Wishlist at add time
- [ ] Eyeballed in ≥3 skins; contrast test, axe, full suite, `pnpm build` green

## Completion report

Report: which components were reused vs. extracted (and why for any extraction), the
fetch-details match-confidence findings and what changed, the four-state ownership +
unset read-status defaults implemented, the required-field audit, and surfaces eyeballed.
