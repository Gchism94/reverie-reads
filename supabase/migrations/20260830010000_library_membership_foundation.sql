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
    check (creation_source in ('corpus_import', 'legacy_personal_backfill', 'reader_add')),
  add column created_by uuid references public.profiles (id) on delete set null,
  add constraint works_cover_options_array_check check (jsonb_typeof(cover_options) = 'array');

-- SQL twin of packages/core/src/normalize.ts's workKeyOf: lowercase, then strip every byte that
-- is not ASCII a-z or 0-9. Keep this internal so identity cannot drift between triggers.
create function public.library_work_key(p_title text, p_author text)
returns text
language sql
immutable
set search_path = ''
as $$
  select regexp_replace(lower(coalesce(p_title, '')), '[^a-z0-9]', '', 'g')
    || '|'
    || regexp_replace(lower(coalesce(p_author, '')), '[^a-z0-9]', '', 'g');
$$;

revoke all on function public.library_work_key(text, text)
  from public, anon, authenticated, service_role;

alter table public.books
  add column corpus_work_id uuid references public.works (id) on delete restrict,
  add column removed_at timestamptz,
  add column removed_by uuid references public.profiles (id) on delete set null;

create index books_corpus_work_idx on public.books (corpus_work_id);
create index books_owner_active_idx on public.books (owner_id, added_at, id)
  where removed_at is null;

