-- Phase 6 G4 (C4b): the monthly cron writes a PENDING adaptive suggestion here when a reader's
-- taste has materially shifted. The client surfaces it as the "your profile is evolving" reveal
-- and resolves it (keep / dismiss / lock), which clears the column. Stored as the new weights +
-- dominant + insight (the client materializes the palette from the live tokens). Owner-scoped RLS.
alter table public.profiles
  add column adaptive_pending jsonb;
