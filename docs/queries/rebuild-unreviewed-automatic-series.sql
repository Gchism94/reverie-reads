-- One-time repair for the pre-20260913010000 classifier, which treated a search document's series
-- label as membership evidence. This is intentionally NOT a migration: it repairs only rows whose
-- current provenance says they came from that automatic pipeline, and it must be reviewed against
-- the target database before it is allowed to write.
--
-- Dry run in the Supabase SQL editor: run this file unchanged. The inventory SELECTs are returned,
-- then the loud approval guard aborts and rolls the transaction back.
--
-- Apply: inspect the inventory, change the one approval literal below from REVIEW_ONLY to
-- RESET_UNREVIEWED_AUTOMATIC_SERIES, and run the whole file again. Run this only after migration
-- 20260917010000 is live. Then use the administrator corpus-completion control until its resumable
-- queue is empty; that pass reclassifies these works with relational evidence and replays every
-- trusted confirmation into eligible personal defaults and structured membership.

begin;

create temp table rebuild_series_candidates on commit drop as
select w.id, w.title, w.author_text, w.series, w.position, w.series_count,
       w.series_check_source,
       w.metadata_provenance -> 'series' ->> 'source' as provenance_source,
       w.metadata_provenance -> 'series' ->> 'sourceRef' as provenance_source_ref
from public.works w
where nullif(trim(coalesce(w.series, '')), '') is not null
  and w.series_check_state = 'found'
  and coalesce(
        nullif(w.metadata_provenance -> 'series' ->> 'source', ''),
        nullif(w.series_check_source, '')
      ) in ('catalog', 'google', 'hardcover', 'openlibrary')
  and nullif(w.metadata_provenance -> 'series' ->> 'reviewedBy', '') is null
  and not exists (
    select 1
    from public.work_series_suggestions suggestion
    where suggestion.work_id = w.id and suggestion.status = 'accepted'
  );

create temp table rebuild_personal_defaults on commit drop as
select book.id, book.owner_id, book.corpus_work_id, book.series, book.position,
       coalesce(book.series_claim ->> 'origin', 'unknown') as claim_origin
from public.books book
join rebuild_series_candidates candidate on candidate.id = book.corpus_work_id
where book.removed_at is null
  and not coalesce(book.series_user_chosen, false)
  and coalesce(book.series_claim ->> 'origin', 'unknown') in (
    'unknown', 'enrichment', 'corpus'
  );

-- Inventory. Keep the title/author rows as the human review surface; the summaries make a large
-- corpus legible without hiding which exact records are in scope.
select provenance_source, series_check_source, count(*) as works
from rebuild_series_candidates
group by provenance_source, series_check_source
order by provenance_source, series_check_source;

select claim_origin, count(*) as personal_defaults
from rebuild_personal_defaults
group by claim_origin
order by claim_origin;

select * from rebuild_series_candidates order by author_text, title, id;

do $$
declare
  approval constant text := 'REVIEW_ONLY';
begin
  if approval <> 'RESET_UNREVIEWED_AUTOMATIC_SERIES' then
    raise exception
      'review only: no rows changed; set the documented approval literal only after inspecting the inventory'
      using errcode = 'P0001';
  end if;
end;
$$;

-- Match every live series writer's suggestion -> book -> work lock order before clearing anything.
-- This repair can span many works, so each class is acquired in stable UUID order to avoid two
-- concurrent repair/review transactions taking the same rows in opposite orders.
do $$
begin
  perform 1
  from public.work_series_suggestions suggestion
  join rebuild_series_candidates candidate on candidate.id = suggestion.work_id
  where suggestion.status = 'pending'
  order by suggestion.work_id, suggestion.id
  for update of suggestion;

  perform 1
  from public.books book
  join rebuild_personal_defaults personal on personal.id = book.id
  order by book.id
  for update of book;

  perform 1
  from public.works work
  join rebuild_series_candidates candidate on candidate.id = work.id
  order by work.id
  for update of work;
end;
$$;

-- Retire only structured memberships attached to the exact eligible personal defaults. Reader and
-- CSV-import memberships are outside rebuild_personal_defaults and cannot match this update.
update public.series_entries entry
   set removed_at = now(),
       book_id = null,
       is_primary = false,
       membership_claim = jsonb_build_object(
         'origin', 'unknown', 'source', 'automatic_series_rebuild', 'at', now()
       )
  from rebuild_personal_defaults personal
 where entry.book_id = personal.id
   and entry.owner_id = personal.owner_id
   and entry.removed_at is null
   and coalesce(entry.membership_claim ->> 'origin', 'unknown') in (
     'unknown', 'enrichment', 'corpus'
   );

update public.books book
   set series = null,
       position = null,
       series_count = null,
       status = case when book.status = 'ongoing' then 'standalone' else book.status end,
       series_user_chosen = false,
       series_claim = jsonb_build_object(
         'origin', 'unknown', 'source', 'automatic_series_rebuild', 'at', now()
       )
  from rebuild_personal_defaults personal
 where book.id = personal.id;

update public.work_series_suggestions suggestion
   set status = 'superseded', reviewed_at = now(), updated_at = now()
  from rebuild_series_candidates candidate
 where suggestion.work_id = candidate.id and suggestion.status = 'pending';

-- Suppress the new manual-override trigger: this is a provenance-scoped reset awaiting the new
-- classifier, not a human ruling that these books are standalone.
select set_config('reverie.series_classifier', 'on', true);

update public.works work
   set series = null,
       position = null,
       series_count = null,
       series_check_state = 'unknown',
       series_checked_at = null,
       series_check_source = 'automatic_series_rebuild',
       series_check_evidence = '[]'::jsonb,
       series_check_reason = 'Awaiting relational reclassification after the legacy automatic reset.',
       metadata_provenance = coalesce(work.metadata_provenance, '{}'::jsonb) - 'series'
  from rebuild_series_candidates candidate
 where work.id = candidate.id;

select set_config('reverie.series_classifier', '', true);

do $$
begin
  if exists (
    select 1 from public.works work
    join rebuild_series_candidates candidate on candidate.id = work.id
    where work.series is not null or work.position is not null or work.series_count is not null
       or work.series_check_state <> 'unknown' or work.series_checked_at is not null
  ) then
    raise exception 'automatic corpus series reset did not reach every reviewed candidate';
  end if;
  if exists (
    select 1 from public.books book
    join rebuild_personal_defaults personal on personal.id = book.id
    where book.series is not null or book.position is not null or book.series_count is not null
       or book.series_claim ->> 'origin' <> 'unknown'
  ) then
    raise exception 'automatic personal series reset did not reach every eligible default';
  end if;
end;
$$;

select
  (select count(*) from rebuild_series_candidates) as corpus_works_reset,
  (select count(*) from rebuild_personal_defaults) as personal_defaults_reset;

commit;
