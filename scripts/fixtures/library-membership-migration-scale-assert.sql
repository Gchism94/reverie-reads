\set ON_ERROR_STOP on

do $$
declare
  total_books int;
  bound_books int;
  function_source text;
begin
  select count(*)::int, count(corpus_work_id)::int
  into total_books, bound_books
  from public.books;

  if total_books <> 5012 or bound_books <> total_books then
    raise exception 'expected all 5,012 personal books bound, got % of %', bound_books, total_books;
  end if;

  if exists (
    select 1
    from generate_series(1, 2500) n
    join public.books b on b.id = md5('scale-book-' || n)::uuid
    where b.corpus_work_id <> md5('scale-work-' || n)::uuid
  ) then
    raise exception 'an ordinary unique fallback did not bind to its exact corpus work';
  end if;

  if exists (
    select 1
    from generate_series(2501, 5000) n
    join public.books b on b.id = md5('scale-book-' || n)::uuid
    where b.corpus_work_id <> md5('scale-work-' || n)::uuid
  ) then
    raise exception 'an ordinary unique ISBN did not retain priority over fallback identity';
  end if;

  if (
    select count(distinct corpus_work_id)
    from public.books
    where id in (
      '92000000-0000-4000-8000-000000000001',
      '92000000-0000-4000-8000-000000000002'
    )
  ) <> 1 then
    raise exception 'ordinary duplicate personal fallbacks did not share one work';
  end if;

  if (
    select w.creation_source
    from public.books b
    join public.works w on w.id = b.corpus_work_id
    where b.id = '92000000-0000-4000-8000-000000000001'
  ) <> 'legacy_personal_backfill' then
    raise exception 'ordinary missing identity did not create a provisional backfill work';
  end if;

  if not exists (
    select 1
    from public.books b
    join public.works w on w.id = b.corpus_work_id
    where b.id = '92000000-0000-4000-8000-000000000003'
      and w.work_key = 'reconcile:92000000-0000-4000-8000-000000000003'
      and w.creation_source = 'reconciliation'
  ) then
    raise exception 'ambiguous fallback did not route to reconciliation';
  end if;

  if not exists (
    select 1
    from public.books b
    join public.works w on w.id = b.corpus_work_id
    where b.id = '92000000-0000-4000-8000-000000000004'
      and w.work_key = 'reconcile:92000000-0000-4000-8000-000000000004'
      and w.creation_source = 'reconciliation'
  ) then
    raise exception 'ambiguous ISBN did not route to reconciliation';
  end if;

  if (
    select corpus_work_id
    from public.books
    where id = '92000000-0000-4000-8000-000000000005'
  ) <> '90000000-0000-4000-8000-000000000005'::uuid then
    raise exception 'the selected mixed-identity row did not keep unique ISBN priority';
  end if;

  if not exists (
    select 1
    from public.books b
    join public.works w on w.id = b.corpus_work_id
    where b.id = '92000000-0000-4000-8000-000000000006'
      and w.work_key = 'reconcile:92000000-0000-4000-8000-000000000006'
      and w.creation_source = 'reconciliation'
  ) then
    raise exception 'zero-ISBN/zero-fallback mixed sibling did not route to reconciliation';
  end if;

  if (
    select count(*)
    from public.books b
    join public.works w on w.id = b.corpus_work_id
    where b.id in (select md5('unmatched-book-' || n)::uuid from generate_series(1, 6) n)
      and w.creation_source = 'legacy_personal_backfill'
  ) <> 6 then
    raise exception 'ordinary unmatched identities did not retain provisional behavior';
  end if;

  if (
    select updated_at from public.books where id = md5('scale-book-1')::uuid
  ) <> '2020-01-02T03:04:06Z'::timestamptz or (
    select enriched_at from public.books where id = md5('scale-book-1')::uuid
  ) <> '2020-01-02T03:04:05Z'::timestamptz then
    raise exception 'internal corpus binding rewrote book timestamps or enrichment state';
  end if;

  if to_regclass('pg_temp.library_work_fallback_owners') is not null
    or to_regclass('pg_temp.library_work_isbn_owners') is not null
    or to_regclass('pg_temp.library_book_identities') is not null
    or to_regclass('pg_temp.library_book_corpus_bindings') is not null then
    raise exception 'migration temporary identity tables survived commit';
  end if;

  if (
    select count(*)
    from pg_trigger
    where tgrelid = 'public.books'::regclass
      and tgname in ('books_set_updated_at', 'books_enriched_stamp_invalidate')
      and tgenabled = 'O'
  ) <> 2 then
    raise exception 'both temporarily disabled book triggers were not restored';
  end if;

  if (
    select count(*)
    from pg_trigger
    where tgrelid = 'public.books'::regclass
      and tgname in ('books_ensure_corpus_work', 'books_validate_corpus_rebind')
      and tgenabled = 'O'
  ) <> 2 then
    raise exception 'both corpus binding book triggers were not installed';
  end if;

  function_source := pg_get_functiondef('public.ensure_book_corpus_work()'::regprocedure);
  if function_source not like '%lock_library_book_owner_insert(new.owner_id)%' then
    raise exception 'book inserts do not acquire the shared owner fence';
  end if;

  function_source := pg_get_functiondef(
    'public.reconcile_household_library_memberships(uuid,jsonb,uuid[],uuid[],text,text)'
      ::regprocedure
  );
  if function_source not like '%lock_library_book_owners_reconciliation(assigned_accounts)%' then
    raise exception 'reconciliation does not acquire the exclusive reviewed-owner fences';
  end if;
end;
$$;

select jsonb_build_object(
  'books', (select count(*) from public.books),
  'bound', (select count(corpus_work_id) from public.books),
  'works', (select count(*) from public.works),
  'reconciliationWorks', (
    select count(*) from public.works where creation_source = 'reconciliation'
  ),
  'mixedSiblingWork', (
    select corpus_work_id from public.books
    where id = '92000000-0000-4000-8000-000000000006'
  )
) as migration_scale_fixture;
