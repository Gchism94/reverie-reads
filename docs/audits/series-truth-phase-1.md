# Audit: series truth, Phase 1

Status: **code-path audit complete; owner-run aggregate inventory pending**.

Branch: `codex/series-truth-phase-1` off `main@8669ed4`.

Companion query: [`docs/queries/series-truth-audit.sql`](../queries/series-truth-audit.sql).
Execution brief: [`docs/backlog/task-series-truth-library-overhaul.md`](../backlog/task-series-truth-library-overhaul.md).

## Question

Can Reverie currently distinguish a series membership established by the reader or a trusted
source from one inferred by an import, enrichment candidate, legacy string, or page-view
reconciliation?

**No.** The shipped mechanisms preserve some important decisions, but the authority model remains
lossy. `books.series_user_chosen` protects a post-2026-08-18 reader edit from enrichment; it does not
record which non-reader source supplied a claim, and several write paths either drop or conflate the
reader gesture. `works.metadata_provenance` records enrichment sources but is not kept authoritative
when a human edits shared series metadata. `series_entries` is a useful ordered personal relation,
but it is still materialized from `books.series` during a read and therefore cannot prove that the
legacy string was justified.

This phase intentionally changes no series data or admission behavior. Production-shaped counts
must come from the owner-run read-only query; no private title-level output belongs in this report.

## Current representations and their authority

| Representation                             | What it can prove today                                                                       | What it cannot prove                                                                                                                                                 |
| ------------------------------------------ | --------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `books.series`, `position`, `series_count` | The current personal compatibility values                                                     | Where the claim came from; whether an unflagged claim was imported, enriched, copied from the corpus, seeded, reconciled, or historically typed                      |
| `books.series_user_chosen`                 | A protected reader gesture after the column shipped, including a deliberate clear             | The kind of gesture; pre-column history; a trusted non-reader source; an Add gesture currently lost by intake                                                        |
| `series` + live `series_entries`           | A personal ordered record, including ghosts and reader-edited slots                           | Independent authority for membership: opening a series lazily creates/reconciles these rows from the legacy string                                                   |
| `series_entries.user_edited`               | Whether the reader deliberately arranged or removed that slot                                 | The bibliographic source of the membership itself                                                                                                                    |
| `works.series`, `position`, `series_count` | The shared corpus claim                                                                       | Whether an unproven personal claim was copied at work creation; whether the current value came from enrichment or later human review without consulting the edit log |
| `works.metadata_provenance`                | Per-field enrichment source and timestamp when `complete_corpus_work_metadata` filled a blank | Current human-edit provenance: `edit_corpus_work_metadata` changes the value without replacing the prior provenance entry                                            |
| `work_metadata_edits`                      | An attributable, append-only human/shared edit, including before and after values             | A normalized per-field source/confidence contract consumable by the app                                                                                              |
| aliases and `series_merge_decisions`       | Durable same/distinct/related identity rulings                                                | Whether any particular book belongs to either series                                                                                                                 |

## Writer and inference map

### Personal compatibility fields (`books.series`, `position`, `series_count`)

| Path                                                                       | Current behavior                                                                                             | Authority result                                                                                                                                                                                            |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Single Add (`AddRoute` → `applyIncoming` → `incomingToBook` → `toBookRow`) | Corpus/enrichment may prefill series; typing toggles `seriesUserChosen` in the form                          | **Finding:** `incomingToBook` does not copy `seriesUserChosen`, so a brand-new manually typed series is inserted unflagged                                                                                  |
| Single-Add duplicate fold and CSV/XLSX import (`foldIn` → `mergeImport`)   | Fills a blank personal series directly                                                                       | **Finding:** an explicit import column, a parsed title suffix, a catalog prefill, and a manual Add value all become the same unflagged claim; a fold that accepts a manual Add value also loses the gesture |
| Enrichment sweep (`enrichLibrary.toIncoming`)                              | `enrichmentSeriesFill` is fill-only and refuses a reader-chosen or reader-cleared field                      | Correct non-overwrite behavior, but the accepted source/confidence is not stored on `books`                                                                                                                 |
| Book detail save (`sync_book_series`)                                      | Retires an old live entry, updates compatibility fields, and sets `series_user_chosen=true` on name or clear | Preserves a direct reader decision, but creates neither the canonical series row nor an entry when absent                                                                                                   |
| “Use shared details” (`adopt_corpus_work_metadata` → `sync_book_series`)   | Copies the shared tuple and calls the reader RPC                                                             | **Finding:** a deliberate adoption is safely protected, but is indistinguishable from “the reader typed this”; its source work and shared provenance are lost                                               |
| Series rename (`useUpdateSeries`)                                          | Updates `series.name`, then separately updates matching `books.series` strings                               | **Finding:** non-transactional dual write; affected books are not newly marked reader-chosen; legacy and structured state can diverge on the second failure                                                 |
| Add existing books to a series (`useAddBooksToSeries`)                     | Writes/revives entries, then writes `books.series` and `series_user_chosen=true`                             | Positive reader establishment is preserved; position/length still rely on the separate order RPC                                                                                                            |
| Acquire a ghost (`useAcquireGhost`)                                        | Creates a wishlist book linked to the series and marks `series_user_chosen=true`                             | Positive reader establishment is preserved                                                                                                                                                                  |
| Remove a slot (`remove_series_entry`)                                      | Tombstones the slot, clears `books.series`, and marks the clear reader-chosen                                | Correct refusal preservation                                                                                                                                                                                |
| Series merge (`merge_series`)                                              | Preserves entries, tombstones, positions, aliases/rulings, and repoints compatibility values                 | Identity decision is durable; it does not add membership-source provenance                                                                                                                                  |
| Book merge (`merge_books`)                                                 | Reparents structured entries and folds `series_user_chosen` when the losing series wins                      | Correct for the boolean model; the model still cannot retain richer source provenance                                                                                                                       |
| Backup restore                                                             | Restores the complete book row, including the boolean, then restores negative series decisions               | Faithful to what the backup knew; cannot recover provenance that was never stored                                                                                                                           |
| Household reconciliation and delegated member-library Add                  | Creates a neutral personal row from `works`, with the boolean false/default false                            | Correctly does not claim a reader typed it, but the copied trusted/untrusted corpus source is not retained                                                                                                  |
| Soft remove/restore                                                        | Archives or restores the row unchanged                                                                       | Provenance survives exactly as stored                                                                                                                                                                       |

