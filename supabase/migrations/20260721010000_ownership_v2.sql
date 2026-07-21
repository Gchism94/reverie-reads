-- Ownership model v2 + read-status "unset" (docs/task-ownership-v2.md).
--
-- The two-state model (owned | unowned) forced every book into a possession category, and the
-- library's default scope hid everything not owned — so a book you READ from the library vanished.
-- This widens ownership to four states and lets read status be genuinely unset, so cataloguing a
-- book never forces a read/possession choice and reading history is never gated on possession.
--
-- Nothing is dropped and no data is destroyed; the two enum widenings are additive plus a single
-- rename of the old 'unowned' value to its true meaning, 'wishlist'.

-- ── 1. Ownership: owned|unowned → owned|borrowed|wishlist|unset ──────────────────────────────────
-- Map the existing meaning through first (unowned WAS the wishlist/TBR state), then widen the check.
-- Robust drop: the ownership check is named (books_ownership_check), but drop by discovery so a
-- differently-named constraint can't survive and reject the new values.
do $$
declare c text;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.books'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%ownership%'
  loop
    execute format('alter table public.books drop constraint %I', c);
  end loop;
end $$;

update public.books set ownership = 'wishlist' where ownership = 'unowned';

alter table public.books
  add constraint books_ownership_check check (ownership in ('owned', 'borrowed', 'wishlist', 'unset'));

-- New books no longer default to 'owned' — a bare insert leaves possession UNSET rather than
-- silently claiming ownership (the app sends an explicit value; this is the backstop).
alter table public.books alter column ownership set default 'unset';

-- ── 2. Read status: add a representable "unset" (no selection) ───────────────────────────────────
-- The read_status check was declared inline (auto-named books_read_status_check). Drop by discovery
-- so the old 4-value constraint can't linger and reject 'unset'.
do $$
declare c text;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.books'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%read_status%'
  loop
    execute format('alter table public.books drop constraint %I', c);
  end loop;
end $$;

alter table public.books
  add constraint books_read_status_check check (read_status in ('unset', 'Unread', 'Reading', 'Read', 'DNF'));

-- Existing rows keep their status; newly added books default to unset (no forced choice).
alter table public.books alter column read_status set default 'unset';

-- ── 3. PROPOSED — borrowed backfill from provenance (owner sign-off pending; see report) ──────────
-- `source` is a free-text provenance string; ~77 rows carry source='Borrowed' (all readStatus='Read'
-- in the personal seed) — books read but not owned, exactly the reading-history hole this closes.
-- Reclassifying them from the migrated default 'owned' to 'borrowed' is well-motivated, but `source`
-- is provenance and `ownership` is state: do NOT auto-conflate them. Left COMMENTED until approved.
-- Guarded to only touch rows still sitting at plain 'owned' (never a user's explicit later choice):
--
--   update public.books set ownership = 'borrowed'
--   where source = 'Borrowed' and ownership = 'owned';
