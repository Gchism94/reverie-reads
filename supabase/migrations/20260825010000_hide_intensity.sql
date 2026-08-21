-- Hide-spice toggle — the reader-facing half of the "Spice standardization with toggle-off"
-- product-queue item (docs/backlog/BACKLOG.md).
--
-- SCHEMA ONLY, and deliberately shaped after 20260729010000_shelf_breakdown_toggles.sql, which is
-- the established precedent for a per-reader visibility flag on profiles. This deploys BEFORE any
-- app code reads the column and must be safe against the app running at that moment, which has
-- never heard of it. Everything here is additive: one new column, no constraint narrowed, no
-- existing column touched, no reader row rewritten.
--
--   hide_intensity — true:  the intensity ("Spice") field is hidden for this reader — no glyphs on
--                           cards or book pages, no filter group, no stats card.
--                    false: unchanged behaviour.
--
-- ── Why it hides rather than deletes ─────────────────────────────────────────────────────────────
-- The flag is a VIEW preference, not a data operation. books.intensity is left exactly as it is, so
-- turning the toggle back off restores every level the reader ever set — the same
-- "suppress, never clear" rule the format flags follow (CLAUDE.md, possession). A reader who hides
-- spice has said "stop showing me this", not "erase what I recorded".
--
-- ── Why default FALSE ────────────────────────────────────────────────────────────────────────────
-- Unlike shelf_breakdown_*, this default is not a judgement call about the data: spice is currently
-- VISIBLE for everyone, so false is the only value that leaves existing readers where they are.
-- A true default would silently hide a field readers are actively filtering on.
--
-- ── Safety ───────────────────────────────────────────────────────────────────────────────────────
-- NOT NULL DEFAULT false, so no row can carry null and no app code ever has to handle one. On
-- PostgreSQL 11+ a NOT NULL column with a non-volatile default is added via the catalog rather than
-- a table rewrite, so existing rows acquire the default without being touched and the statement
-- does not scale with row count.
--
-- RLS needs NO new work, for the reason 20260729010000 documents and which was re-verified here:
-- the policies on public.profiles are ROW-level, not column-level — "profiles: read own" (SELECT,
-- id = auth.uid()) and "profiles: update own" (UPDATE, using + with check, id = auth.uid()), both
-- from 20260624010000_core_schema.sql — so they govern this column the moment it exists. The grant
-- is likewise table-wide and not column-scoped (`grant select, insert, update on public.profiles to
-- authenticated`, 20260624010400_grants.sql); a column-scoped grant WOULD have needed extending.
-- No new RPC, so no revoke/grant pass is required (CLAUDE.md's `revoke execute` rule does not apply
-- to a plain column).

alter table public.profiles
  add column if not exists hide_intensity boolean not null default false;

comment on column public.profiles.hide_intensity is
  'Reader preference: hide the intensity ("Spice") field entirely — glyphs, filter group and stats card. A VIEW flag only; books.intensity is never modified, so unhiding restores every level the reader set.';

-- ── Observability + a self-check that can actually fail ──────────────────────────────────────────
-- Reports what the target database really had, and aborts if any row somehow carries null — which
-- NOT NULL makes impossible, so a failure here means an assumption broke, not a data problem.
do $$
declare
  n_profiles bigint;
  n_null bigint;
  n_books_with_intensity bigint;
begin
  select count(*) into n_profiles from public.profiles;
  select count(*) into n_null from public.profiles where hide_intensity is null;
  select count(*) into n_books_with_intensity
    from public.books where intensity is not null and intensity > 0;

  raise notice 'hide_intensity: % profile row(s), all defaulted to false; % book(s) carry a non-zero intensity and are unaffected',
    n_profiles, n_books_with_intensity;

  if n_null > 0 then
    raise exception 'hide_intensity: % row(s) carry null despite NOT NULL — aborting', n_null;
  end if;
end $$;