-- Every legacy personal row gets a corpus anchor. This is deliberately INSERT-only for existing
-- works: a reader copy never overwrites curated corpus metadata. Missing rows are provisional and
-- attributable, so later curation can review their origin instead of treating them as sourced fact.
with candidates as (
  select distinct on (work_key)
    b.owner_id,
    public.library_work_key(
      b.title,
      coalesce(nullif(b.authors_display, ''), trim(concat_ws(' ', b.author_first, b.author_last)))
    ) as work_key,
    b.title,
    coalesce(nullif(b.authors_display, ''), trim(concat_ws(' ', b.author_first, b.author_last))) as author,
    b.series,
    b.position,
    b.series_count,
    b.status,
    b.pages,
    b.pub_y,
    b.pub_m,
    b.pub_d,
    b.cover_url,
    b.cover_source,
    b.cover_source_url,
    b.cover_color,
    b.genre,
    b.subgenre,
    b.subgenres,
    b.genres,
    b.tags,
    b.isbn,
    regexp_replace(coalesce(b.isbn, ''), '[^0-9]', '', 'g') as normalized_isbn
  from public.books b
  order by work_key, b.updated_at desc, b.id
)
insert into public.works (
  work_key, title, contributors, author_text, series, position, series_count, status, pages,
  pub_y, pub_m, pub_d, cover_url, cover_source, cover_source_url, cover_color, genre, subgenre,
  subgenres, genres, tags, isbns, cover_options, metadata_status, creation_source, created_by
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
  c.cover_url,
  c.cover_source,
  c.cover_source_url,
  c.cover_color,
  nullif(c.genre, ''),
  c.subgenre,
  coalesce(c.subgenres, '{}'),
  coalesce(c.genres, '{}'),
  coalesce(c.tags, '{}'),
  case
    when c.normalized_isbn ~ '^[0-9]{13}$'
      then array[c.normalized_isbn]
    else '{}'
  end,
  case when c.cover_url is null then '[]'::jsonb else jsonb_build_array(jsonb_strip_nulls(
    jsonb_build_object('url', c.cover_url, 'source', c.cover_source, 'sourceUrl', c.cover_source_url)
  )) end,
  'provisional',
  'legacy_personal_backfill',
  c.owner_id
from candidates c
where not exists (
  select 1 from public.works existing
  where (
    c.normalized_isbn ~ '^[0-9]{13}$'
    and c.normalized_isbn = any(existing.isbns)
  ) or public.library_work_key(existing.title, existing.author_text) = c.work_key
)
on conflict (work_key) do nothing;

update public.books b
set corpus_work_id = (
  select w.id
  from public.works w
  where (
    regexp_replace(coalesce(b.isbn, ''), '[^0-9]', '', 'g') ~ '^[0-9]{13}$'
    and regexp_replace(b.isbn, '[^0-9]', '', 'g') = any(w.isbns)
  ) or public.library_work_key(w.title, w.author_text) = public.library_work_key(
    b.title,
    coalesce(nullif(b.authors_display, ''), trim(concat_ws(' ', b.author_first, b.author_last)))
  )
  order by (
    regexp_replace(coalesce(b.isbn, ''), '[^0-9]', '', 'g') ~ '^[0-9]{13}$'
    and regexp_replace(b.isbn, '[^0-9]', '', 'g') = any(w.isbns)
  ) desc, w.id
  limit 1
)
where b.corpus_work_id is null
  and exists (
    select 1 from public.works w
    where (
      regexp_replace(coalesce(b.isbn, ''), '[^0-9]', '', 'g') ~ '^[0-9]{13}$'
      and regexp_replace(b.isbn, '[^0-9]', '', 'g') = any(w.isbns)
    ) or public.library_work_key(w.title, w.author_text) = public.library_work_key(
      b.title,
      coalesce(nullif(b.authors_display, ''), trim(concat_ws(' ', b.author_first, b.author_last)))
    )
  );

alter table public.books alter column corpus_work_id set not null;

-- New personal rows always retain a corpus anchor. Supplying a reviewed corpus_work_id (the
-- Discover/Add path) preserves it; otherwise the trigger creates or reuses a provisional work.
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
begin
  if new.corpus_work_id is not null then
    return new;
  end if;

  author_name := coalesce(
    nullif(new.authors_display, ''),
    trim(concat_ws(' ', new.author_first, new.author_last))
  );
  target_key := public.library_work_key(new.title, author_name);
  normalized_isbn := regexp_replace(coalesce(new.isbn, ''), '[^0-9]', '', 'g');

  select w.id into target_work
  from public.works w
  where (
    normalized_isbn ~ '^[0-9]{13}$' and normalized_isbn = any(w.isbns)
  ) or public.library_work_key(w.title, w.author_text) = target_key
  order by (normalized_isbn ~ '^[0-9]{13}$' and normalized_isbn = any(w.isbns)) desc, w.id
  limit 1;

  if target_work is null then
    insert into public.works (
      work_key, title, contributors, author_text, series, position, series_count, status, pages,
      pub_y, pub_m, pub_d, cover_url, cover_source, cover_source_url, cover_color, genre, subgenre,
      subgenres, genres, tags, isbns, cover_options, metadata_status, creation_source, created_by
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
      new.cover_url,
      new.cover_source,
      new.cover_source_url,
      new.cover_color,
      nullif(new.genre, ''),
      new.subgenre,
      coalesce(new.subgenres, '{}'),
      coalesce(new.genres, '{}'),
      coalesce(new.tags, '{}'),
      case when normalized_isbn ~ '^[0-9]{13}$' then array[normalized_isbn] else '{}' end,
      case when new.cover_url is null then '[]'::jsonb else jsonb_build_array(jsonb_strip_nulls(
        jsonb_build_object(
          'url', new.cover_url, 'source', new.cover_source, 'sourceUrl', new.cover_source_url
        )
      )) end,
      'provisional',
      'reader_add',
      new.owner_id
    )
    on conflict (work_key) do nothing
    returning id into target_work;

    if target_work is null then
      select w.id into target_work from public.works w where w.work_key = target_key;
    end if;
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
begin
  -- Operator imports and background repair jobs keep their explicit corpus write path. Only a
  -- reader editing their own active row promotes these reviewed objective fields automatically.
  if caller is null or caller <> new.owner_id or new.removed_at is not null then return new; end if;

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
      cover_url = coalesce(w.cover_url, nullif(trim(new.cover_url), '')),
      cover_options = case
        when nullif(trim(new.cover_url), '') is null then w.cover_options
        when exists (
          select 1 from jsonb_array_elements(w.cover_options) option
          where option ->> 'url' = new.cover_url
        ) then w.cover_options
        else w.cover_options || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
          'url', new.cover_url,
          'source', new.cover_source,
          'sourceUrl', new.cover_source_url
        )))
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
-- concurrent final unlink cannot resurrect a row in a deleted household.
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

  perform public.sync_personal_book_household_enrichment(p_book);
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

-- Tags and tropes are shared household enrichment, not corpus metadata and not private reading
-- state. Whenever a personal copy is edited, copy only those reviewed fields to an already-active
-- household work. Ratings, favourites, reads, plans, progress, moods, and notes never enter this
-- function and therefore cannot leak through an accidental broad row copy.
create function public.sync_personal_book_household_enrichment(p_book uuid)
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
  target_tropes jsonb;
