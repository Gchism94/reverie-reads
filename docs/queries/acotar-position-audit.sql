-- PREVIEW ONLY — every statement is a SELECT. Nothing writes.
-- Run against production before authorising any ACOTAR position correction.
--
-- Background: the owner reports that ACOTAR-tagged books currently sit at positions
--   1, 2, 2.5, 4, 4, 5.5, 6  (7 entries)
-- and that the intent by external authority (Wikidata P179/P1545, see
-- docs/audits/series-position-integrity.md for the cross-check) is:
--   1  A Court of Thorns and Roses      (Q101987009, 2015)
--   2  A Court of Mist and Fury         (Q101987239, 2016)
--   3  A Court of Wings and Ruin        (Q101987946, 2017)
--   3.1 A Court of Frost and Starlight  (Q101988228, 2018, novella) -- NOT 3.5 as the owner
--                                                                     guessed; the
--                                                                     P1545 qualifier is
--                                                                     a literal "3.1"
--   4  A Court of Silver Flames         (Q101988654, 2021)            -- NOT 5 as the
--                                                                     owner guessed;
--                                                                     it's the sequence-
--                                                                     restarting 4 in
--                                                                     Wikidata's convention
-- Five works, not seven. The library's 2.5 / 5.5 / 6 / 4-collisions do not match Wikidata;
-- two of the seven rows are duplicates of one of the five canonical works. Phase 2
-- determines which.
--
-- All queries here treat "ACOTAR" as either `series = 'ACOTAR'` OR
-- `series = 'A Court of Thorns and Roses'` — BOTH series strings name the same franchise and
-- the duplicate is what `duplicate-series-audit.sql` was built to find. Each row's series
-- string is shown so a fix can decide which side of the duplicate to keep on the merged
-- series row.

\set ON_ERROR_STOP on

-- ══ 1. EVERY ACOTAR-TAGGED BOOK, POSITION ORDERED ════════════════════════════════════════════
-- The whole shape on screen. Anyone running this fix needs to see every row and which one
-- of the seven positions it sits at, before any single-pair diff below has interpretive value.
-- Two rows for "A Court of Mist and Fury" and two rows for what is reported to be the
-- position-4 collision (Frost & Starlight vs Wings & Ruin) will show up here as duplicates
-- of the same `book.title`.
select '1. all ACOTAR-tagged' as section,
       b.owner_id,
       b.id        as book_id,
       b.title,
       b.position,
       b.read_status,
       b.owned_physical,
       b.owned_ebook,
       b.owned_audiobook,
       b.format,
       b.cover_url,
       b.isbn,
       b.series,
       b.created_at,
       (select count(*) from public.series_entries e
         where e.book_id = b.id and e.removed_at is null) as live_series_entries
from public.books b
where b.owner_id = (select auth.uid())   -- run as the owner; preview scope is the reader only
  and ( lower(b.series) = lower('ACOTAR')
     or lower(b.series) = lower('A Court of Thorns and Roses') )
order by b.position nulls last, b.title, b.created_at;

