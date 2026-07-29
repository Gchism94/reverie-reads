-- READ-ONLY DIAGNOSTIC. Not a migration — nothing applies this. `supabase db push` only reads
-- supabase/migrations/, so this file living under docs/ can never be deployed by accident.
--
-- Finds rows left behind by the pre-S3 removal defect (fix/atomic-series-removal): a series-entry
-- TOMBSTONE sitting beside a book that still names that series. useRemoveEntry did two separately
-- committed writes — tombstone the entry, then null books.series — so a failure between them left
-- exactly this shape. It does not merely go stale: useSeriesDetail's reconciliation REVIVES a
-- tombstone whose title matches a book still naming the series, so every row this returns is a
-- removal that will silently undo itself the next time that series page is opened.
--
-- remove_series_entry makes the state unconstructible going forward. It does not heal rows that
-- already exist, which is what this query is for.
--
-- THE PREDICATE MIRRORS THE APP'S REVIVE PASS, including its two exclusions, so a hit is a row that
-- would actually be revived rather than merely one that looks wrong:
--   · books→series match is EXACT (the app does .eq('series', name)); title match is trim +
--     lowercase on both sides (the app normalizes both).
--   · a book already linked to a LIVE entry in the same series is skipped — the app builds its
--     `linked` set first and revive only considers books that are not in it.
--   · a book that a live GHOST would adopt is skipped too — ghost adoption (ghostMatchesBook: null
--     book_id, same normalized title) runs BEFORE revive and takes the book out of the running.
-- Without those two exclusions this over-reports, and a false positive costs a wild-goose chase.

select
  se.owner_id,
  s.name                                     as series_name,
  se.id                                      as entry_id,
  se.title                                   as slot_title,
  se.position,
  se.removed_at,
  b.id                                       as book_id,
  b.title                                    as book_title,
  b.series                                   as book_still_names
from public.series_entries se
join public.series s
  on s.id = se.series_id
join public.books b
  on b.owner_id = se.owner_id
 and b.series   = s.name
 and lower(btrim(b.title)) = lower(btrim(se.title))
where se.removed_at is not null
  -- the book is not already held by a live slot in this series
  and not exists (
    select 1
    from public.series_entries live
    where live.series_id = se.series_id
      and live.removed_at is null
      and live.book_id = b.id
  )
  -- ...and no live ghost in this series would adopt it first
  and not exists (
    select 1
    from public.series_entries ghost
    where ghost.series_id = se.series_id
      and ghost.removed_at is null
      and ghost.book_id is null
      and lower(btrim(ghost.title)) = lower(btrim(se.title))
  )
order by se.removed_at desc;
