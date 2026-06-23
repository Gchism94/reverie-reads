-- Reverie — shared data backend (run this once in your Supabase project's SQL editor).
-- Everything shared (household/club TBRs, read-alongs + comments) is stored as a single
-- capability-keyed document. A "share code" is a long random string that acts like an
-- "anyone with the link" grant.

create table if not exists shared_docs (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now()
);

alter table shared_docs enable row level security;

-- Capability model: holding the (unguessable) key IS the permission. These policies let the
-- public anon role read/write any row; security comes from the secrecy of the code. That fits a
-- household or a book club. If you need stronger guarantees, add auth + per-row ownership later.
drop policy if exists rv_select on shared_docs;
drop policy if exists rv_insert on shared_docs;
drop policy if exists rv_update on shared_docs;
create policy rv_select on shared_docs for select to anon using (true);
create policy rv_insert on shared_docs for insert to anon with check (true);
create policy rv_update on shared_docs for update to anon using (true) with check (true);

-- That's it. In the app: Clubs ▸ ⚙ Sync setup ▸ paste your Project URL + anon key.
-- The app talks to PostgREST directly (no client library needed).
