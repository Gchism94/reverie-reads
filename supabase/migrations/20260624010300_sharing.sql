-- Capability-keyed sharing, carried over from the prototype (backend/supabase_schema.sql)
-- and kept alongside real accounts (owner decision #4: frictionless joins).
-- Holding the unguessable share code IS the permission; security comes from its secrecy.
-- This is deliberately separate from the per-user RLS above.

create table public.shared_docs (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.shared_docs enable row level security;

create policy "shared_docs: read by code" on public.shared_docs
  for select to anon, authenticated using (true);
create policy "shared_docs: insert by code" on public.shared_docs
  for insert to anon, authenticated with check (true);
create policy "shared_docs: update by code" on public.shared_docs
  for update to anon, authenticated using (true) with check (true);
