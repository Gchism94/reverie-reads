-- PREVIEW ONLY — every statement is a SELECT. Nothing writes.
-- Run against production before authorising fix/iron-flame-duplicate.
--
-- Background: two books rows for the same physical book "Iron Flame" at series/position
-- 2 of "The Empyrean":
--
--   38066e50-5404-49e0-8d96-71a3ce409ac7   read_status = Unread   owner_id = 37e9e3a5…
--   1555cc10-3496-435b-a8ea-9b1f36ab62f9   read_status = Read     owner_id = d4bf8f6b…
--
-- Distinct auth.users rows pointed at the same human (separate accounts / separate import paths
-- that converged into a single physical title). NEITHER row has a paired `public.reads` row — all
-- three reader-facing write paths can set `books.read_status='Read'` without writing into
-- `public.reads`: the in-app status chip (BookDetailRoute.tsx:284-289), the "Log a read" dialog
-- (dialogs.tsx:91-92 — this one DOES also insert a reads row), and the CSV importer
-- (core/csv.ts:151-152). A Read-marked book with zero `public.reads` entries is structurally
-- normal, not an anomaly. The durable reader-intent signal is `books.read_status` itself.
--
-- Plus the linkage bug: the single series_entries row for Iron Flame points at 38066e50
-- (the Unread copy), not 1555cc10 (the Read copy) — so /series/The Empyrean currently
-- renders Iron Flame as Unread even though the reader finished it.

