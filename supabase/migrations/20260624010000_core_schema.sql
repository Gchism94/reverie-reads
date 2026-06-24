-- Reverie core schema: identity + personal library, all under row-level security.
-- Maps the prototype's client state (docs/DATA_MODEL.md §1) to relational tables (§2).
-- Genres/tropes are text[] with GIN indexes (the "simpler" option in the data model) —
-- the prototype already stores them as arrays and the Library filters by containment.

create extension if not exists pgcrypto;

-- Keep updated_at honest on every UPDATE.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- profiles — extends auth.users (the auth provider owns identity)
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles: read own" on public.profiles
  for select using (id = (select auth.uid()));
create policy "profiles: insert self" on public.profiles
  for insert with check (id = (select auth.uid()));
create policy "profiles: update own" on public.profiles
  for update using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- books — the personal library
-- ---------------------------------------------------------------------------
create table public.books (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  title text not null,
  author_first text,
  author_last text,
  series text,
  position numeric,                 -- fractional positions exist in the data (e.g. 3.5)
  series_count smallint,            -- NULL => "length not set" / drives the "None set" filter
  status text check (status in ('Standalone', 'Series', 'Complete')),
  subgenre text,
  genres text[] not null default '{}',
  tropes text[] not null default '{}',
  spice smallint check (spice between 0 and 5),
  cover_url text,
  isbn text,
  fave boolean not null default false,
  format text,
  rating numeric(2, 1) check (rating >= 0 and rating <= 5),
  read_status text not null default 'Unread'
    check (read_status in ('Unread', 'Reading', 'Read', 'DNF')),
  source text,
  pub_y smallint,                   -- flexible publish-date precision: any part may be null
  pub_m smallint check (pub_m between 1 and 12),
  pub_d smallint check (pub_d between 1 and 31),
  plan_date date,                   -- planned "need to read" date
  progress smallint check (progress between 0 and 100),
  boyfriend text,                   -- derived mood/archetype tag
  added_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index books_owner_idx on public.books (owner_id);
create index books_owner_series_idx on public.books (owner_id, series);
create index books_tropes_idx on public.books using gin (tropes);
create index books_genres_idx on public.books using gin (genres);

create trigger books_set_updated_at
  before update on public.books
  for each row execute function public.set_updated_at();

alter table public.books enable row level security;

create policy "books: select own" on public.books
  for select using (owner_id = (select auth.uid()));
create policy "books: insert own" on public.books
  for insert with check (owner_id = (select auth.uid()));
create policy "books: update own" on public.books
  for update using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy "books: delete own" on public.books
  for delete using (owner_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- reads — the reread log (a child of books). owner_id denormalized for simple RLS.
-- ---------------------------------------------------------------------------
create table public.reads (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references public.books (id) on delete cascade,
  owner_id uuid not null references public.profiles (id) on delete cascade,
  read_on date,
  format text,
  rating numeric(2, 1) check (rating >= 0 and rating <= 5),
  notes text,
  created_at timestamptz not null default now()
);

create index reads_book_idx on public.reads (book_id);
create index reads_owner_idx on public.reads (owner_id);

alter table public.reads enable row level security;

create policy "reads: select own" on public.reads
  for select using (owner_id = (select auth.uid()));
create policy "reads: insert own" on public.reads
  for insert with check (
    owner_id = (select auth.uid())
    and exists (select 1 from public.books b where b.id = book_id and b.owner_id = (select auth.uid()))
  );
create policy "reads: update own" on public.reads
  for update using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy "reads: delete own" on public.reads
  for delete using (owner_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- lists — TBRs and collections; list_items joins them to books
-- ---------------------------------------------------------------------------
create table public.lists (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  name text not null,
  kind text not null check (kind in ('tbr', 'collection')),
  is_priority boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index lists_owner_idx on public.lists (owner_id);

create trigger lists_set_updated_at
  before update on public.lists
  for each row execute function public.set_updated_at();

alter table public.lists enable row level security;

create policy "lists: select own" on public.lists
  for select using (owner_id = (select auth.uid()));
create policy "lists: insert own" on public.lists
  for insert with check (owner_id = (select auth.uid()));
create policy "lists: update own" on public.lists
  for update using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy "lists: delete own" on public.lists
  for delete using (owner_id = (select auth.uid()));

create table public.list_items (
  list_id uuid not null references public.lists (id) on delete cascade,
  book_id uuid not null references public.books (id) on delete cascade,
  owner_id uuid not null references public.profiles (id) on delete cascade,
  position numeric,
  added_at timestamptz not null default now(),
  primary key (list_id, book_id)
);

create index list_items_owner_idx on public.list_items (owner_id);
create index list_items_book_idx on public.list_items (book_id);

alter table public.list_items enable row level security;

create policy "list_items: select own" on public.list_items
  for select using (owner_id = (select auth.uid()));
create policy "list_items: insert own" on public.list_items
  for insert with check (
    owner_id = (select auth.uid())
    and exists (select 1 from public.lists l where l.id = list_id and l.owner_id = (select auth.uid()))
    and exists (select 1 from public.books b where b.id = book_id and b.owner_id = (select auth.uid()))
  );
create policy "list_items: update own" on public.list_items
  for update using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy "list_items: delete own" on public.list_items
  for delete using (owner_id = (select auth.uid()));
