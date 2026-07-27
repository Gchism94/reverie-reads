# Task: Manual Merge, Legacy Title Re-Parse & Borrowed Import

> **Status: shipped in #75.** This is the brief the work was built against, not a description of
> how the app behaves today. For current behavior, read the code and `docs/DATA_MODEL.md`.

**Branch:** `feat/manual-merge`
**Repo:** book-corpus
**Dependencies:** none hard. Builds on ownership-v2 (four-state) and #54's `seriesTitle.ts`.
Closes the last of the launch bug-report items plus the CSV borrowed-import ledger gap.

## Context

Three related import/dedup findings:

1. **Merge is detection-only.** The merge engine offers only the pairs it detects; there
   is no way to say "these two are the same book" manually. Real libraries always have
   pairs the matcher misses.
2. **Legacy titles still carry Goodreads series junk.** Example:
   `A Court of Mist and Fury (A Court of Thorns and Roses, #2)` where the real title is
   `A Court of Mist and Fury`. #54's `seriesTitle.ts` parses this for **new** imports, but
   rows imported before #54 are still dirty, and the junk breaks duplicate matching —
   which is why the merge suggestion never fires for these.
3. **CSV import doesn't understand `borrowed`.** Ownership-v2 added a four-state model
   (owned/borrowed/wishlist/unset), but the import template's ownership column and its
   parser may only understand owned/unowned and silently flatten `borrowed` to something
   else. A book you borrowed should import as borrowed.

## 1. Legacy title re-parse sweep

- Run `seriesTitle.ts` over existing library rows whose titles match the series-junk
  patterns. For each: clean the title, and populate series name/position **only where the
  book has no series data already** (never overwrite user-entered series info — the
  non-overwrite principle from #52).
- **Previewable and confirmed:** show what will change (old title → new title, series
  extracted) and require confirmation before writing. No silent bulk title rewrite.
- Resumable and batched; report how many rows matched.
- Never eat non-series parentheticals — `(Deluxe Edition)`, `(Unabridged)`, etc. #54's
  parser handles this; verify against real library rows.

## 2. Manual merge

- Let the user select two books and merge them explicitly, in addition to accepting
  detected suggestions.
- **Reuse the existing merge engine** for the union — do not write a second merge path.
  Note the ownership rule is now FOUR-STATE (ownership-v2), not the old owned/unowned:
  survey how `merge`/`merge_books` currently unions ownership and confirm the four-state
  union is sensible (recommended precedence: owned > borrowed > wishlist > unset — a
  record you own outranks one you borrowed outranks one you merely want; report the actual
  rule and whether you changed it). Preserve the format-flag union and the suppress-not-
  clear behavior.
- Show a clear **pre-merge diff**: which fields come from which record, what's kept, what's
  lost — including which ownership state and which moods/tropes survive. Merging is
  destructive; the user must see the outcome first.
- Confirmation required. Assess whether an undo is feasible in scope; if not, say so and
  make the diff correspondingly clear.

## 3. CSV borrowed import

- Audit the CSV import path (both the Reverie XLSX template and the Goodreads CSV path)
  for how the ownership column is parsed. Confirm whether `borrowed` is representable and
  imports correctly, or is silently flattened.
- Extend the Reverie XLSX template's ownership column to accept `borrowed` (remember the
  template is generated from `REVERIE_TEMPLATE_COLUMNS` + `REVERIE_PROFILE` with the
  byte-parity CI check — change the schema source, not the artifact; keep parity green).
  Update the template's legend/guide copy to document the borrowed value.
- Map it end to end: a template row marked borrowed imports as `ownership='borrowed'`,
  carrying any format flags (a borrowed paperback is a physical copy in hand, per
  ownership-v2's `isPossessed`).
- Goodreads has no native "borrowed" signal, so no Goodreads mapping change is needed —
  note that explicitly rather than inventing one.

## 4. Improve detection (small)

- After the sweep cleans titles, re-check whether the existing matcher now catches
  previously-missed pairs. Report before/after detection counts on the real library.

## Out of scope

Changing the matching algorithm's core heuristics. Bulk auto-merge without confirmation.
Merging across users. Borrowed-specific subsystems (due dates, lending — still parked).

## Acceptance / eyeball checklist

- [ ] Re-parse preview lists affected rows accurately; confirming cleans titles and fills
      only empty series fields; `(Deluxe Edition)`-style parentheticals survive
- [ ] Manually merge two books the detector missed; pre-merge diff is accurate; the
      four-state ownership union resolves correctly (owned beats borrowed beats wishlist)
- [ ] A template row marked borrowed imports as borrowed, carrying its format
- [ ] Template regenerated from schema source; byte-parity check green
- [ ] Before/after detection counts reported
- [ ] Full suite, lint, `pnpm build` green; eyeballed on the real authenticated app

## Completion report

Report: rows matched by the sweep, the preview/confirm mechanism, the manual-merge diff
and the four-state ownership union rule (and whether you changed it), whether undo was
feasible, the CSV borrowed-import audit findings + template schema diff, and before/after
detection counts.