-- ══ 1. BOTH BOOKS ROWS, FULL ═══════════════════════════════════════════════════════════════
-- `*` is intentional — additive migrations have evolved the schema since core schema.
-- We need to know which non-null columns differ between the two rows so the merge can
-- union rather than overwrite. Equality here is the answer to Q1 ("is this a genuine
-- duplicate?"): if add date, source, owned_* flags, cover, isbn, etc. all read the same,
-- the rows are the same physical book by two import paths.
select '1. both rows' as section, b.*
from public.books b
where b.id in (
  '38066e50-5404-49e0-8d96-71a3ce409ac7'::uuid,
  '1555cc10-3496-435b-a8ea-9b1f36ab62f9'::uuid
)
order by b.id;

-- ══ 2. COLUMN-LEVEL DIFF ════════════════════════════════════════════════════════════════════
-- Turns the answer to "which columns differ?" into one row per differing column, with
-- each side's value side-by-side. Anything NOT listed is identical across both rows.
-- This is what tells us the merge can union safely without data loss.
select '2. column diff' as section,
       cmp.column_name,
       cmp.value_a,
       cmp.value_b,
       cmp.value_a is distinct from cmp.value_b as differs
from (
  select
    a.id as a_id,
    jsonb_object_agg(att.attname, to_jsonb(a.*)) as a_json,
    jsonb_object_agg(att.attname, to_jsonb(b.*)) as b_json
  from public.books a
  cross join public.books b
  cross join lateral jsonb_object_keys(to_jsonb(a.*)) att(attname)
  where a.id = '38066e50-5404-49e0-8d96-71a3ce409ac7'::uuid
    and b.id = '1555cc10-3496-435b-a8ea-9b1f36ab62f9'::uuid
  group by a.id
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
order by cmp.column_name;

-- ══ 3. CURRENT series_entries LINKAGE ════════════════════════════════════════════════════════
-- Confirms which row the live linked entry points at today, and surfaces any related
-- ghost/removed/duplicate entries that the merge repair must NOT touch. The full row
-- (incl. user_edited, position, removed_at) is shown so we can read what the repair
-- needs to set after re-parenting.
select '3. series_entries for Iron Flame' as section,
       e.id           as entry_id,
       e.series_id,
       s.name         as series_name,
       e.title,
       e.position,
       e.book_id,                         -- current linkage target
       e.user_edited,
       e.removed_at,
       e.source,
       e.created_at
from public.series_entries e
left join public.series s on s.id = e.series_id
where e.owner_id = (select owner_id from public.books
                    where id = '1555cc10-3496-435b-a8ea-9b1f36ab62f9'::uuid)
  and lower(e.title) = lower('Iron Flame');

-- ══ 4. ALL series_entries FOR THIS SERIES (to spot any other ghost clashes) ══════════════════
-- A merge repair must check uniqueness across the WHOLE series, not just one row, because
-- flipping book_id from 38066e50 → 1555cc10 only stays legal if (series_id, 1555cc10)
-- is not already linked. Edge case: a reader added Iron Flame by a third path.
select '4. all Empyrean entries' as section, e.id, e.title, e.position,
       e.book_id, e.user_edited, e.removed_at
from public.series_entries e
join public.series s on s.id = e.series_id
where s.name = 'The Empyrean'
order by e.position nulls last, e.created_at;

-- ══ 5. READ LOGS ON BOTH ROWS ══════════════════════════════════════════════════════════════
-- merge_books step 1 carries the loser's reads onto the primary. Today 38066e50 has none,
-- so this is mainly verification — but printing both sides confirms the assumption that the
-- reader history lives ONLY on 1555cc10 and is therefore safe under any merge direction.
select '5. reads on both rows' as section, r.id, r.book_id,
       r.read_on, r.format, r.rating, r.notes
from public.reads r
where r.book_id in (
  '38066e50-5404-49e0-8d96-71a3ce409ac7'::uuid,
  '1555cc10-3496-435b-a8ea-9b1f36ab62f9'::uuid
)
order by r.book_id, r.read_on;

-- ══ 6. CONTRIBUTORS / TROPES / MOODS / LIST ITEMS ON BOTH ROWS ══════════════════════════════
-- merge_books unions all four onto the surviving row. Showing the pre-merge breakdown so we
-- can verify nothing is being silently dropped: every row on 38066e50 (the loser) should
-- land on 1555cc10 (the primary) after the merge.
select '6a. book_authors on loser' as section, * from public.book_authors
where book_id = '38066e50-5404-49e0-8d96-71a3ce409ac7'::uuid;

select '6b. book_authors on primary' as section, * from public.book_authors
where book_id = '1555cc10-3496-435b-a8ea-9b1f36ab62f9'::uuid;

select '6c. book_tropes on loser' as section, * from public.book_tropes
where book_id = '38066e50-5404-49e0-8d96-71a3ce409ac7'::uuid;

select '6d. book_tropes on primary' as section, * from public.book_tropes
where book_id = '1555cc10-3496-435b-a8ea-9b1f36ab62f9'::uuid;

select '6e. book_moods on loser' as section, * from public.book_moods
where book_id = '38066e50-5404-49e0-8d96-71a3ce409ac7'::uuid;

select '6f. book_moods on primary' as section, * from public.book_moods
where book_id = '1555cc10-3496-435b-a8ea-9b1f36ab62f9'::uuid;

select '6g. list_items on loser' as section, * from public.list_items
where book_id = '38066e50-5404-49e0-8d96-71a3ce409ac7'::uuid;

select '6h. list_items on primary' as section, * from public.list_items
where book_id = '1555cc10-3496-435b-a8ea-9b1f36ab62f9'::uuid;

-- ══ 7. PARTIAL UNIQUE INDEX — DOES THE (series, primary) PAIR ALREADY HAVE AN ENTRY? ═══════
-- merge_books will re-parent the existing entry's book_id from loser → primary. The schema
-- carries a partial unique index over (series_id, book_id) WHERE book_id IS NOT NULL. If
-- another row already has book_id = primary in the SAME series, the re-parent would either
-- clash (raise) or silently conflict, depending on the SQL statement that does the flip.
-- Verify no other entry exists that would block the re-parent.
select '7. any other Empyrean entry pointing at primary' as section, e.id, e.title, e.book_id,
       e.user_edited, e.removed_at
from public.series_entries e
join public.series s on s.id = e.series_id
where s.name = 'The Empyrean'
  and e.book_id = '1555cc10-3496-435b-a8ea-9b1f36ab62f9'::uuid
  and e.removed_at is null;

-- ══ 8. CANONICAL PICK: WHICH ROW HOLDS THE READER HISTORY ══════════════════════════════════
-- Trivially, but explicit: the one with a read log is the one carrying real history. If
-- BOTH have read logs we would have to choose; for Iron Flame only 1555cc10 does, so the
-- choice is forced.
select '8. survivor decision' as section,
       b.id, b.title, b.read_status,
       (select count(*) from public.reads r where r.book_id = b.id) as reads_count,
       case when b.read_status in ('Read', 'DNF')
             or exists (select 1 from public.reads r where r.book_id = b.id)
            then 'survivor candidate'
            else 'loser candidate'
       end as role
from public.books b
where b.id in (
  '38066e50-5404-49e0-8d96-71a3ce409ac7'::uuid,
  '1555cc10-3496-435b-a8ea-9b1f36ab62f9'::uuid
)
order by role;
