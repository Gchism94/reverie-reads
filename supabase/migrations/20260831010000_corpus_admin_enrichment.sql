-- Corpus-admin enrichment and objective-metadata preservation.
--
-- A personal book is not the durable owner of shared bibliographic data. Corpus enrichment writes
-- to `works`, and durable shared covers use `w/{work}/{revision}` storage paths. Personal removal,
-- merge deletion, and account deletion preserve any still-missing objective fields before the
-- personal row disappears. Reader state and private annotations are deliberately excluded.

create table public.corpus_admins (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  granted_at timestamptz not null default now(),
  granted_by uuid references public.profiles (id) on delete set null
);

alter table public.corpus_admins enable row level security;
revoke all on table public.corpus_admins from public, anon, authenticated;
grant all on table public.corpus_admins to service_role;

create function public.is_corpus_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.corpus_admins a where a.user_id = (select auth.uid())
  );
$$;

revoke all on function public.is_corpus_admin()
  from public, anon, authenticated, service_role;
grant execute on function public.is_corpus_admin() to authenticated;

alter table public.works
  add column publisher text,
  add column language text,
  add column description text,
  add column edition_ids text[] not null default '{}',
  add column metadata_provenance jsonb not null default '{}'::jsonb,
  add column enrichment_confidence text
    check (enrichment_confidence in ('high', 'medium', 'low', 'none')),
  add column enriched_at timestamptz,
  add constraint works_metadata_provenance_object_check
    check (jsonb_typeof(metadata_provenance) = 'object');

