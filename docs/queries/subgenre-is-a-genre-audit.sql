-- SUBGENRE TAXONOMY AUDIT — which books carry a GENRE in the subgenre field?
--
-- Owner ruling: subgenres are exactly one layer below genre. "Dark Romance" is a subgenre of
-- Romance; "Romance" is never a subgenre of anything. A core-genre value sitting in `subgenre` or
-- `subgenres[]` is not a subgenre — it is a second genre that was mis-filed.
--
-- READ-ONLY. Selects only; no writes, no DDL. Run by hand against the target:
--   supabase db query --linked --file docs/queries/subgenre-is-a-genre-audit.sql
-- (Verified form: `query`, not `execute`; `--linked`/`--file` are ITS flags. The invocation itself
--  was exercised against the LOCAL stack — see the runbook rule in CLAUDE.md.)
--
-- Its answer sizes the follow-up: if section A returns 0 rows, the stored data already obeys the
-- ruling and no data migration is needed — only the code guard. If it returns rows, each one is a
-- book whose genre was recorded in the wrong field, and fixing them is a separate decision.
--
-- ── HOW THE TWO SECTIONS DIFFER, AND WHY B IS A QUESTION RATHER THAN A VERDICT ────────────────
--
-- A — VIOLATIONS. The value IS a core genre, exactly. Unambiguous under the ruling.
--
-- B — SPELLING VARIANTS, for a decision. 'Sci-Fi' and 'YA' are not in CORE_GENRES but they NAME a
--     core genre, so they are arguably the same mis-filing. Reported separately because calling
--     them violations is a taxonomy judgement the ruling did not make.
--
-- DELIBERATELY IN NEITHER: 'Thriller', 'Crime', 'Historical', 'Short Stories'. These resolve to a
-- core genre through `genreKey`, so a naive check flags them — but they are NOT genre spellings.
-- `GENRE_ALIASES` collapses 'thriller' into Mystery for want of a Thriller skin, and
-- `LITERARY_DESCRIPTIVE` maps 'historical' to Literary while KEEPING it as a descriptive tag.
-- Both are genuine subgenres, one layer below their parent, exactly as the ruling requires.
-- Measured, not assumed: checking GENRE_SUBGENRES through `genreKey` reports four hits, of which
-- one is a real violation and three are these. An over-reporting instrument's hit is a question.

-- ── ONE STATEMENT, on purpose ─────────────────────────────────────────────────────────────────
-- `supabase db query` posts to the Management API as a prepared statement: it rejects a multi-
-- statement file ("cannot insert multiple commands into a prepared statement") and rejects psql
-- backslash meta-commands like `\set ON_ERROR_STOP on` outright. series-order-review-export.sql
-- can use both because it runs through psql; this one is shaped to run through the CLI with no
-- extra tooling. Both facts were found by running it, not by reading the docs.
--
-- Columns are shared across the three sections so they can travel in one result set; `detail` and
-- `value` carry different things per section, which the `section` column names.

with core as (
  select unnest(array[
    'romance','fantasy','science fiction','horror','mystery','literary','cozy','nonfiction','young adult'
  ]) as g
),
variants as (
  select unnest(array[
    'sci-fi','scifi','sci fi','science-fiction',   -- Science fiction
    'ya','young-adult',                            -- Young adult
    'cosy',                                        -- Cozy
    'non-fiction','non fiction',                   -- Nonfiction
    'romace','fantays','fantast'                   -- typo spellings seen in the real export
  ]) as g
),
-- Every subgenre a book carries, from BOTH storage shapes. `subgenres[]` is the current one;
-- `subgenre` is the pre-migration single that older rows still ride in, and bookSubgenres() reads
-- them exactly this way — checking only one would miss whichever half a given row uses.
carried as (
  select b.id, b.title, b.author_last, b.genre, lower(trim(s)) as value, 'subgenres[]' as field
    from public.books b, unnest(coalesce(b.subgenres, '{}')) as s
   where trim(coalesce(s, '')) <> ''
  union all
  select b.id, b.title, b.author_last, b.genre, lower(trim(b.subgenre)), 'subgenre'
    from public.books b
   where trim(coalesce(b.subgenre, '')) <> ''
)
-- A. VIOLATIONS: the value IS a core genre. Unambiguous under the ruling.
select 1 as ord, 'A-violation' as section, c.field as detail, c.value,
       c.title, c.author_last, c.genre as current_genre, c.id::text as book_id
  from carried c join core on core.g = c.value
union all
-- B. SPELLING VARIANTS: names a core genre without being a canonical spelling. A DECISION, not a
--    verdict — see the header.
select 2, 'B-variant-for-decision', c.field, c.value,
       c.title, c.author_last, c.genre, c.id::text
  from carried c join variants on variants.g = c.value
union all
-- C. TOTALS, so "0 rows above" can be told apart from "nothing was examined". A clean result from
--    an instrument that looked at nothing is not evidence of anything.
select 3, 'C-totals', m.k, m.v::text, null, null, null, null
  from (
    select 'books' as k, count(*) as v from public.books
    union all select 'books_with_subgenre',
      count(*) filter (where trim(coalesce(subgenre, '')) <> '') from public.books
    union all select 'books_with_subgenres_array',
      count(*) filter (where coalesce(array_length(subgenres, 1), 0) > 0) from public.books
    union all select 'books_with_any_subgenre',
      count(*) filter (where trim(coalesce(subgenre, '')) <> ''
                          or coalesce(array_length(subgenres, 1), 0) > 0) from public.books
  ) m
order by ord, value, title;
