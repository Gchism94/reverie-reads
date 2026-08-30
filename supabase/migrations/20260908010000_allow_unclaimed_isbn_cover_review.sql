-- Administrator cover review is a visual approval of the exact cover already displayed from an
-- active personal or household copy. A valid personal ISBN that has not yet been copied into
-- works.isbns is not, by itself, evidence that the book is linked to the wrong work. Production's
-- imported 1984 copy demonstrated the distinction: its immutable corpus_work_id and unique
-- title/full-author fallback both identified the displayed work, but the redundant membership
-- precondition rejected every review before the binding resolver could evaluate that evidence.
--
-- Keep the ISBN advisory lock and the existing book_corpus_binding_is_unambiguous check. That
-- helper still refuses an ISBN claimed by another work and any non-unique title/full-author
-- fallback. Remove only the stricter "ISBN must already be in this work's array" precondition.
do $migration$
declare
  target_name text;
  target regprocedure;
  definition text;
  occurrence_count integer;
  conflict_guard constant text := $guard$  if normalized_isbn ~ '^[0-9]{13}$'
    and not normalized_isbn = any(coalesce(target_work_isbns, '{}')) then
    raise exception 'personal book ISBN is not established on the displayed corpus work; refresh after identity reconciliation'
      using errcode = 'PT409';
  end if;
$guard$;
  target_names constant text[] := array[
    'public.admin_review_personal_cover_for_corpus(uuid,uuid,text)',
    'public.admin_review_household_cover_for_corpus(uuid,uuid,uuid,text)'
  ];
begin
  foreach target_name in array target_names loop
    target := target_name::regprocedure;
    definition := pg_get_functiondef(target);
    occurrence_count := (
      length(definition) - length(replace(definition, conflict_guard, ''))
    ) / length(conflict_guard);

    if occurrence_count <> 1 then
      raise exception 'expected one missing-ISBN cover-review guard in %, found %',
        target_name, occurrence_count;
    end if;
    if definition not like '%book_corpus_binding_is_unambiguous%' then
      raise exception 'cover-review binding resolver is missing from %', target_name;
    end if;

    execute replace(definition, conflict_guard, '');
  end loop;

  if exists (
    select 1
    from pg_proc function
    join pg_namespace namespace on namespace.oid = function.pronamespace
    where namespace.nspname = 'public'
      and function.proname in (
        'admin_review_personal_cover_for_corpus',
        'admin_review_household_cover_for_corpus'
      )
      and function.prosrc like '%personal book ISBN is not established%'
  ) then
    raise exception 'a cover-review function still requires prior ISBN-array membership';
  end if;
end;
$migration$;