begin
  select hm.household_id, b.corpus_work_id, b.owner_id, b.tags
  into target_household, target_work, target_owner, target_tags
  from public.books b
  join public.household_members hm on hm.user_id = b.owner_id
  join public.household_works hw on hw.household_id = hm.household_id
    and hw.work_id = b.corpus_work_id and hw.removed_at is null
  where b.id = p_book and b.removed_at is null;

  if target_household is null then return; end if;

  select coalesce(jsonb_agg(
    jsonb_build_object('id', t.id, 'name', t.name, 'emphasis', bt.emphasis)
    order by case when bt.emphasis = 'pinned' then 0 else 1 end, lower(t.name), t.id
  ), '[]'::jsonb)
  into target_tropes
  from public.book_tropes bt
  join public.tropes t on t.id = bt.trope_id
  where bt.book_id = p_book;

  insert into public.household_work_enrichment (
    household_id, work_id, tags, tropes, updated_by
  ) values (
    target_household,
    target_work,
    coalesce(target_tags, '{}'),
    target_tropes,
    target_owner
  )
  on conflict (household_id, work_id) do update
  set tags = excluded.tags,
      tropes = excluded.tropes,
      updated_by = excluded.updated_by;
end;
$$;

revoke all on function public.sync_personal_book_household_enrichment(uuid)
  from public, anon, authenticated, service_role;

create function public.sync_book_tags_to_household()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.sync_personal_book_household_enrichment(new.id);
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
begin
  perform public.sync_personal_book_household_enrichment(coalesce(new.book_id, old.book_id));
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

-- Choose one deterministic active personal copy as the initial household overlay. Later explicit
-- edits are last-writer-wins through the triggers above; this backfill never guesses from private
-- ratings or reading state.
do $$
declare
  source_book uuid;
begin
  for source_book in
    select distinct on (hm.household_id, b.corpus_work_id) b.id
    from public.household_members hm
    join public.books b on b.owner_id = hm.user_id
    join public.household_works hw on hw.household_id = hm.household_id
      and hw.work_id = b.corpus_work_id and hw.removed_at is null
    where b.removed_at is null
    order by hm.household_id, b.corpus_work_id, b.updated_at desc, b.id
  loop
    perform public.sync_personal_book_household_enrichment(source_book);
  end loop;
end;
$$;

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

  perform public.sync_personal_book_household_enrichment(p_book);

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
    select 1 from public.household_works hw
    where hw.household_id = target_household and hw.work_id = p_work and hw.removed_at is null
  ) then
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
begin
  if caller is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if jsonb_typeof(coalesce(p_cover_options, '[]'::jsonb)) <> 'array' then
    raise exception 'cover options must be a JSON array' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.books b
    where b.owner_id = caller and b.corpus_work_id = p_work and b.removed_at is null
  ) and not exists (
    select 1
    from public.household_members hm
    join public.household_works hw on hw.household_id = hm.household_id
    where hm.user_id = caller and hw.work_id = p_work and hw.removed_at is null
  ) then
    raise exception 'work is not in an active personal or household library' using errcode = '42501';
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
      cover_url = nullif(trim(p_cover_url), ''),
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
      and (b.ownership = 'owned' or b.borrowed)
    join public.profiles p on p.id = member.user_id
    where member.household_id = hw.household_id
  ) copies on true
  where mine.user_id = (select auth.uid())
  order by w.title, w.id;
$$;

revoke all on function public.household_library_works()
  from public, anon, authenticated, service_role;
grant execute on function public.household_library_works() to authenticated;

-- The staged-deploy compatibility path must also hide archived personal rows immediately. Its
-- signature and curated field list stay unchanged for the currently deployed client.
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
    b.genre, b.genres, b.subgenre, b.subgenres, b.isbn, b.ownership, b.borrowed, b.wishlist,
    b.owned_physical, b.owned_ebook, b.owned_audiobook, b.format, b.pub_y, b.pub_m, b.pub_d,
    b.added_at
  from public.household_members mine
  join public.household_members member on member.household_id = mine.household_id
  join public.books b on b.owner_id = member.user_id and b.removed_at is null
  join public.profiles p on p.id = b.owner_id
  where mine.user_id = (select auth.uid())
  order by p.display_name nulls last, b.title, b.id;
$$;

revoke all on function public.household_library_books()
  from public, anon, authenticated, service_role;
grant execute on function public.household_library_books() to authenticated;
