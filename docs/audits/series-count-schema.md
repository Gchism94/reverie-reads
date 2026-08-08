# Audit: series-count-schema

**Branch origin:** `audit/series-position-integrity` (off `main`).
**Mode:** Read-only — migrations, types, RLS, and code only. No production data touched. Findings
re-verified against current HEAD.

## 1. Does `series` have a length/count column? — No. It is a missing column, not a dead one.

The series-row table is named `public.series`, defined in `20260716010000_series_experience.sql:8-17`.
Full schema, every column:

| column         | type        | default             | constraints                                                                                                                                                                     |
| -------------- | ----------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`           | uuid        | `gen_random_uuid()` | primary key                                                                                                                                                                     |
| `owner_id`     | uuid        | —                   | not null, references auth.users(id) on delete cascade                                                                                                                           |
| `name`         | text        | —                   | not null                                                                                                                                                                        |
| `status`       | text        | —                   | check in ('standalone','ongoing','completed','on_hiatus','cancelled','interconnected_standalone','interconnected_series') (widened by `20260720010000_series_status_widen.sql`) |
| `source`       | text        | 'manual'            | not null, check in ('manual','hardcover')                                                                                                                                       |
| `source_ref`   | text        | —                   | nullable                                                                                                                                                                        |
| `refreshed_at` | timestamptz | —                   | nullable                                                                                                                                                                        |
| `created_at`   | timestamptz | now()               | not null                                                                                                                                                                        |

Plus `unique (owner_id, name)` and index `series_owner_idx (owner_id)`. RLS enabled (4 owner-scoped
policies); grants: `authenticated` CRUD, `service_role` all.

No column on `public.series` stores series length, total, or entry count. All 63 migrations checked
for any `add column` against `public.series`. Only two alters to the table exist in history: RLS
enable (`20260716:31`) and the status check widen (`20260720:17-18`). No count/length/total/entries/
size column was ever added. This is the missing-column case, not the dead-column case — Q2 is moot.

## 2. Read/write sites for a length column on series — none (the column doesn't exist).

No code reads or writes a series-length field on the series row, because there is no such field.
Series length today lives per-book as `books.series_count` (see §4), not on the series row.

The client does not even type the series row: `apps/web/src/data/types.ts` has a `BookRow` interface
(carrying `series: string | null`, `position: number | null`, `series_count: number | null` as
columns of `books`) but no `Series` or `SeriesEntry` row interface. The app interacts with series
rows only indirectly, through `series_entries` reads. The migrations are the authority for §1, and
they confirm the absence.

## 3. `series_entries.position` — defined, but ordering is structurally unconstrained there too.

Defined alongside `series` in `20260716010000_series_experience.sql:24-37`. Full schema:

| column        | type        | default             | constraints                                                                                 |
| ------------- | ----------- | ------------------- | ------------------------------------------------------------------------------------------- |
| `id`          | uuid        | `gen_random_uuid()` | primary key                                                                                 |
| `owner_id`    | uuid        | —                   | not null, references auth.users on delete cascade                                           |
| `series_id`   | uuid        | —                   | not null, references public.series on delete cascade                                        |
| `book_id`     | uuid        | —                   | nullable, references public.books(id) on delete set null (ghost slots are `book_id = null`) |
| `title`       | text        | —                   | not null                                                                                    |
| `author`      | text        | —                   | not null                                                                                    |
| `position`    | numeric     | 0                   | not null                                                                                    |
| `label`       | text        | —                   | nullable                                                                                    |
| `source`      | text        | 'manual'            | check in ('manual','hardcover')                                                             |
| `source_ref`  | text        | —                   | nullable                                                                                    |
| `user_edited` | boolean     | false               | not null                                                                                    |
| `created_at`  | timestamptz | now()               | not null                                                                                    |
| `removed_at`  | timestamptz | —                   | nullable (tombstone; added by `20260725010000_series_entry_removal.sql`)                    |

Indexes: `series_entries_series_idx (series_id)`; `series_entries_live_idx (series_id) where
removed_at is null`; `series_entries_book_uidx (series_id, book_id) where book_id is not null` — a
partial unique index preventing one book from having two live entries in the same series.

There is **no unique constraint on `(series_id, position)`**. Ordering has no structural integrity at
the `series_entries` level either: positions can collide (two entries at #3) or gap (no #2), and
nothing in the schema rejects either. The only uniqueness guarantee is one live book per series slot,
not one slot per position. So `series_entries.position` is exactly as unconstrained as
`books.position` — the design tension this audit establishes ground truth for exists at both storage
sites.

(`user_edited = true` protects a reader-set position against source refreshes — a hard rule codified in
CLAUDE.md. It is a protection flag, not an ordering constraint: it governs who may overwrite a
position, not whether positions must be unique or contiguous.)

## 4. Writers of `books.series_count` and `books.position` — re-verified against HEAD.

Both columns are defined in `20260624010000_core_schema.sql`: `position numeric` (nullable, comment
notes "fractional positions exist in the data (e.g. 3.5)"); `series_count smallint` (nullable,
comment: "NULL => 'length not set' / drives the 'None set' filter"). Both unconstrained beyond type.

The chokepoint is `toBookRow()` in `apps/web/src/data/mappers.ts:112-175` — every `Partial<Book>`
patch that carries `position` or `seriesCount` becomes a `books.position` / `books.series_count`
write here (lines 118-119). Its callers are the primary client writers:

### `books.series_count` writers

- `apps/web/src/data/books.ts:32-33` — `useAddBook`: `insert({ ...toBookRow(input), ... })`. Add-a-book
  path.
- `apps/web/src/data/books.ts:70-79` — `useUpdateBook`: `update(toBookRow(patch)).eq('id', id)`. The
  edit dialog's writer.
- `apps/web/src/data/intake.ts:103-108` — `insertNewBook`: `insert({ ...toBookRow(book), ... })`.
  CSV/single intake add.
- `apps/web/src/data/intake.ts:118-123` — `foldIn`: `update(toBookRow(result.patch))`. Intake merge-in;
  the patch.seriesCount comes from `mergeImport` → `match.ts:180-181` (fill-when-blank:
  `if existing.seriesCount == null && incoming.seriesCount != null`).
- `apps/web/src/data/importExport.ts:634-636` — `restoreBackup`: `insert({ ...rest, ... })` where
  `rest` is the `select('*')` book row minus id/owner/timestamps/`plan_date`. Carries `series_count`
  straight back from the archive.
- `apps/web/src/book/dialogs.tsx:277` — the edit dialog builds seriesCount into its patch (lines
  178-179 read it, 220 parses it, 277 sends it) → `useUpdateBook` → `toBookRow`.
- `supabase/migrations/20260812010000_merge_series_entries_reparent.sql:173` — `merge_books` RPC step
  4: `series_count = coalesce((p_fields ->> 'series_count')::smallint, series_count)`. The merge field
  comes from `packages/core/src/merge.ts:118-120` (first non-null across all merged books).
- Indirect producers of the patch (not direct DB writers): `packages/core/src/match.ts:180-181` and
  `packages/core/src/merge.ts:118-120` (both above) and `packages/core/src/filters.ts:92` /
  `packages/core/src/seriesStatus.ts:62-75` (read-only — the filter and the "Series of N" badge derive
  from per-book seriesCount).

### `books.position` writers

- All four `toBookRow` callers above (Add, Update, insertNewBook, foldIn) — same lines — also write
  position via `mappers.ts:118`.
- `apps/web/src/data/series.ts:417` — `syncBookPosition(bookId, position)`:
  `await supabase.from('books').update({ position }).eq('id', bookId)`. The clearest direct
  `books.position` writer in app code: mirrors a linked `series_entries.position` onto the book row so
  the book page's "#N" agrees with the series page's order. Called by `useMoveEntry` (`series.ts:437,