-- The membership foundation originally stripped punctuation but silently discarded ISBN-10 even
-- though personal imports still carry it. Normalize a valid ISBN-10 to its ISBN-13 equivalent so
-- removal preservation and every later corpus writer retain the edition identity.
create function public.canonical_library_isbn(p_isbn text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  cleaned text := upper(regexp_replace(coalesce(p_isbn, ''), '[^0-9Xx]', '', 'g'));
  checksum int := 0;
  body text;
begin
  if cleaned ~ '^[0-9]{13}$' then return cleaned; end if;
  if cleaned !~ '^[0-9]{9}[0-9X]$' then return null; end if;
  for i in 1..9 loop
    checksum := checksum + substring(cleaned from i for 1)::int * (11 - i);
  end loop;
  checksum := checksum + case right(cleaned, 1) when 'X' then 10 else right(cleaned, 1)::int end;
  if checksum % 11 <> 0 then return null; end if;
  body := '978' || left(cleaned, 9);
  checksum := 0;
  for i in 1..12 loop
    checksum := checksum + substring(body from i for 1)::int * case when i % 2 = 0 then 3 else 1 end;
  end loop;
  return body || ((10 - checksum % 10) % 10)::text;
end;
$$;

revoke all on function public.canonical_library_isbn(text)
  from public, anon, authenticated, service_role;

create or replace function public.canonical_library_isbns(p_isbns text[])
returns text[]
language sql
immutable
set search_path = ''
as $$
  select coalesce(array_agg(isbn order by isbn), '{}')
  from (
    select distinct public.canonical_library_isbn(value) as isbn
    from unnest(coalesce(p_isbns, '{}')) value
  ) normalized
  where isbn is not null;
$$;

revoke all on function public.canonical_library_isbns(text[])
  from public, anon, authenticated, service_role;

-- Exact durable path emitted by the covers Edge Function for a corpus-scoped ingest. The project
-- origin comes from the gateway-verified JWT issuer, never a caller-controlled Host header.
create function public.hosted_corpus_cover_object_name(p_url text, p_work uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  claims jsonb;
  issuer text;
  canonical_origin text;
  url_origin text;
  object_name text;
begin
  if nullif(trim(p_url), '') is null or p_work is null then return null; end if;
  begin
    claims := coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb;
  exception when others then
    return null;
  end;
  issuer := coalesce(claims ->> 'iss', '');
  if issuer !~* '^https?://[^/?#]+/auth/v1/?$' then return null; end if;
  canonical_origin := lower(regexp_replace(issuer, '/auth/v1/?$', '', 'i'));
  url_origin := lower(substring(trim(p_url) from '(?i)^(https?://[^/?#]+)'));
  object_name := substring(
    trim(p_url) from '(?i)^https?://[^/?#]+/storage/v1/object/public/covers/(w/[^?#]+)$'
  );
  if url_origin is null or url_origin <> canonical_origin or object_name is null then return null; end if;
  if canonical_origin !~* '^https://' and
    canonical_origin !~* '^http://(localhost|127[.]0[.]0[.]1)(:[0-9]+)?$' then
    return null;
  end if;
  if object_name !~ (
    '^w/' || p_work::text || '/[a-z0-9]+(_t)?[.](webp|jpg|png|gif)$'
  ) then
    return null;
  end if;
  if not exists (
    select 1 from storage.objects o
    where o.bucket_id = 'covers' and o.name = object_name
  ) then
    return null;
  end if;
  return object_name;
end;
$$;

revoke all on function public.hosted_corpus_cover_object_name(text, uuid)
  from public, anon, authenticated, service_role;

-- Google Books covers remain display-only. Accept only the two hosts actually emitted by the
-- Google Books API and its image mirror; a caller-controlled lookalike must never become a shared
-- hotlink merely because its hostname contains "books.google".
create function public.google_books_display_cover_url_is_valid(p_url text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(
    trim(p_url) ~* '^https://(books[.]google[.]com|books[.]googleusercontent[.]com)(:443)?/books/content([/?#]|$)',
    false
  );
$$;

revoke all on function public.google_books_display_cover_url_is_valid(text)
  from public, anon, authenticated, service_role;

-- Fill objective gaps in one work. Existing values win: an automated sweep completes blanks but
-- never silently replaces curated metadata. Arrays are additive and canonical ISBN collisions are
-- refused field-by-field rather than attaching an edition to two works.
create function public.complete_corpus_work_metadata(
  p_work uuid,
  p_patch jsonb,
  p_checked_at timestamptz default now()
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  allowed_keys constant text[] := array[
    'contributors', 'authorText', 'series', 'position', 'pages', 'pubY', 'pubM', 'pubD',
    'publisher', 'language', 'description', 'isbns', 'genre', 'genres', 'coverUrl',
    'coverSource', 'coverSourceUrl', 'coverColor', 'externalWorkId', 'editionId',
    'provenance', 'confidence'
  ];
  before_value jsonb;
  after_value jsonb;
  applied_provenance jsonb := '{}'::jsonb;
  candidate_isbns text[] := array[]::text[];
  safe_isbns text[] := array[]::text[];
  candidate_editions text[] := array[]::text[];
  safe_cover text;
  safe_cover_option jsonb;
  replace_cover boolean := false;
  requested_cover_source text := nullif(trim(p_patch ->> 'coverSource'), '');
  requested_cover_url text := nullif(trim(p_patch ->> 'coverUrl'), '');
begin
  if caller is null or not public.is_corpus_admin() then
    raise exception 'corpus administrator required' using errcode = '42501';
  end if;
  if jsonb_typeof(coalesce(p_patch, '{}'::jsonb)) <> 'object' then
    raise exception 'metadata patch must be an object' using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_object_keys(coalesce(p_patch, '{}'::jsonb)) key
    where key <> all(allowed_keys)
  ) then
    raise exception 'metadata patch contains an unsupported field' using errcode = '22023';
  end if;
  if p_patch ? 'contributors' and jsonb_typeof(p_patch -> 'contributors') <> 'array' then
    raise exception 'contributors must be an array' using errcode = '22023';
  end if;
  if p_patch ? 'genres' and jsonb_typeof(p_patch -> 'genres') <> 'array' then
    raise exception 'genres must be an array' using errcode = '22023';
  end if;
  if p_patch ? 'isbns' and jsonb_typeof(p_patch -> 'isbns') <> 'array' then
    raise exception 'isbns must be an array' using errcode = '22023';
  end if;
  if p_patch ? 'provenance' and jsonb_typeof(p_patch -> 'provenance') <> 'object' then
    raise exception 'provenance must be an object' using errcode = '22023';
  end if;

  if p_patch ? 'isbns' then
    select public.canonical_library_isbns(array_agg(value)) into candidate_isbns
    from jsonb_array_elements_text(p_patch -> 'isbns') value;
  end if;
  perform public.lock_library_isbns(candidate_isbns);
  select coalesce(array_agg(isbn order by isbn), '{}') into safe_isbns
  from unnest(candidate_isbns) isbn
  where not exists (
    select 1 from public.works other
    where other.id <> p_work and isbn = any(other.isbns)
  );

  if nullif(trim(p_patch ->> 'editionId'), '') is not null then
    candidate_editions := array[trim(p_patch ->> 'editionId')];
  end if;

  if requested_cover_url is not null then
    if requested_cover_source = 'google'
      and public.google_books_display_cover_url_is_valid(requested_cover_url) then
      safe_cover := requested_cover_url;
    elsif public.hosted_corpus_cover_object_name(requested_cover_url, p_work) is not null then
      safe_cover := requested_cover_url;
    end if;
  end if;
  if safe_cover is not null then
    safe_cover_option := jsonb_strip_nulls(jsonb_build_object(
      'url', safe_cover,
      'source', requested_cover_source,
      'sourceUrl', nullif(trim(p_patch ->> 'coverSourceUrl'), '')
    ));
    if not public.corpus_cover_option_is_valid(safe_cover_option) then
      safe_cover := null;
      safe_cover_option := null;
    end if;
  end if;

  select to_jsonb(w) into before_value from public.works w where w.id = p_work for update;
  if before_value is null then
    raise exception 'corpus work not found' using errcode = 'P0002';
  end if;
  -- A shared cover may predate corpus-owned storage and still point at a reader-owned `u/`
  -- object or an upstream hotlink. The admin sweep may replace only that exact existing image
  -- with its newly ingested `w/` copy; it still cannot choose different artwork over a curated
  -- corpus cover.
  replace_cover := safe_cover is not null and (
    before_value ->> 'cover_url' is null
    or (
      nullif(trim(p_patch ->> 'coverSourceUrl'), '') = before_value ->> 'cover_url'
      and safe_cover is distinct from before_value ->> 'cover_url'
    )
  );
  -- Provenance is fill-only too. A rejected replacement must not relabel an existing fact with
  -- the source that failed to win, and an earlier accepted source is never overwritten.
  select coalesce(jsonb_object_agg(prov.key, prov.value), '{}'::jsonb)
  into applied_provenance
  from jsonb_each(coalesce(p_patch -> 'provenance', '{}'::jsonb)) prov
  where not (coalesce(before_value -> 'metadata_provenance', '{}'::jsonb) ? prov.key)
    and case prov.key
      when 'authors' then before_value -> 'contributors' = '[]'::jsonb
        and jsonb_array_length(coalesce(p_patch -> 'contributors', '[]'::jsonb)) > 0
      when 'series' then before_value ->> 'series' is null
        and nullif(trim(p_patch ->> 'series'), '') is not null
      when 'seriesPosition' then before_value ->> 'position' is null and p_patch ? 'position'
      when 'pageCount' then before_value ->> 'pages' is null and p_patch ? 'pages'
      when 'pubY' then before_value ->> 'pub_y' is null and p_patch ? 'pubY'
      when 'pubM' then before_value ->> 'pub_m' is null and p_patch ? 'pubM'
      when 'pubD' then before_value ->> 'pub_d' is null and p_patch ? 'pubD'
      when 'publisher' then before_value ->> 'publisher' is null
        and nullif(trim(p_patch ->> 'publisher'), '') is not null
      when 'language' then before_value ->> 'language' is null
        and nullif(trim(p_patch ->> 'language'), '') is not null
      when 'description' then before_value ->> 'description' is null
        and nullif(trim(p_patch ->> 'description'), '') is not null
      when 'genre' then before_value ->> 'genre' is null
        and nullif(trim(p_patch ->> 'genre'), '') is not null
      when 'cover' then replace_cover
      when 'workId' then before_value ->> 'work_id' is null
        and nullif(trim(p_patch ->> 'externalWorkId'), '') is not null
      when 'editionId' then nullif(trim(p_patch ->> 'editionId'), '') is not null
        and not (before_value -> 'edition_ids' ? trim(p_patch ->> 'editionId'))
      when 'isbn' then exists (
        select 1 from unnest(safe_isbns) candidate
        where not (coalesce(before_value -> 'isbns', '[]'::jsonb) ? candidate)
      )
      when 'isbn10' then exists (
        select 1 from unnest(safe_isbns) candidate
        where not (coalesce(before_value -> 'isbns', '[]'::jsonb) ? candidate)
      )
      when 'isbn13' then exists (
        select 1 from unnest(safe_isbns) candidate
        where not (coalesce(before_value -> 'isbns', '[]'::jsonb) ? candidate)
      )
      else false
    end;

  update public.works w
  set contributors = case
        when w.contributors = '[]'::jsonb
          and jsonb_array_length(coalesce(p_patch -> 'contributors', '[]'::jsonb)) > 0
          then p_patch -> 'contributors' else w.contributors end,
      author_text = case when nullif(trim(w.author_text), '') is null
        then coalesce(nullif(trim(p_patch ->> 'authorText'), ''), w.author_text)
        else w.author_text end,
      series = coalesce(w.series, nullif(trim(p_patch ->> 'series'), '')),
      position = coalesce(w.position, nullif(trim(p_patch ->> 'position'), '')::numeric),
      pages = coalesce(w.pages, nullif(trim(p_patch ->> 'pages'), '')::int),
      pub_y = coalesce(w.pub_y, nullif(trim(p_patch ->> 'pubY'), '')::int),
      pub_m = coalesce(w.pub_m, nullif(trim(p_patch ->> 'pubM'), '')::int),
      pub_d = coalesce(w.pub_d, nullif(trim(p_patch ->> 'pubD'), '')::int),
      publisher = coalesce(w.publisher, nullif(trim(p_patch ->> 'publisher'), '')),
      language = coalesce(w.language, nullif(trim(p_patch ->> 'language'), '')),
      description = coalesce(w.description, nullif(trim(p_patch ->> 'description'), '')),
      isbns = array(
        select distinct value from unnest(w.isbns || safe_isbns) value order by value
      ),
      genre = coalesce(w.genre, nullif(lower(trim(p_patch ->> 'genre')), '')),
      genres = array(
        select distinct lower(trim(value))
        from unnest(
          w.genres || coalesce(array(
            select value from jsonb_array_elements_text(coalesce(p_patch -> 'genres', '[]'::jsonb)) value
          ), '{}')
        ) value
        where trim(value) <> '' order by lower(trim(value))
      ),
      cover_url = case when replace_cover then safe_cover else w.cover_url end,
      cover_source = case when replace_cover then requested_cover_source else w.cover_source end,
      cover_source_url = case when replace_cover
        then nullif(trim(p_patch ->> 'coverSourceUrl'), '') else w.cover_source_url end,
      cover_color = case when replace_cover
        then nullif(trim(p_patch ->> 'coverColor'), '') else w.cover_color end,
      cover_options = case
        when safe_cover is null then w.cover_options
        when exists (
          select 1 from jsonb_array_elements(w.cover_options) option
          where option ->> 'url' = safe_cover
        ) then w.cover_options
        else w.cover_options || jsonb_build_array(safe_cover_option)
      end,
      work_id = coalesce(w.work_id, nullif(trim(p_patch ->> 'externalWorkId'), '')),
      edition_ids = array(
        select distinct value from unnest(w.edition_ids || candidate_editions) value
        where trim(value) <> '' order by value
      ),
      metadata_provenance = w.metadata_provenance || applied_provenance,
      enrichment_confidence = coalesce(
        w.enrichment_confidence,
        case when p_patch ->> 'confidence' in ('high', 'medium', 'low', 'none')
          then p_patch ->> 'confidence' end
      ),
      -- A null timestamp is reserved for a cover-rescue-only write. Relocating a known image must
      -- not postpone the still-needed metadata check when an upstream provider is unavailable.
      enriched_at = coalesce(p_checked_at, w.enriched_at)
  where w.id = p_work;

  select to_jsonb(w) into after_value from public.works w where w.id = p_work;
  if after_value is distinct from before_value then
    insert into public.work_metadata_edits (work_id, editor_id, previous_value, next_value)
    values (p_work, caller, before_value, after_value);
  end if;
  return p_work;
end;
$$;

revoke all on function public.complete_corpus_work_metadata(uuid, jsonb, timestamptz)
  from public, anon, authenticated, service_role;
grant execute on function public.complete_corpus_work_metadata(uuid, jsonb, timestamptz)
  to authenticated;

-- Canonical corpus trope associations. Admin promotion is immediate and additive; a personal or
-- household removal does not retract the shared fact. A later three-vote mechanism can call the
-- same internal promotion function with source_scope='vote' without changing this data model.
create table public.work_tropes (
  work_id uuid not null references public.works (id) on delete restrict,
  trope_id uuid not null references public.tropes (id) on delete restrict,
  added_by uuid references public.profiles (id) on delete set null,
  source_scope text not null
    check (source_scope in ('personal', 'household', 'direct', 'vote')),
  added_at timestamptz not null default now(),
  primary key (work_id, trope_id)
);

create index work_tropes_trope_idx on public.work_tropes (trope_id, work_id);
alter table public.work_tropes enable row level security;
create policy "work_tropes: read all" on public.work_tropes
  for select to authenticated using (true);
grant select on public.work_tropes to authenticated;
grant all on public.work_tropes to service_role;

create function public.promote_corpus_work_trope(
  p_work uuid,
  p_trope uuid,
  p_admin uuid,
  p_source_scope text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  source_trope public.tropes%rowtype;
  canonical_trope uuid;
begin
  if not exists (select 1 from public.corpus_admins a where a.user_id = p_admin) then
    raise exception 'corpus administrator required' using errcode = '42501';
  end if;
  if p_source_scope not in ('personal', 'household', 'direct', 'vote') then
    raise exception 'invalid corpus trope source' using errcode = '22023';
  end if;
  perform 1 from public.works w where w.id = p_work for update;
  if not found then raise exception 'corpus work not found' using errcode = 'P0002'; end if;
  select * into source_trope from public.tropes t where t.id = p_trope;
  if not found then raise exception 'trope not found' using errcode = 'P0002'; end if;
  if source_trope.owner_id is not null and source_trope.owner_id <> p_admin then
    raise exception 'personal trope is not owned by the administrator' using errcode = '42501';
  end if;

  if source_trope.owner_id is null then
    canonical_trope := source_trope.id;
  elsif source_trope.canonical_id is not null then
    select t.id into canonical_trope from public.tropes t
    where t.id = source_trope.canonical_id and t.owner_id is null;
  end if;
  if canonical_trope is null then
    select t.id into canonical_trope from public.tropes t
    where t.owner_id is null and lower(trim(t.name)) = lower(trim(source_trope.name))
    order by t.id limit 1;
  end if;
  if canonical_trope is null then
    insert into public.tropes (owner_id, name, aliases, facet, genre_affinity)
    values (
      null,
      trim(source_trope.name),
      coalesce(source_trope.aliases, '{}'),
      source_trope.facet,
      coalesce(source_trope.genre_affinity, '{}')
    )
    on conflict do nothing
    returning id into canonical_trope;
    if canonical_trope is null then
      select t.id into canonical_trope from public.tropes t
      where t.owner_id is null and lower(trim(t.name)) = lower(trim(source_trope.name))
      order by t.id limit 1;
    end if;
  end if;

  insert into public.work_tropes (work_id, trope_id, added_by, source_scope)
  values (p_work, canonical_trope, p_admin, p_source_scope)
  on conflict (work_id, trope_id) do nothing;
  return canonical_trope;
end;
$$;

revoke all on function public.promote_corpus_work_trope(uuid, uuid, uuid, text)
  from public, anon, authenticated, service_role;

create function public.promote_corpus_work_trope_by_name(
  p_work uuid,
  p_name text,
  p_facet text,
  p_admin uuid,
  p_source_scope text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  canonical_trope_id uuid;
begin
  if not exists (select 1 from public.corpus_admins a where a.user_id = p_admin) then
    raise exception 'corpus administrator required' using errcode = '42501';
  end if;
  if nullif(trim(p_name), '') is null then
    raise exception 'trope name is required' using errcode = '22023';
  end if;
  if p_facet not in ('dynamics', 'plot', 'characters', 'setting_world', 'vibe') then
    raise exception 'invalid trope facet' using errcode = '22023';
  end if;
  if p_source_scope not in ('personal', 'household', 'direct', 'vote') then
    raise exception 'invalid corpus trope source' using errcode = '22023';
  end if;
  -- All promotion paths lock work first and vocabulary second. Keeping that order avoids a
  -- direct-add/cross-library deadlock when two administrators coin the same canonical name.
  perform 1 from public.works w where w.id = p_work for update;
  if not found then raise exception 'corpus work not found' using errcode = 'P0002'; end if;
  select t.id into canonical_trope_id from public.tropes t
  where t.owner_id is null and lower(trim(t.name)) = lower(trim(p_name))
  order by t.id limit 1;
  if canonical_trope_id is null then
    insert into public.tropes (owner_id, name, facet)
    values (null, trim(p_name), p_facet)
    on conflict do nothing
    returning id into canonical_trope_id;
    if canonical_trope_id is null then
      select t.id into canonical_trope_id from public.tropes t
      where t.owner_id is null and lower(trim(t.name)) = lower(trim(p_name))
      order by t.id limit 1;
    end if;
  end if;
  insert into public.work_tropes (work_id, trope_id, added_by, source_scope)
  values (p_work, canonical_trope_id, p_admin, p_source_scope)
  on conflict (work_id, trope_id) do nothing;
  return canonical_trope_id;
end;
$$;

revoke all on function public.promote_corpus_work_trope_by_name(uuid, text, text, uuid, text)
  from public, anon, authenticated, service_role;

create function public.admin_add_corpus_work_trope(
  p_work uuid,
  p_name text,
  p_facet text default 'vibe'
)
returns uuid
language sql
security definer
set search_path = ''
as $$
  select public.promote_corpus_work_trope_by_name(
    p_work, p_name, p_facet, (select auth.uid()), 'direct'
  );
$$;

revoke all on function public.admin_add_corpus_work_trope(uuid, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.admin_add_corpus_work_trope(uuid, text, text)
  to authenticated;

create function public.promote_admin_personal_trope_to_corpus()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  target_work uuid;
begin
  if caller is null or caller <> new.owner_id or not public.is_corpus_admin() then return new; end if;
  select b.corpus_work_id into target_work
  from public.books b
  where b.id = new.book_id and b.owner_id = caller and b.removed_at is null
    and public.book_corpus_binding_is_unambiguous(
      b.corpus_work_id,
      b.title,
      coalesce(nullif(b.authors_display, ''), trim(concat_ws(' ', b.author_first, b.author_last))),
      b.isbn
    );
  if target_work is not null then
    perform public.promote_corpus_work_trope(target_work, new.trope_id, caller, 'personal');
  end if;
  return new;
end;
$$;

revoke all on function public.promote_admin_personal_trope_to_corpus()
  from public, anon, authenticated, service_role;

create trigger book_tropes_promote_admin_to_corpus
  after insert or update of trope_id on public.book_tropes
  for each row execute function public.promote_admin_personal_trope_to_corpus();

create function public.promote_admin_household_tropes_to_corpus()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  item jsonb;
  source_trope uuid;
  item_name text;
begin
  if caller is null or caller <> new.updated_by or not public.is_corpus_admin() then return new; end if;
  for item in select value from jsonb_array_elements(coalesce(new.tropes, '[]'::jsonb)) value
  loop
    source_trope := null;
    if jsonb_typeof(item) = 'object' then
      begin source_trope := nullif(item ->> 'id', '')::uuid;
      exception when invalid_text_representation then source_trope := null; end;
      item_name := nullif(trim(item ->> 'name'), '');
      if source_trope is not null and exists (
        select 1 from public.tropes t where t.id = source_trope
      ) then
        perform public.promote_corpus_work_trope(new.work_id, source_trope, caller, 'household');
      elsif item_name is not null then
        perform public.promote_corpus_work_trope_by_name(
          new.work_id, item_name, 'vibe', caller, 'household'
        );
      end if;
    end if;
  end loop;
  return new;
end;
$$;

revoke all on function public.promote_admin_household_tropes_to_corpus()
  from public, anon, authenticated, service_role;

create trigger household_tropes_promote_admin_to_corpus
  after insert or update of tropes on public.household_work_enrichment
  for each row execute function public.promote_admin_household_tropes_to_corpus();

create function public.corpus_and_household_tropes(p_work uuid, p_household_tropes jsonb)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(combined.item order by combined.sort_name), '[]'::jsonb)
  from (
    select value as item, lower(coalesce(value ->> 'name', '')) as sort_name
    from jsonb_array_elements(coalesce(p_household_tropes, '[]'::jsonb)) value
    union all
    select jsonb_build_object(
      'id', t.id, 'name', t.name, 'emphasis', 'present', 'scope', 'corpus'
    ), lower(t.name)
    from public.work_tropes wt
    join public.tropes t on t.id = wt.trope_id and t.owner_id is null
    where wt.work_id = p_work
      and not exists (
        select 1 from jsonb_array_elements(coalesce(p_household_tropes, '[]'::jsonb)) existing
        where lower(trim(existing ->> 'name')) = lower(trim(t.name))
      )
  ) combined;
$$;

revoke all on function public.corpus_and_household_tropes(uuid, jsonb)
  from public, anon, authenticated, service_role;

-- Keep the established household RPC signature while composing globally accepted corpus tropes
-- with household-only annotations. Existing household emphasis wins on a name collision.
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
    w.id,
    w.title,
    w.author_text,
    w.cover_url,
    w.cover_color,
    w.cover_options,
    w.series,
    w.position,
    w.series_count,
    w.status,
    w.genre,
    w.genres,
    w.subgenre,
    w.subgenres,
    w.isbns,
    w.pub_y,
    w.pub_m,
    w.pub_d,
    coalesce(copies.owners, '[]'::jsonb),
    coalesce(e.tags, '{}'),
    public.corpus_and_household_tropes(w.id, e.tropes),
    hw.added_at
  from public.household_members mine
  join public.household_works hw on hw.household_id = mine.household_id
    and hw.removed_at is null
  join public.works w on w.id = hw.work_id
  left join public.household_work_enrichment e
    on e.household_id = hw.household_id and e.work_id = hw.work_id
  left join lateral (
    select jsonb_agg(
      jsonb_build_object(
        'userId', member.user_id,
        'bookId', b.id,
        'displayName', p.display_name,
        'ownership', b.ownership,
        'borrowed', b.borrowed,
        'ownedPhysical', b.owned_physical,
        'ownedEbook', b.owned_ebook,
        'ownedAudiobook', b.owned_audiobook,
        'format', b.format,
        'shared', exists (
          select 1 from public.household_book_shares s
          where s.book_id = b.id and s.household_id = hw.household_id
            and s.removed_at is null
        )
      ) order by p.display_name nulls last, member.user_id, b.id
    ) as owners
    from public.household_members member
    join public.books b on b.owner_id = member.user_id
      and b.corpus_work_id = hw.work_id
      and b.removed_at is null
      and (
        b.ownership = 'owned'
        or exists (
          select 1 from public.household_book_shares admitted_share
          where admitted_share.book_id = b.id
            and admitted_share.household_id = hw.household_id
            and admitted_share.work_id = hw.work_id
            and admitted_share.removed_at is null
        )
      )
    join public.profiles p on p.id = member.user_id
    where member.household_id = hw.household_id
  ) copies on true
  where mine.user_id = (select auth.uid())
  order by w.title, w.id;
$$;

-- Last-chance preservation for soft removal, duplicate merge deletion, and account-cascade
-- deletion. It is fill-only and objective-only; personal tags, tropes, moods, ratings, reading
-- state, ownership, wishlist, plans, notes, favourites, and lists never cross this boundary.
create function public.preserve_personal_book_objective_metadata(p_book uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  b public.books%rowtype;
  author_name text;
  candidate_contributors jsonb;
  normalized_isbn text;
  safe_isbn text;
  safe_cover text;
  safe_cover_option jsonb;
begin
  select * into b from public.books where id = p_book for update;
  if not found or b.corpus_work_id is null then return; end if;
  author_name := coalesce(
    nullif(b.authors_display, ''), trim(concat_ws(' ', b.author_first, b.author_last))
  );
  if not public.book_corpus_binding_is_unambiguous(
    b.corpus_work_id, b.title, author_name, b.isbn
  ) then return; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'name', a.name, 'role', ba.role, 'position', ba.position
  ) order by ba.position, a.name, a.id), '[]'::jsonb)
  into candidate_contributors
  from public.book_authors ba
  join public.authors a on a.id = ba.author_id and a.owner_id = b.owner_id
  where ba.book_id = b.id and ba.owner_id = b.owner_id;
  if candidate_contributors = '[]'::jsonb and author_name <> '' then
    candidate_contributors := jsonb_build_array(jsonb_build_object(
      'name', author_name, 'role', 'author', 'position', 0
    ));
  end if;

  select candidate into normalized_isbn
  from unnest(public.canonical_library_isbns(array[b.isbn])) candidate
  order by candidate limit 1;
  if normalized_isbn is not null then
    perform public.lock_library_isbns(array[normalized_isbn]);
    if not exists (
      select 1 from public.works other
      where other.id <> b.corpus_work_id and normalized_isbn = any(other.isbns)
    ) then safe_isbn := normalized_isbn; end if;
  end if;

  safe_cover_option := jsonb_strip_nulls(jsonb_build_object(
    'url', b.cover_url, 'source', b.cover_source, 'sourceUrl', b.cover_source_url
  ));
  if (
    public.hosted_book_cover_object_name(b.cover_url, b.owner_id, b.id) is not null
    or (
      b.cover_source = 'google'
      and public.google_books_display_cover_url_is_valid(b.cover_url)
    )
  )
    and public.corpus_cover_option_is_valid(safe_cover_option) then
    safe_cover := b.cover_url;
  else
    safe_cover_option := null;
  end if;

  update public.works w
  set created_by = case
        when w.created_by is not null and not exists (
          select 1 from public.profiles creator where creator.id = w.created_by
        ) then null
        else w.created_by
      end,
      contributors = case when w.contributors = '[]'::jsonb
        and candidate_contributors <> '[]'::jsonb then candidate_contributors
        else w.contributors end,
      author_text = case when nullif(trim(w.author_text), '') is null then author_name else w.author_text end,
      series = coalesce(w.series, b.series),
      position = coalesce(w.position, b.position),
      series_count = coalesce(w.series_count, b.series_count),
      status = coalesce(w.status, b.status),
      pages = coalesce(w.pages, b.pages),
      pub_y = coalesce(w.pub_y, b.pub_y),
      pub_m = coalesce(w.pub_m, b.pub_m),
      pub_d = coalesce(w.pub_d, b.pub_d),
      genre = coalesce(nullif(trim(w.genre), ''), nullif(lower(trim(b.genre)), '')),
      subgenre = coalesce(nullif(trim(w.subgenre), ''), nullif(lower(trim(b.subgenre)), '')),
      genres = array(
        select distinct lower(trim(value)) from unnest(w.genres || coalesce(b.genres, '{}')) value
        where trim(value) <> '' order by lower(trim(value))
      ),
      subgenres = array(
        select distinct lower(trim(value)) from unnest(w.subgenres || coalesce(b.subgenres, '{}')) value
        where trim(value) <> '' order by lower(trim(value))
      ),
      isbns = case when safe_isbn is null then w.isbns else array(
        select distinct value from unnest(w.isbns || array[safe_isbn]) value order by value
      ) end,
      cover_url = coalesce(w.cover_url, safe_cover),
      cover_source = case when w.cover_url is null and safe_cover is not null then b.cover_source else w.cover_source end,
      cover_source_url = case when w.cover_url is null and safe_cover is not null then b.cover_source_url else w.cover_source_url end,
      cover_color = case when w.cover_url is null and safe_cover is not null then b.cover_color else w.cover_color end,
      cover_options = case
        when safe_cover is null then w.cover_options
        when exists (
          select 1 from jsonb_array_elements(w.cover_options) option where option ->> 'url' = safe_cover
        ) then w.cover_options
        else w.cover_options || jsonb_build_array(safe_cover_option)
      end
  where w.id = b.corpus_work_id;
end;
$$;

revoke all on function public.preserve_personal_book_objective_metadata(uuid)
  from public, anon, authenticated, service_role;

-- Before the corpus sweep asks third-party sources for a possibly different edition, preserve the
-- signed-in administrator's exact selected personal covers. This is intentionally owner-scoped:
-- corpus administration is not permission to inspect another reader's library. The shared helper
-- accepts only a real object at u/{caller}/{book}/... behind the JWT issuer, or the explicit Google
-- display-only exception. The subsequent sweep relocates every u/ object to durable w/ storage.
create function public.admin_recover_personal_corpus_covers()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  source_book record;
  before_cover text;
  after_cover text;
  before_options int;
  after_options int;
  scanned int := 0;
  recovered_covers int := 0;
  recovered_options int := 0;
begin
  if caller is null or not public.is_corpus_admin() then
    raise exception 'corpus administrator required' using errcode = '42501';
  end if;

  for source_book in
    select b.id, b.corpus_work_id
    from public.books b
    where b.owner_id = caller and b.removed_at is null
      and nullif(trim(b.cover_url), '') is not null
    order by b.id
  loop
    select w.cover_url, jsonb_array_length(w.cover_options)
      into before_cover, before_options
    from public.works w where w.id = source_book.corpus_work_id;

    perform public.preserve_personal_book_objective_metadata(source_book.id);

    select w.cover_url, jsonb_array_length(w.cover_options)
      into after_cover, after_options
    from public.works w where w.id = source_book.corpus_work_id;
    scanned := scanned + 1;
    if before_cover is null and after_cover is not null then
      recovered_covers := recovered_covers + 1;
    end if;
    if coalesce(after_options, 0) > coalesce(before_options, 0) then
      recovered_options := recovered_options + 1;
    end if;
  end loop;

  return jsonb_build_object(
    'scanned', scanned,
    'recoveredCovers', recovered_covers,
    'recoveredOptions', recovered_options
  );
end;
$$;

revoke all on function public.admin_recover_personal_corpus_covers()
  from public, anon, authenticated, service_role;
grant execute on function public.admin_recover_personal_corpus_covers()
  to authenticated;

create function public.preserve_personal_book_before_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.preserve_personal_book_objective_metadata(old.id);
  return old;
end;
$$;

revoke all on function public.preserve_personal_book_before_delete()
  from public, anon, authenticated, service_role;

create trigger books_preserve_objective_metadata_before_delete
  before delete on public.books
  for each row execute function public.preserve_personal_book_before_delete();

-- `auth.users` deletion fans out through independent profile, book, author, and book-author
-- cascades whose sibling order is not defined. Preserve while the complete contributor graph still
-- exists, before any of those cascades begin; the per-book trigger remains the direct-delete and
-- merge boundary and its later account-cascade invocation is harmless because writes are fill-only.
create function public.preserve_account_books_before_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  source_book uuid;
begin
  for source_book in
    select b.id from public.books b where b.owner_id = old.id order by b.id
  loop
    perform public.preserve_personal_book_objective_metadata(source_book);
  end loop;
  return old;
end;
$$;

revoke all on function public.preserve_account_books_before_delete()
  from public, anon, authenticated, service_role;

create trigger auth_users_preserve_account_books_before_delete
  before delete on auth.users
  for each row execute function public.preserve_account_books_before_delete();

create or replace function public.remove_personal_book(p_book uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  removed uuid;
begin
  if not exists (
    select 1 from public.books where id = p_book and owner_id = caller and removed_at is null
  ) then
    raise exception 'active personal book not found' using errcode = 'P0002';
  end if;
  perform public.preserve_personal_book_objective_metadata(p_book);
  update public.books
  set removed_at = now(), removed_by = caller
  where id = p_book and owner_id = caller and removed_at is null
  returning id into removed;
  if removed is null then
    raise exception 'active personal book changed during removal' using errcode = '40001';
  end if;
  return removed;
end;
$$;

revoke all on function public.remove_personal_book(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.remove_personal_book(uuid) to authenticated;

-- Generic atomic operator for a reviewed household reconciliation. The target-specific CSV and
-- account ids stay outside schema; the RPC receives only exact, pre-reviewed work membership sets.
-- It is service-role-only because it intentionally changes more than one reader's personal scope.
create function public.reconcile_household_library_memberships(
  p_household uuid,
  p_personal_assignments jsonb,
  p_household_work_ids uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  assignment jsonb;
  account_id uuid;
  desired_personal uuid[];
  desired_household uuid[] := array(
    select distinct work_id
    from unnest(coalesce(p_household_work_ids, '{}')) as desired(work_id)
    order by work_id
  );
  target_work uuid;
  restore_book uuid;
  archive_book uuid;
  personal_created int := 0;
  personal_restored int := 0;
  personal_archived int := 0;
  household_created int := 0;
  household_restored int := 0;
  household_archived int := 0;
begin
  if jsonb_typeof(coalesce(p_personal_assignments, '[]'::jsonb)) <> 'array' then
    raise exception 'personal assignments must be an array' using errcode = '22023';
  end if;
  if exists (
    select 1 from unnest(desired_household) as desired(work_id)
    where not exists (select 1 from public.works w where w.id = desired.work_id)
  ) then
    raise exception 'household assignment references an unknown corpus work' using errcode = '23503';
  end if;

  perform 1 from public.households h where h.id = p_household for update;
  if not found then raise exception 'household not found' using errcode = 'P0002'; end if;

  for assignment in select value from jsonb_array_elements(p_personal_assignments) value
  loop
    if jsonb_typeof(assignment) <> 'object'
      or exists (
        select 1 from jsonb_object_keys(assignment) key
        where key not in ('accountId', 'workIds')
      )
      or jsonb_typeof(assignment -> 'accountId') <> 'string'
      or jsonb_typeof(assignment -> 'workIds') <> 'array' then
      raise exception 'invalid personal assignment shape' using errcode = '22023';
    end if;
    account_id := (assignment ->> 'accountId')::uuid;
    if not exists (
      select 1 from public.household_members hm
      where hm.household_id = p_household and hm.user_id = account_id
    ) then
      raise exception 'assigned account is not a member of the reviewed household'
        using errcode = '42501';
    end if;
    select coalesce(array_agg(distinct value::uuid order by value::uuid), '{}')
      into desired_personal
    from jsonb_array_elements_text(assignment -> 'workIds') value;
    if exists (
      select 1 from unnest(desired_personal) as desired(work_id)
      where not exists (select 1 from public.works w where w.id = desired.work_id)
    ) then
      raise exception 'personal assignment references an unknown corpus work' using errcode = '23503';
    end if;
    if exists (
      select 1 from public.books b
      where b.owner_id = account_id and b.removed_at is null
        and b.corpus_work_id = any(desired_personal)
      group by b.corpus_work_id having count(*) > 1
    ) then
      raise exception 'personal assignment has duplicate active rows' using errcode = '23505';
    end if;

    for archive_book in
      select b.id from public.books b
      where b.owner_id = account_id and b.removed_at is null
        and not (b.corpus_work_id = any(desired_personal))
      order by b.id
    loop
      perform public.preserve_personal_book_objective_metadata(archive_book);
      update public.books set removed_at = now(), removed_by = account_id
      where id = archive_book and owner_id = account_id and removed_at is null;
      personal_archived := personal_archived + 1;
    end loop;

    for target_work in
      select work_id from unnest(desired_personal) as desired(work_id) order by work_id
    loop
      if exists (
        select 1 from public.books b where b.owner_id = account_id
          and b.corpus_work_id = target_work and b.removed_at is null
      ) then continue; end if;
      select b.id into restore_book
      from public.books b
      where b.owner_id = account_id and b.corpus_work_id = target_work
        and b.removed_at is not null
      order by b.updated_at desc, b.id limit 1 for update;
      if restore_book is not null then
        update public.books set removed_at = null, removed_by = null
        where id = restore_book;
        personal_restored := personal_restored + 1;
      else
        insert into public.books (
          owner_id, corpus_work_id, title, author_last, authors_display, series, position,
          series_count, status, pages, pub_y, pub_m, pub_d, cover_url, cover_source,
          cover_source_url, cover_color, genre, subgenre, subgenres, genres, isbn,
          ownership, borrowed, wishlist, read_status
        )
        select
          account_id, w.id, w.title, nullif(w.author_text, ''), nullif(w.author_text, ''),
          w.series, w.position, w.series_count, w.status, w.pages, w.pub_y, w.pub_m, w.pub_d,
          w.cover_url, w.cover_source, w.cover_source_url, w.cover_color,
          coalesce(w.genre, ''), w.subgenre, w.subgenres, w.genres, w.isbns[1],
          'unowned', false, false, 'Read'
        from public.works w where w.id = target_work;
        personal_created := personal_created + 1;
      end if;
      restore_book := null;
    end loop;
  end loop;

  update public.household_works hw
  set removed_at = now(), removed_by = null
  where hw.household_id = p_household and hw.removed_at is null
    and not (hw.work_id = any(desired_household));
  get diagnostics household_archived = row_count;

  update public.household_works hw
  set removed_at = null, removed_by = null, inclusion_source = 'reconciliation'
  where hw.household_id = p_household and hw.removed_at is not null
    and hw.work_id = any(desired_household);
  get diagnostics household_restored = row_count;

  insert into public.household_works (
    household_id, work_id, added_by, inclusion_source
  )
  select p_household, desired.work_id, null, 'reconciliation'
  from unnest(desired_household) as desired(work_id)
  where not exists (
    select 1 from public.household_works hw
    where hw.household_id = p_household and hw.work_id = desired.work_id
  );
  get diagnostics household_created = row_count;

  if exists (
    select 1 from public.household_works hw
    where hw.household_id = p_household and hw.removed_at is null
      and not (hw.work_id = any(desired_household))
  ) or exists (
    select 1 from unnest(desired_household) as desired(work_id)
    where not exists (
      select 1 from public.household_works hw
      where hw.household_id = p_household and hw.work_id = desired.work_id
        and hw.removed_at is null
    )
  ) then
    raise exception 'household reconciliation postcondition failed' using errcode = 'P0001';
  end if;

  return jsonb_build_object(
    'personalCreated', personal_created,
    'personalRestored', personal_restored,
    'personalArchived', personal_archived,
    'householdCreated', household_created,
    'householdRestored', household_restored,
    'householdArchived', household_archived
  );
end;
$$;

revoke all on function public.reconcile_household_library_memberships(uuid, jsonb, uuid[])
  from public, anon, authenticated, service_role;
grant execute on function public.reconcile_household_library_memberships(uuid, jsonb, uuid[])
  to service_role;
