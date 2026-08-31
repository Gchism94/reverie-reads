-- Series claim provenance — Phase 2A of the series-truth overhaul.
--
-- This is deliberately FORWARD-ONLY. Every historical row receives origin=unknown, which records
-- exactly what the pre-2026-08-18 model knows. There is no title-level backfill and no inference
-- from series_user_chosen=false. Later review/canonicalization may replace unknown one row at a
-- time; this migration never does.

alter table public.books
  add column series_claim jsonb not null default '{"origin":"unknown"}'::jsonb;

alter table public.books
  add constraint books_series_claim_object_check
    check (jsonb_typeof(series_claim) = 'object'),
  add constraint books_series_claim_origin_check
    check (
      series_claim ? 'origin'
      and jsonb_typeof(series_claim -> 'origin') = 'string'
      and series_claim ->> 'origin' in ('unknown', 'reader', 'import', 'enrichment', 'corpus')
    ),
  add constraint books_series_claim_confidence_check
    check (
      not (series_claim ? 'confidence')
      or (
        jsonb_typeof(series_claim -> 'confidence') = 'string'
        and series_claim ->> 'confidence' in ('high', 'medium', 'low', 'none')
      )
    ),
  add constraint books_series_claim_optional_text_check
    check (
      (not (series_claim ? 'source') or jsonb_typeof(series_claim -> 'source') = 'string')
      and (not (series_claim ? 'sourceRef') or jsonb_typeof(series_claim -> 'sourceRef') = 'string')
      and (not (series_claim ? 'at') or jsonb_typeof(series_claim -> 'at') = 'string')
    );

comment on column public.books.series_claim is
  'Field-level provenance for the personal series tuple. origin is unknown/reader/import/'
  'enrichment/corpus; optional source/sourceRef/confidence/at retain why the current value exists. '
  'Historical rows default to unknown and are never inferred from series_user_chosen=false.';

-- Fail closed for any writer this phase has not taught to send provenance. A series value must
-- never change while retaining a claim about the value it replaced. Instrumented writers update
-- both fields in one statement and pass through unchanged; legacy/direct writers become unknown.
create or replace function public.fail_closed_series_claim()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.series is distinct from old.series
     and new.series_claim is not distinct from old.series_claim
  then
    new.series_claim := '{"origin":"unknown"}'::jsonb;
  end if;
  return new;
end;
$$;

revoke all on function public.fail_closed_series_claim()
  from public, anon, authenticated, service_role;

create trigger books_fail_closed_series_claim
before update of series, series_claim on public.books
for each row execute function public.fail_closed_series_claim();

