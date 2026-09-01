-- The administrator corpus sweep used to begin with one unbounded RPC that walked every covered
-- personal book in the administrator's household. Production has 1,345 eligible works: that
-- preflight exceeded statement_timeout before the first series classification ran. Recovery is
-- now a durable, idempotent queue keyed by the source book's objective metadata fingerprint. Each
-- call handles at most 25 source books; the client interleaves these batches with corpus work.

create table public.corpus_cover_recovery_marks (
  book_id uuid primary key references public.books(id) on delete cascade,
  source_fingerprint text not null,
  succeeded boolean not null,
  error_message text,
  retry_after timestamptz,
  attempt_count integer not null default 1 check (attempt_count > 0),
  recovered_by uuid references public.profiles(id) on delete set null,
  recovered_at timestamptz not null default now()
);

alter table public.corpus_cover_recovery_marks enable row level security;

revoke all on table public.corpus_cover_recovery_marks
  from public, anon, authenticated, service_role;
grant select, insert, update, delete on table public.corpus_cover_recovery_marks
  to service_role;

create function public.admin_recover_corpus_cover_batch(p_limit integer default 25)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  bounded_limit integer;
  source_book record;
  before_cover text;
  after_cover text;
  before_options integer;
  after_options integer;
  scanned integer := 0;
  failed integer := 0;
  recovered_covers integer := 0;
  recovered_options integer := 0;
  first_error text;
begin
  if caller is null or not public.is_corpus_admin() then
    raise exception 'corpus administrator required' using errcode = '42501';
  end if;

  if p_limit is null or p_limit < 1 or p_limit > 25 then
    raise exception 'cover recovery batch limit must be between 1 and 25'
      using errcode = '22023';
  end if;
  bounded_limit := p_limit;

  for source_book in
    with eligible_sources as materialized (
      select
        'owner'::text as source_kind,
        null::uuid as household_id,
        book.id as book_id,
        book.corpus_work_id,
        book.cover_url,
        md5(jsonb_build_array(
          book.corpus_work_id, book.title, book.authors_display,
          book.author_first, book.author_last, book.series, book.position,
          book.series_count, book.status, book.pages, book.pub_y, book.pub_m, book.pub_d,
          book.genre, book.subgenre, book.genres, book.subgenres, book.isbn,
          book.cover_url, book.cover_source, book.cover_source_url, book.cover_color
        )::text) as source_fingerprint
      from public.books book
      where book.owner_id = caller
        and book.removed_at is null
        and book.corpus_work_id is not null
        and nullif(trim(book.cover_url), '') is not null

      union all

      select
        'peer'::text as source_kind,
        mine.household_id,
        book.id as book_id,
        book.corpus_work_id,
        book.cover_url,
        md5(jsonb_build_array(
          book.corpus_work_id, book.title, book.authors_display,
          book.author_first, book.author_last, book.series, book.position,
          book.series_count, book.status, book.pages, book.pub_y, book.pub_m, book.pub_d,
          book.genre, book.subgenre, book.genres, book.subgenres, book.isbn,
          book.cover_url, book.cover_source, book.cover_source_url, book.cover_color
        )::text) as source_fingerprint
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
    )
    select source.*
    from eligible_sources source
    left join public.corpus_cover_recovery_marks mark on mark.book_id = source.book_id
    where mark.book_id is null
       or mark.source_fingerprint is distinct from source.source_fingerprint
       or (not mark.succeeded and mark.retry_after <= now())
    order by source.corpus_work_id, source.book_id
    limit bounded_limit
  loop
    begin
      select work.cover_url, jsonb_array_length(work.cover_options)
        into before_cover, before_options
      from public.works work where work.id = source_book.corpus_work_id;

      if source_book.source_kind = 'owner' then
        perform public.preserve_personal_book_objective_metadata(source_book.book_id);
      else
        perform public.admin_review_household_cover_for_corpus(
          source_book.household_id,
          source_book.book_id,
          source_book.corpus_work_id,
          source_book.cover_url
        );
      end if;

      select work.cover_url, jsonb_array_length(work.cover_options)
        into after_cover, after_options
      from public.works work where work.id = source_book.corpus_work_id;

      insert into public.corpus_cover_recovery_marks (
        book_id, source_fingerprint, succeeded, error_message, retry_after,
        attempt_count, recovered_by, recovered_at
      ) values (
        source_book.book_id, source_book.source_fingerprint, true, null, null,
        1, caller, now()
      )
      on conflict (book_id) do update
        set source_fingerprint = excluded.source_fingerprint,
            succeeded = true,
            error_message = null,
            retry_after = null,
            attempt_count = case
              when public.corpus_cover_recovery_marks.source_fingerprint
                is distinct from excluded.source_fingerprint then 1
              else public.corpus_cover_recovery_marks.attempt_count + 1
            end,
            recovered_by = excluded.recovered_by,
            recovered_at = excluded.recovered_at;

      scanned := scanned + 1;
      if before_cover is null and after_cover is not null then
        recovered_covers := recovered_covers + 1;
      end if;
      if coalesce(after_options, 0) > coalesce(before_options, 0) then
        recovered_options := recovered_options + 1;
      end if;
    exception when others then
      failed := failed + 1;
      first_error := coalesce(first_error, sqlerrm);
      -- A failed row must not occupy the front of every later batch. Remember the attempt and
      -- defer it briefly; a changed source fingerprint is eligible immediately.
      insert into public.corpus_cover_recovery_marks (
        book_id, source_fingerprint, succeeded, error_message, retry_after,
        attempt_count, recovered_by, recovered_at
      ) values (
        source_book.book_id, source_book.source_fingerprint, false, sqlerrm,
        now() + interval '15 minutes', 1, caller, now()
      )
      on conflict (book_id) do update
        set source_fingerprint = excluded.source_fingerprint,
            succeeded = false,
            error_message = excluded.error_message,
            retry_after = excluded.retry_after,
            attempt_count = case
              when public.corpus_cover_recovery_marks.source_fingerprint
                is distinct from excluded.source_fingerprint then 1
              else public.corpus_cover_recovery_marks.attempt_count + 1
            end,
            recovered_by = excluded.recovered_by,
            recovered_at = excluded.recovered_at;
    end;
  end loop;

  return jsonb_strip_nulls(jsonb_build_object(
    'scanned', scanned,
    'failed', failed,
    'recoveredCovers', recovered_covers,
    'recoveredOptions', recovered_options,
    'maybeMore', scanned + failed = bounded_limit,
    'errorMessage', first_error
  ));
end;
$$;

revoke all on function public.admin_recover_corpus_cover_batch(integer)
  from public, anon, authenticated, service_role;
grant execute on function public.admin_recover_corpus_cover_batch(integer)
  to authenticated;

comment on function public.admin_recover_corpus_cover_batch(integer) is
  'Recovers at most 25 changed personal or household cover sources for a corpus administrator. '
  'Durable source fingerprints make repeated calls resumable and idempotent.';
