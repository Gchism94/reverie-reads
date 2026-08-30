-- SQLSTATE 40001 is reserved for transaction serialization failures. PostgREST versions that
-- automatically retry that class can keep a permanent application conflict alive indefinitely.
-- Production demonstrated the failure mode when an ISBN-mismatch refusal in the household-cover
-- review RPC generated more than one thousand retries per second until the project was restarted.
--
-- These are optimistic-concurrency and stale-context refusals, not serialization failures. Report
-- them as explicit HTTP 409 conflicts so PostgREST returns once and the client can refresh.
do $migration$
declare
  target_name text;
  target regprocedure;
  definition text;
  conflict_routines constant text[] := array[
    'public.unlink_household_member(uuid,uuid)',
    'public.ensure_book_corpus_work()',
    'public.add_personal_book_to_household(uuid)',
    'public.remove_personal_book_from_household(uuid)',
    'public.remove_household_work(uuid)',
    'public.remove_personal_book(uuid)',
    'public.update_household_work_enrichment(uuid,text[],jsonb)',
    'public.update_corpus_work_metadata(uuid,text,text,text[],text[],text,jsonb)',
    'public.reconcile_household_library_memberships(uuid,jsonb,uuid[],uuid[],text,text)',
    'public.add_corpus_work_to_household(uuid)',
    'public.create_household_catalog_work(text,text,text,text,text)',
    'public.edit_corpus_work_metadata(uuid,text,numeric,integer,text,text,text,text[],text[],text,jsonb,integer,integer,integer)',
    'public.set_corpus_work_cover(uuid,text,text,text,text)',
    'public.admin_review_personal_cover_for_corpus(uuid,uuid,text)',
    'public.admin_review_household_cover_for_corpus(uuid,uuid,uuid,text)',
    'public.add_personal_books_to_household(uuid[])',
    'public.add_corpus_work_to_member_library(uuid,uuid)'
  ];
begin
  foreach target_name in array conflict_routines loop
    target := target_name::regprocedure;
    definition := pg_get_functiondef(target);

    if definition not like '%''40001''%' then
      raise exception 'expected retryable conflict marker is missing from %', target_name;
    end if;

    execute replace(definition, '''40001''', '''PT409''');
  end loop;

  if exists (
    select 1
    from pg_proc function
    join pg_namespace namespace on namespace.oid = function.pronamespace
    where namespace.nspname = 'public' and function.prosrc like '%40001%'
  ) then
    raise exception 'an unclassified public function still raises retryable SQLSTATE 40001';
  end if;
end;
$migration$;

