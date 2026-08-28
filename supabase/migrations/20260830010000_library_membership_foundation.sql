-- First-class personal / household / corpus membership.
--
-- A personal `books` row is reader state. `works` is the shared corpus. `household_works` is an
-- independent household collection. None of those rows owns either of the other two lifecycles:
-- archiving a personal row leaves the corpus and household rows intact, and removing a household
-- membership leaves every personal row and corpus work intact.

-- Corpus fields required by the scoped-edit contract. Existing corpus rows are curated imports;
-- rows created from a reader add are visibly provisional and retain attribution.
alter table public.works
  add column subgenre text,
  add column subgenres text[] not null default '{}',
  add column genres text[] not null default '{}',
  add column cover_options jsonb not null default '[]'::jsonb,
  add column metadata_status text not null default 'curated'
    check (metadata_status in ('curated', 'provisional')),
  add column creation_source text not null default 'corpus_import'
    check (creation_source in (
      'corpus_import', 'legacy_personal_backfill', 'reader_add', 'reconciliation'
    )),
  add column created_by uuid references public.profiles (id) on delete set null,
  add constraint works_cover_options_array_check check (jsonb_typeof(cover_options) = 'array');

-- SQL twin of packages/core/src/normalize.ts's workKeyOf. Compatibility decomposition and mark
-- removal keep Ibañez / Ibanez together; Unicode alphanumeric classes keep non-Latin works distinct.
create function public.library_work_key(p_title text, p_author text)
returns text
language sql
immutable
set search_path = ''
as $$
  select regexp_replace(
      lower(normalize(coalesce(p_title, ''), NFKD)), '[^[:alnum:]]', '', 'g'
    )
    || '|'
    || regexp_replace(
      lower(normalize(coalesce(p_author, ''), NFKD)), '[^[:alnum:]]', '', 'g'
    );
$$;

revoke all on function public.library_work_key(text, text)
  from public, anon, authenticated, service_role;
-- `works_library_work_key_idx` evaluates this expression during every corpus insert. Corpus writes
-- are service-managed, so the service role needs this narrow helper even when callers supply an
-- explicit work_key; readers still receive no direct execute grant.
grant execute on function public.library_work_key(text, text) to service_role;

-- Fallback identity is intentionally non-unique: duplicate title/author pairs are reconciliation
-- cases. Index the immutable expression so both this backfill and future one-book resolution avoid
-- rebuilding every corpus key for each lookup as the shared catalog grows.
create index works_library_work_key_idx
  on public.works (public.library_work_key(title, author_text)) include (id);

alter table public.books
  add column corpus_work_id uuid references public.works (id) on delete restrict,
  add column removed_at timestamptz,
  add column removed_by uuid references public.profiles (id) on delete set null;

create index books_corpus_work_idx on public.books (corpus_work_id);
create index books_owner_active_idx on public.books (owner_id, added_at, id)
  where removed_at is null;