-- Existing signature, additive write. A book-detail save is an explicit reader gesture whether it
-- names a series or deliberately leaves it blank, so it owns both series_user_chosen and the claim.
create or replace function public.sync_book_series(
  p_book uuid,
  p_new_series text,
  p_position numeric,
  p_length int
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := (select auth.uid());
  v_old_name text;
  v_new_name text := nullif(trim(coalesce(p_new_series, '')), '');
  v_old_sid uuid;
  v_new_sid uuid;
  v_entry uuid;
  v_final_position numeric;
  v_claim jsonb := jsonb_build_object(
    'origin', 'reader', 'source', 'book_edit', 'at', now()
  );
begin
  select series into v_old_name from public.books where id = p_book and owner_id = uid;
  if not found then
    raise exception 'not owner of book';
  end if;

  if v_old_name is not null and v_old_name <> '' and v_old_name is distinct from v_new_name then
    select id into v_old_sid from public.series where owner_id = uid and name = v_old_name;
    if v_old_sid is not null then
      update public.series_entries
         set removed_at = now(), book_id = null, user_edited = true
       where series_id = v_old_sid and book_id = p_book and removed_at is null;
    end if;
  end if;

  if v_new_name is null then
    if v_old_name is not null and v_old_name <> '' then
      update public.books
         set series = null, position = null, series_count = null,
             series_user_chosen = true, series_claim = v_claim
       where id = p_book;
    else
      update public.books
         set series = null, position = p_position, series_count = p_length,
             series_user_chosen = true, series_claim = v_claim
       where id = p_book;
    end if;
    return;
  end if;

  select id into v_new_sid from public.series where owner_id = uid and name = v_new_name;
  if v_new_sid is not null then
    select id into v_entry from public.series_entries
     where series_id = v_new_sid and book_id = p_book and owner_id = uid and removed_at is null;
  end if;

  if v_new_sid is not null and v_entry is not null then
    v_final_position := p_position;
    if v_final_position is null then
      select floor(coalesce(max(position), 0)) + 1 into v_final_position
        from public.series_entries where series_id = v_new_sid and removed_at is null;
    end if;
    perform public.set_series_order(
      v_new_sid,
      jsonb_build_array(jsonb_build_object('entry_id', v_entry, 'position', v_final_position)),
      'reader',
      jsonb_build_object('length', p_length)
    );
  end if;

  update public.books
     set series = v_new_name,
         position = case when v_entry is null then p_position else position end,
         series_count = case when v_new_sid is null then p_length else series_count end,
         series_user_chosen = true,
         series_claim = v_claim
   where id = p_book;
end;
$$;

comment on function public.sync_book_series(uuid, text, numeric, int) is
  'Atomic reader series save: retire the old live slot, write the compatibility tuple, mark the '
  'reader gesture in series_user_chosen and series_claim, and delegate structured placement to '
  'set_series_order when a live entry exists.';

revoke all on function public.sync_book_series(uuid, text, numeric, int)
  from public, anon, authenticated, service_role;
grant execute on function public.sync_book_series(uuid, text, numeric, int) to authenticated;

-- A removal is a positive reader refusal. Retain that distinction even though the current series
-- value is blank; otherwise a later fill-only source cannot tell absence from a deliberate clear.
create or replace function public.remove_series_entry(p_entry uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := (select auth.uid());
  v_book uuid;
begin
  select book_id into v_book
  from public.series_entries
  where id = p_entry and owner_id = uid;
  if not found then
    raise exception 'not owner of series entry';
  end if;

  if v_book is not null
     and not exists (select 1 from public.books where id = v_book and owner_id = uid)
  then
    raise exception 'not owner of linked book';
  end if;

  update public.series_entries
  set removed_at = now(), book_id = null, user_edited = true
  where id = p_entry;

  if v_book is not null then
    update public.books
    set series = null,
        series_user_chosen = true,
        series_claim = jsonb_build_object(
          'origin', 'reader', 'source', 'series_remove', 'at', now()
        )
    where id = v_book;
  end if;
end;
$$;

comment on function public.remove_series_entry(uuid) is
  'Retire one series slot atomically: tombstone the entry, clear the linked compatibility name, '
  'and record a reader refusal in both series_user_chosen and series_claim.';

revoke all on function public.remove_series_entry(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.remove_series_entry(uuid) to authenticated;

-- Shared adoption remains an explicit reader action, but it is not the same action as typing a
-- series. sync_book_series first performs the atomic structured transition; this final update then
-- replaces only the provenance label with the corpus work that was adopted.
create or replace function public.adopt_corpus_work_metadata(p_book uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  target_work uuid;
  shared_series text;
  shared_position numeric;
  shared_series_count int;
begin
  if caller is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select book.corpus_work_id into target_work
  from public.books book
  where book.id = p_book and book.owner_id = caller and book.removed_at is null
  for update;
  if target_work is null then
    raise exception 'active personal book not found' using errcode = 'P0002';
  end if;

  select work.series, work.position, work.series_count
  into shared_series, shared_position, shared_series_count
  from public.works work
  where work.id = target_work
  for share;
  if not found then
    raise exception 'corpus work not found' using errcode = 'P0002';
  end if;

  perform public.sync_book_series(
    p_book, shared_series, shared_position, shared_series_count
  );

  update public.books book
  set series_count = shared_series_count,
      series_claim = jsonb_build_object(
        'origin', 'corpus',
        'source', 'shared_adoption',
        'sourceRef', target_work,
        'at', now()
      ),
      status = coalesce(work.status, 'standalone'),
      genre = coalesce(work.genre, ''),
      subgenre = coalesce(work.subgenre, ''),
      genres = coalesce(work.genres, '{}'),
      subgenres = coalesce(work.subgenres, '{}'),
      cover_url = work.cover_url,
      cover_thumb_url = null,
      cover_source = work.cover_source,
      cover_source_url = work.cover_source_url,
      cover_color = work.cover_color,
      cover_confidence = null,
      cover_user_chosen = work.cover_url is not null,
      pub_y = work.pub_y,
      pub_m = work.pub_m,
      pub_d = work.pub_d
  from public.works work
  where book.id = p_book
    and book.owner_id = caller
    and book.removed_at is null
    and work.id = target_work;

  if not found then
    raise exception 'corpus work not found' using errcode = 'P0002';
  end if;
  return p_book;
end;
$$;

revoke all on function public.adopt_corpus_work_metadata(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.adopt_corpus_work_metadata(uuid) to authenticated;

-- A peer-library Add copies the shared work, so its personal claim points back to that work. It is
-- not reader-chosen: the recipient only authorized neutral additions, and can review/adopt later.
create or replace function public.add_corpus_work_to_member_library(p_work uuid, p_member uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  target_household uuid;
  created_book uuid;
begin
  if caller is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if p_member is null or p_member = caller then
    raise exception 'choose another household member' using errcode = '22023';
  end if;

  perform 1 from public.profiles profile where profile.id = caller for key share;
  if not found then
    raise exception 'profile not found' using errcode = 'P0002';
  end if;
  perform 1 from public.profiles profile where profile.id = p_member for key share;
  if not found then
    raise exception 'recipient profile not found' using errcode = 'P0002';
  end if;

  select mine.household_id into target_household
  from public.household_members mine
  join public.household_members recipient
    on recipient.household_id = mine.household_id
   and recipient.user_id = p_member
  where mine.user_id = caller
    and recipient.allow_member_library_adds
  for update of recipient;
  if target_household is null then
    raise exception 'recipient has not allowed household members to add to their library'
      using errcode = '42501';
  end if;

  perform 1 from public.households household
  where household.id = target_household
  for update;
  if not exists (
    select 1
    from public.household_members mine
    join public.household_members recipient
      on recipient.household_id = mine.household_id
     and recipient.user_id = p_member
    join public.household_works household_work
      on household_work.household_id = mine.household_id
     and household_work.work_id = p_work
     and household_work.removed_at is null
    where mine.user_id = caller
      and recipient.allow_member_library_adds
      and mine.household_id = target_household
  ) then
    raise exception 'permission, membership, or household work changed during update'
      using errcode = 'PT409';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('reverie:book-owner:' || p_member::text, 0)
  );
  select book.id into created_book
  from public.books book
  where book.owner_id = p_member
    and book.corpus_work_id = p_work
    and book.removed_at is null
  order by book.added_at, book.id
  limit 1;
  if created_book is not null then return created_book; end if;

  insert into public.books (
    owner_id, corpus_work_id, title, author_last, authors_display,
    series, position, series_count, series_user_chosen, series_claim, status, pages,
    pub_y, pub_m, pub_d,
    cover_url, cover_source, cover_source_url, cover_color, cover_user_chosen,
    genre, subgenre, subgenres, genres, isbn,
    ownership, borrowed, wishlist, read_status
  )
  select
    p_member, work.id, work.title, nullif(work.author_text, ''), nullif(work.author_text, ''),
    work.series, work.position, work.series_count, false,
    jsonb_build_object(
      'origin', 'corpus', 'source', 'delegated_add', 'sourceRef', work.id, 'at', now()
    ),
    work.status, work.pages,
    work.pub_y, work.pub_m, work.pub_d,
    work.cover_url, work.cover_source, work.cover_source_url, work.cover_color, false,
    coalesce(work.genre, ''), work.subgenre, work.subgenres, work.genres, work.isbns[1],
    'unowned', false, false, 'unset'
  from public.works work
  where work.id = p_work
  returning id into created_book;

  if created_book is null then
    raise exception 'corpus work not found' using errcode = 'P0002';
  end if;
  return created_book;
end;
$$;

revoke all on function public.add_corpus_work_to_member_library(uuid, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.add_corpus_work_to_member_library(uuid, uuid) to authenticated;
