-- Explicit Add/import destinations and opt-in household-member library additions.
--
-- A household member may always add a work to the collective household catalog. Adding a
-- PERSONAL row for somebody else is a separate authority: the recipient must opt in, and the
-- delegated row is bibliographic only. It never asserts possession, reading history, rating,
-- favourite state, intensity/darkness, planning, progress, tags, tropes, or moods.

alter table public.household_members
  add column allow_member_library_adds boolean not null default false;

-- The return shape grows by one reviewed permission field. PostgreSQL cannot change a table
-- function's return type in place, so this DROP is required before the immediate recreation. No
-- data is removed; the function is recreated in this same transaction and its ACL is reset below.
drop function public.household_roster();
create function public.household_roster()
returns table (
  household_id uuid,
  household_name text,
  user_id uuid,
  display_name text,
  member_role text,
  allow_member_library_adds boolean
)
language sql
security definer
stable
set search_path = ''
as $$
  select
    household.id,
    household.name,
    member.user_id,
    profile.display_name,
    member.role,
    member.allow_member_library_adds
  from public.household_members mine
  join public.households household on household.id = mine.household_id
  join public.household_members member on member.household_id = household.id
  join public.profiles profile on profile.id = member.user_id
  where mine.user_id = (select auth.uid())
  order by
    (member.user_id = (select auth.uid())) desc,
    profile.display_name nulls last,
    member.user_id;
$$;

revoke all on function public.household_roster()
  from public, anon, authenticated, service_role;
grant execute on function public.household_roster() to authenticated;

-- A member controls only their own delegation permission. Direct table writes remain unavailable.
create function public.set_household_member_library_adds(p_allow boolean)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
begin
  if caller is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  update public.household_members member
  set allow_member_library_adds = coalesce(p_allow, false)
  where member.user_id = caller;

  if not found then
    raise exception 'account is not linked to a household' using errcode = 'P0002';
  end if;
  return coalesce(p_allow, false);
end;
$$;

revoke all on function public.set_household_member_library_adds(boolean)
  from public, anon, authenticated, service_role;
grant execute on function public.set_household_member_library_adds(boolean) to authenticated;

-- One boundary for single Add and large imports. Every supplied id must be an active personal row
-- belonging to the caller; a mixed valid/invalid array fails atomically rather than partly sharing.
-- The personal rows themselves are untouched, including wishlist/unset rows: this is an explicit
-- collective-catalog choice, not an inference from possession.
create function public.add_personal_books_to_household(p_books uuid[])
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  target_household uuid;
  requested_count integer;
  eligible_count integer;
begin
  if caller is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select count(*)::integer into requested_count
  from (select distinct book_id from unnest(coalesce(p_books, '{}')) book_id) requested;
  if requested_count = 0 then return 0; end if;
  if requested_count > 10000 then
    raise exception 'too many books in one household add' using errcode = '22023';
  end if;

  perform 1 from public.profiles profile where profile.id = caller for key share;
  if not found then
    raise exception 'profile not found' using errcode = 'P0002';
  end if;

  select member.household_id into target_household
  from public.household_members member
  where member.user_id = caller
  for key share;
  if target_household is null then
    raise exception 'account is not linked to a household' using errcode = 'P0002';
  end if;

  select count(*)::integer into eligible_count
  from (select distinct book_id from unnest(p_books) book_id) requested
  join public.books book on book.id = requested.book_id
  where book.owner_id = caller and book.removed_at is null;
  if eligible_count <> requested_count then
    raise exception 'every book must be an active personal book owned by the caller'
      using errcode = '42501';
  end if;

  perform 1 from public.households household
  where household.id = target_household
  for update;
  if not exists (
    select 1 from public.household_members member
    where member.household_id = target_household and member.user_id = caller
  ) then
    raise exception 'household membership changed during update' using errcode = '40001';
  end if;

  insert into public.household_works (
    household_id, work_id, added_by, inclusion_source, removed_at, removed_by
  )
  select distinct
    target_household,
    book.corpus_work_id,
    caller,
    'manual',
    null::timestamptz,
    null::uuid
  from unnest(p_books) requested(book_id)
  join public.books book on book.id = requested.book_id
  where book.owner_id = caller and book.removed_at is null
  on conflict (household_id, work_id) do update
  set removed_at = null,
      removed_by = null,
      added_by = coalesce(public.household_works.added_by, excluded.added_by),
      inclusion_source = case
        when public.household_works.removed_at is null
          then public.household_works.inclusion_source
        else 'manual'
      end;

  return requested_count;
