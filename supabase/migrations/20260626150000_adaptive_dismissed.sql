-- D0c: "Not now" memory for the evolving-skin reveal. When a reader dismisses a suggestion we
-- store its taste signal here; the monthly evolve-skins cron then won't re-surface the same shift
-- until taste drifts materially past it (mirrors the merge-verdicts "remember the no" pattern; a
-- lock means never ask). Owner-scoped via the existing profiles RLS. Nullable, no backfill needed.
alter table public.profiles
  add column if not exists adaptive_dismissed jsonb;

comment on column public.profiles.adaptive_dismissed is
  'Last evolving-skin suggestion the reader dismissed (weights+dominant+insight+at); the cron skips re-surfacing a shift that is not materially past this.';
