-- PREVIEW ONLY — one statement, every branch a SELECT. Nothing writes, nothing is created.
-- Run against production before authorising fix/series-backfill's migration.
--
-- ── The parser is PORTED, and the port was verified rather than trusted ─────────────────────────
-- The peel/parse CTEs below are `packages/core/src/seriesTitle.ts`'s parseSeriesFromTitle
-- reimplemented in SQL, copied VERBATIM from docs/queries/series-entry-repair-preview.sql: the same
-- REF alternation (name + `#N` / `Book N` / `#N-M` range), the same peel loop over STACKED trailing
-- parentheticals, the same ';'-split within one parenthetical, and the same rule that a
-- parenthetical is consumed only if EVERY part is series-shaped — so "(Deluxe Edition)" survives.
--
-- Parity was checked by running both implementations over 5,827 generated cases and diffing every
-- field. Zero divergences. Both porting bugs that exercise found are present here:
--   · the `cardinality(string_to_array(...)) > 0` guard — `string_to_array('', ';')` is `{}` in
--     Postgres but `''.split(';')` is `['']` in JS, so an EMPTY parenthetical "()" satisfied
--     "all parts are series-shaped" VACUOUSLY and was consumed.
--   · the opening `btrim`, without which a whitespace-only title kept its space.
--
-- ── What is NEW here, versus the repair preview ─────────────────────────────────────────────────
-- The parser now runs over a NORMALIZED title, because a title written in mathematical bold has no
-- ASCII `#` and cannot match the ref regex at all. Order is deliberate:
--   1. normalize(NFKC)  — folds mathematical bold and fullwidth variants to ASCII.
--   2. strip zero-width — NFKC does NOT remove U+200B/200C/200D/2060/FEFF. `translate(x, set, '')`
--      is used rather than a regex: Postgres regex `\uXXXX` escapes inside a bracket expression are
--      easy to get subtly wrong, and translate() removing every `from` char with no counterpart is
--      unambiguous.
--   3. btrim, then peel.
-- Normalizing FIRST is what lets `𝐀 𝐂𝐨𝐮𝐫𝐭 𝐨𝐟 𝐁𝐨𝐧𝐝𝐬 𝐚𝐧𝐝 𝐁𝐞𝐭𝐫𝐚𝐲𝐚𝐥 - 𝐀𝐜𝐨𝐭𝐚𝐫` become searchable at all.
--
-- ── Two things this preview REPORTS rather than decides ────────────────────────────────────────
-- · Category 8 lists titles that end up with a DOUBLE SPACE after zero-width stripping. The spec
--   asks for NFKC + zero-width removal and says nothing about collapsing whitespace, so this
--   migration will not collapse it. If category 8 is non-empty, that is a decision to make before
--   authorising, not after.
-- · Category 9 counts books whose `series` is the EMPTY STRING rather than NULL. The spec says
--   backfill "ONLY where books.series is currently null"; an empty string is functionally
--   series-less but would be skipped by a literal `is null`. If category 9 is non-zero, say which
--   reading you want.

