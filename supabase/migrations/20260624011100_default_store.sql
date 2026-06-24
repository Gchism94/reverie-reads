-- B3 — the reader's chosen default indie bookstore, persisted across sessions/devices.
-- This is a deliberate, saved preference (a public business), distinct from the ephemeral
-- live location used by the finder, which is never stored server-side. Only the store's public
-- identity is kept (id from the finder + name + its own website) — no user coordinates.
alter table public.profiles
  add column default_store_id text,
  add column default_store_name text,
  add column default_store_website text;
