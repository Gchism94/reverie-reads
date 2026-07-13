-- Book editing — genre model + series status (docs/task-book-editing.md).
--
-- 1) subgenres[] joins the row: multi-select replaces the single subgenre. The old `subgenre`
--    column stays as the DENORMALIZED FIRST element (the same pattern author_first/author_last
--    use against contributors) — single-value readers keep working, writers keep both in sync.
-- 2) Primary genre inference: rows with no genre get one ONLY where their subgenre names a
--    single genre unambiguously (pairs mirror core's SUBGENRE_PRIMARY_GENRE — parity-tested).
--    Shared subgenres (Romantasy, Contemporary, Cozy Mystery, Cozy Fantasy, 'Other', legacy
--    'Fantasy') stay empty: the edit form prompts the reader instead of guessing.
-- 3) Series status expands to the five-value enum. This is the SERIES' publication status —
--    the reader's own position in a series is derived from read states and never stored here.

alter table public.books add column if not exists subgenres text[] not null default '{}';

update public.books
set subgenres = array[subgenre]
where coalesce(subgenre, '') <> '' and subgenres = '{}';

-- Primary-genre inference (unambiguous pairs only; keys lowercased).
update public.books b
set genre = m.genre
from (values
  ('dark romance', 'romance'),
  ('romance', 'romance'),
  ('sports', 'romance'),
  ('cowboy romance', 'romance'),
  ('epic fantasy', 'fantasy'),
  ('dark fantasy', 'fantasy'),
  ('portal fantasy', 'fantasy'),
  ('sword & sorcery', 'fantasy'),
  ('space opera', 'science fiction'),
  ('cyberpunk', 'science fiction'),
  ('dystopian', 'science fiction'),
  ('hard sf', 'science fiction'),
  ('time travel', 'science fiction'),
  ('first contact', 'science fiction'),
  ('gothic', 'horror'),
  ('supernatural', 'horror'),
  ('slasher', 'horror'),
  ('cosmic horror', 'horror'),
  ('psychological', 'horror'),
  ('haunted house', 'horror'),
  ('noir', 'mystery'),
  ('thriller', 'mystery'),
  ('detective', 'mystery'),
  ('whodunit', 'mystery'),
  ('locked room', 'mystery'),
  ('literary fiction', 'literary'),
  ('historical', 'literary'),
  ('magical realism', 'literary'),
  ('short stories', 'literary'),
  ('small town', 'cozy'),
  ('slice of life', 'cozy'),
  ('culinary', 'cozy'),
  ('memoir', 'nonfiction'),
  ('history', 'nonfiction'),
  ('science', 'nonfiction'),
  ('essays', 'nonfiction'),
  ('biography', 'nonfiction'),
  ('self-help', 'nonfiction'),
  ('ya fantasy', 'young adult'),
  ('ya romance', 'young adult'),
  ('ya dystopian', 'young adult'),
  ('coming of age', 'young adult'),
  ('ya contemporary', 'young adult')
) as m(subgenre, genre)
where coalesce(b.genre, '') = '' and lower(coalesce(b.subgenre, '')) = m.subgenre;

-- Series status → five-value enum. Mapping: Standalone→standalone, Series→ongoing,
-- Complete→completed; anything else falls back on whether the row names a series.
-- The original schema pins the OLD three values in books_status_check — drop it BEFORE the
-- rewrite or the new values can't be written.
alter table public.books drop constraint if exists books_status_check;

update public.books
set status = case
  when lower(coalesce(status, '')) in ('standalone', 'standalones') then 'standalone'
  when lower(coalesce(status, '')) in ('series', 'ongoing', 'in progress', 'in_progress') then 'ongoing'
  when lower(coalesce(status, '')) in ('complete', 'completed', 'finished') then 'completed'
  when lower(coalesce(status, '')) in ('on hiatus', 'on_hiatus', 'hiatus', 'paused') then 'on_hiatus'
  when lower(coalesce(status, '')) in ('cancelled', 'canceled') then 'cancelled'
  when coalesce(series, '') = '' then 'standalone'
  else 'ongoing'
end;

-- Pin the enum in schema (null passes; the app always writes a value).
alter table public.books add constraint books_status_check
  check (status in ('standalone', 'ongoing', 'completed', 'on_hiatus', 'cancelled'));