with recursive
-- Normalized source. `raw` keeps the original for before/after display; `title` is what the parser
-- sees. ZW set: U+200B ZWSP, U+200C ZWNJ, U+200D ZWJ, U+2060 WORD JOINER, U+FEFF ZWNBSP.
src as (
  select 'books'::text as tbl, b.id, b.owner_id, b.title as raw_original,
         btrim(translate(normalize(b.title, NFKC),
               chr(8203)||chr(8204)||chr(8205)||chr(8288)||chr(65279), '')) as title,
         b.position, null::boolean as user_edited, null::uuid as book_id,
         b.series as series_name, coalesce(b.cover_url, '') as cover_url
  from public.books b
  union all
  select 'series_entries', e.id, e.owner_id, e.title,
         btrim(translate(normalize(e.title, NFKC),
               chr(8203)||chr(8204)||chr(8205)||chr(8288)||chr(65279), '')),
         e.position, e.user_edited, e.book_id, s.name, ''
  from public.series_entries e join public.series s on s.id = e.series_id
  where e.removed_at is null
),
-- ── VERBATIM from series-entry-repair-preview.sql below ────────────────────────────────────────
peel as (
  select tbl, id, owner_id, raw_original, title as raw, btrim(title) as remaining, 0 as depth,
         null::text as inner_txt, position, user_edited, book_id, series_name, cover_url
  from src
  union all
  select p.tbl, p.id, p.owner_id, p.raw_original, p.raw,
         btrim((regexp_match(p.remaining, '^(.*?)\s*\(([^()]*)\)\s*$'))[1]),
         p.depth + 1,
         (regexp_match(p.remaining, '^(.*?)\s*\(([^()]*)\)\s*$'))[2],
         p.position, p.user_edited, p.book_id, p.series_name, p.cover_url
  from peel p
  where p.remaining ~ '^(.*?)\s*\(([^()]*)\)\s*$'
    and coalesce((regexp_match(p.remaining, '^(.*?)\s*\(([^()]*)\)\s*$'))[1], '') <> ''
    -- cardinality guard: see the header. Without it, "()" is consumed and the TS parser never does.
    and cardinality(string_to_array((regexp_match(p.remaining, '^(.*?)\s*\(([^()]*)\)\s*$'))[2], ';')) > 0
    and not exists (
      select 1 from unnest(string_to_array((regexp_match(p.remaining, '^(.*?)\s*\(([^()]*)\)\s*$'))[2], ';')) part
      where part !~* '^\s*(.+?),?\s+(?:#\s*([0-9]+(?:\.[0-9]+)?)(?:\s*[-–]\s*#?[0-9]+(?:\.[0-9]+)?)?|book\s+([0-9]+(?:\.[0-9]+)?)|#\s*([0-9]+(?:\.[0-9]+)?\s*[-–]\s*[0-9]+(?:\.[0-9]+)?))\s*$'
    )
),
deepest as (
  select distinct on (tbl, id) tbl, id, owner_id, raw_original, raw, remaining as clean_title,
         inner_txt, depth, position, user_edited, book_id, series_name, cover_url
  from peel order by tbl, id, depth desc
),
parse as (
  select d.*,
         btrim((regexp_match((string_to_array(d.inner_txt, ';'))[1],
           '^\s*(.+?),?\s+(?:#\s*([0-9]+(?:\.[0-9]+)?)(?:\s*[-–]\s*#?[0-9]+(?:\.[0-9]+)?)?|book\s+([0-9]+(?:\.[0-9]+)?)|#\s*([0-9]+(?:\.[0-9]+)?\s*[-–]\s*[0-9]+(?:\.[0-9]+)?))\s*$', 'i'))[1]) as parsed_series,
         case
           when d.depth = 0 then null
           when position('#' in (string_to_array(d.inner_txt, ';'))[1]) > 0
                and substr((string_to_array(d.inner_txt, ';'))[1],
                           position('#' in (string_to_array(d.inner_txt, ';'))[1])) ~ '[-–]' then null
           else coalesce(
             (regexp_match((string_to_array(d.inner_txt, ';'))[1],
               '^\s*(.+?),?\s+(?:#\s*([0-9]+(?:\.[0-9]+)?)(?:\s*[-–]\s*#?[0-9]+(?:\.[0-9]+)?)?|book\s+([0-9]+(?:\.[0-9]+)?)|#\s*([0-9]+(?:\.[0-9]+)?\s*[-–]\s*[0-9]+(?:\.[0-9]+)?))\s*$', 'i'))[2],
             (regexp_match((string_to_array(d.inner_txt, ';'))[1],
               '^\s*(.+?),?\s+(?:#\s*([0-9]+(?:\.[0-9]+)?)(?:\s*[-–]\s*#?[0-9]+(?:\.[0-9]+)?)?|book\s+([0-9]+(?:\.[0-9]+)?)|#\s*([0-9]+(?:\.[0-9]+)?\s*[-–]\s*[0-9]+(?:\.[0-9]+)?))\s*$', 'i'))[3]
           )::numeric
         end as parsed_position,
         (d.depth > 0
          and position('#' in (string_to_array(d.inner_txt, ';'))[1]) > 0
          and substr((string_to_array(d.inner_txt, ';'))[1],
                     position('#' in (string_to_array(d.inner_txt, ';'))[1])) ~ '[-–]') as is_range
  from deepest d
),
-- ── END verbatim ───────────────────────────────────────────────────────────────────────────────

