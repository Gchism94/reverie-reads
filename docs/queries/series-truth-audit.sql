-- SERIES TRUTH PHASE 1 — aggregate inventory only.
--
-- READ-ONLY. Every statement is SELECT/WITH/SHOW. Nothing is written or repaired. Run the whole
-- file in the production Supabase SQL Editor as the project owner. The output contains counts and
-- schema facts only: no titles, author names, profile ids, book ids, or work ids.
--
-- Return every result grid to the implementation task. Do not paste any ad-hoc title-level probes
-- into a committed report.

-- Q1. Schema capability: prove which parts of the proposed authority model exist today.
select
  exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'books' and column_name = 'series_user_chosen'
  ) as personal_reader_flag_exists,
  exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'works' and column_name = 'metadata_provenance'
  ) as corpus_field_provenance_exists,
  exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'works' and column_name = 'enrichment_confidence'
  ) as corpus_match_confidence_exists,
  exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'series_entries' and column_name = 'user_edited'
  ) as structured_reader_flag_exists,
  exists (
    select 1 from pg_indexes
    where schemaname = 'public' and tablename = 'series_entries'
      and indexname = 'series_entries_position_uidx'
  ) as live_position_uniqueness_exists;

-- Shared basis for Q2-Q6. A current human series edit means the newest audit event that changed the
-- series field still agrees with the work's current series. The write RPC was authority-gated when
-- that event was recorded. This does not pretend metadata_provenance was updated; it reconstructs
-- the current human-review fact from the append-only audit.
--
-- A trusted upstream claim initially requires HIGH match confidence and a field-level source from
-- the providers that can supply series in the enrichment precedence table. Medium/low/none remain
-- review material.

-- Q2. Exclusive proposed admission result across every active personal book.
with latest_human_series_edit as (
  select distinct on (edit.work_id)
    edit.work_id,
    nullif(trim(edit.next_value ->> 'series'), '') as reviewed_series
  from public.work_metadata_edits edit
  where (edit.previous_value -> 'series') is distinct from (edit.next_value -> 'series')
  order by edit.work_id, edit.created_at desc, edit.id desc
), live_memberships as (
  select
    entry.book_id,
    count(*)::int as live_count,
    count(*) filter (
      where lower(trim(series_row.name)) = lower(trim(coalesce(book.series, '')))
    )::int as matching_name_count
  from public.series_entries entry
  join public.series series_row on series_row.id = entry.series_id
  join public.books book on book.id = entry.book_id
  where entry.removed_at is null and entry.book_id is not null
  group by entry.book_id
), classified as (
  select
    book.id,
    case
      when nullif(trim(book.series), '') is null
        and coalesce(live.live_count, 0) = 0
        then 'standalone'
      when coalesce(live.live_count, 0) > 1
        or (coalesce(live.live_count, 0) > 0 and coalesce(live.matching_name_count, 0) = 0)
        then 'low_confidence_or_contradictory'
      when nullif(trim(book.series), '') is not null and book.series_user_chosen
        then 'reader_confirmed_series'
      when nullif(trim(book.series), '') is not null
        and lower(trim(book.series)) = lower(trim(coalesce(work.series, '')))
        and (
          lower(trim(coalesce(human.reviewed_series, ''))) = lower(trim(work.series))
          or (
            work.enrichment_confidence = 'high'
            and work.metadata_provenance -> 'series' ->> 'source'
              in ('hardcover', 'openlibrary', 'google')
          )
        )
        then 'sourced_series'
      else 'low_confidence_or_contradictory'
    end as proposed_admission
  from public.books book
  join public.works work on work.id = book.corpus_work_id
  left join latest_human_series_edit human on human.work_id = work.id
  left join live_memberships live on live.book_id = book.id
  where book.removed_at is null
)
select proposed_admission, count(*) as active_books
from classified
group by proposed_admission
order by proposed_admission;

-- Q3. Independent structural integrity signals. These intentionally overlap Q2 categories.
with live_memberships as (
  select
    entry.book_id,
    count(*)::int as live_count,
    count(*) filter (
      where lower(trim(series_row.name)) = lower(trim(coalesce(book.series, '')))
    )::int as matching_name_count,
    count(*) filter (
      where book.position is not null and entry.position is distinct from book.position
    )::int as position_mismatch_count,
    count(*) filter (
      where book.series_count is distinct from series_row.length
    )::int as length_mismatch_count
  from public.series_entries entry
  join public.series series_row on series_row.id = entry.series_id
  join public.books book on book.id = entry.book_id
  where entry.removed_at is null and entry.book_id is not null
  group by entry.book_id
), signals as (
  select
    book.id,
    (nullif(trim(book.series), '') is not null and coalesce(live.matching_name_count, 0) = 0)
      as compatibility_claim_without_matching_entry,
    (nullif(trim(book.series), '') is null and coalesce(live.live_count, 0) > 0)
      as entry_without_compatibility_claim,
    (coalesce(live.live_count, 0) > 1) as multiple_live_memberships,
    (coalesce(live.position_mismatch_count, 0) > 0) as position_mismatch,
    (coalesce(live.length_mismatch_count, 0) > 0) as length_mismatch
  from public.books book
  left join live_memberships live on live.book_id = book.id
  where book.removed_at is null
)
select signal, affected_books
from (
  select 1 as ord, 'compatibility_claim_without_matching_entry' as signal,
    count(*) filter (where compatibility_claim_without_matching_entry) as affected_books from signals
  union all
  select 2, 'entry_without_compatibility_claim',
    count(*) filter (where entry_without_compatibility_claim) from signals
  union all
  select 3, 'multiple_live_memberships',
    count(*) filter (where multiple_live_memberships) from signals
  union all
  select 4, 'position_mismatch',
    count(*) filter (where position_mismatch) from signals
  union all
  select 5, 'length_mismatch',
    count(*) filter (where length_mismatch) from signals
) result
order by ord;

