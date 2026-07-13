-- Shelf & TBR system (docs/task-shelf-system.md):
--  · lists.sort_order — manual shelf ordering (spaced numeric; renumber-on-write from the app).
--    Backfilled from created_at so the current display order is preserved exactly.
--  · lists.description — the shelf detail page's subtitle line.
--  · books.reading_position — manual Reading Now ordering (same spaced-numeric scheme).
--  · books.reading_now_hidden — "hide from Reading Now" display-only removal; the book stays
--    readStatus='Reading' with its progress intact. Cleared whenever the reader marks it Reading.
-- RLS: unchanged — all user-scoped attributes on already-policied tables.

alter table public.lists
  add column sort_order numeric,
  add column description text;

update public.lists l
set sort_order = sub.rn * 1000
from (
  select id, row_number() over (partition by owner_id order by created_at) as rn
  from public.lists
) sub
where l.id = sub.id;

alter table public.books
  add column reading_position numeric,
  add column reading_now_hidden boolean not null default false;
