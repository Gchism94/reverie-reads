-- D3: reading orders (docs/DATA_MODEL.md) — a user-defined, named, ORDERED sequence that can span
-- multiple series + standalones. Distinct from series (intrinsic to a book) and lists (unordered):
-- a reading order is an OVERLAY, so a book keeps its own series + position and may also appear in
-- one or more orders at different positions. Owner-scoped (a private per-user construct).

create table public.reading_orders (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.reading_orders enable row level security;
create policy "reading_orders: select own" on public.reading_orders for select using (owner_id = (select auth.uid()));
create policy "reading_orders: insert own" on public.reading_orders for insert with check (owner_id = (select auth.uid()));
create policy "reading_orders: update own" on public.reading_orders for update using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy "reading_orders: delete own" on public.reading_orders for delete using (owner_id = (select auth.uid()));

create table public.reading_order_items (
  id uuid primary key default gen_random_uuid(),
  reading_order_id uuid not null references public.reading_orders (id) on delete cascade,
  owner_id uuid not null references auth.users (id) on delete cascade,
  -- fractional sort key so a drag-insert between two items never collides (client renumbers
  -- when a gap gets too tight).
  position double precision not null default 0,
  -- an item is exactly ONE of: a BOOK (core) or a SERIES reference (expands to that series' books
  -- in series order at this slot). Series are identified by name in this app.
  book_id uuid references public.books (id) on delete cascade,
  series text,
  note text,
  constraint reading_order_item_is_book_xor_series
    check (num_nonnulls(book_id, nullif(series, '')) = 1)
);
create index reading_order_items_order_idx on public.reading_order_items (reading_order_id);
alter table public.reading_order_items enable row level security;
create policy "reading_order_items: select own" on public.reading_order_items for select using (owner_id = (select auth.uid()));
-- Insert/update also require the parent order to be the user's, so an item can't be attached to
-- someone else's order even with your own owner_id (mirrors the reads policy).
create policy "reading_order_items: insert own" on public.reading_order_items for insert
  with check (
    owner_id = (select auth.uid())
    and exists (select 1 from public.reading_orders o where o.id = reading_order_id and o.owner_id = (select auth.uid()))
  );
create policy "reading_order_items: update own" on public.reading_order_items for update
  using (owner_id = (select auth.uid()))
  with check (
    owner_id = (select auth.uid())
    and exists (select 1 from public.reading_orders o where o.id = reading_order_id and o.owner_id = (select auth.uid()))
  );
create policy "reading_order_items: delete own" on public.reading_order_items for delete using (owner_id = (select auth.uid()));

grant select, insert, update, delete on public.reading_orders to authenticated;
grant select, insert, update, delete on public.reading_order_items to authenticated;
grant all on public.reading_orders to service_role;
grant all on public.reading_order_items to service_role;
