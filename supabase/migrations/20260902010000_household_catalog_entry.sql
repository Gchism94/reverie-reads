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

-- Shape alone is not validity: canonical_library_isbn intentionally normalizes both ISBN forms,
-- but household catalog creation must also refuse a correctly sized bad checksum before it becomes
-- a shared identity.
create function public.library_isbn_checksum_is_valid(p_isbn text)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  -- Only the separators accepted by the household catalog form are normalization noise. Removing
  -- arbitrary characters would turn prose such as `ISBN: ...` into a seemingly valid identifier.
  candidate text := upper(regexp_replace(trim(coalesce(p_isbn, '')), '[ -]', '', 'g'));
  checksum int := 0;
  digit int;
  index int;
begin
  -- A checksum-valid EAN-13 is an ISBN only inside the 978/979 Bookland prefixes.
  if candidate ~ '^97[89][0-9]{10}$' then
    for index in 1..13 loop
      digit := substr(candidate, index, 1)::int;
      checksum := checksum + digit * case when index % 2 = 0 then 3 else 1 end;
    end loop;
    return checksum % 10 = 0;
  end if;

  if candidate ~ '^[0-9]{9}[0-9X]$' then
    for index in 1..10 loop
      digit := case
        when index = 10 and substr(candidate, index, 1) = 'X' then 10
        else substr(candidate, index, 1)::int
      end;
      checksum := checksum + digit * (11 - index);
    end loop;
    return checksum % 11 = 0;
  end if;

  return false;
end;
$$;

revoke all on function public.library_isbn_checksum_is_valid(text)
  from public, anon, authenticated, service_role;

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

  -- Match owner unlink's profile-first order. The added_by FK otherwise takes this lock only after
  -- the household lock, which can deadlock with unlink's profile -> household order.
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
  perform 1 from public.works work where work.id = p_work for key share;
  if not found then
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
  p_isbn text default null,
  p_cover_url text default null,
  p_cover_source text default null
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
  supplied_isbn text := trim(coalesce(p_isbn, ''));
  safe_display_cover text := case
    when lower(trim(coalesce(p_cover_source, ''))) = 'google'
      and public.google_books_display_cover_url_is_valid(p_cover_url)
      then trim(p_cover_url)
    else null
  end;
begin
  if caller is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if clean_title is null then
    raise exception 'title is required' using errcode = '22023';
  end if;
  if supplied_isbn <> '' and (
    supplied_isbn !~ '^[0-9Xx -]+$'
    or not public.library_isbn_checksum_is_valid(supplied_isbn)
  ) then
    raise exception 'ISBN must be a valid ISBN-10 or ISBN-13' using errcode = '22023';
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
      metadata_status, creation_source, created_by,
      cover_url, cover_source, cover_source_url, cover_options
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
      caller,
      safe_display_cover,
      case when safe_display_cover is null then null else 'google' end,
      safe_display_cover,
      case when safe_display_cover is null then '[]'::jsonb
        else jsonb_build_array(jsonb_build_object(
          'url', safe_display_cover,
          'source', 'google',
          'sourceUrl', safe_display_cover
        ))
      end
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
        end,
        'coverUrl', safe_display_cover
      )
    );
  end if;

  return target_work;
end;
$$;

