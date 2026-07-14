-- Series experience — the series page IS the reading order (docs/task-series-experience.md).
--
-- series          one row per (owner, series name): the series-level facts — status (the
--                 book-editing enum), source provenance, refresh bookkeeping.
-- series_entries  the series-membership relation: every canonical slot in reading order,
--                 INCLUDING books the reader doesn't own — book_id null = a ghost slot carrying
--                 its own title/author. position is numeric so #0.5 prequels and #2.5 novellas
--                 are first-class; label carries the human tag ('novella', 'prequel').
--                 user_edited pins a row against source refreshes: Hardcover data only fills
--                 gaps, never overwrites what the reader arranged. A single order per series by
--                 decision (docs/decisions/0001-series-single-order.md) — an order_variant
--                 dimension would attach HERE if alternate orders ever land.
--
-- reading_orders / reading_order_items stay untouched: the Order TAB dies in this change, but
-- the tables hold user-authored data and cost nothing. A later cleanup can migrate or drop them.

create table public.series (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  -- the SERIES' publication status (book-editing enum); null = not set
  status text check (status in ('standalone', 'ongoing', 'completed', 'on_hiatus', 'cancelled')),
  source text not null default 'manual' check (source in ('manual', 'hardcover')),
  source_ref text,
  refreshed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (owner_id, name)
);
create index series_owner_idx on public.series (owner_id);

alter table public.series enable row level security;
create policy "series: select own" on public.series for select using (owner_id = (select auth.uid()));
create policy "series: insert own" on public.series for insert with check (owner_id = (select auth.uid()));
create policy "series: update own" on public.series for update using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy "series: delete own" on public.series for delete using (owner_id = (select auth.uid()));

create table public.series_entries (
  id uuid primary key default gen_random_uuid(),
  series_id uuid not null references public.series (id) on delete cascade,
  owner_id uuid not null references auth.users (id) on delete cascade,
  position numeric not null default 0,
  label text,
  -- ghost display fields; a linked entry renders from the book record instead
  title text not null default '',
  author text not null default '',
  book_id uuid references public.books (id) on delete set null,
  source text not null default 'manual' check (source in ('manual', 'hardcover')),
  user_edited boolean not null default false,
  created_at timestamptz not null default now()
);
create index series_entries_series_idx on public.series_entries (series_id);
create unique index series_entries_book_uidx on public.series_entries (series_id, book_id) where book_id is not null;

alter table public.series_entries enable row level security;
create policy "series_entries: select own" on public.series_entries for select using (owner_id = (select auth.uid()));
-- Insert/update also require the parent series to be the user's (mirrors reading_order_items).
create policy "series_entries: insert own" on public.series_entries for insert
  with check (
    owner_id = (select auth.uid())
    and exists (select 1 from public.series s where s.id = series_id and s.owner_id = (select auth.uid()))
  );
create policy "series_entries: update own" on public.series_entries for update
  using (owner_id = (select auth.uid()))
  with check (
    owner_id = (select auth.uid())
    and exists (select 1 from public.series s where s.id = series_id and s.owner_id = (select auth.uid()))
  );
create policy "series_entries: delete own" on public.series_entries for delete using (owner_id = (select auth.uid()));

grant select, insert, update, delete on public.series to authenticated;
grant select, insert, update, delete on public.series_entries to authenticated;
grant all on public.series to service_role;
grant all on public.series_entries to service_role;
