-- PREVIEW ONLY — every statement is a SELECT. Nothing writes.
-- Follow-up to acotar-full-state.sql, which answered the main question and opened two more.
--
-- WHAT THE FIRST PASS ESTABLISHED (2026-08-09, production):
--   · Block 3 returned ZERO rows -> CASE (C). No `books` row for "A Court of Wings and Ruin"
--     exists under this owner. The ghost dd33f8da is the library's ONLY record of that book.
--   · Block 0 returned TWO series rows, not one: the target
--     (aa4e251e, "A Court of Thorns and Roses", 6 live + 1 tombstone) and a second
--     (2bec23ba, "ACOTAR", created 2026-08-04, 1 LIVE ENTRY, 0 tombstones).
--
-- Both need closing before a correction can be written, and neither is answerable from the
-- first pass's output.
--
-- ── 1. WHAT IS THE ACOTAR ROW'S SINGLE LIVE ENTRY? ──────────────────────────────────────────
-- A position correction applied to the target row alone leaves whatever this is stranded in a
-- duplicate series record. If it turns out to BE Wings and Ruin — catalogued under the variant
-- series name and therefore invisible to block 3's title search only if the title is spelled
-- differently — then case (c) is wrong and this is case (a), a series-identity split, with a
-- completely different correct fix.
--
-- ── 2. IS CASE (C) ACTUALLY TRUE, CHECKED A SECOND WAY? ─────────────────────────────────────
-- Block 3 searched by TITLE. Concluding "no books row exists" from a title match alone is a
-- proxy: a Wings-and-Ruin row titled unusually (a boxed-set name, a subtitle-first import, a
-- typo) would not match `%wings%ruin%` and would read as absent. Block 2 below searches by the
-- book's own SERIES STRING instead, which is an independent axis — a franchise book filed
-- under any ACOTAR-ish series name shows up here whatever its title says.
--
-- If block 2 lists exactly the four known books (Thorns, Mist, Frost, Silver) and nothing else,
-- case (c) is confirmed on two independent axes and the ghost really is the only record.

-- ══ 1. THE SECOND SERIES ROW'S ENTRIES ═══════════════════════════════════════════════════════
select '1. ACOTAR row entries' as section,
       e.id                                       as entry_id,
       e.position,
       e.title                                    as entry_title,
       e.author                                   as entry_author,
       e.label,
       e.book_id,
       b.title                                    as book_title,
       b.series                                   as book_series_string,
       b.position                                 as book_position,
       b.series_count,
       b.ownership,
       b.owned_physical,
       b.owned_ebook,
       b.owned_audiobook,
       e.source,
       e.user_edited,
       e.created_at,
       e.removed_at
from public.series_entries e
left join public.books b on b.id = e.book_id
where e.series_id = '2bec23ba-a016-4e97-aa60-e7dfff528fa7'
order by e.position, e.created_at;

-- ══ 2. EVERY FRANCHISE BOOK BY SERIES STRING — the independent check on case (c) ═════════════
-- Owner-scoped. Matches on the BOOK's series string, not its title, so a Wings-and-Ruin row
-- with an unexpected title still appears.
with target as (
  select id, owner_id from public.series
  where id = 'aa4e251e-be7a-45bf-a66b-78bbf9406e71'
)
select '2. franchise books by series string' as section,
       b.id            as book_id,
       b.title,
       b.series        as book_series_string,
       b.position      as book_position,
       b.series_count,
       b.ownership,
       b.owned_physical,
       b.owned_ebook,
       b.owned_audiobook,
       b.read_status,
       b.added_at,
       (select count(*) from public.series_entries e
         where e.book_id = b.id and e.removed_at is null)   as live_entry_links,
       (select string_agg(distinct s2.name, ' | ')
          from public.series_entries e
          join public.series s2 on s2.id = e.series_id
         where e.book_id = b.id and e.removed_at is null)   as live_linked_series
from public.books b
join target t on b.owner_id = t.owner_id
where b.series ilike '%court%'
   or b.series ilike '%thorns%'
   or b.series ilike 'acotar%'
order by b.position nulls last, b.title;

-- ══ 3. THE eBOOK-BUNDLE TOMBSTONE'S REVIVAL RISK ═════════════════════════════════════════════
-- The target series carries one tombstone: 09357eb3, "A Court of Thorns and Roses eBook Bundle",
-- position 11, removed 2026-08-03. Reconciliation REVIVES a tombstone whose title matches a book
-- still naming the series, so if a `books` row with that title exists and still names an ACOTAR
-- series, the next series-page open resurrects a slot the reader deliberately removed — and it
-- would land at position 11, outside the corrected order. Cheap to check now, expensive to
-- discover after the correction lands.
with target as (
  select id, owner_id from public.series
  where id = 'aa4e251e-be7a-45bf-a66b-78bbf9406e71'
)
select '3. bundle revival risk' as section,
       b.id      as book_id,
       b.title,
       b.series  as book_series_string,
       (select count(*) from public.series_entries e
         where e.book_id = b.id and e.removed_at is null) as live_entry_links
from public.books b
join target t on b.owner_id = t.owner_id
where b.title ilike '%bundle%'
   or b.title ilike '%boxed%'
   or b.title ilike '%box set%'
   or b.title ilike '%collection%';
