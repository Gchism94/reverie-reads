-- Phase 6 G1: generalize the romance-specific fields so other genres are first-class.
--   tropes  → tags      (generic content tags)
--   spice   → intensity (renamed; stays nullable smallint 0..5)
--   + genre              (primary genre signal for skin/adaptive logic)
-- A rename preserves every existing value; `genre` backfills to 'romance' for the current
-- (romance) seed. Guarded so a re-run on an already-migrated database is a clean no-op.

do $$
begin
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'books' and column_name = 'tropes') then
    alter table public.books rename column tropes to tags;
  end if;

  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'books' and column_name = 'spice') then
    alter table public.books rename column spice to intensity;
  end if;

  if not exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'books' and column_name = 'genre') then
    alter table public.books add column genre text not null default 'romance';
  end if;
end $$;

-- Keep the GIN index name in step with the column; add a primary-genre lookup index.
alter index if exists public.books_tropes_idx rename to books_tags_idx;
create index if not exists books_genre_idx on public.books (genre);
