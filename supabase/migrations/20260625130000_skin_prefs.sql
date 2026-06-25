-- Phase 6 G2/G3: persist the reader's skin + light/dark mode per account (cross-device).
-- Skin and mode are independent axes. 'system' mode follows the device's prefers-color-scheme;
-- 'reverie' is the default skin. Covered by the existing owner-scoped profiles RLS.
alter table public.profiles
  add column skin text not null default 'reverie',
  add column mode text not null default 'system';
