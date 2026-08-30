-- A corpus administrator may explicitly review a safe cover that is already visible through the
-- active household read model. This does not grant general access to another reader's library:
-- the caller, source owner, work membership, and exact owned/shared copy are rechecked while the
-- household serialization lock is held. The expected work and cover bind the browser gesture to
-- the state that was displayed.
create function public.admin_review_household_cover_for_corpus(
  p_household uuid,
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
  if p_household is null or p_expected_work is null or expected_cover is null then
    raise exception 'household cover review context is required' using errcode = '22023';
  end if;

  -- Match the established profile -> administrator -> book -> ISBN -> work order. The household
  -- row follows the work: add_corpus_work_to_household already takes work -> household, so the
  -- reverse order here would introduce a lock cycle.
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
  where book.id = p_book and book.removed_at is null
  for update;
  if not found then
    raise exception 'active household copy not found' using errcode = 'P0002';
  end if;
  if target_book.corpus_work_id is distinct from p_expected_work
    or target_book.cover_url is distinct from expected_cover then
    raise exception 'household cover context changed before review; refresh and try again'
      using errcode = '40001';
  end if;

  author_name := coalesce(
    nullif(target_book.authors_display, ''),
    trim(concat_ws(' ', target_book.author_first, target_book.author_last))
  );
  normalized_isbn := public.canonical_library_isbn(target_book.isbn);
  perform public.lock_library_isbns(array[normalized_isbn]);

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

  -- The household lock serializes unlink, household removal, and copy admission. Recheck every
  -- part of the projection after it is held so a concurrent revocation wins in the safe direction.
  perform 1 from public.households household where household.id = p_household for update;
  if not found then
    raise exception 'household not found' using errcode = 'P0002';
  end if;
  if not exists (
    select 1 from public.household_members member
    where member.household_id = p_household and member.user_id = caller
  ) or not exists (
    select 1 from public.household_members member
    where member.household_id = p_household and member.user_id = target_book.owner_id
  ) or not exists (
    select 1 from public.household_works household_work
    where household_work.household_id = p_household
      and household_work.work_id = p_expected_work
      and household_work.removed_at is null
  ) or not (
    target_book.ownership = 'owned'
    or exists (
      select 1 from public.household_book_shares share
      where share.household_id = p_household
        and share.book_id = target_book.id
        and share.work_id = p_expected_work
        and share.removed_at is null
    )
  ) then
    raise exception 'household cover is no longer available for review; refresh and try again'
      using errcode = '40001';
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
    raise exception 'household cover must use the reviewed cover-ingestion boundary'
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
          select 1 from jsonb_array_elements(work.cover_options) option
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

revoke all on function public.admin_review_household_cover_for_corpus(uuid, uuid, uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function public.admin_review_household_cover_for_corpus(uuid, uuid, uuid, text)
  to authenticated;

-- Keep the deployed RPC name stable for the #369 client. Its original personal-owner scan remains,
-- and it now also reviews safe covers from active peer copies in the caller's household. A peer
-- borrowed copy participates only through its exact live share. Unrelated households and unsafe or
-- ambiguous rows never enter the loop.
create or replace function public.admin_recover_personal_corpus_covers()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  source_book record;
  before_cover text;
  after_cover text;
  before_options int;
  after_options int;
  scanned int := 0;
  recovered_covers int := 0;
  recovered_options int := 0;
begin
  if caller is null or not public.is_corpus_admin() then
    raise exception 'corpus administrator required' using errcode = '42501';
  end if;

  -- Preserve the administrator's own existing behavior, including safe fill-only objective gaps.
  for source_book in
    select book.id, book.corpus_work_id
    from public.books book
    where book.owner_id = caller and book.removed_at is null
      and nullif(trim(book.cover_url), '') is not null
    order by book.corpus_work_id, book.id
  loop
    select work.cover_url, jsonb_array_length(work.cover_options)
      into before_cover, before_options
    from public.works work where work.id = source_book.corpus_work_id;

    perform public.preserve_personal_book_objective_metadata(source_book.id);

    select work.cover_url, jsonb_array_length(work.cover_options)
      into after_cover, after_options
    from public.works work where work.id = source_book.corpus_work_id;
    scanned := scanned + 1;
    if before_cover is null and after_cover is not null then
      recovered_covers := recovered_covers + 1;
    end if;
    if coalesce(after_options, 0) > coalesce(before_options, 0) then
      recovered_options := recovered_options + 1;
    end if;
  end loop;

  for source_book in
    select mine.household_id, book.id, book.corpus_work_id, book.cover_url
    from public.household_members mine
    join public.household_members peer
      on peer.household_id = mine.household_id and peer.user_id <> caller
    join public.books book
      on book.owner_id = peer.user_id and book.removed_at is null
    join public.household_works household_work
      on household_work.household_id = mine.household_id
     and household_work.work_id = book.corpus_work_id
     and household_work.removed_at is null
    join public.works work on work.id = book.corpus_work_id
    where mine.user_id = caller
      and nullif(trim(book.cover_url), '') is not null
      and (
        book.ownership = 'owned'
        or exists (
          select 1 from public.household_book_shares share
          where share.household_id = mine.household_id
            and share.book_id = book.id
            and share.work_id = book.corpus_work_id
            and share.removed_at is null
        )
      )
      and (
        public.hosted_book_cover_object_name(book.cover_url, book.owner_id, book.id) is not null
        or (
          book.cover_source = 'google'
          and public.google_books_display_cover_url_is_valid(book.cover_url)
        )
      )
      and public.corpus_cover_option_is_valid(jsonb_strip_nulls(jsonb_build_object(
        'url', book.cover_url,
        'source', book.cover_source,
        'sourceUrl', book.cover_source_url
      )))
      and public.book_corpus_binding_is_unambiguous(
        book.corpus_work_id,
        book.title,
        coalesce(
          nullif(book.authors_display, ''),
          trim(concat_ws(' ', book.author_first, book.author_last))
        ),
        public.canonical_library_isbn(book.isbn)
      )
      and (
        public.canonical_library_isbn(book.isbn) is null
        or public.canonical_library_isbn(book.isbn) = any(coalesce(work.isbns, '{}'))
      )
    order by book.corpus_work_id, book.id
  loop
    select work.cover_url, jsonb_array_length(work.cover_options)
      into before_cover, before_options
    from public.works work where work.id = source_book.corpus_work_id;

    perform public.admin_review_household_cover_for_corpus(
      source_book.household_id,
      source_book.id,
      source_book.corpus_work_id,
      source_book.cover_url
    );

    select work.cover_url, jsonb_array_length(work.cover_options)
      into after_cover, after_options
    from public.works work where work.id = source_book.corpus_work_id;
    scanned := scanned + 1;
    if before_cover is null and after_cover is not null then
      recovered_covers := recovered_covers + 1;
    end if;
    if coalesce(after_options, 0) > coalesce(before_options, 0) then
      recovered_options := recovered_options + 1;
    end if;
  end loop;

  return jsonb_build_object(
    'scanned', scanned,
    'recoveredCovers', recovered_covers,
    'recoveredOptions', recovered_options
  );
end;
$$;

revoke all on function public.admin_recover_personal_corpus_covers()
  from public, anon, authenticated, service_role;
grant execute on function public.admin_recover_personal_corpus_covers()
  to authenticated;
