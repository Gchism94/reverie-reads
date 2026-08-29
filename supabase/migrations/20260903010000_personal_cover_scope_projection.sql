-- Project trusted eligible personal covers into the household read model, and expose one explicit
-- administrator review action for publishing the administrator's own cover into the corpus
-- candidate list. Routine personal-cover writes never publish shared metadata. The review action
-- is intentionally one-way for now: accepted corpus options stay additive while a future quorum
-- model is designed.

create function public.admin_review_personal_cover_for_corpus(p_book uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  target_book public.books%rowtype;
  author_name text;
  safe_cover text;
  safe_cover_option jsonb;
  before_value jsonb;
  after_value jsonb;
begin
  if caller is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  -- Match edit_corpus_work_metadata's profile -> administrator -> book -> work order. This both
  -- holds service-managed authority through the audit write and prevents the old book-trigger
  -- inversion (book -> administrator) from deadlocking with an administrator corpus edit.
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
  if nullif(trim(target_book.cover_url), '') is null then
    raise exception 'personal cover required' using errcode = '22023';
  end if;

  author_name := coalesce(
    nullif(target_book.authors_display, ''),
    trim(concat_ws(' ', target_book.author_first, target_book.author_last))
  );
  if not public.book_corpus_binding_is_unambiguous(
    target_book.corpus_work_id, target_book.title, author_name, target_book.isbn
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

  select jsonb_build_object(
    'coverUrl', work.cover_url,
    'coverSource', work.cover_source,
    'coverSourceUrl', work.cover_source_url,
    'coverColor', work.cover_color,
    'coverOptions', work.cover_options
  ) into before_value
  from public.works work
  where work.id = target_book.corpus_work_id
  for update;
  if before_value is null then
    raise exception 'corpus work not found' using errcode = 'P0002';
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
  where work.id = target_book.corpus_work_id;

  select jsonb_build_object(
    'coverUrl', work.cover_url,
    'coverSource', work.cover_source,
    'coverSourceUrl', work.cover_source_url,
    'coverColor', work.cover_color,
    'coverOptions', work.cover_options
  ) into after_value
  from public.works work
  where work.id = target_book.corpus_work_id;

  if after_value is distinct from before_value then
    insert into public.work_metadata_edits (
      work_id, editor_id, previous_value, next_value
    ) values (
      target_book.corpus_work_id, caller, before_value, after_value
    );
  end if;
  return target_book.corpus_work_id;
end;
$$;

revoke all on function public.admin_review_personal_cover_for_corpus(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.admin_review_personal_cover_for_corpus(uuid) to authenticated;

-- Keep the work-level return signature stable. Covers join the already-authorized copy projection:
-- an owned copy is visible automatically, while a borrowed copy contributes a cover only after the
-- exact copy is shared. Canonical corpus cover fields remain separate at the top level so a display
-- fallback cannot accidentally become a corpus edit.
create or replace function public.household_library_works()
returns table (
  work_id uuid,
  title text,
  author text,
  cover_url text,
  cover_color text,
  cover_options jsonb,
  series_name text,
  series_position numeric,
  series_count int,
  series_status text,
  primary_genre text,
  genres text[],
  subgenre text,
  subgenres text[],
  isbns text[],
  pub_y int,
  pub_m int,
  pub_d int,
  owners jsonb,
  household_tags text[],
  household_tropes jsonb,
  added_at timestamptz
)
language sql
security definer
stable
set search_path = ''
as $$
  select
    work.id,
    work.title,
    work.author_text,
    work.cover_url,
    work.cover_color,
    work.cover_options,
    work.series,
    work.position,
    work.series_count,
    work.status,
    work.genre,
    work.genres,
    work.subgenre,
    work.subgenres,
    work.isbns,
    work.pub_y,
    work.pub_m,
    work.pub_d,
    coalesce(copies.owners, '[]'::jsonb),
    coalesce(enrichment.tags, '{}'),
    public.corpus_and_household_tropes(work.id, enrichment.tropes),
    household_work.added_at
  from public.household_members mine
  join public.household_works household_work
    on household_work.household_id = mine.household_id
   and household_work.removed_at is null
  join public.works work on work.id = household_work.work_id
  left join public.household_work_enrichment enrichment
    on enrichment.household_id = household_work.household_id
   and enrichment.work_id = household_work.work_id
  left join lateral (
    select jsonb_agg(
      jsonb_build_object(
        'userId', member.user_id,
        'bookId', book.id,
        'displayName', profile.display_name,
        'ownership', book.ownership,
        'borrowed', book.borrowed,
        'ownedPhysical', book.owned_physical,
        'ownedEbook', book.owned_ebook,
        'ownedAudiobook', book.owned_audiobook,
        'format', book.format,
        'coverUrl', case
          when book.owner_id = (select auth.uid())
            or public.hosted_book_cover_object_name(
              book.cover_url, book.owner_id, book.id
            ) is not null
            or (
              book.cover_source = 'google'
              and public.google_books_display_cover_url_is_valid(book.cover_url)
            )
          then book.cover_url
        end,
        'coverThumbUrl', case
          when book.owner_id = (select auth.uid())
            or public.hosted_book_cover_object_name(
              book.cover_thumb_url, book.owner_id, book.id
            ) is not null
          then book.cover_thumb_url
        end,
        'coverColor', case
          when book.owner_id = (select auth.uid())
            or public.hosted_book_cover_object_name(
              book.cover_url, book.owner_id, book.id
            ) is not null
            or (
              book.cover_source = 'google'
              and public.google_books_display_cover_url_is_valid(book.cover_url)
            )
          then book.cover_color
        end,
        'shared', exists (
          select 1 from public.household_book_shares share
          where share.book_id = book.id
            and share.household_id = household_work.household_id
            and share.removed_at is null
        )
      ) order by profile.display_name nulls last, member.user_id, book.id
    ) as owners
    from public.household_members member
    join public.books book
      on book.owner_id = member.user_id
     and book.corpus_work_id = household_work.work_id
     and book.removed_at is null
     and (
       book.ownership = 'owned'
       or exists (
         select 1 from public.household_book_shares admitted_share
         where admitted_share.book_id = book.id
           and admitted_share.household_id = household_work.household_id
           and admitted_share.work_id = household_work.work_id
           and admitted_share.removed_at is null
       )
     )
    join public.profiles profile on profile.id = member.user_id
    where member.household_id = household_work.household_id
  ) copies on true
  where mine.user_id = (select auth.uid())
  order by work.title, work.id;
$$;

revoke all on function public.household_library_works()
  from public, anon, authenticated, service_role;
grant execute on function public.household_library_works() to authenticated;