446`) and `useUpdateEntry` (`series.ts:462`). Ghost entries (no `book_id`) skip. **This is a
  dual-write with no transactional guarantee** — `series_entries.position` and `books.position` are
  updated in separate statements.
- `supabase/migrations/20260812010000_merge_series_entries_reparent.sql:172` — `merge_books` step 4:
  `position = coalesce((p_fields ->> 'position')::numeric, position)`.
- `supabase/migrations/20260809010000_series_backfill.sql:232-236` —
  `backfill_series_from_titles()` step 3: `update public.books set series = t.new_series, position =
t.new_position`. Parses `Title (Series, #N)` from book/entry titles and writes both fields. Note:
  this RPC writes position but NOT `series_count` (confirmed — `series_count` does not appear in that
  migration).

Not a series-length writer (naming collision): `apps/web/src/routes/StatsRoute.tsx:140` —
`new Set(ownedAll.filter((b) => b.series).map((b) => b.series)).size` is a count of distinct series
the reader owns, not a series' length. Mentioned so it isn't mistaken for one on a future grep.

## 5. Existing cross-row consistency enforcement — the precedent and the pattern.

Four mechanisms enforce cross-field consistency today; none enforce series length or position
consistency, which is the gap.

1. **`invalidate_enriched_stamp()`** — before-update trigger on `books`
   (`20260811010000_enriched_stamp_invalidate.sql`). The documented precedent. Nulls `enriched_at`
   when `title`/`author_first`/`author_last`/`isbn` (the enrichment query keys) change, unless the
   same statement set its own new `enriched_at` (writer-knows exception via `IS DISTINCT FROM`). Its
   comment block articulates the repo's general pattern verbatim: "This defect class — a stored
   assertion that stopped being true with no mechanism to notice — has recurred repeatedly; the
   mechanism-to-notice belongs at the one chokepoint that cannot be bypassed" — the DB layer, because
   the incident-causing writer was a SQL migration that ran no client code.
2. **`remove_series_entry(p_entry)`** — security definer RPC (`20260731010000`). Atomic cross-row
   consistency: tombstones the `series_entries` row (`removed_at = now(), book_id = null, user_edited
= true`) and nulls `books.series` on the linked book (line 67) in one plpgsql transaction, so
   reconciliation can't revive the slot. Reads `book_id` server-side from the entry (never passed by
   caller) to prevent stale-cache clearing the wrong book. Explicit ownership checks because security
   definer bypasses RLS.
