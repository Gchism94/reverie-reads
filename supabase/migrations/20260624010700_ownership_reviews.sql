-- Late-added requirements: per-format ownership, individual reviews (no aggregate), and a
-- content-free club-activity signal so behind-progress readers' locked counts update live.

-- ── Per-format ownership ── (owned = any flag truthy; all-false = wishlist).
-- `rating` stays the reader's OWN rating (myRating) — there is deliberately no aggregate column.
alter table public.books
  add column owned_physical text check (owned_physical in ('paperback', 'hardcover', 'yes')),
  add column owned_ebook boolean not null default false,
  add column owned_audiobook boolean not null default false;

-- ── Individual reviews (others' opinions, surfaced on demand, NEVER averaged) ──
-- Keyed by a shared "work key" (normalized title|author, or isbn) so reviews are visible
-- across users for the same book. Each user writes at most one review per work.
create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  work_key text not null,
  reviewer_id uuid not null references public.profiles (id) on delete cascade,
  reviewer_name text,
  rating smallint check (rating between 0 and 5),
  body text not null default '',
  created_at timestamptz not null default now(),
  unique (work_key, reviewer_id)
);
create index reviews_work_idx on public.reviews (work_key);

alter table public.reviews enable row level security;
-- Reviews are public opinions: any signed-in user may read them; you manage only your own.
create policy "reviews: read all" on public.reviews
  for select to authenticated using (true);
create policy "reviews: write own" on public.reviews
  for insert to authenticated with check (reviewer_id = (select auth.uid()));
create policy "reviews: update own" on public.reviews
  for update to authenticated using (reviewer_id = (select auth.uid())) with check (reviewer_id = (select auth.uid()));
create policy "reviews: delete own" on public.reviews
  for delete to authenticated using (reviewer_id = (select auth.uid()));
grant select, insert, update, delete on public.reviews to authenticated;

-- ── Cover/metadata cache for the enrichment Edge Function (service-role only) ──
create table public.cover_cache (
  key text primary key,
  cover text,
  data jsonb,
  updated_at timestamptz not null default now()
);
alter table public.cover_cache enable row level security; -- no policies: service role only

-- ── Content-free club activity signal ──
-- Bumping clubs.last_activity_at on any comment change produces a clubs-row UPDATE that
-- every member can SELECT (and thus receive over Realtime) — carrying NO comment content.
-- Behind-progress readers refetch their locked-count RPC on it; the gated rows themselves
-- never reach them (RLS on club_comments is unchanged).
alter table public.clubs add column last_activity_at timestamptz not null default now();

create or replace function public.bump_club_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- clock_timestamp() (not now()) so it reflects the real moment of the activity.
  update public.clubs set last_activity_at = clock_timestamp()
  where id = coalesce(new.club_id, old.club_id);
  return coalesce(new, old);
end;
$$;

create trigger club_comments_activity
  after insert or update or delete on public.club_comments
  for each row execute function public.bump_club_activity();

-- service_role (admin scripts + Edge Functions) needs grants on these new tables — the
-- earlier blanket `grant all ... to service_role` ran before they existed.
grant all on public.reviews to service_role;
grant all on public.cover_cache to service_role;
grant all on public.shared_refs to service_role;

-- Publish clubs so members receive the activity signal live.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.clubs;
  end if;
end;
$$;
