-- Shelf breakdown toggles — B1 of the shelf-model stage B sequence (docs/task-shelf-model.md).
--
-- SCHEMA ONLY. This migration deploys to production BEFORE any app code reads these columns, and
-- must be safe against the app that is running at that moment — which has never heard of them.
-- Everything here is additive: two new columns, no constraint narrowed, no existing column touched,
-- no reader row rewritten. An app that does not select them cannot notice them, and an app that
-- does not write them leaves them at their default.
--
--   shelf_breakdown_format — true: the Owned shelf splits into Owned physical / ebook / audiobook.
--                            false: one Owned shelf.
--   shelf_breakdown_dnf    — true: DNF splits out of Read onto its own shelf.
--                            false: DNF books appear within Read.
--
-- ── Why both default FALSE ───────────────────────────────────────────────────────────────────────
--
-- `shelf_breakdown_format` defaults false because of what the format flags actually contain, not
-- merely because false is the conservative choice. In production today 538 books are in hand and
-- only 10 of them carry ANY format flag — 98% have none. A split Owned shelf would therefore show
-- ten books across three shelves and drop 528 out of the view entirely, because a book with no
-- format flag belongs to no format shelf. Splitting is the right OPTION for a reader who marks
-- formats; it is the wrong DEFAULT while almost nobody does.
--
-- `shelf_breakdown_dnf` defaults false because DNF is rare: 5 books in production, all belonging to
-- one reader, against 371 marked Read. Defaulting it on would give most readers a permanently empty
-- shelf. (What "false" should MEAN is a B2 rendering decision, not a schema one — see the note in
-- that PR about DNF sitting under a shelf labelled "Read", which is in tension with isBookRead's
-- deliberate exclusion of DNF.)
--
-- Both defaults are reversible with a one-line `alter column set default` plus an update, but the
-- update would rewrite reader rows, so the value is worth getting right the first time.
--
-- ── Safety ───────────────────────────────────────────────────────────────────────────────────────
--
-- NOT NULL DEFAULT false, so no row can carry null and no app code ever has to handle one — the
-- same property that made `borrowed`/`wishlist` structurally safe in stage A. On PostgreSQL 11+ a
-- NOT NULL column with a non-volatile default is added via the catalog rather than a table rewrite,
-- so existing rows acquire the default without being touched and the statement does not scale with
-- row count.
--
-- RLS needs NO new work. Policies on public.profiles are row-level, not column-level — "profiles:
-- read own" (SELECT, id = auth.uid()) and "profiles: update own" (UPDATE, using + with check,
-- id = auth.uid()) both from 20260624010000_core_schema.sql — so they govern these columns the
-- moment they exist. The grant is likewise table-wide and not column-scoped
-- (`grant select, insert, update on public.profiles to authenticated`, 20260624010400_grants.sql);
-- a column-scoped grant WOULD have needed extending, and this one does not.

alter table public.profiles
  add column if not exists shelf_breakdown_format boolean not null default false,
  add column if not exists shelf_breakdown_dnf boolean not null default false;

comment on column public.profiles.shelf_breakdown_format is
  'Reader preference: split the Owned shelf by format (physical/ebook/audiobook). Default false — most in-hand books carry no format flag, so splitting would hide them.';
comment on column public.profiles.shelf_breakdown_dnf is
  'Reader preference: give DNF its own shelf instead of showing those books within Read. Default false — DNF is rare enough that an always-on shelf would usually be empty.';

-- ── Observability + a self-check that can actually fail ──────────────────────────────────────────
-- Reports what production really had, and aborts the transaction if any row somehow carries null —
-- which NOT NULL makes impossible, so a failure here means an assumption broke, not a data problem.
do $$
declare
  n_rows integer;
  n_null integer;
begin
  select count(*),
         count(*) filter (where shelf_breakdown_format is null or shelf_breakdown_dnf is null)
    into n_rows, n_null
  from public.profiles;

  if n_null > 0 then
    raise exception 'shelf_breakdown toggles: % of % profile row(s) carry null after an ADD COLUMN NOT NULL DEFAULT', n_null, n_rows;
  end if;

  raise notice 'shelf_breakdown toggles: % profile row(s), all defaulted to false, 0 null.', n_rows;
end $$;
