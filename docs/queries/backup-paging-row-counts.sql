-- Which tables are ALREADY over the PostgREST row cap?
--
-- Context: buildBackup issued fourteen un-ranged selects, each capped silently at 1,000 rows
-- (fix/backup-paging). `books` was 491 at the time and comfortably under — but the JOIN tables
-- carry several rows per book, so they cross the cap long before the library does. This answers
-- whether any backup taken before that fix was already truncated, or whether the exposure was
-- still latent.
--
-- READ-ONLY. Run against the target database by hand; a Code session does not run this.
--   supabase db query --linked --file docs/queries/backup-paging-row-counts.sql
--
-- Reading the result: `over_cap = true` on any row means backups written before the fix were
-- missing rows from that section, silently, and restored clean. `headroom` is how many rows that
-- table can still gain before it crosses.

with counts as (
  select 'books'                  as tbl, count(*) as n from public.books
  union all select 'book_authors',           count(*) from public.book_authors
  union all select 'book_tropes',            count(*) from public.book_tropes
  union all select 'book_moods',             count(*) from public.book_moods
  union all select 'reads',                  count(*) from public.reads
  union all select 'lists',                  count(*) from public.lists
  union all select 'list_items',             count(*) from public.list_items
  union all select 'reviews',                count(*) from public.reviews
  union all select 'merge_verdicts',         count(*) from public.merge_verdicts
  union all select 'author_follows',         count(*) from public.author_follows
  union all select 'series',                 count(*) from public.series
  union all select 'series_entries',         count(*) from public.series_entries
  union all select 'series_merge_decisions', count(*) from public.series_merge_decisions
  union all select 'tropes',                 count(*) from public.tropes
  union all select 'moods',                  count(*) from public.moods
  union all select 'trope_suggestions',      count(*) from public.trope_suggestions
)
select
  tbl,
  n                          as rows,
  n > 1000                   as over_cap,
  greatest(0, 1000 - n)      as headroom
from counts
order by n desc;