-- ══ 2. THE TWO MIST-AND-FURY ROWS — FULL COLUMN DIFF ═══════════════════════════════════════
-- Per the owner complaint: "TWO rows for 'A Court of Mist and Fury' (one may be ebook vs
-- print edition, one is coverless)." Same Iron-Flame discipline: full column diff so we
-- can decide if this is a genuine duplicate (read-status + ownership + history on one
-- side, fragmentary on the other — merge candidate) OR two legitimately distinct records
-- (ebook vs print edition is the load-bearing distinction — fits AGENTS.md's
-- "different edition ≠ merge candidate" rule, see AGENTS.md "Possession is five
-- independent flags" section).
--
-- The pair query selects both rows and pivots them side-by-side by column so any
-- difference is one row in the column-diff output. `is distinct from` carries NULL-safe
-- inequality; identical values collapse, differing values surface.
select '2. Mist-and-Fury column diff' as section,
       cmp.column_name,
       cmp.value_a,
       cmp.value_b,
       cmp.value_a is distinct from cmp.value_b as differs
from (
  select
    a.id as a_id,
    b.id as b_id,
    jsonb_object_agg(att.attname, to_jsonb(a.*)) as a_json,
    jsonb_object_agg(att.attname, to_jsonb(b.*)) as b_json
  from public.books a
  cross join public.books b
  cross join lateral jsonb_object_keys(to_jsonb(a.*)) att(attname)
  where lower(a.title) = lower('A Court of Mist and Fury')
    and lower(a.series) in (lower('ACOTAR'), lower('A Court of Thorns and Roses'))
    and lower(b.title) = lower('A Court of Mist and Fury')
    and lower(b.series) in (lower('ACOTAR'), lower('A Court of Thorns and Roses'))
    and a.id <> b.id
    and a.row_created_at <= b.created_at     -- dedup symmetric pairs
    and a.owner_id = (select auth.uid())
    and b.owner_id = a.owner_id
  group by a.id, b.id, a.created_at
) sides
cross join lateral (
  select att.attname::text as column_name,
         (sides.a_json ->> att.attname) as value_a,
         (sides.b_json ->> att.attname) as value_b
  from pg_attribute att
  join pg_class c on c.oid = att.attrelid
  where c.relname = 'books'
    and att.attnum > 0
    and not att.attisdropped
) cmp
where cmp.value_a is distinct from cmp.value_b
order by sides.a_id, cmp.column_name;

-- ══ 3. POSITION-4 COLLISION: FROST & STARLIGHT vs WINGS & RUIN — FULL COLUMN DIFF ═════════
-- The owner complaint says both Frost & Starlight AND Wings & Ruin sit at position 4 today.
-- This is a different shape from the Mist-and-Fury duplicate: it's two DIFFERENT titles
-- assigned the same position. That is a position-assignment defect, regardless of whether
-- the books themselves are distinct or dupes — but here we still want the column diff to
-- catch a possible genuine-duplicate that just happens to alias under position 4 (less
-- likely, but a column diff is cheap).
select '3. position-4 collision — Frost vs Wings' as section,
       b.id as book_id,
       b.title,
       b.position,
       b.read_status,
       b.owned_physical,
       b.owned_ebook,
       b.owned_audiobook,
       b.format,
       b.cover_url,
       b.isbn,
       b.created_at
from public.books b
where b.owner_id = (select auth.uid())
  and ( lower(b.series) = lower('ACOTAR')
     or lower(b.series) = lower('A Court of Thorns and Roses') )
  and b.position = 4
order by b.title, b.created_at;

-- ══ 4. LIBRARY POSITIONS THAT DON'T MATCH WIKIDATA — ROW-BY-ROW ═══════════════════════════
-- Reads the seven live positions and surfaces each row's typo relative to the Wikidata
-- canonical set {1, 2, 3, 3.1, 4}. The intent is to show which rows are off, NOT to be
-- authoritative on the correct number — Wikidata's claim is one source, the final fix
-- needs the owner's confirmation per the audit's directive. This query reads against the
-- library side only.
select '4. position disagreement with Wikidata' as section,
       b.id as book_id,
       b.title,
       b.position as library_position,
       case
         when b.position in (1, 2, 3, 3.1, 4) then 'matches Wikidata canonical'
         else 'does NOT match (1, 2, 3, 3.1, 4)'
       end as wikidata_agreement
from public.books b
where b.owner_id = (select auth.uid())
  and ( lower(b.series) = lower('ACOTAR')
     or lower(b.series) = lower('A Court of Thorns and Roses') )
order by b.position nulls last, b.title;

-- ══ 5. series_entries LINKAGE — THE BACKBONE THE FIX ACTUALLY RE-WRITES ════════════════════
-- The library's series experience was migrated to `public.series_entries`
-- (supabase/migrations/20260716010000_series_experience.sql). The position column on
-- `public.books` is the legacy text/data carrier; the user's read state, the rendered
-- order on /series/A Court of Thorns and Roses, and the "skip" / "currently reading"
-- filters all read off `series_entries`. A position correction has to fix BOTH homes —
-- `books.position` for the legacy carry, and `series_entries.position` for what the UI
-- actually renders.
--
-- This query surfaces every live entry for the ACOTAR series (after duplicate-series-row
-- merge) with both positions side-by-side so the fix can update them as a matched pair.
-- Tombstones (removed_at is not null) are excluded — they're frozen audit trail.
select '5. ACOTAR series_entries live' as section,
       e.id           as entry_id,
       e.series_id,
       s.name         as series_name,
       e.title,
       e.position     as entries_position,
       e.book_id,
       b.position     as books_position,
       b.title        as book_title,
       b.read_status,
       e.user_edited,
       e.source
from public.series_entries e
join public.series s on s.id = e.series_id
left join public.books b on b.id = e.book_id
where s.name in ('ACOTAR', 'A Court of Thorns and Roses')
  and e.removed_at is null
order by e.position nulls last, e.title, e.created_at;

-- ══ 6. DUPLICATE-SERIES PAIRS IN THE LIBRARY (PREVIEW OF THE MERGE-RECORDS BOTTLENECK) ═══
-- Per Phase 0's underlying premise (and the duplicate-series-audit.sql output already on
-- file), "ACOTAR" and "A Court of Thorns and Roses" should resolve to ONE series row or
-- the position correction has to write to TWO `series_entries.position` columns keyed on
-- TWO `series.id`s, both naming the same franchise. Phase 3 of
-- docs/audits/series-position-integrity.md argues the merge has to happen FIRST.
--
-- This block surfaces the live state of both records so the hand-reviewer can confirm
-- which one is `pub_*`-attributed (the canonical) and which is the lazy creation.
select '6. series rows for the franchise' as section,
       s.id   as series_id,
       s.name,
       s.created_at,
       (select count(*) from public.series_entries e
         where e.series_id = s.id and e.removed_at is null) as live_entries_count
