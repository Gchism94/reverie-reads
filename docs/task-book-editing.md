# Task: Book Editing — Genre Model, Series Status, Field Flexibility

> **Status: shipped in #51.** This is the brief the work was built against, not a description of
> how the app behaves today. The series-status enum widened to seven values in #65; page count
> and edit-as-superset landed in #82. For current behavior, read the code and
> `docs/DATA_MODEL.md`.

**Branch:** `feat/book-editing`
**Dependencies:** none hard; can run parallel to shelf-system. Series _status_ enum lands here; series _experience_ is a separate task that consumes it. Covers and tropes are their own tasks (`feat/cover-system`, `feat/trope-system`) — do not touch them here.
**Golden rule applies:** eyeball on the real authenticated app before merge.

## Context

Launch feedback: editing a book is too rigid — a single-select subgenre with no primary genre, and a series status field lacking options. Decisions are locked; implement as specified below.

## 1. Genre model

- **Primary genre:** required, single-select, from a fixed taxonomy list. Survey the existing taxonomy constants first: if a genre-level list exists, use it; if only subgenres exist, derive a primary list (Romance, Fantasy, Sci-Fi, Mystery/Thriller, Horror, Historical, Contemporary/LitFic, Nonfiction, YA, Other — adjust to fit whatever the existing subgenre taxonomy implies, and keep it genre-neutral per the platform positioning) and propose the final list in the completion report.
- **Subgenres:** multi-select, replacing the current single-select. Preserve the existing subgenre vocabulary.
- **Migration:** existing single subgenre value → first element of the new subgenres array. Infer primary genre from subgenre where the mapping is unambiguous (pick a canonical mapping and document it); where ambiguous, leave primary null-but-required-on-next-edit rather than guessing wrong. The edit form surfaces missing primaries gently.
- Tropes are untouched here — they have their own task.
- Filters/stats that key off subgenre must handle the array (a book with 3 subgenres appears under all 3; stats count it once per subgenre bucket — note this in Wrapped copy if any "adds to 100%" framing exists).

## 2. Series status

- Expand the series-level status enum to: `standalone | ongoing | completed | on_hiatus | cancelled`. Migrate existing values into this set (report the mapping).
- This is the **series'** publication status. It is not the user's position in the series — that's derived from read states and belongs to the series-experience task. Keep the two concepts separate in schema and copy.

## 3. Rigidity audit

- Sweep the edit form for other single-selects or locked fields that plausibly should be multi or freer (formats? content tags?). Do NOT change them — list them in the completion report with a one-line recommendation each. One decision cycle at a time.

## Out of scope

Cover changes of any kind (`feat/cover-system`). Trope model or picker (`feat/trope-system`). Series linking, reading order, series pages (series-experience task). Import mapping (import-quality task).

## Acceptance / eyeball checklist

- [ ] Edit a book: set primary genre, select multiple subgenres; both persist and render on book detail
- [ ] Migrated books show their old subgenre intact; ambiguous primaries prompt on edit rather than guessing
- [ ] Filter by a subgenre a book holds among several → book appears
- [ ] Set each of the five series statuses; values persist
- [ ] Eyeballed across ≥3 skins; contrast test, axe, full suite green

## Completion report

Report: final primary-genre list, subgenre→primary inference mapping, migration SQL, series-status migration mapping, and the rigidity-audit list with recommendations.
