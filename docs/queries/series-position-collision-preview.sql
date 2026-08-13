-- PREVIEW ONLY — every statement is a SELECT. Nothing writes.
-- Run against production BEFORE deploying 20260816010000_series_position_uidx.sql:
-- that migration's `create unique index series_entries_position_uidx (series_id, position)
-- where removed_at is null` fails outright against any of the rows this file surfaces,
-- so the violating set must be empty (or resolved via staged incident files) first.
--
-- The index was originally part of 20260813010000_series_integrity_schema.sql and moved out in
-- Phase 2, because it and `series.length` have opposite deploy constraints (the RPC needs the
-- column to exist BEFORE it ships; the index must not exist UNTIL the re-pointed app has). It now
-- lives on the held branch `chore/series-position-index` and is the LAST thing deployed.
--
-- ALREADY RUN, 2026-08-09: exactly ONE collision in the whole library — A Court of Thorns and
-- Roses position 4, ghost-vs-book. Re-run before the index deploys, since the library moves.
--
-- Three blocks:
--   1. The violating set itself — every (series, position) holding >1 LIVE entry, with
--      per-entry detail for owner review, and each group classified by SHAPE:
--        book-vs-book   — every collider is a linked entry (the ACOTAR shape: two real
--                         book rows claiming one slot; resolves via merge_books or a
--                         position correction)
--        ghost-vs-book  — a ghost slot collides with a linked entry (ghosts occupy the
--                         uniqueness space deliberately per the ownership-vs-membership
--                         rule, but this shape usually means a source refresh inserted a
--                         slot the reader's own book already fills)
--        ghost-vs-ghost — only ghosts collide (pure source/seeding artifact)
--      The owner wants ghost involvement visible BEFORE assuming every collision has the
--      ACOTAR (two real books) shape — the two shapes repair differently.
--   2. Clustering — collisions per series, worst first: do violations concentrate in a
--      handful of series (Iron-Flame-style per-incident cleanup) or spread evenly
--      (needs batched tooling)?
--   3. Headline totals — one row for the report, plus the shape distribution.
--
-- Tombstoned entries (removed_at is not null) are invisible to every block on purpose:
-- the index predicate excludes them, so they cannot violate it.

\set ON_ERROR_STOP on

-- ══ 1. VIOLATING SET — every live (series_id, position) collision, with detail ══════════════
select
  s.name                                                as series_name,
  e.series_id,
  e.position,
  count(*)                                              as live_rows,
  count(*) filter (where e.book_id is not null)         as book_rows,
  count(*) filter (where e.book_id is null)             as ghost_rows,
  case
    when count(*) filter (where e.book_id is null) = 0     then 'book-vs-book'
    when count(*) filter (where e.book_id is not null) = 0 then 'ghost-vs-ghost'
    else                                                        'ghost-vs-book'
  end                                                   as collision_shape,
  bool_or(e.user_edited)                                as any_user_edited,
  jsonb_agg(
    jsonb_build_object(
      'entry_id',    e.id,
      'book_id',     e.book_id,
      'title',       coalesce(b.title, nullif(e.title, ''), '(untitled ghost)'),
      'label',       e.label,
      'source',      e.source,
      'user_edited', e.user_edited,
      'created_at',  e.created_at
    )
    order by e.created_at
  )                                                     as entries
from public.series_entries e
join public.series s on s.id = e.series_id
left join public.books b on b.id = e.book_id
where e.removed_at is null
group by s.name, e.series_id, e.position
having count(*) > 1
order by s.name, e.position;

-- ══ 2. CLUSTERING — collisions per series, worst first ══════════════════════════════════════
with collision_groups as (
  select e.series_id, e.position, count(*) as live_rows
  from public.series_entries e
  where e.removed_at is null
  group by e.series_id, e.position
  having count(*) > 1
)
select
  s.name                 as series_name,
  c.series_id,
  count(*)               as collision_groups,
  sum(c.live_rows)       as colliding_rows,
  sum(c.live_rows) - count(*) as rows_needing_resolution  -- one survivor per slot
from collision_groups c
join public.series s on s.id = c.series_id
group by s.name, c.series_id
order by collision_groups desc, s.name;

-- ══ 3. HEADLINE — one row for the report, then the shape distribution ═══════════════════════
with collision_groups as (
  select e.series_id, e.position, count(*) as live_rows,
         count(*) filter (where e.book_id is null)     as ghost_rows,
         count(*) filter (where e.book_id is not null) as book_rows
  from public.series_entries e
  where e.removed_at is null
  group by e.series_id, e.position
  having count(*) > 1
)
select
  (select count(distinct series_id) from public.series_entries where removed_at is null)
                                   as series_with_live_entries,
  count(distinct c.series_id)      as series_with_collisions,
  count(*)                         as collision_groups,
  coalesce(sum(c.live_rows), 0)    as colliding_rows
from collision_groups c;

with collision_groups as (
  select e.series_id, e.position,
         count(*) filter (where e.book_id is null)     as ghost_rows,
         count(*) filter (where e.book_id is not null) as book_rows
  from public.series_entries e
  where e.removed_at is null
  group by e.series_id, e.position
  having count(*) > 1
)
select
  case
    when ghost_rows = 0 then 'book-vs-book'
    when book_rows  = 0 then 'ghost-vs-ghost'
    else                     'ghost-vs-book'
  end        as collision_shape,
  count(*)   as collision_groups
from collision_groups
group by 1
order by collision_groups desc;