-- The five hand-picked merges from the 42-row author-grouped review. Applied on WRITE only, and
-- deliberately NOT generalised into a rule: near-misses like `Ravenhood Legacy` / `The Ravenhood`
-- are separate series, and `Divine Rivals` / `Letters of Enchantment` is a book title read as one.
canon(from_name, to_name) as (
  values ('Adrian X Isolde',    'Adrian x Isolde'),
         ('Hades & Persephone', 'Hades x Persephone Saga'),
         ('Hades X Persephone', 'Hades x Persephone Saga'),
         ('Dance with my Demons','Dance With My Demons'),
         ('Playing For Keeps',  'Playing for Keeps'),
         ('Fire and Metal',     'Fire & Metal')
),
-- Books only, with exclusions applied exactly as the migration will apply them.
bk as (
  select p.*,
         (p.clean_title = 'Untitled') as is_untitled,
         coalesce(c.to_name, p.parsed_series) as canon_series
  from parse p
  left join canon c on c.from_name = p.parsed_series
  where p.tbl = 'books'
),
-- The post-migration state of every book: what series and position it would END UP with.
-- `series is null` is the never-overwrite rule, verbatim.
final as (
  select bk.*,
         case
           when bk.is_untitled then bk.series_name          -- excluded: untouched
           when bk.is_range   then bk.series_name           -- omnibus: no series written
           when bk.series_name is null then bk.canon_series -- backfilled
           else bk.series_name                              -- existing series never overwritten
         end as final_series,
         case
           when bk.is_untitled then bk.position
           when bk.is_range   then bk.position
           when bk.series_name is null then bk.parsed_position
           else bk.position
         end as final_position
  from bk
),
-- Per-owner single-book counts. EVERY aggregate below is owner-scoped: `series_entries`, `books`
-- and the series page are all owner-scoped by RLS, and `positionsAreInSeriesIndices` runs over one
-- reader's candidates. Aggregating across owners conflated six libraries into one and reported
-- another account's copy of Throne of Glass as a position collision — caught by running this
-- against the local seed (590 books, 6 owners, zero duplicate (owner,title)), not by reading it.
sb_before as (
  select owner_id, count(*) as n from (
    select owner_id, series_name from final
    where nullif(btrim(series_name),'') is not null group by 1,2 having count(*) = 1) x
  group by owner_id
),
sb_after as (
  select owner_id, count(*) as n from (
    select owner_id, final_series from final
    where nullif(btrim(final_series),'') is not null group by 1,2 having count(*) = 1) x
  group by owner_id
)

-- ══ Q2a. EXPECTED SERIES COUNT AFTER BACKFILL (per owner) ══════════════════════════════════════
select 'Q2a. series count after backfill' as category, owner_id::text as owner,
       null::text as source, null::uuid as id, null::text as series_name,
       count(distinct series_name) filter (where nullif(btrim(series_name),'') is not null)::text as before_value,
       count(distinct final_series) filter (where nullif(btrim(final_series),'') is not null)::text as after_value,
       count(*)::text as detail_a, null::text as detail_b,
       'distinct non-empty series names over this owner''s books; detail_a = books' as note
from final group by owner_id

union all
-- ══ Q2b. HOW MANY OF THOSE ARE SINGLE-BOOK (per owner) ═════════════════════════════════════════
select 'Q2b. single-book series after', f.owner_id::text, null, null, null,
       coalesce(b.n, 0)::text, coalesce(a.n, 0)::text, null, null,
       'a single-book series is legitimate (first of a planned series) but inflates the shelf'
