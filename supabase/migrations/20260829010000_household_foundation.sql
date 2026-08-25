-- Household foundation — linked PERSONAL libraries, not a merged library.
--
-- Owner ruling (2026-08-23): a household is a set of separate accounts with a filterable shared
-- view. V1 is deliberately read-only. Membership changes are service-role/owner-run, every base
-- table keeps its existing owner-only write path, and Match/stats/series continue to read the
-- personal useBooks cache only.
--
-- PRIVACY BOUNDARY: do not add a same-household SELECT policy to books. A raw books row includes
-- ratings, reading state, plan/progress, spice/darkness, favourites, and other personal fields.
-- household_library_books() is the one cross-account read path and names its safe columns
-- explicitly, so a future books column does not become household-visible by accident.

create table public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  -- The owner role lives on household_members. There is deliberately no creator FK here: a
  -- household is collective, and deleting the account that first linked it must not delete the
  -- remaining members' relationship.
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger households_set_updated_at
  before update on public.households
  for each row execute function public.set_updated_at();

create table public.household_members (
  household_id uuid not null references public.households (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  joined_at timestamptz not null default now(),
  primary key (household_id, user_id),
  -- V1 is one household per account. Besides matching the product model, this prevents two
  -- memberships from being used as a bridge between otherwise unrelated libraries.
  unique (user_id)
);

create index household_members_household_idx on public.household_members (household_id);

-- SECURITY DEFINER avoids a recursive household_members policy. It answers only whether the
-- current caller belongs to one household; no roster or private profile data escapes through it.
create function public.is_household_member(p_household uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.household_members hm
    where hm.household_id = p_household
      and hm.user_id = (select auth.uid())
  );
$$;

revoke all on function public.is_household_member(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.is_household_member(uuid) to authenticated;

alter table public.households enable row level security;
alter table public.household_members enable row level security;

create policy "households: members read" on public.households
  for select to authenticated using (public.is_household_member(id));

create policy "household_members: household reads roster" on public.household_members
  for select to authenticated using (public.is_household_member(household_id));

-- No client write policies. Linking accounts changes another person's privacy boundary and stays
-- an explicit owner-run service-role operation in V1.
grant select on public.households, public.household_members to authenticated;
grant all on public.households, public.household_members to service_role;

-- Atomic + idempotent service-role entry point used by scripts/link-household.mjs. It never embeds
-- production UUIDs and it refuses to merge two already-distinct households.
create function public.link_household(
  p_name text,
  p_owner uuid,
  p_members uuid[]
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  all_users uuid[];
  existing_households uuid[];
  existing_users uuid[];
  target uuid;
  missing_profiles int;
begin
  if length(trim(coalesce(p_name, ''))) = 0 then
    raise exception 'household name is required' using errcode = '22023';
  end if;
  if p_owner is null then
    raise exception 'household owner is required' using errcode = '22023';
  end if;

  select array_agg(user_id order by user_id)
  into all_users
  from (
    select distinct unnest(array_prepend(p_owner, coalesce(p_members, '{}'))) as user_id
  ) users
  where user_id is not null;

  if coalesce(cardinality(all_users), 0) < 2 then
    raise exception 'a household requires at least two distinct accounts' using errcode = '22023';
  end if;

  select count(*)
  into missing_profiles
  from unnest(all_users) u(user_id)
  left join public.profiles p on p.id = u.user_id
  where p.id is null;
  if missing_profiles > 0 then
    raise exception '% account(s) have no profile', missing_profiles using errcode = '23503';
  end if;

  -- Profiles exist before membership does, so they are the serialization boundary for both new
  -- and existing members. UUID order makes overlapping link/unlink transactions take locks in the
  -- same order instead of deadlocking or racing an unlinked account into two households.
  perform 1
  from public.profiles p
  where p.id = any(all_users)
  order by p.id
  for update;

  -- Membership rows are locked as well so the complete-roster check and insertion below observe
  -- one stable household state after the profile locks have serialized every affected account.
  perform 1
  from public.household_members hm
  where hm.user_id = any(all_users)
  order by hm.user_id
  for update;

  select array_agg(distinct hm.household_id)
  into existing_households
  from public.household_members hm
  where hm.user_id = any(all_users);

  if coalesce(cardinality(existing_households), 0) > 1 then
    raise exception 'the requested accounts already belong to different households'
      using errcode = '23505';
  end if;

  target := existing_households[1];
  if target is null then
    insert into public.households (name)
    values (trim(p_name))
    returning id into target;
  else
    select array_agg(hm.user_id order by hm.user_id)
    into existing_users
    from public.household_members hm
    where hm.household_id = target;

    -- Extending an existing household is allowed only when the operator supplied its COMPLETE
    -- current roster. Otherwise omitted people would silently gain access to the new accounts.
    if not (existing_users <@ all_users) then
      raise exception 'requested set omits existing household members'
        using errcode = '22023';
    end if;
  end if;

  insert into public.household_members (household_id, user_id, role)
  select target, u.user_id, case when u.user_id = p_owner then 'owner' else 'member' end
  from unnest(all_users) u(user_id)
  where not exists (
    select 1 from public.household_members existing where existing.user_id = u.user_id
  );

  if exists (
    select 1
    from unnest(all_users) requested(user_id)
    left join public.household_members linked
      on linked.household_id = target and linked.user_id = requested.user_id
    where linked.user_id is null
  ) then
    raise exception 'could not link the complete requested household'
      using errcode = '23505';
  end if;

  -- A rerun may name an existing member as the household owner. Make the requested role explicit;
  -- multiple owners are allowed so household access never depends on one account remaining active.
  update public.household_members
  set role = 'owner'
  where household_id = target and user_id = p_owner;

  return target;
end;
$$;

revoke all on function public.link_household(text, uuid, uuid[]) from public, anon, authenticated;
grant execute on function public.link_household(text, uuid, uuid[]) to service_role;

-- Membership-only removal is the inverse privacy operation: the account, profile, and personal
-- books remain untouched while both directions of household access disappear immediately. Empty
-- households created by an explicit final unlink are removed; one-member households remain valid.
create function public.unlink_household_member(p_user uuid, p_household uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  target uuid;
begin
  if p_user is null then
    raise exception 'household member is required' using errcode = '22023';
  end if;
  if p_household is null then
    raise exception 'reviewed household is required' using errcode = '22023';
  end if;

  -- Same always-present lock and ordering convention as link_household.
  perform 1 from public.profiles p where p.id = p_user for update;

  select hm.household_id
  into target
  from public.household_members hm
  where hm.user_id = p_user
  for update;

  if target is null then
    raise exception 'account is not linked to a household' using errcode = 'P0002';
  end if;
  if target <> p_household then
    raise exception 'membership changed since preview' using errcode = '40001';
  end if;

  delete from public.household_members
  where user_id = p_user and household_id = p_household;
  delete from public.households h
  where h.id = target
    and not exists (
      select 1 from public.household_members remaining where remaining.household_id = h.id
    );

  return target;
end;
$$;

revoke all on function public.unlink_household_member(uuid, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.unlink_household_member(uuid, uuid) to service_role;

-- A roster includes display names even though profiles itself stays owner-only. Empty-library
-- members therefore still appear in a household scope picker.
create function public.household_roster()
returns table (
  household_id uuid,
  household_name text,
  user_id uuid,
  display_name text,
  member_role text
)
language sql
security definer
stable
set search_path = ''
as $$
  select h.id, h.name, hm.user_id, p.display_name, hm.role
  from public.household_members mine
  join public.households h on h.id = mine.household_id
  join public.household_members hm on hm.household_id = h.id
  join public.profiles p on p.id = hm.user_id
  where mine.user_id = (select auth.uid())
  order by (hm.user_id = (select auth.uid())) desc, p.display_name nulls last, hm.user_id;
$$;

revoke all on function public.household_roster()
  from public, anon, authenticated, service_role;
grant execute on function public.household_roster() to authenticated;

-- The household library contract: bibliographic facts + possession only. Specifically absent:
-- rating, fave, read_status, reads/notes, intensity, darkness, plan, progress, personal tags,
-- moods, and tropes. The base books RLS remains owner-only even for household members.
create function public.household_library_books()
returns table (
  book_id uuid,
  owner_id uuid,
  owner_name text,
  title text,
  author text,
  cover_url text,
  cover_thumb_url text,
  cover_color text,
  series_name text,
  series_position numeric,
  series_count smallint,
  series_status text,
  primary_genre text,
  genres text[],
  subgenre text,
  subgenres text[],
  isbn text,
  ownership text,
  borrowed boolean,
  wishlist boolean,
  owned_physical text,
  owned_ebook boolean,
  owned_audiobook boolean,
  book_format text,
  pub_y smallint,
  pub_m smallint,
  pub_d smallint,
  added_at timestamptz
)
language sql
security definer
stable
set search_path = ''
as $$
  select
    b.id,
    b.owner_id,
    p.display_name,
    b.title,
    coalesce(nullif(b.authors_display, ''), trim(concat_ws(' ', b.author_first, b.author_last))),
    b.cover_url,
    b.cover_thumb_url,
    b.cover_color,
    b.series,
    b.position,
    b.series_count,
    b.status,
    b.genre,
    b.genres,
    b.subgenre,
    b.subgenres,
    b.isbn,
    b.ownership,
    b.borrowed,
    b.wishlist,
    b.owned_physical,
    b.owned_ebook,
    b.owned_audiobook,
    b.format,
    b.pub_y,
    b.pub_m,
    b.pub_d,
    b.added_at
  from public.household_members mine
  join public.household_members member on member.household_id = mine.household_id
  join public.books b on b.owner_id = member.user_id
  join public.profiles p on p.id = b.owner_id
  where mine.user_id = (select auth.uid())
  order by p.display_name nulls last, b.title, b.id;
$$;

revoke all on function public.household_library_books()
  from public, anon, authenticated, service_role;
grant execute on function public.household_library_books() to authenticated;
