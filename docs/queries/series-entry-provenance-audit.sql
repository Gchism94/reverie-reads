-- PROVENANCE AUDIT for series_entries. READ-ONLY, one statement. Run against production.
--
-- Answers the question fix/series-seed-provenance is blocked on: how many rows carry
-- `user_edited = true`, and can any of them be identified as ACTUALLY reader-placed rather than
-- machine-seeded?
--
-- ── Why this cannot be answered from the schema alone ──────────────────────────────────────────
-- `series_entries` has twelve columns and none of them records who wrote the row:
--   id, series_id, owner_id, position, label, title, author, book_id, source, user_edited,
--   created_at, removed_at
-- There is NO `updated_at` — verified against the live schema, not assumed — so there is no
-- "modified after creation" signal to separate a row a reader later dragged from one that has sat
-- untouched since reconciliation minted it.
--
-- The two shapes that matter are byte-identical:
--   · a SEEDED row      (useSeriesDetail)      → source 'manual', user_edited true, book_id set
--   · a PICKER-ADDED row(useAddSeriesEntries)  → source 'manual', user_edited true, book_id set
-- Nothing distinguishes them. A ghost add differs only by `book_id is null`, which a seeded row
-- never has — so ghosts ARE identifiable; linked rows are not.
--
-- Position shape is not a tiebreaker either, and it is worth saying why explicitly because it looks
-- like one. A drag writes `positionBetween`, which produces decimals (2.5, 2.45) — so a decimal
-- looks like reader evidence. It is not sufficient: `seedSeriesPositions` KEEPS believable in-series
-- indices verbatim, and after the series backfill (#130) those include parsed decimals like #2.5
-- from `(Series, #2.5)` novella parentheticals. A decimal position can therefore be either. And it
-- is not necessary: the whole-list renumber path writes clean integers 1..n over reader-arranged
-- rows, so a genuinely dragged series can end up entirely integral.
--
-- `label` is the one honest positive signal: nothing but `useUpdateEntry` ever writes it, and that
-- is a reader typing a tag. A row with a non-null label was touched by a reader. The converse says
-- nothing — most reader gestures never set a label.

select
  s.owner_id::text                                                            as owner,
  count(*)                                                                    as entries_total,
  count(*) filter (where e.removed_at is not null)                            as tombstones,
  count(*) filter (where e.removed_at is null)                                as live,

  -- The population the reset would touch.
  count(*) filter (where e.removed_at is null and e.user_edited)              as live_user_edited,

  -- Of those: the AMBIGUOUS shape — seeded and picker-added are indistinguishable here.
  count(*) filter (
    where e.removed_at is null and e.user_edited
      and e.source = 'manual' and e.book_id is not null
  )                                                                           as ambiguous_linked_manual,

  -- Identifiable as reader-placed: a manual GHOST (no book ever linked). Seeding always links.
  count(*) filter (
    where e.removed_at is null and e.user_edited
      and e.source = 'manual' and e.book_id is null
  )                                                                           as reader_ghost,

  -- Identifiable as reader-placed: carries a label, which only useUpdateEntry writes.
  count(*) filter (where e.removed_at is null and e.user_edited and e.label is not null)
                                                                              as reader_labelled,

  -- Rows already correctable today (the merge can move these): hardcover-sourced, never edited.
  count(*) filter (
    where e.removed_at is null and not e.user_edited and e.source = 'hardcover'
  )                                                                           as already_movable,

  -- Context only — see the header on why this does NOT identify a drag.
  count(*) filter (where e.removed_at is null and e.position <> floor(e.position))
                                                                              as decimal_position,
  count(distinct e.series_id)                                                 as series_touched
from public.series_entries e
join public.series s on s.id = e.series_id
group by s.owner_id
order by 2 desc;
