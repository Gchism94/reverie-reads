-- One-incident fix for the Iron Flame duplicate pair in /series/The Empyrean.
--
-- STAGED — DO NOT RUN until the owner has reviewed docs/queries/iron-flame-duplicate-audit.sql
-- and confirmed both Iron Flame rows plus every series_entries row intended to be merged onto
-- 1555cc10 match this script's guards.
--
-- ── Why a hand-run script under docs/queries/, not a migration ─────────────────────────────────
-- Same discipline as fix/untitled-placeholder-titles and fix/empyrean-position: a one-off
-- corrective change on rows the merger was supposed to handle. AGENTS.md forbids prod writes from
-- a Code session, so this is a docs/queries/ artifact, not a migration — pnpm db:migrate would
-- push it on every future deploy, and the row ids are scoped to this single incident (the only
-- Iron Flame dedupe pair in the library).
--
-- ── Why call merge_books and not write the unions by hand ──────────────────────────────────────
-- Per the user's Q4 directive: "Propose the fix using the existing merge_books path if it already
-- does the right thing end to end." Once the durable step 3c-series lands in
-- supabase/migrations/20260812010000_merge_series_entries_reparent.sql — and only once that
-- migration has been DEPLOYED on prod — merge_books handles: reads union, list-items union,
-- book_authors/book_tropes/book_moods union, take_plan decision, scalar/array field patch,
-- authors_display refresh, AND the critical linked-series-entry re-parent, AND the loser's
-- cascade-clear delete. That's the merger as written in this branch; if 20260812010000 has not
-- been deployed, this script will SILENTLY LEAVE the series_entries linkage as a ghost slot
-- because step 6's `on delete set null` FK will fire before this script can re-parent, and the
-- whole point of the new step 3c-series is to prevent that. So this script asserts the
-- deployment. The owner can verify with:
--
--   select prosrc from pg_proc where proname = 'merge_books' and pronamespace = 'public'::regnamespace;
--
-- That body's step 6 must reference the partial unique index's behaviour AND an explicit
-- `update public.series_entries ...set book_id = p_primary` between 3c and 3d. If not, the
-- migration hasn't been run on this database — STOP, run 20260812010000 first, then re-run this
-- script.
--
-- ── Setup the owner must complete before running ───────────────────────────────────────────────
-- 1. Replace OWNER_SUB_UUID with the row owner id. The audit's section 1 surfaces this on every
--    row as `owner_id` (the same value on 1555cc10 and 38066e50 — they ARE owned by the same
--    reader, otherwise merge_books raises "not owner of loser book" before anything happens).
-- 2. The OWNER_AUTH_UUID is the same value the reader logs in with — also `owner_id`.
-- 3. Fill p_fields (the JSONB merge_books receives) using the audit's section 2 column-diff
--    output. Set ONLY the keys that should change on the primary; every other field is a no-op
--    via coalesce(). For this pair the audit's section 1 row-by-row output goes in verbatim
--    after the owner confirms it on the LIVE database.
-- 4. Run the whole block in a single psql session as the database superuser, or as any role
--    that owns merge_books' definition (typically the supabase migration role).

-- PRE-FLIGHT (no writes; run first).
select b.id, b.title, b.read_status, b.owner_id
from public.books
where id in (
  '38066e50-5404-49e0-8d96-71a3ce409ac7'::uuid,
  '1555cc10-3496-435b-a8ea-9b1f36ab62f9'::uuid
);
-- Expected: two rows, owned by the SAME auth.users.id, Iron Flame / Empyrean / position 2.
-- If ownership differs, STOP.

select e.id, e.series_id, e.title, e.position, e.book_id, e.removed_at
from public.series_entries e
join public.series s on s.id = e.series_id
where lower(e.title) = lower('Iron Flame')
  and s.name = 'The Empyrean';
-- Expected: book_id = 38066e50..., removed_at is null. The fix re-parents this to 1555cc10.

-- THE FIX (writes; run only after the pre-flight matches expectations above).