-- Q4. Why an unflagged personal series would or would not qualify as sourced. This distinguishes
-- missing provenance from low confidence and an actual personal/shared disagreement.
with latest_human_series_edit as (
  select distinct on (edit.work_id)
    edit.work_id,
    nullif(trim(edit.next_value ->> 'series'), '') as reviewed_series
  from public.work_metadata_edits edit
  where (edit.previous_value -> 'series') is distinct from (edit.next_value -> 'series')
  order by edit.work_id, edit.created_at desc, edit.id desc
), reasons as (
  select case
    when nullif(trim(work.series), '') is null then 'linked_work_has_no_series'
    when lower(trim(book.series)) <> lower(trim(work.series)) then 'personal_shared_disagree'
    when lower(trim(coalesce(human.reviewed_series, ''))) = lower(trim(work.series))
      then 'current_human_review'
    when work.metadata_provenance -> 'series' ->> 'source' is null
      then 'matching_shared_claim_without_field_provenance'
    when work.enrichment_confidence is distinct from 'high'
      then 'matching_shared_claim_below_high_confidence'
    when work.metadata_provenance -> 'series' ->> 'source'
      in ('hardcover', 'openlibrary', 'google') then 'trusted_high_confidence_source'
    else 'unsupported_provenance_source'
  end as reason
  from public.books book
  join public.works work on work.id = book.corpus_work_id
  left join latest_human_series_edit human on human.work_id = work.id
  where book.removed_at is null
    and nullif(trim(book.series), '') is not null
    and not book.series_user_chosen
)
select reason, count(*) as active_books
from reasons
group by reason
order by reason;

-- Q5. Shared corpus series authority, counted by current provenance shape.
with latest_human_series_edit as (
  select distinct on (edit.work_id)
    edit.work_id,
    nullif(trim(edit.next_value ->> 'series'), '') as reviewed_series
  from public.work_metadata_edits edit
  where (edit.previous_value -> 'series') is distinct from (edit.next_value -> 'series')
  order by edit.work_id, edit.created_at desc, edit.id desc
)
select
  case
    when lower(trim(coalesce(human.reviewed_series, ''))) = lower(trim(work.series))
      then 'current_human_review'
    when work.metadata_provenance -> 'series' ->> 'source' is null
      then 'no_field_provenance'
    when work.enrichment_confidence = 'high'
      and work.metadata_provenance -> 'series' ->> 'source'
        in ('hardcover', 'openlibrary', 'google')
      then 'trusted_high_confidence_source'
    else 'source_needs_review'
  end as authority,
  count(*) as corpus_works
from public.works work
left join latest_human_series_edit human on human.work_id = work.id
where nullif(trim(work.series), '') is not null
group by authority
order by authority;

-- Q6. Structured-series inventory and retained reader decisions, still aggregate-only.
select
  (select count(*) from public.series) as series_rows,
  (select count(*) from public.series series_row where not exists (
    select 1 from public.series_entries entry
    where entry.series_id = series_row.id and entry.removed_at is null
  )) as series_rows_without_live_entries,
  (select count(*) from public.series_entries where removed_at is null) as live_entries,
  (select count(*) from public.series_entries where removed_at is null and book_id is null)
    as live_ghosts,
  (select count(*) from public.series_entries where removed_at is not null) as tombstones,
  (select count(*) from public.series_entries where removed_at is null and user_edited)
    as reader_edited_live_entries,
  (select count(*) from public.series_merge_decisions where alias_name is not null) as aliases,
  (select count(*) from public.series_merge_decisions) as identity_rulings;

-- Q7. Historical ambiguity: the boolean cannot classify pre-column values. These timestamps are
-- aggregate scope only; the migration was deployed on 2026-08-18 and added no backfill.
select
  count(*) filter (
    where book.removed_at is null and nullif(trim(book.series), '') is not null
      and not book.series_user_chosen and book.added_at < timestamptz '2026-08-18 00:00:00+00'
  ) as pre_flag_unclassified_active_series_books,
  count(*) filter (
    where book.removed_at is null and nullif(trim(book.series), '') is not null
      and not book.series_user_chosen and book.added_at >= timestamptz '2026-08-18 00:00:00+00'
  ) as post_flag_unclassified_active_series_books,
  count(*) filter (
    where book.removed_at is null and book.series_user_chosen
  ) as active_reader_flagged_books
from public.books book;

-- Interpretation gate:
--   * Q2/Q4 small review populations -> build an explicit owner review queue, no blanket backfill.
--   * Q2/Q4 large unproven population -> land provenance/write-path enforcement first, then stage
--     a batched review/reconciliation workflow. Never infer that an old false boolean means machine.
--   * Any Q3 count above zero -> structured canonicalization must include a repair/adjudication plan
--     before the scalar compatibility fields can be declared derived.