revoke all on function public.create_household_catalog_work(text, text, text, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.create_household_catalog_work(text, text, text, text, text)
  to authenticated;

-- The old RPC accepted any member with a personal/household relationship to the work. Remove that
-- client grant and expose one complete, audited shared-details writer through the explicit
-- administrator/household-owner boundary. Covers retain the hosted-object allowlist; series,
-- classification, and flexible publication precision are validated as one operation.
revoke all on function public.update_corpus_work_metadata(
  uuid, text, text, text[], text[], text, jsonb
) from public, anon, authenticated, service_role;

create function public.edit_corpus_work_metadata(
  p_work uuid,
  p_series text,
  p_position numeric,
  p_series_count int,
  p_status text,
  p_genre text,
  p_subgenre text,
  p_genres text[],
  p_subgenres text[],
  p_cover_url text,
  p_cover_options jsonb,
  p_pub_y int,
  p_pub_m int,
  p_pub_d int
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  target_household uuid;
  target_book uuid;
  before_value jsonb;
  after_value jsonb;
  option jsonb;
  option_url text;
  desired_cover text := nullif(trim(p_cover_url), '');
  normalized_series text := nullif(trim(p_series), '');
  normalized_status text := nullif(lower(trim(p_status)), '');
  normalized_genre text := nullif(lower(trim(p_genre)), '');
  normalized_subgenre text := nullif(lower(trim(p_subgenre)), '');
  normalized_genres text[];
  normalized_subgenres text[];
  caller_is_admin boolean := false;
begin
  if caller is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if jsonb_typeof(coalesce(p_cover_options, '[]'::jsonb)) <> 'array' then
    raise exception 'cover options must be a JSON array' using errcode = '22023';
  end if;
  if p_position is not null and (p_position < 0 or p_position > 9999) then
    raise exception 'series position must be between 0 and 9999' using errcode = '22023';
  end if;
  if p_series_count is not null and (p_series_count < 1 or p_series_count > 999) then
    raise exception 'series count must be between 1 and 999' using errcode = '22023';
  end if;
  if normalized_status is not null and normalized_status <> all(array[
    'standalone', 'ongoing', 'completed', 'on_hiatus', 'cancelled',
    'interconnected_standalone', 'interconnected_series'
  ]) then
    raise exception 'series status is not canonical' using errcode = '22023';
  end if;
  if p_pub_y is not null and (p_pub_y < 1 or p_pub_y > 9999) then
    raise exception 'publication year must be between 1 and 9999' using errcode = '22023';
  end if;
  if p_pub_m is not null and (p_pub_m < 1 or p_pub_m > 12) then
    raise exception 'publication month must be between 1 and 12' using errcode = '22023';
  end if;
  if p_pub_d is not null and (p_pub_d < 1 or p_pub_d > 31) then
    raise exception 'publication day must be between 1 and 31' using errcode = '22023';
  end if;

  normalized_genres := array(
    select distinct lower(trim(value))
    from unnest(coalesce(p_genres, '{}')) value
    where trim(value) <> '' and lower(trim(value)) is distinct from normalized_genre
    order by lower(trim(value))
  );
  if normalized_genre is not null then
    normalized_genres := array_prepend(normalized_genre, normalized_genres);
  end if;
  if exists (
    select 1 from unnest(normalized_genres) value
    where value <> all(array[
      'romance', 'fantasy', 'science fiction', 'horror', 'mystery', 'literary', 'cozy',
      'nonfiction', 'young adult'
    ])
  ) then
    raise exception 'genres must use the canonical library vocabulary' using errcode = '22023';
  end if;

  normalized_subgenres := array(
    select distinct lower(trim(value))
    from unnest(coalesce(p_subgenres, '{}')) value
    where trim(value) <> '' and lower(trim(value)) is distinct from normalized_subgenre
    order by lower(trim(value))
  );
  if normalized_subgenre is not null then
    normalized_subgenres := array_prepend(normalized_subgenre, normalized_subgenres);
  end if;

  -- added_by/editor_id and unlink all reference the profile. Taking this first gives every
  -- household mutation the same profile -> membership -> household/work order.
  perform 1 from public.profiles profile where profile.id = caller for key share;
  if not found then
    raise exception 'profile not found' using errcode = 'P0002';
  end if;

  -- The locking lookup both classifies and holds administrator authority through the audit write.
  perform 1 from public.corpus_admins admin where admin.user_id = caller for update;
  caller_is_admin := found;
  if not caller_is_admin then
    -- Probe authority without taking a household lock. A later locking recheck prevents a
    -- concurrent role/removal change from authorizing the edit after this point.
    select member.household_id into target_household
    from public.household_members member
    join public.household_works household_work
      on household_work.household_id = member.household_id
     and household_work.work_id = p_work
     and household_work.removed_at is null
    where member.user_id = caller
      and member.role = 'owner';
    if target_household is null then
      raise exception 'corpus administrator or household owner required' using errcode = '42501';
    end if;

    -- Personal tag/trope triggers take their own book before work and household rows. Prelock every
    -- active personal copy of this work, across all readers, in UUID order before taking
    -- the owner-membership/household-work rows. Restricting this to the caller's copy leaves a
    -- cross-member admin trope promotion able to invert work -> household against this edit.
    perform 1
    from public.books book
    where book.corpus_work_id = p_work
      and book.removed_at is null
    order by book.id
    for update;

    perform 1
    from public.household_members member
    join public.household_works household_work
      on household_work.household_id = member.household_id
     and household_work.work_id = p_work
     and household_work.removed_at is null
    where member.household_id = target_household
      and member.user_id = caller
      and member.role = 'owner'
    for update of member, household_work;
    if not found then
      raise exception 'household corpus authority changed during update' using errcode = '40001';
    end if;
  end if;

  -- A newly proposed cover must still originate from this caller's hosted personal object. Global
  -- administrators may select or retain reviewed corpus options without a personal copy.
  select book.id into target_book
  from public.books book
  where book.owner_id = caller and book.corpus_work_id = p_work and book.removed_at is null
    and public.book_corpus_binding_is_unambiguous(
      book.corpus_work_id,
      book.title,
      coalesce(
        nullif(book.authors_display, ''),
        trim(concat_ws(' ', book.author_first, book.author_last))
      ),
      book.isbn
    )
  order by book.id
  limit 1
  for update;

  select jsonb_build_object(
    'series', work.series,
    'position', work.position,
    'seriesCount', work.series_count,
    'status', work.status,
    'genre', work.genre,
    'subgenre', work.subgenre,
    'genres', work.genres,
    'subgenres', work.subgenres,
    'coverUrl', work.cover_url,
    'coverOptions', work.cover_options,
    'pubY', work.pub_y,
    'pubM', work.pub_m,
    'pubD', work.pub_d
  ) into before_value
  from public.works work
  where work.id = p_work
  for update;
  if before_value is null then
    raise exception 'corpus work not found' using errcode = 'P0002';
  end if;

  if (
    select count(*) <> count(distinct value ->> 'url')
    from jsonb_array_elements(coalesce(p_cover_options, '[]'::jsonb)) value
  ) then
    raise exception 'cover option URLs must be unique' using errcode = '22023';
  end if;

  for option in select value from jsonb_array_elements(coalesce(p_cover_options, '[]'::jsonb))
  loop
    if not public.corpus_cover_option_is_valid(option) then
      raise exception 'cover options must use the reviewed url/source/sourceUrl schema'
        using errcode = '22023';
    end if;
    option_url := trim(option ->> 'url');
    if not exists (
      select 1 from jsonb_array_elements(before_value -> 'coverOptions') current_option
      where current_option = option
    ) and not exists (
      select 1 from public.books book
      where target_book is not null and book.id = target_book
        and book.owner_id = caller and book.corpus_work_id = p_work and book.removed_at is null
        and public.hosted_book_cover_object_name(option_url, caller, book.id) is not null
    ) then
      raise exception 'new corpus covers must come from the hosted cover ingestion pipeline'
        using errcode = '22023';
    end if;
  end loop;

  if desired_cover is not null
    and desired_cover is distinct from (before_value ->> 'coverUrl')
    and not exists (
      select 1 from jsonb_array_elements(coalesce(p_cover_options, '[]'::jsonb)) value
      where value ->> 'url' = desired_cover
    ) then
    raise exception 'the canonical cover must be an accepted cover option' using errcode = '22023';
  end if;

  update public.works work
  set series = normalized_series,
      position = p_position,
      series_count = p_series_count,
      status = normalized_status,
      genre = normalized_genre,
      subgenre = normalized_subgenre,
      genres = normalized_genres,
      subgenres = normalized_subgenres,
      cover_url = desired_cover,
      cover_options = coalesce(p_cover_options, '[]'::jsonb),
      pub_y = p_pub_y,
      pub_m = p_pub_m,
      pub_d = p_pub_d
  where work.id = p_work;

  select jsonb_build_object(
    'series', work.series,
    'position', work.position,
    'seriesCount', work.series_count,
    'status', work.status,
    'genre', work.genre,
    'subgenre', work.subgenre,
    'genres', work.genres,
    'subgenres', work.subgenres,
    'coverUrl', work.cover_url,
    'coverOptions', work.cover_options,
    'pubY', work.pub_y,
    'pubM', work.pub_m,
    'pubD', work.pub_d
  ) into after_value
  from public.works work where work.id = p_work;

  if after_value is distinct from before_value then
    insert into public.work_metadata_edits (
      work_id, editor_id, previous_value, next_value
    ) values (p_work, caller, before_value, after_value);
  end if;

  return p_work;
end;
$$;

revoke all on function public.edit_corpus_work_metadata(
  uuid, text, numeric, int, text, text, text, text[], text[], text, jsonb, int, int, int
) from public, anon, authenticated, service_role;
grant execute on function public.edit_corpus_work_metadata(
  uuid, text, numeric, int, text, text, text, text[], text[], text, jsonb, int, int, int
) to authenticated;

-- A cover ingest writes bytes but never mutates catalog rows. This narrow second phase selects the
-- resulting corpus-owned object (or the explicit Google display-only exception) through the same
-- owner/admin boundary as the complete metadata editor, without resending unrelated fields.
create function public.set_corpus_work_cover(
  p_work uuid,
  p_cover_url text,
  p_cover_source text,
  p_cover_source_url text default null,
  p_cover_color text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  target_household uuid;
  caller_is_admin boolean := false;
  safe_cover text := nullif(trim(p_cover_url), '');
  safe_source text := nullif(lower(trim(p_cover_source)), '');
  safe_source_url text := nullif(trim(p_cover_source_url), '');
  safe_option jsonb;
  before_value jsonb;
  after_value jsonb;
begin
  if caller is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if safe_cover is null or safe_source is null then
    raise exception 'cover URL and source are required' using errcode = '22023';
  end if;
  if safe_source = 'google' then
    if not public.google_books_display_cover_url_is_valid(safe_cover) then
      raise exception 'Google display cover URL is not allowlisted' using errcode = '22023';
    end if;
  elsif safe_source not in ('hardcover', 'openlibrary', 'upload', 'camera', 'url')
    or public.hosted_corpus_cover_object_name(safe_cover, p_work) is null then
    raise exception 'shared covers must use the corpus cover ingestion pipeline'
      using errcode = '22023';
  end if;

  safe_option := jsonb_strip_nulls(jsonb_build_object(
    'url', safe_cover,
    'source', safe_source,
    'sourceUrl', safe_source_url
  ));
  if not public.corpus_cover_option_is_valid(safe_option) then
    raise exception 'cover option is invalid' using errcode = '22023';
  end if;

  perform 1 from public.profiles profile where profile.id = caller for key share;
  if not found then
    raise exception 'profile not found' using errcode = 'P0002';
  end if;

  perform 1 from public.corpus_admins admin where admin.user_id = caller for update;
  caller_is_admin := found;
  if not caller_is_admin then
    select member.household_id into target_household
    from public.household_members member
    join public.household_works household_work
      on household_work.household_id = member.household_id
     and household_work.work_id = p_work
     and household_work.removed_at is null
    where member.user_id = caller
      and member.role = 'owner';
    if target_household is null then
      raise exception 'corpus administrator or household owner required' using errcode = '42501';
    end if;

    perform 1
    from public.books book
    where book.corpus_work_id = p_work
      and book.removed_at is null
    order by book.id
    for update;

    perform 1
    from public.household_members member
    join public.household_works household_work
      on household_work.household_id = member.household_id
     and household_work.work_id = p_work
     and household_work.removed_at is null
    where member.household_id = target_household
      and member.user_id = caller
      and member.role = 'owner'
    for update of member, household_work;
    if not found then
      raise exception 'household corpus authority changed during update' using errcode = '40001';
    end if;
  end if;

  select jsonb_build_object(
    'coverUrl', work.cover_url,
    'coverSource', work.cover_source,
    'coverSourceUrl', work.cover_source_url,
    'coverColor', work.cover_color,
    'coverOptions', work.cover_options
  ) into before_value
  from public.works work
  where work.id = p_work
  for update;
  if before_value is null then
    raise exception 'corpus work not found' using errcode = 'P0002';
  end if;

  update public.works work
  set cover_url = safe_cover,
      cover_source = safe_source,
      cover_source_url = safe_source_url,
      cover_color = nullif(trim(p_cover_color), ''),
      cover_options = (
        select coalesce(jsonb_agg(option_value order by option_order), '[]'::jsonb)
        from (
          select safe_option as option_value, 0 as option_order
          union all
          select existing.value, existing.ordinality::int
          from jsonb_array_elements(coalesce(work.cover_options, '[]'::jsonb))
            with ordinality existing(value, ordinality)
          where existing.value ->> 'url' is distinct from safe_cover
        ) options
      )
  where work.id = p_work;

  select jsonb_build_object(
    'coverUrl', work.cover_url,
    'coverSource', work.cover_source,
    'coverSourceUrl', work.cover_source_url,
    'coverColor', work.cover_color,
    'coverOptions', work.cover_options
  ) into after_value
  from public.works work where work.id = p_work;

  if after_value is distinct from before_value then
    insert into public.work_metadata_edits (
      work_id, editor_id, previous_value, next_value
    ) values (p_work, caller, before_value, after_value);
  end if;

  return p_work;
end;
$$;

revoke all on function public.set_corpus_work_cover(uuid, text, text, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.set_corpus_work_cover(uuid, text, text, text, text)
  to authenticated;

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
  shared_series text;
  shared_position numeric;
  shared_series_count int;
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

  select work.series, work.position, work.series_count
  into shared_series, shared_position, shared_series_count
  from public.works work
  where work.id = target_work
  for share;
  if not found then
    raise exception 'corpus work not found' using errcode = 'P0002';
  end if;

  -- Reuse the established atomic reader series transition. Directly assigning books.series would
  -- leave the former live series_entries row behind and make two structured series claims true.
  perform public.sync_book_series(
    p_book, shared_series, shared_position, shared_series_count
  );

  update public.books book
  set series_count = shared_series_count,
      status = coalesce(work.status, 'standalone'),
      genre = coalesce(work.genre, ''),
      subgenre = coalesce(work.subgenre, ''),
      genres = coalesce(work.genres, '{}'),
      subgenres = coalesce(work.subgenres, '{}'),
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