from (select distinct owner_id from final) f
left join sb_before b on b.owner_id = f.owner_id
left join sb_after  a on a.owner_id = f.owner_id

union all
-- ══ Q3. UNCOVERED BOOKS CARRYING A DIRTY TITLE (per owner) ═════════════════════════════════════
-- If most of the uncovered set is dirty, the residual is a MATCHING failure, not a coverage gap —
-- the enrich search sends `b.title` verbatim to Open Library's `title=` and Google's `intitle:"..."`
-- (supabase/functions/enrich/index.ts:216,232), so a parenthetical is searched as part of the title.
select 'Q3. uncovered books', owner_id::text, null, null, null,
       count(*) filter (where cover_url = '')::text,
       count(*) filter (where cover_url = '' and depth > 0)::text,
       count(*) filter (where cover_url = '' and depth = 0)::text, null,
       'before = uncovered total; after = of those, DIRTY; detail_a = already clean'
from final group by owner_id

union all
-- ══ Q4a. DUPLICATE POSITIONS WITHIN ONE SERIES, POST-BACKFILL (per owner) ══════════════════════
-- positionsAreInSeriesIndices returns false on ANY duplicate within one reader's candidate set,
-- which renumbers the WHOLE series 1..n and discards the parsed numbers. One collision poisons a
-- series — which is why this is wanted before authorising, not after.
select 'Q4a. DUPLICATE position', owner_id::text, 'books', null, final_series,
       final_position::text, count(*)::text,
       string_agg(clean_title, ' | ' order by clean_title), null,
       'collision — this series would be fully renumbered, parsed positions discarded'
from final
where nullif(btrim(final_series),'') is not null and final_position is not null
group by owner_id, final_series, final_position
having count(*) > 1

union all
-- ══ Q4b. POSITION OUTSIDE THE TRUSTED RANGE (0 < p <= 100) ═════════════════════════════════════
-- Same consequence as a duplicate: SERIES_POSITION_CEILING is 100 (packages/core/src/seriesShelf.ts),
-- and a single out-of-range value makes that owner's whole series untrusted.
select 'Q4b. position out of range', owner_id::text, 'books', id, final_series,
       final_position::text, null, clean_title, null,
       'outside 0 < p <= 100 — untrusts the whole series'
from final
where nullif(btrim(final_series),'') is not null and final_position is not null
  and (final_position <= 0 or final_position > 100)

union all
-- ══ 1. TITLES CARRYING A SERIES PARENTHETICAL (books AND entries) ══════════════════════════════
select '1. dirty title', p.owner_id::text, p.tbl, p.id, p.series_name,
       p.raw_original, p.clean_title, p.parsed_series, p.parsed_position::text,
       case when p.is_range then 'RANGE — omnibus, no series/position written'
            when p.clean_title = 'Untitled' then 'EXCLUDED — bare Untitled, left untouched'
            when p.raw_original is distinct from p.raw then 'also unicode-normalized'
            else null end
from parse p
where p.depth > 0

union all
-- ══ 2. STORED POSITION DISAGREES WITH THE TITLE'S ══════════════════════════════════════════════
select '2. position disagrees', owner_id::text, tbl, id, series_name,
       position::text, parsed_position::text, null, user_edited::text,
       case when user_edited then 'reader-placed — NOT touched' else 'recoverable' end
from parse
where tbl = 'series_entries' and depth > 0 and parsed_position is not null
  and position is distinct from parsed_position

union all
-- ══ 3. ORPHAN GHOSTS WHOSE CLEANED TITLE MATCHES A LIBRARY BOOK ════════════════════════════════
-- Both sides are cleaned before comparing: the BOOK's title may be dirty too, which is exactly how
-- these pairs came to look different in the first place. Already owner-scoped by the join.
select '3. orphan ghost', g.owner_id::text, 'series_entries', g.id, g.series_name,
       g.raw_original, g.clean_title, b.id::text, null,
       'adopts book ' || b.id || ' — ' || b.clean_title
