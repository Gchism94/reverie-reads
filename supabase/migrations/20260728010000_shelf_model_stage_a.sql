-- Shelf model, stage A — data model only (docs/task-shelf-model.md).
--
-- The four-state enum (owned | borrowed | wishlist | unset) made possession a single-choice field,
-- so "borrowed" and "wanted" competed for one slot: a book you own in hardback AND want in audio had
-- no representable state, and every shelf that wanted to ask "is this borrowed?" had to ask the enum
-- instead of a flag. This narrows ownership to the one thing it actually asserts — do you own a copy
-- — and moves borrowed and wishlist out to independent flags beside the three format flags.
--
--   ownership ∈ {owned, unowned}, default 'unowned'
--   flags: owned_physical ('paperback'|'hardcover'|'yes'), owned_ebook, owned_audiobook,
--          borrowed, wishlist   — all five independent, ALL COMBINATIONS LEGAL.
--
-- No combination is constrained. "Owned in paperback, borrowed the audio, still want the special
-- edition" is a real reader state and the schema must not have an opinion about it. The only rule
-- lives in application code (bookOwnedFormats): the format flags are SUPPRESSED, never cleared, when
-- a book is neither owned nor borrowed — so drop → re-acquire loses nothing.
--
-- Information-preserving. Every old state maps to exactly one new combination and back:
--   owned    → ownership 'owned'                      borrowed=f wishlist=f
--   borrowed → ownership 'unowned', borrowed=true     (borrowed is NOT owned — that is the point)
--   wishlist → ownership 'unowned', wishlist=true
--   unset    → ownership 'unowned'                    borrowed=f wishlist=f
-- 'unset' and the new 'unowned' default carry the SAME information: no possession claim of any kind.
-- 'unset' was already the column default (ownership_v2), so nothing that reads "the reader has not
-- answered" changes meaning — it is a rename of the no-claim state, not a collapse of two states.

-- ── 1. The two new flags ─────────────────────────────────────────────────────────────────────────
-- NOT NULL DEFAULT false: absence of a flag is a definite "no", never an unknown. Booleans here and
-- not a second enum precisely because they must be able to co-occur with each other and with owned.
alter table public.books
  add column if not exists borrowed boolean not null default false,
  add column if not exists wishlist boolean not null default false;

comment on column public.books.borrowed is
  'Has a borrowed copy in hand. Independent of ownership — borrowed is not owned, and a book can be both (own the paperback, borrowed the audio).';
comment on column public.books.wishlist is
  'Wants a copy. Independent of ownership — a book already owned can still be wanted in another edition.';

-- ── 2. Backfill the flags from the enum, BEFORE the enum narrows ─────────────────────────────────
-- Order is load-bearing: once the check only admits owned|unowned these rows are unreadable as
-- 'borrowed'/'wishlist'. Guarded on the old values, so a re-run matches zero rows and cannot stamp
-- a flag onto a reader's later correction (idempotent).
--
-- Observable: this migration runs against PROD through `pnpm deploy:migrations`, and the seed's
-- counts are a local guess. The notice reports the REAL affected rows from the deploy output, and
-- reports the residue check that proves no row lands outside every category.
do $$
declare
  n_borrowed integer;
  n_wishlist integer;
  n_unset    integer;
  n_owned    integer;
begin
  select count(*) filter (where ownership = 'borrowed'),
         count(*) filter (where ownership = 'wishlist'),
         count(*) filter (where ownership = 'unset'),
         count(*) filter (where ownership = 'owned')
    into n_borrowed, n_wishlist, n_unset, n_owned
  from public.books;

  raise notice 'shelf_model stage A backfill: owned=%, borrowed=% (→ unowned+borrowed), wishlist=% (→ unowned+wishlist), unset=% (→ unowned)',
    n_owned, n_borrowed, n_wishlist, n_unset;

  update public.books set borrowed = true where ownership = 'borrowed';
  update public.books set wishlist = true where ownership = 'wishlist';
end $$;

-- ── 3. Narrow the enum to the single claim it makes ──────────────────────────────────────────────
-- Drop by discovery, not by name: the constraint has been recreated twice (book_ownership,
-- ownership_v2) and a differently-named survivor would silently reject 'unowned'.
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

-- Everything that is not a positive ownership claim becomes 'unowned'. The claim it USED to carry
-- (borrowed / wishlist) is already on a flag by now — step 2 ran first.
update public.books set ownership = 'unowned' where ownership <> 'owned';

alter table public.books
  add constraint books_ownership_check check (ownership in ('owned', 'unowned'));

-- A bare insert claims nothing: not owned, not borrowed, not wanted. Same posture as the 'unset'
-- default it replaces — cataloguing a book still never forces a possession category.
alter table public.books alter column ownership set default 'unowned';

-- ── 4. Prove the round trip in the deploy output ─────────────────────────────────────────────────
-- Every book must sit in a representable state. There is no such thing as "no category" under this
-- model (unowned + no flags IS a category — the no-claim one), so the honest assertion is the one
-- that could actually fail: no row survived with an ownership value outside the new enum.
do $$
declare
  n_bad integer;
  n_owned integer; n_borrowed integer; n_wishlist integer; n_bare integer;
begin
  select count(*) into n_bad from public.books where ownership not in ('owned', 'unowned');
  if n_bad > 0 then
    raise exception 'shelf_model stage A: % row(s) outside the owned|unowned enum after migration', n_bad;
  end if;

  select count(*) filter (where ownership = 'owned'),
         count(*) filter (where borrowed),
         count(*) filter (where wishlist),
         count(*) filter (where ownership = 'unowned' and not borrowed and not wishlist)
    into n_owned, n_borrowed, n_wishlist, n_bare
  from public.books;

  raise notice 'shelf_model stage A result: owned=%, borrowed=%, wishlist=%, no-claim=% (categories overlap by design)',
    n_owned, n_borrowed, n_wishlist, n_bare;
end $$;
