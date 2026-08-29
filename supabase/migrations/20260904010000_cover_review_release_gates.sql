-- Close the release gates found by the independent review of the personal-cover projection.
-- This is deliberately forward-only: 20260902010000 is already deployed, and an environment that
-- applied either 20260903010000 candidate must still receive the same final RPC and ACL state.

-- The production project retained legacy auto-exposure defaults. RLS remains enabled, but table
-- privileges are a separate boundary: reset every API role before restoring only the intended
-- capabilities from the creating migrations.
revoke all privileges on table public.households, public.household_members,
  public.household_works, public.household_book_shares, public.household_work_enrichment,
  public.work_metadata_edits
  from public, anon, authenticated, service_role;

grant select on table public.households, public.household_members to authenticated;
grant all privileges on table public.households, public.household_members,
  public.household_works, public.household_book_shares, public.household_work_enrichment,
  public.work_metadata_edits
  to service_role;

-- An authenticated metadata form may have opened before an administrator accepted another cover.
-- Preserve every URL that existed when the write reaches the table, while still accepting validated
-- additions and same-URL metadata replacements from the calling RPC. A service-role maintenance
-- write has no auth.uid() and remains the deliberate operator escape hatch for future governance.
create function public.preserve_authenticated_corpus_cover_options()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select auth.uid()) is null
    or old.cover_options is not distinct from new.cover_options
    or not exists (
      select 1
      from jsonb_array_elements(coalesce(old.cover_options, '[]'::jsonb)) previous
      where not exists (
        select 1
        from jsonb_array_elements(coalesce(new.cover_options, '[]'::jsonb)) proposed
        where proposed ->> 'url' = previous ->> 'url'
      )
    ) then
    return new;
  end if;

  select coalesce(jsonb_agg(option_value order by option_order), '[]'::jsonb)
  into new.cover_options
  from (
    -- Keep the authorized writer's submitted order and exact same-URL values, including optional
    -- provenance refreshes and validated additions.
    select
      proposed.value as option_value,
      proposed.ordinality as option_order
    from jsonb_array_elements(coalesce(new.cover_options, '[]'::jsonb))
      with ordinality proposed(value, ordinality)

    union all

    -- Append only concurrently accepted URLs omitted by the submitted snapshot. They cannot be
    -- retracted through an authenticated writer, but they do not erase the requested reordering.
    select
      previous.value,
      jsonb_array_length(coalesce(new.cover_options, '[]'::jsonb)) + previous.ordinality
    from jsonb_array_elements(coalesce(old.cover_options, '[]'::jsonb))
      with ordinality previous(value, ordinality)
    where not exists (
      select 1
      from jsonb_array_elements(coalesce(new.cover_options, '[]'::jsonb)) proposed
      where proposed ->> 'url' = previous.value ->> 'url'
    )
  ) merged;

  return new;
end;
$$;

revoke all on function public.preserve_authenticated_corpus_cover_options()
  from public, anon, authenticated, service_role;

create trigger works_preserve_authenticated_cover_options
  before update of cover_options on public.works
  for each row execute function public.preserve_authenticated_corpus_cover_options();

-- The UUID-only review signature cannot bind the administrator's gesture to the cover and work
-- displayed in the browser. Keep it unavailable as a compatibility tombstone, then expose a new
-- exact-context signature. The locked row must still match both expected values before publication.
revoke all on function public.admin_review_personal_cover_for_corpus(uuid)
  from public, anon, authenticated, service_role;

