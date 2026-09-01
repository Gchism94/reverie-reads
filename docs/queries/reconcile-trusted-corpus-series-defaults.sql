-- One-time reconciliation for eligible personal books that predate structured series authority or
-- missed the original corpus projection. This is intentionally NOT a migration: it may update
-- personal rows and must be reviewed against the target database before it is allowed to write.
-- Run only after migration 20260917010000 is live.
--
-- Dry run in the Supabase SQL editor: run this file unchanged. Inspect both inventories; the loud
-- approval guard then aborts and rolls the transaction back.
--
-- Apply: change the one approval literal from REVIEW_ONLY to
-- RECONCILE_TRUSTED_CORPUS_SERIES and run the whole file again. This does not adjudicate uncertain
-- or legacy search-label series. Run rebuild-unreviewed-automatic-series.sql separately for those.

begin;

create temp table trusted_corpus_series on commit drop as
select work.id, work.title, work.author_text, work.series, work.position, work.series_count,
       work.series_check_source,
       work.metadata_provenance -> 'series' ->> 'source' as provenance_source,
       work.metadata_provenance -> 'series' ->> 'reviewedBy' as reviewed_by
from public.works work
where nullif(trim(coalesce(work.series, '')), '') is not null
  and work.series_check_state = 'found'
  and (
    nullif(work.metadata_provenance -> 'series' ->> 'reviewedBy', '') is not null
    or coalesce(
      nullif(work.metadata_provenance -> 'series' ->> 'source', ''),
      nullif(work.series_check_source, '')
    ) = 'manual'
    or exists (
      select 1
      from jsonb_array_elements(coalesce(work.series_check_evidence, '[]'::jsonb)) item
      where item ->> 'kind' = 'relational_membership'
        and lower(regexp_replace(trim(item ->> 'series'), '[^[:alnum:]]+', '', 'g'))
          = lower(regexp_replace(trim(work.series), '[^[:alnum:]]+', '', 'g'))
    )
  );

create temp table trusted_personal_reconciliation on commit drop as
select book.id, book.owner_id, book.corpus_work_id, book.series as personal_series,
       book.position as personal_position, book.series_count as personal_count,
       coalesce(book.series_claim ->> 'origin', 'unknown') as claim_origin,
       work.series as corpus_series, work.position as corpus_position,
       work.series_count as corpus_count
from public.books book
join trusted_corpus_series work on work.id = book.corpus_work_id
where book.removed_at is null
  and not coalesce(book.series_user_chosen, false)
  and coalesce(book.series_claim ->> 'origin', 'unknown') in (
    'unknown', 'enrichment', 'corpus'
  )
  and (
    row(book.series, book.position, book.series_count)
      is distinct from row(work.series, work.position, work.series_count)
    or book.series_claim ->> 'origin' is distinct from 'corpus'
    or book.status = 'standalone'
    or not exists (
      select 1
      from public.series_entries entry
      join public.series series_row on series_row.id = entry.series_id
      where entry.book_id = book.id
        and entry.owner_id = book.owner_id
        and entry.removed_at is null
        and coalesce(entry.membership_claim ->> 'origin', 'unknown') <> 'unknown'
        and lower(regexp_replace(trim(series_row.name), '[^[:alnum:]]+', '', 'g'))
          = lower(regexp_replace(trim(work.series), '[^[:alnum:]]+', '', 'g'))
    )
  );

select provenance_source, series_check_source, count(*) as trusted_works
from trusted_corpus_series
group by provenance_source, series_check_source
order by provenance_source, series_check_source;

select claim_origin, count(*) as personal_rows_to_reconcile
from trusted_personal_reconciliation
group by claim_origin
order by claim_origin;

select *
from trusted_personal_reconciliation
order by owner_id, corpus_work_id, id;

do $$
declare
  approval constant text := 'REVIEW_ONLY';
begin
  if approval <> 'RECONCILE_TRUSTED_CORPUS_SERIES' then
    raise exception
      'review only: no rows changed; set the documented approval literal only after inspecting the inventory'
      using errcode = 'P0001';
  end if;
end;
$$;

-- Match the classifier's suggestion -> book -> work lock order before replaying any defaults.
do $$
begin
  perform 1
  from public.work_series_suggestions suggestion
  join trusted_corpus_series work on work.id = suggestion.work_id
  where suggestion.status = 'pending'
  order by suggestion.work_id, suggestion.id
  for update of suggestion;

  perform 1
  from public.books book
  join trusted_personal_reconciliation personal on personal.id = book.id
  order by book.id
  for update of book;

  perform 1
  from public.works work
  join trusted_corpus_series candidate on candidate.id = work.id
  order by work.id
  for update of work;
end;
$$;

-- A same-tuple update fires the projection trigger. The classifier marker makes this an explicit
-- reconciliation rather than a manual corpus edit.
select set_config('reverie.series_classifier', 'on', true);

update public.works work
   set series = work.series,
       position = work.position,
       series_count = work.series_count
  from trusted_corpus_series candidate
 where work.id = candidate.id;

select set_config('reverie.series_classifier', '', true);

do $$
begin
  if exists (
    select 1
    from public.books book
    join trusted_personal_reconciliation personal on personal.id = book.id
    where row(book.series, book.position, book.series_count)
            is distinct from row(personal.corpus_series, personal.corpus_position, personal.corpus_count)
       or book.series_claim ->> 'origin' is distinct from 'corpus'
       or book.status = 'standalone'
       or not exists (
         select 1
         from public.series_entries entry
         join public.series series_row on series_row.id = entry.series_id
         where entry.book_id = book.id
           and entry.owner_id = book.owner_id
           and entry.removed_at is null
           and coalesce(entry.membership_claim ->> 'origin', 'unknown') <> 'unknown'
           and lower(regexp_replace(trim(series_row.name), '[^[:alnum:]]+', '', 'g'))
             = lower(regexp_replace(trim(personal.corpus_series), '[^[:alnum:]]+', '', 'g'))
       )
  ) then
    raise exception 'trusted corpus series reconciliation did not repair every inventoried row';
  end if;
end;
$$;

select count(*) as personal_rows_reconciled
from trusted_personal_reconciliation;

commit;