### Structured personal series (`series`, `series_entries`, aliases, rulings)

- `useSeriesDetail` finds or lazily creates a `series` row by a normalized name, then reconciles
  every personal book carrying that string into a live entry. This is the principal inference path:
  a page view materializes structure from a claim whose authority may be unknown.
- Source refresh fills gaps and respects `series_entries.user_edited` and tombstones. That correctly
  protects order/refusal, but `source='hardcover'` describes the slot feed rather than proving the
  linked personal book's original membership claim.
- `set_series_order` is the only position/length writer for an existing structured record and mirrors
  its results into the legacy columns. The mirror still matches books by series name, so a name split
  remains capable of leaving compatibility values stale.
- The schema permits a book to have live entries in more than one `series` row (the uniqueness is per
  `(series_id, book_id)`), while `books.series` can name only one. Multiple membership therefore
  cannot be transactionally mirrored by the current compatibility model.
- `parseSeriesFromTitle` can parse additional memberships into `more`, but current import mapping
  keeps only the first. Omnibuses preserve the name and deliberately leave a single position unset;
  companion/spinoff semantics have no first-class relationship model.

### Shared corpus (`works`)

- The library-membership foundation initially created `works` by copying representative personal
  series fields. The runtime personal-book corpus-binding path can do the same. Neither records
  per-field provenance for those copied values, so a legacy personal inference can become shared
  corpus metadata without becoming more trustworthy.
- `complete_corpus_work_metadata` fills blank shared fields from enrichment and records
  `metadata_provenance.series` / `seriesPosition`; the overall match confidence is stored in
  `works.enrichment_confidence`. It never overwrites an existing value.
- `edit_corpus_work_metadata` is correctly restricted to a household owner or corpus administrator
  and appends `work_metadata_edits`, but it does not update `metadata_provenance`. A human correction
  can therefore retain an obsolete upstream label, or remain unlabeled except in the audit log.
- Household-only catalog creation establishes identity only and does not invent a series. Delegated
  personal Add copies the current work tuple without claiming a reader gesture.
- Corpus adoption copies one shared tuple into one personal row without changing title, contributors,
  ISBN, possession, reading history, rating, or private annotations. The missing part is an explicit
  `adopted_corpus` provenance carrying the work identity and current claim revision.

## Proposed conservative classification for the inventory

The companion query does not mutate or adjudicate rows. It applies these provisional rules:

1. **Reader-confirmed series:** a nonblank personal series with `series_user_chosen=true`.
2. **Sourced series:** an unflagged personal series exactly matching its linked work, where the
   current shared claim is either the result of an attributable human series edit or a high-confidence
   enrichment claim from Hardcover, Open Library, or Google Books.
3. **Standalone:** no personal series and no live structured membership.
4. **Low-confidence or contradictory:** a nonblank claim not admitted by rules 1–2, a mismatch
   between personal/shared/structured names, or a sourced claim below high confidence.
5. **Structurally unlinked:** a compatibility claim with no exactly matching live structured entry,
   a live entry with no compatibility claim, multiple live memberships, or a position/length mirror
   mismatch. This is reported as an independent integrity dimension because the current lazy model
   makes “unlinked” overlap the authority categories.

High confidence is intentionally the initial automatic threshold. Medium/low claims belong in a
review queue until production evidence supports a narrower exception. Absence remains a valid
standalone/unknown state and is never treated as a gap to fill.

## Findings that gate Phase 2

1. **A boolean cannot carry the required provenance.** The durable model needs at least claim
   origin, source/ref, confidence, timestamp, and a reader-override/adoption distinction.
2. **Manual Add currently loses its positive gesture.** This is a forward writer bug, not a data
   cleanup rule; it needs a focused regression once the provenance representation is selected.
3. **Import authority must be explicit.** An explicit reader-maintained Series column, a title parser,
   and a provider result cannot remain one undifferentiated `Incoming.series` string.
4. **Shared human edits must replace field provenance transactionally.** The append-only edit log is
   necessary history, but the current claim also needs a direct, current source record.
5. **Structured membership must become canonical before multiple memberships ship.** A scalar
   compatibility copy cannot represent multiple series; it must be a derived primary-membership
   projection or be retired from authoritative reads.
6. **No backfill is safe from code inspection alone.** Pre-2026-08-18 personal rows are inherently
   ambiguous. The aggregate inventory determines whether owner review is small enough to be manual
   or requires a dedicated queue and staged reconciliation tooling.

## Phase 1 completion gate

- [x] Trace current personal, structured, shared, import, enrichment, merge, restore, and household paths.
- [x] Define a conservative, non-destructive classification.
- [x] Stage an owner-run, aggregate-only, read-only inventory.
- [ ] Record the query's aggregate output (never title-level rows) and validate the classification
      against the production-shaped distribution.
- [ ] Choose the Phase 2 schema/write-path slice from that evidence.

No migration or production write should be prepared until the final two checks are complete.