-- Only covers produced by the existing `covers` ingestion function may become shared corpus URLs.
-- Its durable boundary is an object in the public covers bucket under u/{owner}/{book}/{revision}.
-- The signed JWT issuer supplies the project origin; request Host / forwarded-host headers are
-- caller-controlled and are never a trust root. HTTP is accepted only when that signed issuer is
-- the disposable local stack; deployed issuers and cover URLs must use HTTPS.
create function public.hosted_book_cover_object_name(
  p_url text,
  p_owner uuid,
  p_book uuid
)
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
  if nullif(trim(p_url), '') is null or p_owner is null or p_book is null then return null; end if;

  begin
    claims := coalesce(
      nullif(current_setting('request.jwt.claims', true), ''), '{}'
    )::jsonb;
  exception when others then
    return null;
  end;

  issuer := coalesce(claims ->> 'iss', '');
  if issuer !~* '^https?://[^/?#]+/auth/v1/?$' then return null; end if;

  canonical_origin := lower(regexp_replace(issuer, '/auth/v1/?$', '', 'i'));
  url_origin := lower(substring(trim(p_url) from '(?i)^(https?://[^/?#]+)'));
  object_name := substring(
    trim(p_url) from '(?i)^https?://[^/?#]+/storage/v1/object/public/covers/(u/[^?#]+)$'
  );

  if url_origin is null or url_origin <> canonical_origin or object_name is null then
    return null;
  end if;
  if canonical_origin !~* '^https://' and
    canonical_origin !~* '^http://(localhost|127[.]0[.]0[.]1)(:[0-9]+)?$' then
    return null;
  end if;
  if object_name !~ (
    '^u/' || p_owner::text || '/' || p_book::text ||
    '/[a-z0-9]+(_t)?[.](webp|jpg|png|gif)$'
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

revoke all on function public.hosted_book_cover_object_name(text, uuid, uuid)
  from public, anon, authenticated, service_role;

-- Every path that can publish a cover option uses this one narrow object contract. Personal cover
-- columns are owner-writable, so a hosted URL alone is not enough: its source metadata must also be
-- safe for a peer browser to consume.
create function public.corpus_cover_option_is_valid(p_option jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case
    when jsonb_typeof(p_option) is distinct from 'object' then false
    else coalesce(
      p_option ? 'url'
      and jsonb_typeof(p_option -> 'url') = 'string'
      and nullif(trim(p_option ->> 'url'), '') is not null
      and not exists (
        select 1 from jsonb_object_keys(p_option) key
        where key not in ('url', 'source', 'sourceUrl')
      )
      and (
        not (p_option ? 'source')
        or (
          jsonb_typeof(p_option -> 'source') = 'string'
          and p_option ->> 'source' in (
            'hardcover', 'google', 'openlibrary', 'upload', 'camera', 'url'
          )
        )
      )
      and (
        not (p_option ? 'sourceUrl')
        or (
          jsonb_typeof(p_option -> 'sourceUrl') = 'string'
          and p_option ->> 'sourceUrl' ~* '^https?://'
        )
      ),
      false
    )
  end;
$$;

revoke all on function public.corpus_cover_option_is_valid(jsonb)
  from public, anon, authenticated, service_role;

-- Canonical ISBN resolution is a transaction-level write boundary, not merely a lookup. Every
-- writer locks the same normalized ISBN-13 values in the same order before it checks or assigns
-- them, so concurrent first editions cannot create two ordinary works and multi-ISBN updates do
-- not deadlock by choosing opposite lock orders.
create function public.canonical_library_isbns(p_isbns text[])
returns text[]
language sql
immutable
set search_path = ''
as $$
  select coalesce(array_agg(isbn order by isbn), '{}')
  from (
    select distinct regexp_replace(value, '[^0-9]', '', 'g') as isbn
    from unnest(coalesce(p_isbns, '{}')) value
  ) normalized
  where isbn ~ '^[0-9]{13}$';
$$;

revoke all on function public.canonical_library_isbns(text[])
  from public, anon, authenticated, service_role;

create function public.lock_library_isbns(p_isbns text[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  isbn text;
begin
  foreach isbn in array public.canonical_library_isbns(p_isbns)
  loop
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended('reverie:canonical-isbn:' || isbn, 0)
    );
  end loop;
end;
$$;

revoke all on function public.lock_library_isbns(text[])
  from public, anon, authenticated, service_role;

-- A personal-book insert and the owner-run reconciliation must agree on whether the insert belongs
-- to the reviewed snapshot. Ordinary inserts share a transaction-scoped owner fence, preserving
-- normal same-reader concurrency. Reconciliation takes the exclusive form for its complete,
-- sorted owner set before locking any book rows; an earlier insert therefore commits and is seen
-- by the fingerprint, while a later insert waits until reconciliation has committed.
create function public.lock_library_book_owner_insert(p_owner uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  select pg_catalog.pg_advisory_xact_lock_shared(
    pg_catalog.hashtextextended('reverie:book-owner:' || p_owner::text, 0)
  );
$$;

revoke all on function public.lock_library_book_owner_insert(uuid)
  from public, anon, authenticated, service_role;

create function public.lock_library_book_owners_reconciliation(p_owners uuid[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner_id uuid;
begin
  for owner_id in
    select distinct value from unnest(coalesce(p_owners, '{}')) value order by value
  loop
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended('reverie:book-owner:' || owner_id::text, 0)
    );
  end loop;
end;
$$;

revoke all on function public.lock_library_book_owners_reconciliation(uuid[])
  from public, anon, authenticated, service_role;

-- Keep direct corpus writers on the same boundary as personal-book resolution. Existing ambiguous
-- ISBN data remains visible to the reconciliation resolver; only a new assignment that would add a
-- second ordinary owner for an ISBN is refused.
create function public.validate_work_isbn_assignment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.isbns := public.canonical_library_isbns(new.isbns);
  perform public.lock_library_isbns(new.isbns);

  if exists (
    select 1
    from public.works existing
    cross join unnest(new.isbns) isbn
    where existing.id <> new.id and isbn = any(existing.isbns)
  ) then
    raise exception 'canonical ISBN is already assigned to another work'
      using errcode = '23505';
  end if;
  return new;
end;
$$;

revoke all on function public.validate_work_isbn_assignment()
  from public, anon, authenticated, service_role;

-- A supplied corpus id is valid only when bibliographic evidence resolves to exactly one work.
-- ISBN wins when present in the corpus; title+full-author is the fallback. Multiple candidates are
-- a reconciliation case, never permission to take whichever UUID sorts first.
create function public.book_corpus_binding_is_unambiguous(
  p_work uuid,
  p_title text,
  p_author text,
  p_isbn text
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  normalized_isbn text := regexp_replace(coalesce(p_isbn, ''), '[^0-9]', '', 'g');
  target_key text := public.library_work_key(p_title, p_author);
  match_count int;
  matched_work uuid;
begin
  if p_work is null then return false; end if;

  if normalized_isbn ~ '^[0-9]{13}$' then
    select count(*)::int, (array_agg(w.id order by w.id))[1] into match_count, matched_work
    from public.works w where normalized_isbn = any(w.isbns);
    if match_count > 0 then return match_count = 1 and matched_work = p_work; end if;
  end if;

  select count(*)::int, (array_agg(w.id order by w.id))[1] into match_count, matched_work
  from public.works w where public.library_work_key(w.title, w.author_text) = target_key;
  return match_count = 1 and matched_work = p_work;
end;
$$;

revoke all on function public.book_corpus_binding_is_unambiguous(uuid, text, text, text)
  from public, anon, authenticated, service_role;

-- Existing derived ASCII keys are safe to re-key only when they are recognizably derived and one
-- source row maps to the target. Two legacy keys can converge after Unicode normalization even when
-- neither target existed before the UPDATE; those ambiguous rows stay untouched for reconciliation.
-- External identifiers remain byte-for-byte unchanged.
create function public.rekey_legacy_library_work_keys()
returns integer
language plpgsql
set search_path = ''
as $$
declare
  changed integer;
begin
  with candidates as (
    select
      w.id,
      public.library_work_key(w.title, w.author_text) as new_key,
      count(*) over (
        partition by public.library_work_key(w.title, w.author_text)
      ) as target_count
    from public.works w
    where w.work_key = (
        regexp_replace(lower(coalesce(w.title, '')), '[^a-z0-9]', '', 'g') || '|' ||
        regexp_replace(lower(coalesce(w.author_text, '')), '[^a-z0-9]', '', 'g')
      )
      and w.work_key <> public.library_work_key(w.title, w.author_text)
  )
  update public.works w
  set work_key = candidate.new_key
  from candidates candidate
  where w.id = candidate.id
    and candidate.target_count = 1
    and not exists (
      select 1 from public.works collision
      where collision.id <> w.id and collision.work_key = candidate.new_key
    );

  get diagnostics changed = row_count;
  return changed;
end;
$$;

revoke all on function public.rekey_legacy_library_work_keys()
  from public, anon, authenticated, service_role;

select public.rekey_legacy_library_work_keys();

-- Reuse one corpus identity snapshot throughout the backfill. The expression index already paid
-- the Unicode-normalization cost; the ordered index scan below reads that stored value rather than
-- recomputing it in every later statement. Newly inserted provisional/reconciliation works are
-- appended to the snapshot explicitly, so ambiguity counts remain identical to live-table counts.
create temporary table library_work_fallback_owners (
  work_id uuid primary key,
  fallback_key text not null
) on commit drop;
create index library_work_fallback_owners_key_idx
  on library_work_fallback_owners (fallback_key, work_id);

set local enable_seqscan = off;
insert into library_work_fallback_owners (work_id, fallback_key)
select w.id, public.library_work_key(w.title, w.author_text)
from public.works w
order by public.library_work_key(w.title, w.author_text);
set local enable_seqscan = on;

create temporary table library_work_isbn_owners (
  work_id uuid not null,
  isbn text not null,
  primary key (work_id, isbn)
) on commit drop;
create index library_work_isbn_owners_isbn_idx
  on library_work_isbn_owners (isbn, work_id);

insert into library_work_isbn_owners (work_id, isbn)
select distinct w.id, identifier.isbn
from public.works w
cross join lateral unnest(w.isbns) identifier(isbn);

-- Personal identity is likewise calculated once and then reused by all three decisions below.
-- This also guarantees that every stage sees the same title/author/ISBN snapshot.
create temporary table library_book_identities on commit drop as
select
  b.id as book_id,
  b.owner_id,
  b.title,
  coalesce(
    nullif(b.authors_display, ''), trim(concat_ws(' ', b.author_first, b.author_last))
  ) as author,
  b.series,
  b.position,
  b.series_count,
  b.status,
  b.pages,
  b.pub_y,
  b.pub_m,
  b.pub_d,
  b.genre,
  b.subgenre,
  b.subgenres,
  b.genres,
  b.updated_at,
  regexp_replace(coalesce(b.isbn, ''), '[^0-9]', '', 'g') as normalized_isbn,
  public.library_work_key(
    b.title,
    coalesce(
      nullif(b.authors_display, ''), trim(concat_ws(' ', b.author_first, b.author_last))
    )
  ) as fallback_key
from public.books b;
alter table library_book_identities add primary key (book_id);
create index library_book_identities_fallback_idx
  on library_book_identities (fallback_key, book_id);
create index library_book_identities_isbn_idx
  on library_book_identities (normalized_isbn, book_id);

-- Every legacy personal row gets a corpus anchor. This is deliberately INSERT-only for existing
-- works: a reader copy never overwrites curated corpus metadata. Personal covers and tags are not
-- published by deployment; only the objective bibliographic allowlist seeds a provisional work.
with candidates as materialized (
  select distinct on (fallback_key)
    identity.*,
    identity.fallback_key as work_key
  from library_book_identities identity
  order by fallback_key, updated_at desc, book_id
),
existing_isbns as materialized (
  select distinct isbn
  from library_work_isbn_owners
),
existing_fallback_keys as materialized (
  select distinct fallback_key as work_key
  from library_work_fallback_owners
)
insert into public.works (
  work_key, title, contributors, author_text, series, position, series_count, status, pages,
  pub_y, pub_m, pub_d, genre, subgenre, subgenres, genres, isbns,
  metadata_status, creation_source, created_by
)
select
  c.work_key,
  c.title,
  case when c.author = '' then '[]'::jsonb
    else jsonb_build_array(jsonb_build_object('name', c.author, 'role', 'author', 'position', 0))
  end,
  c.author,
  c.series,
  c.position,
  c.series_count,
  c.status,
  c.pages,
  c.pub_y,
  c.pub_m,
  c.pub_d,
  nullif(c.genre, ''),
  c.subgenre,
  coalesce(c.subgenres, '{}'),
  coalesce(c.genres, '{}'),
  case
    when c.normalized_isbn ~ '^[0-9]{13}$'
      then array[c.normalized_isbn]
    else '{}'
  end,
  'provisional',
  'legacy_personal_backfill',
  c.owner_id
from candidates c
left join existing_isbns isbn_match
  on c.normalized_isbn ~ '^[0-9]{13}$'
  and isbn_match.isbn = c.normalized_isbn
left join existing_fallback_keys fallback_match on fallback_match.work_key = c.work_key
where isbn_match.isbn is null and fallback_match.work_key is null
on conflict (work_key) do nothing;

insert into library_work_fallback_owners (work_id, fallback_key)
select w.id, public.library_work_key(w.title, w.author_text)
from public.works w
left join library_work_fallback_owners known on known.work_id = w.id
where known.work_id is null;

insert into library_work_isbn_owners (work_id, isbn)
select distinct w.id, identifier.isbn
from public.works w
cross join lateral unnest(w.isbns) identifier(isbn)
left join library_work_isbn_owners known
  on known.work_id = w.id and known.isbn = identifier.isbn
where known.work_id is null;

-- Ambiguous ISBN or title+author fallbacks get a per-row reconciliation anchor. This intentionally
-- refuses to coalesce uncertain matches; an owner-reviewed, target-scoped repair can merge them
-- later without deployment ever attaching a personal row to the wrong global work. Identity maps
-- are materialized once: rescanning the whole corpus for every personal row exceeds the production
-- statement budget even though the same set-based decision completes comfortably within it. The
-- zero-ISBN/zero-fallback case is also a refusal: it can occur when one fallback-group candidate is
-- suppressed by its unique ISBN while a differently-ISBN'd sibling has no remaining target.
with work_isbn_counts as materialized (
  select isbn, count(*)::int as match_count
  from library_work_isbn_owners
  group by isbn
),
work_fallback_counts as materialized (
  select fallback_key, count(*)::int as match_count
  from library_work_fallback_owners
  group by fallback_key
)
insert into public.works (
  work_key, title, contributors, author_text, series, position, series_count, status, pages,
  pub_y, pub_m, pub_d, genre, subgenre, subgenres, genres,
  metadata_status, creation_source, created_by
)
select
  'reconcile:' || b.book_id::text,
  b.title,
  case when b.author = '' then '[]'::jsonb
    else jsonb_build_array(jsonb_build_object(
      'name', b.author, 'role', 'author', 'position', 0
    ))
  end,
  b.author,
  b.series,
  b.position,
  b.series_count,
  b.status,
  b.pages,
  b.pub_y,
  b.pub_m,
  b.pub_d,
  nullif(b.genre, ''),
  b.subgenre,
  coalesce(b.subgenres, '{}'),
  coalesce(b.genres, '{}'),
  'provisional',
  'reconciliation',
  b.owner_id
from library_book_identities b
left join work_isbn_counts isbn_matches
  on b.normalized_isbn ~ '^[0-9]{13}$'
  and isbn_matches.isbn = b.normalized_isbn
left join work_fallback_counts fallback_matches
  on fallback_matches.fallback_key = b.fallback_key
where coalesce(isbn_matches.match_count, 0) > 1
  or (
    coalesce(isbn_matches.match_count, 0) = 0
    and coalesce(fallback_matches.match_count, 0) <> 1
  )
on conflict (work_key) do nothing;

insert into library_work_fallback_owners (work_id, fallback_key)
select w.id, public.library_work_key(w.title, w.author_text)
from public.works w
left join library_work_fallback_owners known on known.work_id = w.id
where known.work_id is null;

-- Compute every binding separately from the write. Besides keeping the decision inspectable, this
-- ensures neither the corpus aggregation nor the row update consumes the whole per-statement budget.
create temporary table library_book_corpus_bindings (
  book_id uuid primary key,
  work_id uuid not null
) on commit drop;

with unique_isbn_targets as materialized (
  select isbn, (array_agg(work_id order by work_id))[1] as work_id
  from library_work_isbn_owners
  group by isbn
  having count(*) = 1
),
unique_fallback_targets as materialized (
  select fallback_key, (array_agg(work_id order by work_id))[1] as work_id
  from library_work_fallback_owners
  group by fallback_key
  having count(*) = 1
)
insert into library_book_corpus_bindings (book_id, work_id)
select
  identity.book_id,
  coalesce(
    isbn_target.work_id,
    reconciliation_target.id,
    fallback_target.work_id
  )
from library_book_identities identity
left join unique_isbn_targets isbn_target
  on identity.normalized_isbn ~ '^[0-9]{13}$'
  and isbn_target.isbn = identity.normalized_isbn
left join public.works reconciliation_target
  on reconciliation_target.work_key = 'reconcile:' || identity.book_id::text
left join unique_fallback_targets fallback_target
  on fallback_target.fallback_key = identity.fallback_key;

-- This is an internal identity link, not a reader edit. Avoid rewriting every book's recency stamp;
-- the enrichment invalidator is also irrelevant because none of its title/author/ISBN keys change.
-- A migration failure rolls these trigger-state changes back with the backfill transaction.
alter table public.books disable trigger books_set_updated_at;
alter table public.books disable trigger books_enriched_stamp_invalidate;

update public.books b
set corpus_work_id = binding.work_id
from library_book_corpus_bindings binding
where b.id = binding.book_id and b.corpus_work_id is null;

alter table public.books enable trigger books_enriched_stamp_invalidate;
alter table public.books enable trigger books_set_updated_at;

alter table public.books alter column corpus_work_id set not null;

-- Install the future-write boundary after the legacy inventory has been preserved. A database that
-- already contains ambiguous ISBN ownership must still deploy and route those personal additions
-- to reconciliation rather than guessing or rewriting historical corpus rows.
create trigger works_validate_isbn_assignment
  before insert or update of isbns on public.works
  for each row execute function public.validate_work_isbn_assignment();

-- New personal rows always retain a corpus anchor. A supplied Discover/Add work must match one
-- unambiguous bibliographic identity. Uncertain fallback matches receive a reconciliation work
-- rather than silently attaching to the first UUID.
create function public.ensure_book_corpus_work()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  author_name text;
  target_key text;
  target_work uuid;
  normalized_isbn text;
  isbn_matches int := 0;
  fallback_matches int := 0;
  ambiguous_match boolean := false;
  safe_cover text;
  safe_cover_option jsonb;
begin
  -- This is deliberately the first lock in every personal-book insert. It must precede the ISBN,
  -- corpus-work, row/FK, and owned-household boundaries below.
  perform public.lock_library_book_owner_insert(new.owner_id);

  author_name := coalesce(
    nullif(new.authors_display, ''),
    trim(concat_ws(' ', new.author_first, new.author_last))
  );
  target_key := public.library_work_key(new.title, author_name);
  normalized_isbn := regexp_replace(coalesce(new.isbn, ''), '[^0-9]', '', 'g');

  -- Waiters take a fresh READ COMMITTED snapshot after the first writer commits, so the count below
  -- sees that work and reuses it. Invalid/absent ISBNs produce an empty lock set.
  perform public.lock_library_isbns(array[normalized_isbn]);

  if new.corpus_work_id is not null then
    if not public.book_corpus_binding_is_unambiguous(
      new.corpus_work_id, new.title, author_name, new.isbn
    ) then
      raise exception 'supplied corpus work does not uniquely match this book'
        using errcode = '23514';
    end if;
    return new;
  end if;

  if normalized_isbn ~ '^[0-9]{13}$' then
    select count(*)::int, (array_agg(w.id order by w.id))[1] into isbn_matches, target_work
    from public.works w where normalized_isbn = any(w.isbns);
  end if;

  if isbn_matches = 0 then
    select count(*)::int, (array_agg(w.id order by w.id))[1] into fallback_matches, target_work
    from public.works w where public.library_work_key(w.title, w.author_text) = target_key;
  end if;

  if isbn_matches = 1 or (isbn_matches = 0 and fallback_matches = 1) then
    new.corpus_work_id := target_work;
    return new;
  end if;

  ambiguous_match := isbn_matches > 1 or fallback_matches > 1;
  if ambiguous_match then target_key := 'reconcile:' || new.id::text; end if;
  safe_cover_option := jsonb_strip_nulls(jsonb_build_object(
    'url', new.cover_url,
    'source', new.cover_source,
    'sourceUrl', new.cover_source_url
  ));
  if public.hosted_book_cover_object_name(new.cover_url, new.owner_id, new.id) is not null
    and public.corpus_cover_option_is_valid(safe_cover_option) then
    safe_cover := new.cover_url;
  else
    safe_cover := null;
    safe_cover_option := null;
  end if;

  insert into public.works (
    work_key, title, contributors, author_text, series, position, series_count, status, pages,
    pub_y, pub_m, pub_d, cover_url, cover_source, cover_source_url, cover_color, genre, subgenre,
    subgenres, genres, isbns, cover_options, metadata_status, creation_source, created_by
  ) values (
    target_key,
    new.title,
    case when author_name = '' then '[]'::jsonb
      else jsonb_build_array(jsonb_build_object(
        'name', author_name, 'role', 'author', 'position', 0
      ))
    end,
    author_name,
    new.series,
    new.position,
    new.series_count,
    new.status,
    new.pages,
    new.pub_y,
    new.pub_m,
    new.pub_d,
    safe_cover,
    case when safe_cover is not null then safe_cover_option ->> 'source' else null end,
    case when safe_cover is not null then safe_cover_option ->> 'sourceUrl' else null end,
    case when safe_cover is not null then new.cover_color else null end,
    nullif(new.genre, ''),
    new.subgenre,
    coalesce(new.subgenres, '{}'),
    coalesce(new.genres, '{}'),
    case
      when not ambiguous_match and normalized_isbn ~ '^[0-9]{13}$'
        then array[normalized_isbn]
      else '{}'
    end,
    case when safe_cover is null then '[]'::jsonb else jsonb_build_array(safe_cover_option) end,
    'provisional',
    case when ambiguous_match then 'reconciliation' else 'reader_add' end,
    new.owner_id
  )
  on conflict (work_key) do nothing
  returning id into target_work;

  if target_work is null then
    select w.id into target_work from public.works w where w.work_key = target_key;
  end if;

  if target_work is null then
    raise exception 'could not establish a corpus work' using errcode = '40001';
  end if;
  new.corpus_work_id := target_work;
  return new;
end;
$$;

revoke all on function public.ensure_book_corpus_work()
  from public, anon, authenticated, service_role;

create trigger books_ensure_corpus_work
  before insert on public.books
  for each row execute function public.ensure_book_corpus_work();

-- Owner RLS permits ordinary book-field edits, but corpus identity is a global-integrity link.
-- Authenticated readers may never mutate it. A server/operator rebind is still checked against the
-- same unique bibliographic resolver, so elevated access cannot turn a bypass into a wrong binding.
create function public.validate_book_corpus_rebind()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  author_name text;
begin
  if old.corpus_work_id is not distinct from new.corpus_work_id then return new; end if;
  if (select auth.uid()) is not null then
    raise exception 'corpus work binding is immutable for readers' using errcode = '42501';
  end if;

  author_name := coalesce(
    nullif(new.authors_display, ''), trim(concat_ws(' ', new.author_first, new.author_last))
  );
  if not public.book_corpus_binding_is_unambiguous(
    new.corpus_work_id, new.title, author_name, new.isbn
  ) then
    raise exception 'server corpus rebind is not a unique bibliographic match'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke all on function public.validate_book_corpus_rebind()
  from public, anon, authenticated, service_role;

create trigger books_validate_corpus_rebind
  before update of corpus_work_id on public.books
  for each row execute function public.validate_book_corpus_rebind();

create table public.household_works (
  household_id uuid not null references public.households (id) on delete cascade,
  work_id uuid not null references public.works (id) on delete restrict,
  added_by uuid references public.profiles (id) on delete set null,
  inclusion_source text not null
    check (inclusion_source in ('owned', 'borrowed', 'manual', 'reconciliation')),
  added_at timestamptz not null default now(),
  removed_at timestamptz,
  removed_by uuid references public.profiles (id) on delete set null,
  primary key (household_id, work_id)
);

create index household_works_live_idx on public.household_works (household_id, added_at, work_id)
  where removed_at is null;

-- One explicit borrowed-book checkbox per personal row. Keeping this source separate prevents one
-- member from unchecking another member's share of the same work. Personal archival is soft, so
-- the share (and therefore the independent household membership) survives personal removal.
create table public.household_book_shares (
  book_id uuid primary key references public.books (id) on delete cascade,
  household_id uuid not null references public.households (id) on delete cascade,
  work_id uuid not null references public.works (id) on delete restrict,
  shared_by uuid references public.profiles (id) on delete set null,
  shared_at timestamptz not null default now(),
  removed_at timestamptz,
  removed_by uuid references public.profiles (id) on delete set null
);

create index household_book_shares_live_idx
  on public.household_book_shares (household_id, work_id, book_id)
  where removed_at is null;

create table public.household_work_enrichment (
  household_id uuid not null,
  work_id uuid not null,
  tags text[] not null default '{}',
  tropes jsonb not null default '[]'::jsonb,
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (household_id, work_id),
  foreign key (household_id, work_id)
    references public.household_works (household_id, work_id) on delete cascade,
  check (jsonb_typeof(tropes) = 'array')
);

-- Shared corpus edits are intentionally narrow and auditable. Readers never receive direct write
-- access to `works`; the RPC below can change only the objective fields in its signature, and this
-- append-only record retains who changed what for later curation or rollback.
create table public.work_metadata_edits (
  id uuid primary key default gen_random_uuid(),
  work_id uuid not null references public.works (id) on delete restrict,
  editor_id uuid references public.profiles (id) on delete set null,
  previous_value jsonb not null,
  next_value jsonb not null,
  created_at timestamptz not null default now()
);

create index work_metadata_edits_work_idx
  on public.work_metadata_edits (work_id, created_at desc, id);

create function public.sync_personal_objective_metadata_to_corpus()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  before_value jsonb;
  after_value jsonb;
  safe_cover text;
  safe_cover_option jsonb;
  author_name text;
begin
  -- Operator imports and background repair jobs keep their explicit corpus write path. Only a
  -- reader editing their own active row promotes these reviewed objective fields automatically.
  if caller is null or caller <> new.owner_id or new.removed_at is not null then return new; end if;

  author_name := coalesce(
    nullif(new.authors_display, ''), trim(concat_ws(' ', new.author_first, new.author_last))
  );
  if not public.book_corpus_binding_is_unambiguous(
    new.corpus_work_id, new.title, author_name, new.isbn
  ) then
    return new;
  end if;

  safe_cover_option := jsonb_strip_nulls(jsonb_build_object(
    'url', new.cover_url,
    'source', new.cover_source,
    'sourceUrl', new.cover_source_url
  ));
  if public.hosted_book_cover_object_name(new.cover_url, new.owner_id, new.id) is not null
    and public.corpus_cover_option_is_valid(safe_cover_option) then
    safe_cover := new.cover_url;
  else
    safe_cover := null;
    safe_cover_option := null;
  end if;

  select jsonb_build_object(
    'genre', w.genre,
    'subgenre', w.subgenre,
    'genres', w.genres,
    'subgenres', w.subgenres,
    'coverUrl', w.cover_url,
    'coverOptions', w.cover_options
  ) into before_value
  from public.works w where w.id = new.corpus_work_id
  for update;

  update public.works w
  set genre = nullif(lower(trim(new.genre)), ''),
      subgenre = nullif(lower(trim(new.subgenre)), ''),
      genres = array(
        select distinct lower(trim(value)) from unnest(coalesce(new.genres, '{}')) value
        where trim(value) <> '' order by lower(trim(value))
      ),
      subgenres = array(
        select distinct lower(trim(value)) from unnest(coalesce(new.subgenres, '{}')) value
        where trim(value) <> '' order by lower(trim(value))
      ),
      -- A personal cover choice becomes a corpus option. It seeds the canonical cover only when
      -- the work has none; one reader never silently replaces everybody's established cover.
      cover_url = coalesce(w.cover_url, safe_cover),
      cover_options = case
        when safe_cover is null then w.cover_options
        when exists (
          select 1 from jsonb_array_elements(w.cover_options) option
          where option ->> 'url' = safe_cover
        ) then w.cover_options
        else w.cover_options || jsonb_build_array(safe_cover_option)
      end
  where w.id = new.corpus_work_id;

  select jsonb_build_object(
    'genre', w.genre,
    'subgenre', w.subgenre,
    'genres', w.genres,
    'subgenres', w.subgenres,
    'coverUrl', w.cover_url,
    'coverOptions', w.cover_options
  ) into after_value
  from public.works w where w.id = new.corpus_work_id;

  if after_value is distinct from before_value then
    insert into public.work_metadata_edits (
      work_id, editor_id, previous_value, next_value
    ) values (new.corpus_work_id, caller, before_value, after_value);
  end if;
  return new;
end;
$$;

revoke all on function public.sync_personal_objective_metadata_to_corpus()
  from public, anon, authenticated, service_role;

create trigger books_sync_objective_metadata_to_corpus
  after update of genre, subgenre, subgenres, genres, cover_url, cover_source, cover_source_url
  on public.books
  for each row
  when (
    old.genre is distinct from new.genre
    or old.subgenre is distinct from new.subgenre
    or old.subgenres is distinct from new.subgenres
    or old.genres is distinct from new.genres
    or old.cover_url is distinct from new.cover_url
    or old.cover_source is distinct from new.cover_source
    or old.cover_source_url is distinct from new.cover_source_url
  )
  execute function public.sync_personal_objective_metadata_to_corpus();

create trigger household_work_enrichment_set_updated_at
  before update on public.household_work_enrichment
  for each row execute function public.set_updated_at();

alter table public.household_works enable row level security;
alter table public.household_book_shares enable row level security;
alter table public.household_work_enrichment enable row level security;
alter table public.work_metadata_edits enable row level security;

-- There are deliberately no authenticated table privileges or policies. The RPCs below are the
-- complete client contract, so adding a column never exposes it by accident.
grant all on public.household_works, public.household_book_shares, public.household_work_enrichment,
  public.work_metadata_edits to service_role;

-- Shared helper used by ownership and household-member triggers. The household row serializes
-- removal against automatic owned-book inclusion. Recheck membership after taking that lock so a
-- concurrent final unlink cannot resurrect a row in a deleted household. This deliberately creates
-- membership only: historical personal tags/tropes are published only by a separately approved
-- reconciliation, while later edits flow through their own triggers below.
create function public.ensure_owned_household_work(p_book uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_household uuid;
  target_work uuid;
  target_owner uuid;
begin
  select hm.household_id, b.corpus_work_id, b.owner_id
  into target_household, target_work, target_owner
  from public.books b
  join public.household_members hm on hm.user_id = b.owner_id
  where b.id = p_book
    and b.removed_at is null
    and b.ownership = 'owned';

  if target_household is null then return; end if;

  perform 1 from public.households h where h.id = target_household for update;
  if not exists (
    select 1 from public.household_members hm
    where hm.household_id = target_household and hm.user_id = target_owner
  ) then return; end if;

  insert into public.household_works (
    household_id, work_id, added_by, inclusion_source, removed_at, removed_by
  ) values (target_household, target_work, target_owner, 'owned', null, null)
  on conflict (household_id, work_id) do update
  set removed_at = null,
      removed_by = null,
      inclusion_source = case
        when public.household_works.inclusion_source = 'reconciliation'
          then public.household_works.inclusion_source
        else 'owned'
      end;

end;
$$;

revoke all on function public.ensure_owned_household_work(uuid)
  from public, anon, authenticated, service_role;

create function public.sync_owned_book_to_household()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.removed_at is null and new.ownership = 'owned' then
    perform public.ensure_owned_household_work(new.id);
  end if;
  return new;
end;
$$;

revoke all on function public.sync_owned_book_to_household()
  from public, anon, authenticated, service_role;

create trigger books_sync_owned_household_work
  after insert or update of ownership, corpus_work_id, removed_at on public.books
  for each row execute function public.sync_owned_book_to_household();

create function public.sync_new_household_member_books()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  owned_book uuid;
begin
  for owned_book in
    select b.id from public.books b
    where b.owner_id = new.user_id and b.removed_at is null and b.ownership = 'owned'
    order by b.id
  loop
    perform public.ensure_owned_household_work(owned_book);
  end loop;
  return new;
end;
$$;

revoke all on function public.sync_new_household_member_books()
  from public, anon, authenticated, service_role;

create trigger household_members_sync_owned_books
  after insert on public.household_members
  for each row execute function public.sync_new_household_member_books();

-- A join may reference only canonical vocabulary or the acting reader's personal vocabulary.
-- Book ownership and trope ownership are independent boundaries: knowing another reader's private
-- trope UUID must not make its name publishable through this security-definer household trigger.
drop policy "book_tropes: insert own" on public.book_tropes;
create policy "book_tropes: insert own" on public.book_tropes for insert
  with check (
    owner_id = (select auth.uid())
    and exists (
      select 1 from public.books b
      where b.id = book_id and b.owner_id = (select auth.uid())
    )
    and exists (
      select 1 from public.tropes t
      where t.id = trope_id
        and (t.owner_id is null or t.owner_id = (select auth.uid()))
    )
  );

drop policy "book_tropes: update own" on public.book_tropes;
create policy "book_tropes: update own" on public.book_tropes for update
  using (
    owner_id = (select auth.uid())
    and exists (
      select 1 from public.books b
      where b.id = book_id and b.owner_id = (select auth.uid())
    )
  )
  with check (
    owner_id = (select auth.uid())
    and exists (
      select 1 from public.books b
      where b.id = book_id and b.owner_id = (select auth.uid())
    )
    and exists (
      select 1 from public.tropes t
      where t.id = trope_id
        and (t.owner_id is null or t.owner_id = (select auth.uid()))
    )
  );

-- Tags and tropes are independent household-enrichment fields, not corpus metadata and not private
-- reading state. Both edit paths serialize with household unlink, then recheck the exact owner,
-- personal link, and active household work while holding that household lock. A concurrent
-- revocation therefore keeps the personal edit but suppresses its household side effect.
create function public.lock_personal_book_household_enrichment(
  p_book uuid,
  p_owner uuid,
  p_expected_work uuid
)
returns table (household_id uuid, work_id uuid, owner_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_household uuid;
  target_work uuid;
  target_owner uuid;
begin
  target_work := p_expected_work;
  if target_work is null then return; end if;

  -- Personal removal/rebinding serializes here. Book-first is compatible with the existing book
  -- triggers, and the row lock stays held through the eventual overlay write.
  perform 1
  from public.books b
  where b.id = p_book and b.owner_id = p_owner
  for update;
  if not found then return; end if;

  select hm.household_id, b.owner_id
  into target_household, target_owner
  from public.books b
  join public.household_members hm on hm.user_id = b.owner_id
  join public.household_works hw on hw.household_id = hm.household_id
    and hw.work_id = b.corpus_work_id and hw.removed_at is null
  where b.id = p_book
    and b.owner_id = p_owner
    and b.corpus_work_id = target_work
    and b.removed_at is null
    and (
      b.ownership = 'owned'
      or exists (
        select 1 from public.household_book_shares s
        where s.book_id = b.id
          and s.household_id = hm.household_id
          and s.work_id = b.corpus_work_id
          and s.removed_at is null
      )
    );

  if target_household is null then return; end if;

  -- Match unlink_household_member's membership-then-household order. If revocation already owns
  -- this row, the trigger waits here and observes its deletion instead of forming a lock cycle.
  perform 1
  from public.household_members hm
  where hm.household_id = target_household and hm.user_id = target_owner
  for key share;
  if not found then return; end if;

  perform 1 from public.households h where h.id = target_household for update;
  if not found then return; end if;

  if not exists (
    select 1
    from public.household_members hm
    join public.books b on b.owner_id = hm.user_id
    join public.household_works hw on hw.household_id = hm.household_id
      and hw.work_id = b.corpus_work_id and hw.removed_at is null
    where hm.household_id = target_household
      and hm.user_id = target_owner
      and b.id = p_book
      and b.owner_id = target_owner
      and b.corpus_work_id = target_work
      and b.removed_at is null
      and (
        b.ownership = 'owned'
        or exists (
          select 1 from public.household_book_shares s
          where s.book_id = b.id
            and s.household_id = target_household
            and s.work_id = target_work
            and s.removed_at is null
        )
      )
  ) then return; end if;

  household_id := target_household;
  work_id := target_work;
  owner_id := target_owner;
  return next;
end;
$$;

revoke all on function public.lock_personal_book_household_enrichment(uuid, uuid, uuid)
  from public, anon, authenticated, service_role;

-- A tag edit replaces only household tags. Pre-link personal tropes and independently curated
-- household tropes remain untouched.
create function public.sync_personal_book_household_tags(
  p_book uuid,
  p_owner uuid,
  p_expected_work uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_household uuid;
  target_work uuid;
  target_owner uuid;
  target_tags text[];
begin
  select locked.household_id, locked.work_id, locked.owner_id
  into target_household, target_work, target_owner
  from public.lock_personal_book_household_enrichment(
    p_book, p_owner, p_expected_work
  ) locked;

  if target_household is null then return; end if;

  select b.tags into target_tags
  from public.books b
  where b.id = p_book and b.owner_id = target_owner and b.corpus_work_id = target_work;

  insert into public.household_work_enrichment (
    household_id, work_id, tags, updated_by
  ) values (
    target_household,
    target_work,
    coalesce(target_tags, '{}'),
    target_owner
  )
  on conflict (household_id, work_id) do update
  set tags = excluded.tags,
      updated_by = excluded.updated_by;
end;
$$;

revoke all on function public.sync_personal_book_household_tags(uuid, uuid, uuid)
  from public, anon, authenticated, service_role;

-- A trope edit replaces only household tropes. Pre-link personal tags and independently curated
-- household tags remain untouched.
create function public.sync_personal_book_household_tropes(
  p_book uuid,
  p_owner uuid,
  p_expected_work uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_household uuid;
  target_work uuid;
  target_owner uuid;
  target_tropes jsonb;
begin
  select locked.household_id, locked.work_id, locked.owner_id
  into target_household, target_work, target_owner
  from public.lock_personal_book_household_enrichment(
    p_book, p_owner, p_expected_work
  ) locked;

  if target_household is null then return; end if;

  select coalesce(jsonb_agg(
    jsonb_build_object('id', t.id, 'name', t.name, 'emphasis', bt.emphasis)
    order by case when bt.emphasis = 'pinned' then 0 else 1 end, lower(t.name), t.id
  ), '[]'::jsonb)
  into target_tropes
  from public.book_tropes bt
  join public.tropes t on t.id = bt.trope_id
  where bt.book_id = p_book
    and bt.owner_id = target_owner
    and (t.owner_id is null or t.owner_id = target_owner);

  insert into public.household_work_enrichment (
    household_id, work_id, tropes, updated_by
  ) values (
    target_household,
    target_work,
    target_tropes,
    target_owner
  )
  on conflict (household_id, work_id) do update
  set tropes = excluded.tropes,
      updated_by = excluded.updated_by;
end;
$$;

revoke all on function public.sync_personal_book_household_tropes(uuid, uuid, uuid)
  from public, anon, authenticated, service_role;

create function public.sync_book_tags_to_household()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.sync_personal_book_household_tags(
    new.id, new.owner_id, new.corpus_work_id
  );
  return new;
end;
$$;

revoke all on function public.sync_book_tags_to_household()
  from public, anon, authenticated, service_role;

create trigger books_sync_household_enrichment
  after update of tags on public.books
  for each row execute function public.sync_book_tags_to_household();

create function public.sync_book_tropes_to_household()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  old_work uuid;
  new_work uuid;
begin
  if tg_op = 'UPDATE' and old.book_id is distinct from new.book_id then
    -- Capture both bindings before either book-row wait. A server rebind that is already in flight
    -- must not cause this independent join edit to adopt the newly committed corpus identity.
    select b.corpus_work_id into old_work
    from public.books b
    where b.id = old.book_id and b.owner_id = old.owner_id;
    select b.corpus_work_id into new_work
    from public.books b
    where b.id = new.book_id and b.owner_id = new.owner_id;

    -- A service/operator move still refreshes both snapshots. Lock both personal books before
    -- either helper can acquire a household lock; UUID ordering prevents opposite moves from
    -- forming a book-to-book cycle.
    perform 1
    from public.books b
    where b.id in (old.book_id, new.book_id)
    order by b.id
    for update;

    -- Locks are ordered by UUID above, but snapshots follow move semantics: remove from the source,
    -- then publish the destination as the final state. When duplicate personal copies share one
    -- household/work overlay, an empty source snapshot must not overwrite the moved destination.
    perform public.sync_personal_book_household_tropes(
      old.book_id, old.owner_id, old_work
    );
    perform public.sync_personal_book_household_tropes(
      new.book_id, new.owner_id, new_work
    );
  elsif tg_op = 'DELETE' then
    select b.corpus_work_id into old_work
    from public.books b
    where b.id = old.book_id and b.owner_id = old.owner_id;
    perform public.sync_personal_book_household_tropes(
      old.book_id, old.owner_id, old_work
    );
  else
    select b.corpus_work_id into new_work
    from public.books b
    where b.id = new.book_id and b.owner_id = new.owner_id;
    perform public.sync_personal_book_household_tropes(
      new.book_id, new.owner_id, new_work
    );
  end if;
  return coalesce(new, old);
end;
$$;

revoke all on function public.sync_book_tropes_to_household()
  from public, anon, authenticated, service_role;

create trigger book_tropes_sync_household_enrichment
  after insert or update or delete on public.book_tropes
  for each row execute function public.sync_book_tropes_to_household();

-- Existing linked households start with owned books only. Borrowed consent cannot be inferred from
-- the old derived view, and wishlist / reading history never creates household membership.
insert into public.household_works (household_id, work_id, added_by, inclusion_source)
select distinct hm.household_id, b.corpus_work_id, b.owner_id, 'owned'
from public.household_members hm
join public.books b on b.owner_id = hm.user_id
where b.removed_at is null and b.ownership = 'owned'
on conflict (household_id, work_id) do nothing;

-- Deployment deliberately does not publish historical personal tags or tropes into household
-- overlays. Reconciliation starts with an inventory/dry run and explicit owner approval, then uses
-- a separately reviewed target-scoped operator data fix. Subsequent reader edits still synchronize
-- through the triggers above.

create function public.add_personal_book_to_household(p_book uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  target_household uuid;
  target_work uuid;
  target_owned boolean;
  target_borrowed boolean;
begin
  select b.corpus_work_id, b.ownership = 'owned', b.borrowed
  into target_work, target_owned, target_borrowed
  from public.books b
  where b.id = p_book and b.owner_id = caller and b.removed_at is null
  for update;

  if target_work is null then
    raise exception 'active personal book not found' using errcode = 'P0002';
  end if;
  if not target_owned and not target_borrowed then
    raise exception 'only an owned or borrowed personal book can join the household'
      using errcode = '23514';
  end if;

  select hm.household_id into target_household
  from public.household_members hm where hm.user_id = caller;
  if target_household is null then
    raise exception 'account is not linked to a household' using errcode = 'P0002';
  end if;

  perform 1 from public.households h where h.id = target_household for update;
  if not exists (
    select 1 from public.household_members hm
    where hm.household_id = target_household and hm.user_id = caller
  ) or not exists (
    select 1 from public.books b
    where b.id = p_book and b.owner_id = caller and b.removed_at is null
      and b.corpus_work_id = target_work and (b.ownership = 'owned' or b.borrowed)
  ) then
    raise exception 'household membership or personal-book eligibility changed during update'
      using errcode = '40001';
  end if;
  insert into public.household_works (
    household_id, work_id, added_by, inclusion_source, removed_at, removed_by
  ) values (
    target_household, target_work, caller, case when target_owned then 'owned' else 'borrowed' end,
    null, null
  )
  on conflict (household_id, work_id) do update
  set removed_at = null,
      removed_by = null,
      added_by = coalesce(public.household_works.added_by, excluded.added_by),
      inclusion_source = case
        when public.household_works.inclusion_source = 'reconciliation'
          then public.household_works.inclusion_source
        else excluded.inclusion_source
      end;

  if not target_owned then
    insert into public.household_book_shares (
      book_id, household_id, work_id, shared_by, removed_at, removed_by
    ) values (p_book, target_household, target_work, caller, null, null)
    on conflict (book_id) do update
    set household_id = excluded.household_id,
        work_id = excluded.work_id,
        shared_by = excluded.shared_by,
        shared_at = now(),
        removed_at = null,
        removed_by = null;
  end if;

  return target_work;
end;
$$;

revoke all on function public.add_personal_book_to_household(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.add_personal_book_to_household(uuid) to authenticated;

create function public.remove_personal_book_from_household(p_book uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  target_household uuid;
  target_work uuid;
begin
  select s.household_id, s.work_id
  into target_household, target_work
  from public.household_book_shares s
  join public.books b on b.id = s.book_id
  where s.book_id = p_book and b.owner_id = caller and s.removed_at is null
  for update of s;
  if target_household is null then
    raise exception 'active personal household share not found' using errcode = 'P0002';
  end if;

  perform 1 from public.households h where h.id = target_household for update;
  if not exists (
    select 1 from public.household_members hm
    where hm.household_id = target_household and hm.user_id = caller
  ) or not exists (
    select 1 from public.household_book_shares s
    join public.books b on b.id = s.book_id
    where s.book_id = p_book and s.household_id = target_household
      and s.work_id = target_work and s.removed_at is null and b.owner_id = caller
  ) then
    raise exception 'household membership or personal share changed during update'
      using errcode = '40001';
  end if;
  update public.household_book_shares
  set removed_at = now(), removed_by = caller
  where book_id = p_book;

  if not exists (
    select 1 from public.household_book_shares s
    where s.household_id = target_household and s.work_id = target_work and s.removed_at is null
  ) and not exists (
    select 1
    from public.household_members hm
    join public.books b on b.owner_id = hm.user_id
    where hm.household_id = target_household and b.corpus_work_id = target_work
      and b.removed_at is null and b.ownership = 'owned'
  ) and exists (
    select 1 from public.household_works hw
    where hw.household_id = target_household and hw.work_id = target_work
      and hw.inclusion_source = 'borrowed' and hw.removed_at is null
  ) then
    update public.household_works
    set removed_at = now(), removed_by = caller
    where household_id = target_household and work_id = target_work;
  end if;

  return target_work;
end;
$$;

revoke all on function public.remove_personal_book_from_household(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.remove_personal_book_from_household(uuid) to authenticated;

create function public.remove_household_work(p_work uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  target_household uuid;
begin
  select hm.household_id into target_household
  from public.household_members hm where hm.user_id = caller;
  if target_household is null then
    raise exception 'account is not linked to a household' using errcode = 'P0002';
  end if;

  perform 1 from public.households h where h.id = target_household for update;
  if not exists (
    select 1 from public.household_members hm
    where hm.household_id = target_household and hm.user_id = caller
  ) then
    raise exception 'household membership changed during update' using errcode = '40001';
  end if;
  perform 1 from public.household_works hw
  where hw.household_id = target_household and hw.work_id = p_work and hw.removed_at is null
  for update;
  if not found then
    raise exception 'household work not found' using errcode = 'P0002';
  end if;

  if exists (
    select 1
    from public.household_members hm
    join public.books b on b.owner_id = hm.user_id
    where hm.household_id = target_household
      and b.corpus_work_id = p_work
      and b.removed_at is null
      and b.ownership = 'owned'
  ) then
    raise exception 'an owned personal copy keeps this work in the household'
      using errcode = '23514';
  end if;

  update public.household_works
  set removed_at = now(), removed_by = caller
  where household_id = target_household and work_id = p_work;
  update public.household_book_shares
  set removed_at = now(), removed_by = caller
  where household_id = target_household and work_id = p_work and removed_at is null;
  return p_work;
end;
$$;

revoke all on function public.remove_household_work(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.remove_household_work(uuid) to authenticated;

create function public.remove_personal_book(p_book uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  removed uuid;
begin
  update public.books
  set removed_at = now(), removed_by = caller
  where id = p_book and owner_id = caller and removed_at is null
  returning id into removed;
  if removed is null then
    raise exception 'active personal book not found' using errcode = 'P0002';
  end if;
  return removed;
end;
$$;

revoke all on function public.remove_personal_book(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.remove_personal_book(uuid) to authenticated;

create function public.restore_personal_book(p_book uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  restored uuid;
begin
  update public.books
  set removed_at = null, removed_by = null
  where id = p_book and owner_id = caller and removed_at is not null
  returning id into restored;
  if restored is null then
    raise exception 'removed personal book not found' using errcode = 'P0002';
  end if;
  return restored;
end;
$$;

revoke all on function public.restore_personal_book(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.restore_personal_book(uuid) to authenticated;

create function public.update_household_work_enrichment(
  p_work uuid,
  p_tags text[],
  p_tropes jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  target_household uuid;
begin
  if jsonb_typeof(coalesce(p_tropes, '[]'::jsonb)) <> 'array' then
    raise exception 'household tropes must be a JSON array' using errcode = '22023';
  end if;

  select hm.household_id into target_household
  from public.household_members hm where hm.user_id = caller;
  if target_household is null then
    raise exception 'account is not linked to a household' using errcode = 'P0002';
  end if;

  perform 1 from public.households h where h.id = target_household for update;
  if not exists (
    select 1 from public.household_members hm
    where hm.household_id = target_household and hm.user_id = caller
  ) then
    raise exception 'household membership changed during update' using errcode = '40001';
  end if;

  perform 1 from public.household_works hw
  where hw.household_id = target_household and hw.work_id = p_work and hw.removed_at is null
  for update;
  if not found then
    raise exception 'household work not found' using errcode = 'P0002';
  end if;

  insert into public.household_work_enrichment (
    household_id, work_id, tags, tropes, updated_by
  ) values (
    target_household,
    p_work,
    array(
      select distinct trim(tag)
      from unnest(coalesce(p_tags, '{}')) tag
      where trim(tag) <> ''
      order by trim(tag)
    ),
    coalesce(p_tropes, '[]'::jsonb),
    caller
  )
  on conflict (household_id, work_id) do update
  set tags = excluded.tags,
      tropes = excluded.tropes,
      updated_by = excluded.updated_by;

  return p_work;
end;
$$;

revoke all on function public.update_household_work_enrichment(uuid, text[], jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.update_household_work_enrichment(uuid, text[], jsonb)
  to authenticated;

create function public.update_corpus_work_metadata(
  p_work uuid,
  p_genre text,
  p_subgenre text,
  p_genres text[],
  p_subgenres text[],
  p_cover_url text,
  p_cover_options jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  before_value jsonb;
  after_value jsonb;
  target_book uuid;
  target_household uuid;
  option jsonb;
  option_url text;
  desired_cover text := nullif(trim(p_cover_url), '');
begin
  if caller is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if jsonb_typeof(coalesce(p_cover_options, '[]'::jsonb)) <> 'array' then
    raise exception 'cover options must be a JSON array' using errcode = '22023';
  end if;
  select b.id into target_book
  from public.books b
  where b.owner_id = caller and b.corpus_work_id = p_work and b.removed_at is null
    and public.book_corpus_binding_is_unambiguous(
      b.corpus_work_id,
      b.title,
      coalesce(
        nullif(b.authors_display, ''), trim(concat_ws(' ', b.author_first, b.author_last))
      ),
      b.isbn
    )
  order by b.id limit 1;
  select hm.household_id into target_household
  from public.household_members hm
  join public.household_works hw on hw.household_id = hm.household_id
  where hm.user_id = caller and hw.work_id = p_work and hw.removed_at is null;
  if target_book is null and target_household is null then
    raise exception 'work is not in an active personal or household library' using errcode = '42501';
  end if;

  if target_book is not null then
    perform 1 from public.books b where b.id = target_book for update;
  end if;
  if target_household is not null then
    perform 1 from public.households h where h.id = target_household for update;
  end if;

  select jsonb_build_object(
    'genre', w.genre,
    'subgenre', w.subgenre,
    'genres', w.genres,
    'subgenres', w.subgenres,
    'coverUrl', w.cover_url,
    'coverOptions', w.cover_options
  ) into before_value
  from public.works w where w.id = p_work
  for update;
  if before_value is null then
    raise exception 'corpus work not found' using errcode = 'P0002';
  end if;

  -- Authorization is intentionally repeated after the book/household and work locks. Each PL/pgSQL
  -- statement receives a fresh READ COMMITTED snapshot, so a revocation that won the lock race is
  -- observed here instead of authorizing from the stale pre-lock read.
  if not exists (
    select 1 from public.books b
    where target_book is not null and b.id = target_book
      and b.owner_id = caller and b.corpus_work_id = p_work and b.removed_at is null
      and public.book_corpus_binding_is_unambiguous(
        b.corpus_work_id,
        b.title,
        coalesce(
          nullif(b.authors_display, ''), trim(concat_ws(' ', b.author_first, b.author_last))
        ),
        b.isbn
      )
  ) and not exists (
    select 1
    from public.household_members hm
    join public.household_works hw on hw.household_id = hm.household_id
    where target_household is not null and hm.household_id = target_household
      and hm.user_id = caller and hw.work_id = p_work and hw.removed_at is null
  ) then
    raise exception 'work eligibility changed during update' using errcode = '40001';
  end if;

  if (
    select count(*) <> count(distinct value ->> 'url')
    from jsonb_array_elements(coalesce(p_cover_options, '[]'::jsonb)) value
  ) then
    raise exception 'cover option URLs must be unique' using errcode = '22023';
  end if;

  for option in select value from jsonb_array_elements(coalesce(p_cover_options, '[]'::jsonb))
  loop
    if not public.corpus_cover_option_is_valid(option) then
      raise exception 'cover options must use the reviewed url/source/sourceUrl schema'
        using errcode = '22023';
    end if;

    option_url := trim(option ->> 'url');
    if not exists (
      select 1 from jsonb_array_elements(before_value -> 'coverOptions') current_option
      where current_option = option
    ) and not exists (
      select 1 from public.books b
      where target_book is not null and b.id = target_book
        and b.owner_id = caller and b.corpus_work_id = p_work and b.removed_at is null
        and public.book_corpus_binding_is_unambiguous(
          b.corpus_work_id,
          b.title,
          coalesce(
            nullif(b.authors_display, ''), trim(concat_ws(' ', b.author_first, b.author_last))
          ),
          b.isbn
        )
        and public.hosted_book_cover_object_name(option_url, caller, b.id) is not null
    ) then
      raise exception 'new corpus covers must come from the hosted cover ingestion pipeline'
        using errcode = '22023';
    end if;
  end loop;

  if desired_cover is not null
    and desired_cover is distinct from (before_value ->> 'coverUrl')
    and not exists (
      select 1 from jsonb_array_elements(coalesce(p_cover_options, '[]'::jsonb)) value
      where value ->> 'url' = desired_cover
    ) then
    raise exception 'the canonical cover must be an accepted cover option' using errcode = '22023';
  end if;

  update public.works
  set genre = nullif(lower(trim(p_genre)), ''),
      subgenre = nullif(lower(trim(p_subgenre)), ''),
      genres = array(
        select distinct lower(trim(value))
        from unnest(coalesce(p_genres, '{}')) value
        where trim(value) <> ''
        order by lower(trim(value))
      ),
      subgenres = array(
        select distinct lower(trim(value))
        from unnest(coalesce(p_subgenres, '{}')) value
        where trim(value) <> ''
        order by lower(trim(value))
      ),
      cover_url = desired_cover,
      cover_options = coalesce(p_cover_options, '[]'::jsonb)
  where id = p_work;

  select jsonb_build_object(
    'genre', w.genre,
    'subgenre', w.subgenre,
    'genres', w.genres,
    'subgenres', w.subgenres,
    'coverUrl', w.cover_url,
    'coverOptions', w.cover_options
  ) into after_value
  from public.works w where w.id = p_work;

  if after_value is distinct from before_value then
    insert into public.work_metadata_edits (
      work_id, editor_id, previous_value, next_value
    ) values (p_work, caller, before_value, after_value);
  end if;

  return p_work;
end;
$$;

revoke all on function public.update_corpus_work_metadata(
  uuid, text, text, text[], text[], text, jsonb
) from public, anon, authenticated, service_role;
grant execute on function public.update_corpus_work_metadata(
  uuid, text, text, text[], text[], text, jsonb
) to authenticated;

create function public.household_library_works()
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
    coalesce(e.tropes, '[]'::jsonb),
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
        'format', b.format
        ,'shared', exists (
          select 1 from public.household_book_shares s
          where s.book_id = b.id and s.household_id = hw.household_id and s.removed_at is null
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

revoke all on function public.household_library_works()
  from public, anon, authenticated, service_role;
grant execute on function public.household_library_works() to authenticated;

-- The staged-deploy compatibility path keeps its signature for the currently deployed client, but
-- uses the same privacy sources as the work-level contract: owned copies or this exact book's active
-- household share. Wishlist is never a household field and is returned as false for every row.
create or replace function public.household_library_books()
returns table (
  book_id uuid, owner_id uuid, owner_name text, title text, author text, cover_url text,
  cover_thumb_url text, cover_color text, series_name text, series_position numeric,
  series_count smallint, series_status text, primary_genre text, genres text[], subgenre text,
  subgenres text[], isbn text, ownership text, borrowed boolean, wishlist boolean,
  owned_physical text, owned_ebook boolean, owned_audiobook boolean, book_format text,
  pub_y smallint, pub_m smallint, pub_d smallint, added_at timestamptz
)
language sql
security definer
stable
set search_path = ''
as $$
  select
    b.id, b.owner_id, p.display_name, b.title,
    coalesce(nullif(b.authors_display, ''), trim(concat_ws(' ', b.author_first, b.author_last))),
    b.cover_url, b.cover_thumb_url, b.cover_color, b.series, b.position, b.series_count, b.status,
    b.genre, b.genres, b.subgenre, b.subgenres, b.isbn, b.ownership, b.borrowed, false,
    b.owned_physical, b.owned_ebook, b.owned_audiobook, b.format, b.pub_y, b.pub_m, b.pub_d,
    b.added_at
  from public.household_members mine
  join public.household_members member on member.household_id = mine.household_id
  join public.books b on b.owner_id = member.user_id and b.removed_at is null
  join public.profiles p on p.id = b.owner_id
  where mine.user_id = (select auth.uid())
    and (
      b.ownership = 'owned'
      or exists (
        select 1 from public.household_book_shares s
        where s.book_id = b.id
          and s.household_id = mine.household_id
          and s.work_id = b.corpus_work_id
          and s.removed_at is null
      )
    )
  order by p.display_name nulls last, b.title, b.id;
$$;

revoke all on function public.household_library_books()
  from public, anon, authenticated, service_role;
grant execute on function public.household_library_books() to authenticated;
