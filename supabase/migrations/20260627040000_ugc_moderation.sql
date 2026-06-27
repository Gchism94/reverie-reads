-- Phase 7 H3: lean UGC report + hide (owner decision 2026-06-25 — no moderation queue). Anyone can
-- report a review or club comment; reported content can be hidden (by its author as a self-takedown,
-- or by the owner via the service role); hidden content is not served to OTHERS, while the author
-- still sees their own. Authorship RLS is otherwise unchanged.

-- Hidden flags.
alter table public.reviews add column hidden boolean not null default false;
alter table public.club_comments add column hidden boolean not null default false;

-- Reports: one per user per item; readable only by the reporter (and the service role).
create table public.content_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles (id) on delete cascade,
  target_type text not null check (target_type in ('review', 'club_comment')),
  target_id uuid not null,
  reason text,
  created_at timestamptz not null default now(),
  unique (reporter_id, target_type, target_id)
);
alter table public.content_reports enable row level security;
create policy "content_reports: insert own" on public.content_reports
  for insert to authenticated with check (reporter_id = (select auth.uid()));
create policy "content_reports: read own" on public.content_reports
  for select to authenticated using (reporter_id = (select auth.uid()));
grant select, insert on public.content_reports to authenticated;
grant all on public.content_reports to service_role;

-- Reviews: hide from others, author keeps visibility.
drop policy "reviews: read all" on public.reviews;
create policy "reviews: read visible" on public.reviews
  for select to authenticated using (not hidden or reviewer_id = (select auth.uid()));

-- Club comments: same hide rule layered onto the spoiler gate (author always sees their own).
drop policy "club_comments: gated read" on public.club_comments;
create policy "club_comments: gated read" on public.club_comments
  for select using (
    public.is_club_member(club_id)
    and (
      user_id = (select auth.uid())
      or (unit <= public.club_progress(club_id) and not hidden)
    )
  );
