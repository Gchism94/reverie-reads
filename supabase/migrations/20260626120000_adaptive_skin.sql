-- Phase 6 G4: the reader's generated Tier-2 adaptive skin (a palette blended from the Tier-1
-- skins, weighted by reading taste) + a lock flag (frozen skins aren't re-evolved by the cron).
-- Stored per user; covered by the existing owner-scoped profiles RLS. `skin` may now be 'adaptive'.
alter table public.profiles
  add column adaptive_skin jsonb,
  add column adaptive_locked boolean not null default false;
