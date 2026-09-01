-- A trusted classifier confirmation is not a no-op merely because the corpus tuple is unchanged.
-- Eligible legacy personal rows may still lack the corpus claim and structured membership. Replay
-- the existing default projection only inside the classifier/reviewer transaction; an unrelated
-- same-tuple UPDATE remains inert and reader/import choices remain authoritative.
create or replace function public.seed_personal_series_from_corpus()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  source_name text := coalesce(
    nullif(new.metadata_provenance -> 'series' ->> 'source', ''),
    nullif(new.series_check_source, ''),
    'corpus'
  );
  source_ref text := coalesce(
    nullif(new.metadata_provenance -> 'series' ->> 'sourceRef', ''),
    new.id::text
  );
  confidence text := coalesce(
    nullif(new.metadata_provenance -> 'series' ->> 'membershipConfidence', ''),
    nullif(new.metadata_provenance -> 'series' ->> 'confidence', ''),
    'high'
  );
  observed_at text := coalesce(new.series_checked_at::text, now()::text);
  claim jsonb;
begin
  if tg_op = 'UPDATE'
     and row(new.series, new.position, new.series_count)
       is not distinct from row(old.series, old.position, old.series_count)
     and coalesce(current_setting('reverie.series_classifier', true), '') <> 'on'
  then
    return new;
  end if;

  claim := jsonb_strip_nulls(jsonb_build_object(
    'origin', 'corpus', 'source', source_name, 'sourceRef', source_ref,
    'confidence', confidence, 'at', observed_at
  ));

  update public.series_entries entry
     set removed_at = now(),
         book_id = null,
         is_primary = false,
         membership_claim = claim
    from public.books book, public.series series_row
   where book.corpus_work_id = new.id
     and book.removed_at is null
     and not coalesce(book.series_user_chosen, false)
     and coalesce(book.series_claim ->> 'origin', 'unknown') in (
       'unknown', 'enrichment', 'corpus'
     )
     and entry.book_id = book.id
     and entry.owner_id = book.owner_id
     and entry.series_id = series_row.id
     and entry.removed_at is null
     and coalesce(entry.membership_claim ->> 'origin', 'unknown') in (
       'unknown', 'enrichment', 'corpus'
     )
     and (
       nullif(trim(coalesce(new.series, '')), '') is null
       or lower(regexp_replace(trim(series_row.name), '[^[:alnum:]]+', '', 'g'))
         <> lower(regexp_replace(trim(new.series), '[^[:alnum:]]+', '', 'g'))
     );

  update public.books book
     set series = new.series,
         position = new.position,
         series_count = new.series_count,
         status = case
           when nullif(trim(coalesce(new.series, '')), '') is not null
             and book.status = 'standalone' then 'ongoing'
           when nullif(trim(coalesce(new.series, '')), '') is null
             and book.status = 'ongoing' then 'standalone'
           else book.status
         end,
         series_user_chosen = false,
         series_claim = claim
   where book.corpus_work_id = new.id
     and book.removed_at is null
     and not coalesce(book.series_user_chosen, false)
     and coalesce(book.series_claim ->> 'origin', 'unknown') in (
       'unknown', 'enrichment', 'corpus'
     );
  return new;
end;
$$;

revoke all on function public.seed_personal_series_from_corpus()
  from public, anon, authenticated, service_role;