create function public.admin_review_personal_cover_for_corpus(
  p_book uuid,
  p_expected_work uuid,
  p_expected_cover_url text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  expected_cover text := nullif(trim(p_expected_cover_url), '');
  target_book public.books%rowtype;
  target_work_isbns text[];
  normalized_isbn text;
  author_name text;
  safe_cover text;
  safe_cover_option jsonb;
  before_value jsonb;
  after_value jsonb;
begin
  if caller is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if p_expected_work is null or expected_cover is null then
    raise exception 'personal cover review context is required' using errcode = '22023';
  end if;

  -- Preserve the established global order: profile -> administrator -> book -> work.
  perform 1 from public.profiles profile where profile.id = caller for key share;
  if not found then
    raise exception 'profile not found' using errcode = 'P0002';
  end if;

  perform 1
  from public.corpus_admins admin
  where admin.user_id = caller
  for update;
  if not found then
    raise exception 'corpus administrator required' using errcode = '42501';
  end if;

  select book.* into target_book
  from public.books book
  where book.id = p_book
    and book.owner_id = caller
    and book.removed_at is null
  for update;
  if not found then
    raise exception 'active personal book not found' using errcode = 'P0002';
  end if;
  if target_book.corpus_work_id is distinct from p_expected_work
    or target_book.cover_url is distinct from expected_cover then
    raise exception 'personal cover context changed before review; refresh and try again'
      using errcode = '40001';
  end if;

  author_name := coalesce(
    nullif(target_book.authors_display, ''),
    trim(concat_ws(' ', target_book.author_first, target_book.author_last))
  );
  normalized_isbn := public.canonical_library_isbn(target_book.isbn);

  -- The locked book stabilizes its ISBN while this canonical key serializes every authenticated
  -- identity writer. Existing completion and household-creation paths take ISBN before work too, so
  -- a review may wait without forming an ISBN/work cycle. Invalid/absent ISBNs lock an empty set.
  perform public.lock_library_isbns(array[normalized_isbn]);

  -- Now lock the displayed work. A waiter gets a fresh READ COMMITTED snapshot after an earlier
  -- ISBN claimant commits, so both the established-ISBN guard and binding resolver refuse safely.
  select jsonb_build_object(
    'coverUrl', work.cover_url,
    'coverSource', work.cover_source,
    'coverSourceUrl', work.cover_source_url,
    'coverColor', work.cover_color,
    'coverOptions', work.cover_options
  ), work.isbns into before_value, target_work_isbns
  from public.works work
  where work.id = p_expected_work
  for update;
  if before_value is null then
    raise exception 'corpus work not found' using errcode = 'P0002';
  end if;

  if normalized_isbn ~ '^[0-9]{13}$'
    and not normalized_isbn = any(coalesce(target_work_isbns, '{}')) then
    raise exception 'personal book ISBN is not established on the displayed corpus work; refresh after identity reconciliation'
      using errcode = '40001';
  end if;
  if not public.book_corpus_binding_is_unambiguous(
    target_book.corpus_work_id, target_book.title, author_name, normalized_isbn
  ) then
    raise exception 'personal book corpus binding is ambiguous' using errcode = '22023';
  end if;

  safe_cover_option := jsonb_strip_nulls(jsonb_build_object(
    'url', target_book.cover_url,
    'source', target_book.cover_source,
    'sourceUrl', target_book.cover_source_url
  ));
  if (
    public.hosted_book_cover_object_name(
      target_book.cover_url, target_book.owner_id, target_book.id
    ) is not null
    or (
      target_book.cover_source = 'google'
      and public.google_books_display_cover_url_is_valid(target_book.cover_url)
    )
  ) and public.corpus_cover_option_is_valid(safe_cover_option) then
    safe_cover := target_book.cover_url;
  else
    raise exception 'personal cover must use the reviewed cover-ingestion boundary'
      using errcode = '22023';
  end if;

  update public.works work
  set cover_url = coalesce(work.cover_url, safe_cover),
      cover_source = case
        when work.cover_url is null then target_book.cover_source else work.cover_source
      end,
      cover_source_url = case
        when work.cover_url is null then target_book.cover_source_url else work.cover_source_url
      end,
      cover_color = case
        when work.cover_url is null then target_book.cover_color else work.cover_color
      end,
      cover_options = case
        when exists (
          select 1
          from jsonb_array_elements(work.cover_options) option
          where option ->> 'url' = safe_cover
        ) then work.cover_options
        else work.cover_options || jsonb_build_array(safe_cover_option)
      end
  where work.id = p_expected_work;

  select jsonb_build_object(
    'coverUrl', work.cover_url,
    'coverSource', work.cover_source,
    'coverSourceUrl', work.cover_source_url,
    'coverColor', work.cover_color,
    'coverOptions', work.cover_options
  ) into after_value
  from public.works work
  where work.id = p_expected_work;

  if after_value is distinct from before_value then
    insert into public.work_metadata_edits (
      work_id, editor_id, previous_value, next_value
    ) values (
      p_expected_work, caller, before_value, after_value
    );
  end if;
  return p_expected_work;
end;
$$;

revoke all on function public.admin_review_personal_cover_for_corpus(uuid, uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function public.admin_review_personal_cover_for_corpus(uuid, uuid, text)
  to authenticated;
