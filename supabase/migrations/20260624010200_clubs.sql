-- Book clubs: read-alongs with per-member progress and spoiler-gated comments.
-- The spoiler rule from the prototype — a comment about unit U is visible only once the
-- reader's progress >= U — is enforced here in the database (server-enforced option from
-- docs/ARCHITECTURE.md), not just honored client-side.

create table public.clubs (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  author text,
  cover_url text,
  unit_type text not null check (unit_type in ('chapter', 'page', 'percent')),
  unit_count int,
  unit_label text,
  created_by uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.club_members (
  club_id uuid not null references public.clubs (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  display_name text,
  progress int not null default 0,
  joined_at timestamptz not null default now(),
  primary key (club_id, user_id)
);

create table public.club_comments (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  unit int not null default 0,        -- the chapter/page/percent the comment is about
  body text not null,
  created_at timestamptz not null default now()
);

create index club_members_user_idx on public.club_members (user_id);
create index club_comments_club_idx on public.club_comments (club_id);

-- Membership/progress lookups used inside policies. SECURITY DEFINER so they bypass the
-- members table's own RLS — this both avoids policy recursion and keeps them fast.
create or replace function public.is_club_member(c uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.club_members m
    where m.club_id = c and m.user_id = (select auth.uid())
  );
$$;

create or replace function public.club_progress(c uuid)
returns int
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(
    (select progress from public.club_members m where m.club_id = c and m.user_id = (select auth.uid())),
    0
  );
$$;

alter table public.clubs enable row level security;
alter table public.club_members enable row level security;
alter table public.club_comments enable row level security;

-- clubs: members (and the creator) can read; only the creator manages the club row.
create policy "clubs: members read" on public.clubs
  for select using (created_by = (select auth.uid()) or public.is_club_member(id));
create policy "clubs: creator insert" on public.clubs
  for insert with check (created_by = (select auth.uid()));
create policy "clubs: creator update" on public.clubs
  for update using (created_by = (select auth.uid())) with check (created_by = (select auth.uid()));
create policy "clubs: creator delete" on public.clubs
  for delete using (created_by = (select auth.uid()));

-- club_members: members see the roster; a user manages only their own membership row.
create policy "club_members: members read" on public.club_members
  for select using (user_id = (select auth.uid()) or public.is_club_member(club_id));
create policy "club_members: join self" on public.club_members
  for insert with check (user_id = (select auth.uid()));
create policy "club_members: update self" on public.club_members
  for update using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "club_members: leave self" on public.club_members
  for delete using (user_id = (select auth.uid()));

-- club_comments: THE SPOILER GATE. A member reads a comment only when their own progress
-- has reached the comment's unit (authors always see their own).
create policy "club_comments: gated read" on public.club_comments
  for select using (
    public.is_club_member(club_id)
    and (user_id = (select auth.uid()) or unit <= public.club_progress(club_id))
  );
create policy "club_comments: member insert" on public.club_comments
  for insert with check (user_id = (select auth.uid()) and public.is_club_member(club_id));
create policy "club_comments: author update" on public.club_comments
  for update using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "club_comments: author delete" on public.club_comments
  for delete using (user_id = (select auth.uid()));
