-- Page count — the one bibliographic field the model never had.
--
-- It already arrives: the cover sheet's edition chooser fetches `pages` for every candidate and
-- shows it ("352 pp"), then throws it away when the reader picks one. Nothing stored it because
-- there was nowhere to put it.
--
-- Nullable on purpose. Absent means UNKNOWN and renders as nothing — never a fabricated 0, never a
-- guess from word count or format. The same honesty rule the cover placeholder and the mood
-- dimension follow: a blank is a real state, not a hole to fill.
--
-- Deliberately NOT progress-by-page in this change. `progress` stays a 0..100 percentage; wiring
-- pages into it is a separate decision about what "progress" means for an audiobook or an ebook.

alter table public.books add column if not exists pages integer;

-- A book with zero or negative pages is a data error, not an edition. Mirrors the pub_m/pub_d
-- shape so the client can validate against the same bound it will be held to.
alter table public.books drop constraint if exists books_pages_check;
alter table public.books add constraint books_pages_check
  check (pages is null or (pages > 0 and pages <= 20000));

comment on column public.books.pages is
  'Page count for the edition the reader has. Null = unknown; renders blank, never a default. Populated by hand in edit details or from the chosen edition in the cover sheet.';
