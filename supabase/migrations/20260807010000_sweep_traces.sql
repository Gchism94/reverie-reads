-- Per-stage timing for the "complete missing covers & info" sweep.
--
-- WHY A TABLE AND NOT LOGS. `logEvent` writes single-line JSON to stdout, which lands in Supabase's
-- Edge logs — queryable, but only for 24 HOURS. A sweep of 500 books takes hours at the observed
-- pace, and the question being asked ("where do 56 seconds per book go?") is answered by comparing
-- runs days apart. A log line that expires before the comparison is worthless for this. The other
-- durable options were considered and rejected: Sentry is an error channel and would need a paid
-- plan's performance product to hold spans; a Storage blob is durable but not queryable without
-- downloading and parsing it. A table costs one migration, is readable with the SQL the owner
-- already runs against production, and joins to `books` for free.
--
-- ONE ROW PER BOOK, not per stage: 500 books x ~15 stages would be 7,500 rows to answer a question
-- that only ever gets asked grouped by stage. `spans` keeps the stages IN ORDER, with repeats kept
-- separate (ol-search is consumed twice per book and the two calls cost very different amounts —
-- collapsing them to a sum is what hides the answer).
create table public.sweep_traces (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  -- One id per sweep invocation, so runs can be compared without guessing at timestamps.
  run_id text not null,
  -- Nullable: a trace is still worth keeping if the book row is later deleted or merged away.
  book_id uuid references public.books (id) on delete set null,
  book_title text not null default '',
  -- Ordered spans: [{"s":"client.enrich","ms":1902.4}, {"s":"enrich.pace.ol-search.wait","ms":0}, ...]
  spans jsonb not null default '[]'::jsonb,
  -- Denormalized for the obvious query ("which books were slow?") without unpacking spans.
  total_ms numeric not null default 0,
  -- What actually happened, so a slow book can be told from a rate-limited or coverless one.
  outcome text not null default '',
  cover_source text not null default '',
  created_at timestamptz not null default now()
);

create index sweep_traces_run_idx on public.sweep_traces (owner_id, run_id, created_at);

alter table public.sweep_traces enable row level security;

-- Owner-scoped, same shape as books. No update policy: a trace is an immutable measurement — the
-- only legitimate operations are recording one and reading your own back.
create policy "sweep_traces: select own" on public.sweep_traces
  for select using (owner_id = (select auth.uid()));
create policy "sweep_traces: insert own" on public.sweep_traces
  for insert with check (owner_id = (select auth.uid()));
create policy "sweep_traces: delete own" on public.sweep_traces
  for delete using (owner_id = (select auth.uid()));

grant select, insert, delete on public.sweep_traces to authenticated;
grant all on public.sweep_traces to service_role;
