-- Household-only catalog entry and explicit corpus/personal metadata flow.
--
-- A household work is a collective membership, not evidence that any member owns, borrowed,
-- wishes for, or has read a personal copy. Missing catalog identities can therefore be created
-- directly for a household without manufacturing a `books` row. Canonical edits remain audited
-- and never flow into personal rows until their owner explicitly adopts the shared details.

create function public.can_edit_corpus_work(p_work uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null and (
    exists (
      select 1 from public.corpus_admins admin
      where admin.user_id = (select auth.uid())
    )
    or exists (
      select 1
      from public.household_members member
      join public.household_works household_work
        on household_work.household_id = member.household_id
       and household_work.work_id = p_work
       and household_work.removed_at is null
      where member.user_id = (select auth.uid())
        and member.role = 'owner'
    )
  );
$$;

revoke all on function public.can_edit_corpus_work(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.can_edit_corpus_work(uuid) to authenticated;

-- Any active member may add an existing catalog work. This changes only collective membership;
-- it never creates or updates a personal book.
create function public.add_corpus_work_to_household(p_work uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  target_household uuid;
begin
  if caller is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select member.household_id into target_household
  from public.household_members member
  where member.user_id = caller;
  if target_household is null then
    raise exception 'account is not linked to a household' using errcode = 'P0002';
  end if;
  if not exists (select 1 from public.works work where work.id = p_work) then
    raise exception 'corpus work not found' using errcode = 'P0002';
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
  ) values (
    target_household, p_work, caller, 'manual', null, null
  )
  on conflict (household_id, work_id) do update
  set removed_at = null,
      removed_by = null,
      added_by = coalesce(public.household_works.added_by, excluded.added_by),
      inclusion_source = case
        when public.household_works.removed_at is null
          then public.household_works.inclusion_source
        else 'manual'
      end;

  return p_work;
end;
$$;

revoke all on function public.add_corpus_work_to_household(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.add_corpus_work_to_household(uuid) to authenticated;

-- Any active member may establish a missing, attributed provisional catalog identity, matching the
-- authority already available through a personal Add. Editing an existing canonical work remains
-- owner/admin-only below. ISBN stays first priority, followed by one exact normalized
-- title/full-author fallback; ambiguity is always refused.
create function public.create_household_catalog_work(
  p_title text,
  p_author text,
  p_isbn text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  target_household uuid;
  target_key text;
  target_work uuid;
  clean_title text := nullif(trim(p_title), '');
  clean_author text := coalesce(nullif(trim(p_author), ''), '');
  clean_isbn text := public.canonical_library_isbn(p_isbn);
  isbn_matches int := 0;
  fallback_matches int := 0;
  created_work boolean := false;
begin
  if caller is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if clean_title is null then
    raise exception 'title is required' using errcode = '22023';
  end if;
  if nullif(regexp_replace(coalesce(p_isbn, ''), '[^0-9Xx]', '', 'g'), '') is not null
    and clean_isbn is null then
    raise exception 'ISBN must be a valid ISBN-10 or ISBN-13' using errcode = '22023';
  end if;

  select member.household_id into target_household
  from public.household_members member
  where member.user_id = caller;
  if target_household is null then
    raise exception 'account is not linked to a household' using errcode = 'P0002';
  end if;
  target_key := public.library_work_key(clean_title, clean_author);
  perform public.lock_library_isbns(array[clean_isbn]);

  if clean_isbn is not null then
    select count(*)::int, (array_agg(work.id order by work.id))[1]
      into isbn_matches, target_work
    from public.works work
    where clean_isbn = any(work.isbns);
  end if;
  if isbn_matches > 1 then
    raise exception 'ISBN maps to multiple corpus works' using errcode = '23505';
  end if;

  if isbn_matches = 0 then
    select count(*)::int, (array_agg(work.id order by work.id))[1]
      into fallback_matches, target_work
    from public.works work
    where public.library_work_key(work.title, work.author_text) = target_key;
    if fallback_matches > 1 then
      raise exception 'title and author map to multiple corpus works' using errcode = '23505';
    end if;
  end if;

  if isbn_matches = 0 and fallback_matches = 0 then
    insert into public.works (
      work_key, title, contributors, author_text, isbns,
      metadata_status, creation_source, created_by
    ) values (
      target_key,
      clean_title,
      case when clean_author = '' then '[]'::jsonb
        else jsonb_build_array(jsonb_build_object(
          'name', clean_author, 'role', 'author', 'position', 0
        ))
      end,
      clean_author,
      case when clean_isbn is null then '{}'::text[] else array[clean_isbn] end,
      'provisional',
      'reader_add',
      caller
    )
    on conflict (work_key) do nothing
    returning id into target_work;

    if target_work is not null then
      created_work := true;
    else
      select work.id into target_work
      from public.works work
      where work.work_key = target_key;
    end if;
  end if;

  if target_work is null then
    raise exception 'could not establish a corpus work' using errcode = '40001';
  end if;

  perform 1 from public.households household
  where household.id = target_household
  for update;
  if not exists (
    select 1 from public.household_members member
    where member.household_id = target_household
      and member.user_id = caller
  ) then
    raise exception 'household membership changed during update' using errcode = '40001';
  end if;

  insert into public.household_works (
    household_id, work_id, added_by, inclusion_source, removed_at, removed_by
  ) values (
    target_household, target_work, caller, 'manual', null, null
  )
  on conflict (household_id, work_id) do update
  set removed_at = null,
      removed_by = null,
      added_by = coalesce(public.household_works.added_by, excluded.added_by),
      inclusion_source = case
        when public.household_works.removed_at is null
          then public.household_works.inclusion_source
        else 'manual'
      end;

  if created_work then
    insert into public.work_metadata_edits (
      work_id, editor_id, previous_value, next_value
    ) values (
      target_work,
      caller,
      '{}'::jsonb,
      jsonb_build_object(
        'event', 'household catalog creation',
        'title', clean_title,
        'authorText', clean_author,
        'isbns', case when clean_isbn is null then '[]'::jsonb
          else jsonb_build_array(clean_isbn)
        end
      )
    );
  end if;

  return target_work;
end;
$$;

revoke all on function public.create_household_catalog_work(text, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.create_household_catalog_work(text, text, text)
  to authenticated;

-- The old RPC accepted any member with a personal/household relationship to the work. Remove that
-- client grant, retain the implementation as an internal validated writer, and expose the same
-- narrow patch only through the explicit administrator/household-owner authorization boundary.
revoke all on function public.update_corpus_work_metadata(
  uuid, text, text, text[], text[], text, jsonb
) from public, anon, authenticated, service_role;

create function public.edit_corpus_work_metadata(
  p_work uuid,
  p_genre text,
  p_subgenre text,
  p_genres text[],
  p_subgenres text[],
  p_cover_url text,
  p_cover_options jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  target_household uuid;
begin
  if caller is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  -- Hold the exact authority row for the whole delegated edit. The helper above is useful for UI
  -- affordances, but a preflight boolean must never be the write boundary: an administrator could
  -- be revoked or an owner membership could change after that read. Row locks make either change
  -- wait, and the legacy writer below independently rechecks that the work remains active.
  perform 1
  from public.corpus_admins admin
  where admin.user_id = caller
  for update;
  if found then
    return public.update_corpus_work_metadata(
      p_work, p_genre, p_subgenre, p_genres, p_subgenres, p_cover_url, p_cover_options
    );
  end if;

  select member.household_id into target_household
  from public.household_members member
  join public.household_works household_work
    on household_work.household_id = member.household_id
   and household_work.work_id = p_work
   and household_work.removed_at is null
  where member.user_id = caller
    and member.role = 'owner'
  for update of member;
  if target_household is null then
    raise exception 'corpus administrator or household owner required' using errcode = '42501';
  end if;

  return public.update_corpus_work_metadata(
    p_work, p_genre, p_subgenre, p_genres, p_subgenres, p_cover_url, p_cover_options
  );
end;
$$;

revoke all on function public.edit_corpus_work_metadata(
  uuid, text, text, text[], text[], text, jsonb
) from public, anon, authenticated, service_role;
grant execute on function public.edit_corpus_work_metadata(
  uuid, text, text, text[], text[], text, jsonb
) to authenticated;

-- Personal edits are private by default. This trigger previously promoted every reader's genre
-- and cover edits into the shared work; removing it closes that implicit write path. The function
-- remains for historical migrations, but no future personal update invokes it.
drop trigger books_sync_objective_metadata_to_corpus on public.books;

-- A personal owner may explicitly copy shared descriptive fields into their own active row. The
-- bibliographic identity, ISBN/edition, contributors, ownership, reading state, and annotations are
-- deliberately untouched.
create function public.adopt_corpus_work_metadata(p_book uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  target_work uuid;
begin
  if caller is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select book.corpus_work_id into target_work
  from public.books book
  where book.id = p_book and book.owner_id = caller and book.removed_at is null
  for update;
  if target_work is null then
    raise exception 'active personal book not found' using errcode = 'P0002';
  end if;

  update public.books book
  set series = work.series,
      position = work.position,
      series_count = work.series_count,
      status = work.status,
      series_user_chosen = true,
      genre = coalesce(work.genre, ''),
      subgenre = work.subgenre,
      genres = work.genres,
      subgenres = work.subgenres,
      cover_url = work.cover_url,
      cover_thumb_url = null,
      cover_source = work.cover_source,
      cover_source_url = work.cover_source_url,
      cover_color = work.cover_color,
      cover_confidence = null,
      cover_user_chosen = work.cover_url is not null,
      pub_y = work.pub_y,
      pub_m = work.pub_m,
      pub_d = work.pub_d
  from public.works work
  where book.id = p_book
    and book.owner_id = caller
    and book.removed_at is null
    and work.id = target_work;

  if not found then
    raise exception 'corpus work not found' using errcode = 'P0002';
  end if;
  return p_book;
end;
$$;

revoke all on function public.adopt_corpus_work_metadata(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.adopt_corpus_work_metadata(uuid) to authenticated;
