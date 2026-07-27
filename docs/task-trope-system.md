# Task: Trope System — Structure, Weight, and a Reason to Tag

> **Status: shipped in #53.** This is the brief the work was built against, not a description of
> how the app behaves today. The vocabulary broadened beyond romance in #69. For current
> behavior, read the code and `docs/DATA_MODEL.md`.

**Branch:** `feat/trope-system`
**Dependencies:** none hard. Coordinate with `feat/series-experience` if merged: the post-read trope prompt and the next-in-series prompt must render as **one** "just finished" sheet, never two stacked dialogs. Downstream consumers (do not build, do not foreclose): bingo auto-fill, Wrapped top-tropes, trope/spice analytics, taste-ranking signals.
**Golden rule applies:** eyeball on the real authenticated app before merge.

## Context

Tropes are currently a flat tag list: unscannable picker, every trope equally loud, and per-book tagging friction that starves every downstream feature. Decisions, locked: tropes get structure (facets, aliases, genre affinity), assignments get weight (pinned vs. present), entry moves to low-friction moments (post-read sheet, suggestions, per-trope sweep), and every trope becomes a navigable page. Spice remains its own separate concept — untouched here.

## 1. Vocabulary model

- `tropes` table: canonical name, aliases (text[]), **facet** — one of `dynamics | plot | characters | setting_world | vibe` — and **genre_affinity** (text[] of primary genres; a picker-ordering hint, never a gate).
- **Seed taxonomy:** derive the canonical set from the existing trope vocabulary in the codebase/data, assign facets and affinities, and present the full seed list in the completion report for Greg's review. Do not invent hundreds of new tropes; canonicalize what exists and fill obvious gaps conservatively.
- **Personal tropes are first-class:** `owner_id` null = canonical, set = user-owned (RLS-scoped), with an optional `canonical_id` alias link so a personal coinage can still count toward canonical-keyed features (future bingo, stats). Creating a personal trope is inline in the picker; if the name matches a canonical name/alias, offer the canonical instead of duplicating.

## 2. Assignment model

- `book_tropes` join: book record → trope, with **emphasis**: `pinned | present`. Pinned soft-capped at 3 per book (enforced in UI copy-warmly, not by constraint violence).
- **Migration:** every existing trope tag → `present`; nothing pinned initially. Survey the current storage shape (array column vs. join) and migrate accordingly.
- All existing trope filters/stats must read from the new join and treat emphasis as additive (filters match both levels unless explicitly scoped to pinned).

## 3. Entry — kill the grind

- **Picker (edit form and everywhere else):** search-first with type-ahead across names *and* aliases; results grouped by facet; a "your frequent tropes" section on top; ordering within groups biased by the book's primary genre via genre_affinity. Inline create-personal. Selected tropes show a pin toggle.
- **The "just finished" sheet:** extend the existing finish-into-read-log moment with a skippable quick-tag step — suggested + frequent tropes as one-tap confirms, pin by press-and-hold or a second tap (pick one gesture and be consistent). If series-experience's chain prompt exists, both live in the same sheet: tropes, then next-in-series. Everything skippable in one gesture.
- **Suggestions:** at book-add/enrichment time, fetch Hardcover's community tags for the book (backend, cached), map to canonical tropes via name/alias matching, and store as **suggestions** — never auto-applied. The picker and finished-sheet render them in a "suggested" section for one-tap confirm; dismissing hides them. Decision note (flag in report for Greg's veto): community *descriptors* are treated as factual metadata like page counts, not consensus opinion — no counts, popularity, or ranking from the community data ever surfaces. Only the trope names.
- **Per-trope sweep (bulk tagging):** pick a trope → your library as a cover grid → tap covers to toggle the trope on/off (present level; pinning stays per-book). Reachable from the trope page and the tropes index. Simple filtered grid + toggle; no gamified animation needed.

## 4. Representation — skin-charactered, never a chip wall

- Trope chips render through skin tokens (shape/rule/ornament vocabulary from the skin character system) — no generic gray pills. **Pinned tropes render distinctly** (the skin's ornament treatment; larger presence) and lead.
- Book detail shows pinned tropes prominently plus a small count expander for the rest — never more than ~5 chips visible collapsed.
- Contrast test must stay green across all nine skins for both chip states.

## 5. Trope pages — the payoff

- Every trope chip links to `/tropes/:id`: a shelf/grid of your books carrying it, your read-rate on it ("you own 12, read 9"), and **kin** — the tropes it most co-occurs with *in your library* ("you pair this with grumpy/sunshine"). Co-occurrence is computed from your data only; nothing global.
- A **tropes index**: your active vocabulary ordered by usage, entry point for browsing and for the per-trope sweep.
- These pages are private like everything else; no public path, per standing privacy rules.

## Out of scope

Spice model changes. Content warnings as a distinct field (recommended future addition — warnings protect while tropes attract, different function; note as a flagged recommendation in the report, do not build). Bingo, Wrapped changes, taste-model integration. Any surfacing of community tag popularity.

## Acceptance / eyeball checklist

- [ ] Migration lands existing trope data as `present` with all current filters working
- [ ] Picker: type-ahead hits an alias; facet grouping renders; create a personal trope inline; near-match offers the canonical
- [ ] Pin 3 tropes on a book; attempt a 4th → warm soft-cap copy; book detail leads with pinned, collapses the rest
- [ ] Finish a mid-series book → one sheet: trope quick-tag then next-in-series (if merged); fully skippable in one gesture
- [ ] A Hardcover-suggested trope appears as a suggestion, applies only on confirm, disappears on dismiss
- [ ] Per-trope sweep tags 10 books in well under a minute of real use
- [ ] Trope page shows your shelf, read-rate, and kin; kin reflects your library only
- [ ] Chips eyeballed across ≥3 skins including pinned state; contrast test, axe, full suite green

## Completion report

Report: schema (tropes, book_tropes, suggestions storage), the full seed taxonomy with facets/affinities for review, migration SQL, suggestion mapping hit-rate on real data, the finished-sheet integration status vs. series-experience, surfaces eyeballed, test results. Flag explicitly: the community-suggestions decision for Greg's veto, and the content-warnings recommendation.