from public.series s
where s.name in ('ACOTAR', 'A Court of Thorns and Roses')
order by s.name;

-- ══ 7. SURVIVOR CANDIDATE ARGUMENT, FOR ANY DUPLICATE PAIR ═════════════════════════════════
-- Iron-Flame discipline. For each pair of rows that have the same `lower(title)` AND
-- live in an ACOTAR series, list the read-status / reads_count / cover_url / owned_* /
-- format shape side by side so a hand-reviewer can argue survivor grounds on data
-- completeness, not assumption.
select '7. survivor-candidate argument (Mist-and-Fury)' as section,
       b.id, b.title, b.read_status,
       (select count(*) from public.reads r where r.book_id = b.id) as reads_count,
       case when b.read_status in ('Read','Reading','DNF')        then 'has read marker' else 'no read marker' end as read_side,
       case when b.isbn is not null                                then 'has isbn'        else 'no isbn'        end as isbn_side,
       case when b.cover_url is not null                           then 'has cover'       else 'no cover'       end as cover_side,
       case when coalesce(b.owned_physical,'') <> '' or b.owned_ebook or b.owned_audiobook then 'has formats' else 'no formats' end as formats_side
from public.books b
where b.owner_id = (select auth.uid())
  and lower(b.title) = lower('A Court of Mist and Fury')
  and ( lower(b.series) = lower('ACOTAR')
     or lower(b.series) = lower('A Court of Thorns and Roses') )
order by b.id;

select '7b. survivor-candidate argument (Frost & Starlight)' as section,
       b.id, b.title, b.position, b.read_status,
       (select count(*) from public.reads r where r.book_id = b.id) as reads_count,
       case when b.cover_url is not null then 'has cover' else 'no cover' end as cover_side,
       case when b.isbn is not null      then 'has isbn'  else 'no isbn'  end as isbn_side
from public.books b
where b.owner_id = (select auth.uid())
  and lower(b.title) = lower('A Court of Frost and Starlight')
  and ( lower(b.series) = lower('ACOTAR')
     or lower(b.series) = lower('A Court of Thorns and Roses') )
order by b.id;

select '7c. survivor-candidate argument (Wings & Ruin)' as section,
       b.id, b.title, b.position, b.read_status,
       (select count(*) from public.reads r where r.book_id = b.id) as reads_count,
       case when b.cover_url is not null then 'has cover' else 'no cover' end as cover_side,
       case when b.isbn is not null      then 'has isbn'  else 'no isbn'  end as isbn_side
from public.books b
where b.owner_id = (select auth.uid())
  and lower(b.title) = lower('A Court of Wings and Ruin')
  and ( lower(b.series) = lower('ACOTAR')
     or lower(b.series) = lower('A Court of Thorns and Roses') )
order by b.id;

-- ══ 8. POSITION-VS-OWNER-EDITED ON series_entries ══════════════════════════════════════════
-- `series_entries.user_edited` is the read-side signal the core engine uses to decide if
-- a position move was a deliberate reader action (`packages/core/src/seriesShelf.ts:345`
-- only moves if `!match.userEdited`). Any position correction MUST NOT clobber a row
-- where user_edited was set; the library's source of truth is then that row's frozen
-- position, not the Wikidata canonical. This query surfaces every ACOTAR entry's
-- user_edited state so the fix can refuse to overwrite any YES row.
select '8. user_edited signal on ACOTAR entries' as section,
       e.id as entry_id,
       e.title,
       e.position as entries_position,
       e.user_edited,
       e.source
from public.series_entries e
join public.series s on s.id = e.series_id
where s.name in ('ACOTAR', 'A Court of Thorns and Roses')
  and e.removed_at is null
order by e.position nulls last, e.title;