end;
$$;

revoke all on function public.add_personal_books_to_household(uuid[])
  from public, anon, authenticated, service_role;
grant execute on function public.add_personal_books_to_household(uuid[]) to authenticated;

-- Add one neutral personal row for an opted-in peer. The work must already be active in the shared
-- household catalog, so the destination is explicit and the caller cannot use a guessed work UUID
-- as a cross-account write primitive. The exclusive per-owner lock serializes duplicate requests.
create function public.add_corpus_work_to_member_library(p_work uuid, p_member uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  target_household uuid;
  created_book uuid;
begin
  if caller is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if p_member is null or p_member = caller then
    raise exception 'choose another household member' using errcode = '22023';
  end if;

  perform 1 from public.profiles profile where profile.id = caller for key share;
  if not found then
    raise exception 'profile not found' using errcode = 'P0002';
  end if;
  perform 1 from public.profiles profile where profile.id = p_member for key share;
  if not found then
    raise exception 'recipient profile not found' using errcode = 'P0002';
  end if;

  select mine.household_id into target_household
  from public.household_members mine
  join public.household_members recipient
    on recipient.household_id = mine.household_id
   and recipient.user_id = p_member
  where mine.user_id = caller
    and recipient.allow_member_library_adds
  for update of recipient;
  if target_household is null then
    raise exception 'recipient has not allowed household members to add to their library'
      using errcode = '42501';
  end if;

  perform 1 from public.households household
  where household.id = target_household
  for update;
  if not exists (
    select 1
    from public.household_members mine
    join public.household_members recipient
      on recipient.household_id = mine.household_id
     and recipient.user_id = p_member
    join public.household_works household_work
      on household_work.household_id = mine.household_id
     and household_work.work_id = p_work
     and household_work.removed_at is null
    where mine.user_id = caller
      and recipient.allow_member_library_adds
      and mine.household_id = target_household
  ) then
    raise exception 'permission, membership, or household work changed during update'
      using errcode = '40001';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('reverie:book-owner:' || p_member::text, 0)
  );
  select book.id into created_book
  from public.books book
  where book.owner_id = p_member
    and book.corpus_work_id = p_work
    and book.removed_at is null
  order by book.added_at, book.id
  limit 1;
  if created_book is not null then return created_book; end if;

  insert into public.books (
    owner_id, corpus_work_id, title, author_last, authors_display,
    series, position, series_count, series_user_chosen, status, pages,
    pub_y, pub_m, pub_d,
    cover_url, cover_source, cover_source_url, cover_color, cover_user_chosen,
    genre, subgenre, subgenres, genres, isbn,
    ownership, borrowed, wishlist, read_status
  )
  select
    p_member, work.id, work.title, nullif(work.author_text, ''), nullif(work.author_text, ''),
    work.series, work.position, work.series_count, false, work.status, work.pages,
    work.pub_y, work.pub_m, work.pub_d,
    work.cover_url, work.cover_source, work.cover_source_url, work.cover_color, false,
    coalesce(work.genre, ''), work.subgenre, work.subgenres, work.genres, work.isbns[1],
    'unowned', false, false, 'unset'
  from public.works work
  where work.id = p_work
  returning id into created_book;

  if created_book is null then
    raise exception 'corpus work not found' using errcode = 'P0002';
  end if;
  return created_book;
end;
$$;

revoke all on function public.add_corpus_work_to_member_library(uuid, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.add_corpus_work_to_member_library(uuid, uuid) to authenticated;