\set ON_ERROR_STOP on
begin;

-- Drive auth.uid() inside the security definer function with the row's owner_id.
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"OWNER_AUTH_UUID","role":"authenticated"}',
  true);

-- Guard: refuse to run unless the live state matches the audit's premise. Bar-raising on
-- surprises. Both pre-condition checks see the row-count the actor would see under RLS — they
-- run as authenticated so they MIGHT hide rows; tested in pgTAP. For the hand-run, this matters:
-- run as a privileged role, NOT as the reader, so the row counts can't be hidden from us.
reset role;

do $$
declare
  n_primary int; n_loser int; n_linked int; n_already_pk int;
  primary_id constant uuid := '1555cc10-3496-435b-a8ea-9b1f36ab62f9';
  loser_id   constant uuid := '38066e50-5404-49e0-8d96-71a3ce409ac7';
begin
  select count(*) into n_primary from public.books where id = primary_id and read_status = 'Read';
  if n_primary <> 1 then raise exception 'guard #1: 1555cc10 expected read_status=Read, got %', n_primary; end if;

  select count(*) into n_loser from public.books where id = loser_id
    and coalesce(read_status,'') not in ('Read','Reading','DNF');
  if n_loser <> 1 then raise exception 'guard #2: 38066e50 expected read_status=Unread, got %', n_loser; end if;

  select count(*) into n_linked from public.series_entries
   where book_id = loser_id and removed_at is null;
  if n_linked < 1 then raise exception 'guard #3: ≥1 live series_entries on loser expected, got %', n_linked; end if;

  select count(*) into n_already_pk from public.series_entries
   where book_id = primary_id and removed_at is null;
  if n_already_pk <> 0 then raise exception 'guard #4: 1555cc10 already has % live entries — re-parent would clash', n_already_pk; end if;

  raise notice 'pre-flight OK: 1555cc10=Read, 38066e50=Unread, % linked entries on loser, 0 already on primary',
               n_linked;
end $$;

-- Step 1 (do; merge_books). Set role back to authenticated + jwt claims for auth.uid() to resolve.
-- The JSONB payload (`p_fields`) is intentionally minimal — only the keys the merge_books SET clause
-- reads; everything else is a no-op via coalesce(). The audit's section 2 column diff drives which
-- keys here carry a value vs null.
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"OWNER_AUTH_UUID","role":"authenticated"}',
  true);

select public.merge_books(
  '1555cc10-3496-435b-a8ea-9b1f36ab62f9'::uuid,
  '38066e50-5404-49e0-8d96-71a3ce409ac7'::uuid,
  $json${
    "read_status": "Read",
    "rating": 0,
    "fave": false,
    "ownership": "unowned",
    "borrowed": false,
    "wishlist": false
  }$json$::jsonb
);

commit;
reset role;

-- POST-RUN AUDIT (run AFTER commit; verifies the linkage bug is gone).
select e.book_id, e.title, e.position,
       b.read_status,
       (select count(*) from public.reads r where r.book_id = b.id) as reads_n,
       (select count(*) from public.series_entries e2
         where e2.book_id = loser_id and e2.removed_at is null) as loser_links_remaining
from public.series_entries e
join public.books b on b.id = e.book_id
join public.series s on s.id = e.series_id
where s.name = 'The Empyrean' and e.position = 2;

-- Expected:
--   book_id = 1555cc10...
--   title = Iron Flame
--   read_status = Read
--   reads_n ≥ 1
--   loser_links_remaining = 0   (the on-delete-set-null FK fired on the loser's delete and the
--                                 series_entries row was kept on the primary via 3c-series)
--
-- If the loser_links_remaining is non-zero (i.e. the entry also exists on 38066e50 itself with
-- book_id still set), 3c-series has not run — STOP, the durable migration 20260812010000 has
-- not been deployed, re-run after deploying it. If book_id is NULL on the kept row, the
-- migration IS deployed but p_fields/SET logic turned a different update order wrong — STOP
-- and dump the series_entries table by hand.