from parse g
join parse b on b.tbl = 'books' and b.owner_id = g.owner_id
             and lower(btrim(b.clean_title)) = lower(btrim(g.clean_title))
where g.tbl = 'series_entries' and g.book_id is null

union all
-- ══ 4. OMNIBUS ENTRIES (a range is not a reading-order slot) ═══════════════════════════════════
select '4. omnibus entry', owner_id::text, tbl, id, series_name,
       raw_original, clean_title, null, user_edited::text,
       'tombstone rather than delete, so reader removals stay expressible'
from parse
where depth > 0 and is_range

union all
-- ══ 5. EXCLUDED — BARE `Untitled` ══════════════════════════════════════════════════════════════
-- Unreleased placeholders. Cleaning them would make them indistinguishable from each other.
select '5. excluded Untitled', owner_id::text, tbl, id, series_name,
       raw_original, clean_title, parsed_series, parsed_position::text,
       'title, series and position ALL left untouched'
from parse
where clean_title = 'Untitled'

union all
-- ══ 6. CANONICAL MERGE APPLIED ON WRITE ════════════════════════════════════════════════════════
select '6. canonical merge', owner_id::text, 'books', id, null,
       parsed_series, canon_series, clean_title, null,
       'hand-picked; no additional merges are derived by rule'
from bk
where canon_series is distinct from parsed_series

union all
-- ══ 7. BACKFILL SKIPPED — BOOK ALREADY HAS A SERIES ════════════════════════════════════════════
-- The never-overwrite rule, made visible: these parse to a series but keep the one they have.
select '7. existing series kept', owner_id::text, 'books', id, series_name,
       series_name, parsed_series, clean_title, null,
       case when lower(btrim(series_name)) = lower(btrim(coalesce(canon_series,'')))
            then 'same name — no visible change'
            else 'DIFFERS from parsed — existing wins, by rule' end
from bk
where depth > 0 and nullif(btrim(series_name),'') is not null and parsed_series is not null

union all
-- ══ 8. WHITESPACE ANOMALY AFTER NORMALIZATION (reported, NOT fixed) ════════════════════════════
select '8. double space after strip', owner_id::text, tbl, id, series_name,
       raw_original, clean_title, null, null,
       'zero-width removal left a double space; spec does not ask for collapsing — decide first'
from parse
where clean_title ~ '  '

union all
-- ══ 9. series = EMPTY STRING rather than NULL (reported, NOT decided) ══════════════════════════
select '9. series is empty string', owner_id::text, null, null, null,
       count(*) filter (where series_name is not null and btrim(series_name) = '')::text,
       null, null, null,
       'a literal `is null` would SKIP these; they are functionally series-less — confirm the reading'
from bk group by owner_id
having count(*) filter (where series_name is not null and btrim(series_name) = '') > 0

union all
-- ══ 10. NORMALIZATION-ONLY CHANGE (no parenthetical to peel) ═══════════════════════════════════
-- WITHOUT THIS CATEGORY THE PREVIEW HIDES ITS OWN WORK. Category 1 is `depth > 0` — it only lists
-- titles carrying a series parenthetical. Two of the three known Unicode cases
-- (`A ​Court of Silver Flames`, `The ​Crown of Gilded Bones`) are zero-width damage with NO
-- parenthetical, so they changed under normalization and appeared in nothing. Found by inserting
-- the spec's own examples locally and noticing the ZWSP probe (25 chars -> 24) was in no category.
select '10. normalized only', owner_id::text, tbl, id, series_name,
       raw_original, clean_title, length(raw_original)::text, length(clean_title)::text,
       'changed by NFKC / zero-width strip alone; no series parenthetical'
from parse
where depth = 0 and raw_original is distinct from raw

order by 1, 2, 5 nulls last, 6;
