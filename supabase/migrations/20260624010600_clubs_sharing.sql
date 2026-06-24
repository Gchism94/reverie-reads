-- Step 7: capability-code joins for read-alongs, locked-comment counts, tracking of joined
-- shared lists, and Realtime on the collaborative tables.

-- A short, shareable join code for each read-along (the club's capability code).
alter table public.clubs
  add column join_code text not null unique
    default lower(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));

-- Join a read-along by its code: find the club (bypassing the members-only read policy),
-- add the caller as a member, and return the club id. SECURITY DEFINER so a non-member can
-- resolve the code before they're allowed to read the club row.
create or replace function public.join_club_by_code(p_code text, p_name text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  cid uuid;
begin
  select id into cid from public.clubs where join_code = lower(trim(p_code));
  if cid is null then
    return null;
  end if;
  insert into public.club_members (club_id, user_id, display_name)
  values (cid, auth.uid(), coalesce(p_name, (select display_name from public.profiles where id = auth.uid())))
  on conflict (club_id, user_id) do nothing;
  return cid;
end;
$$;
grant execute on function public.join_club_by_code(text, text) to authenticated;

-- How many comments are still spoiler-locked for the caller, and the next unit that unlocks one.
-- SECURITY DEFINER so it can see past the gate to *count* — it never returns the hidden bodies.
create or replace function public.club_locked_info(p_club uuid)
returns table (hidden int, next_unit int)
language sql
security definer
stable
set search_path = public
as $$
  select count(*)::int as hidden, min(c.unit) as next_unit
  from public.club_comments c
  where c.club_id = p_club
    and public.is_club_member(p_club)
    and c.user_id <> auth.uid()
    and c.unit > public.club_progress(p_club);
$$;
grant execute on function public.club_locked_info(uuid) to authenticated;

-- Track which capability-keyed shared lists / club TBRs a user has created or joined.
create table public.shared_refs (
  owner_id uuid not null references public.profiles (id) on delete cascade,
  code text not null,
  kind text not null check (kind in ('list', 'clubtbr')),
  name text,
  created_at timestamptz not null default now(),
  primary key (owner_id, code)
);
alter table public.shared_refs enable row level security;
create policy "shared_refs: own" on public.shared_refs
  for all using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
grant select, insert, update, delete on public.shared_refs to authenticated;

-- Realtime: broadcast changes on the collaborative tables (RLS still gates what each
-- subscriber receives). Guarded in case the publication isn't present in some environments.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.club_comments;
    alter publication supabase_realtime add table public.club_members;
    alter publication supabase_realtime add table public.shared_docs;
  end if;
end;
$$;