3. **`merge_books(p_primary, p_loser, p_fields)`** — security definer RPC (`20260812010000`). Atomic
   multi-table consistency across 7 tables in one transaction: re-parents reads, `list_items`,
   `book_authors`, `book_tropes`, `book_moods`, and `series_entries` (step 3c-series: tombstones
   redundant entries before re-parenting to avoid clashing `series_entries_book_uidx`), then writes
   `books.position`/`series_count` (step 4, lines 172-173), then deletes the loser. This is the
   strongest existing example of cross-row consistency as a deliberate, ordered, atomic operation.
4. **`set_updated_at()`** — before update trigger on `books` (`20260624010000_core_schema.sql:9-17`):
   `new.updated_at := now()`. Single-row, not cross-row — listed for completeness of the trigger
   inventory.

General pattern this repo uses: security definer RPCs for multi-write atomicity (default plpgsql
transaction + explicit ownership checks since definer bypasses RLS), and before-update triggers for
single-chokepoint invariants. The DB is the chokepoint by design, because migrations run no client
code. No constraint, trigger, or RPC enforces that `books.series_count` agrees across member books, or
that `books.position` agrees with `series_entries.position`, or that either is unique/contiguous
within a series. `syncBookPosition` (`series.ts:417`) is an application-level attempt to keep
`books.position` and `series_entries.position` in sync, but it is two unserialized statements with no
DB enforcement — exactly the dual-write-without-a-chokepoint shape the `enriched_stamp_invalidate`
comment warns about.

## The design tension, already documented in code

The audit's premise — that series length is a series-level fact stored N times on member books — is
not a conclusion introduced here; it is already stated in `packages/core/src/seriesIndex.ts`:

- Line 198-200 (`displayTotal`): "There is no single canonical total in the schema: `books.series_count`
  (per book), the live entry count, and nothing at all on the `series` row are three sources that can
  each answer differently."
- Line 253-264 (`claimedSeriesLength`): "Both display sites used `find(b => b.seriesCount != null)`,
  which is ORDER-DEPENDENT… Members disagree because `seriesCount` is a SERIES fact stored N times on
  member books; deriving it away entirely is the real fix and is out of this PR's scope."

`displayTotal` reconciles the disagreement client-side (`canonicalTotal ?? group.total`, where
`canonicalTotal` is the live entry count when it exceeds the owned count); `claimedSeriesLength` takes
MAX rather than first-non-null so the answer is monotonic under fill-only merges. Both are derivations
over the disagreement, not resolutions of it.

## Summary

`public.series` has no length column and never has. `series_entries.position` has no unique constraint
on `(series_id, position)`, so ordering is exactly as unconstrained there as on `books.position`. Both
`books.series_count` and `books.position` are written independently by at least seven and five paths
respectively, with no cross-row consistency enforcement anywhere in the schema. The repo has an
established pattern for this class of problem — security-definer RPCs for atomic multi-table writes,
before-update triggers for single-chokepoint invariants — demonstrated most fully by `merge_books`. No
existing mechanism applies that pattern to series length or position. `syncBookPosition`'s
two-statement dual-write is a live instance of the exact hazard `invalidate_enriched_stamp`'s own
documentation warns against.
