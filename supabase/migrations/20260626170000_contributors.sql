-- D2: ordered, multi-contributor authorship (docs/DATA_MODEL.md). The single author_first/last on
-- books stays as the denormalized PRIMARY author (back-compat reads keep working during the
-- transition); the normalized authors + book_authors carry the full ordered, role-tagged list so
-- "all books by author", author filters, and Wrapped most-read authors are real queries.

-- ── authors: one row per distinct name per owner (deduped by a normalized key) ──
create table public.authors (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  name_key text not null, -- normalized (lower, collapsed whitespace) — matches core normalizeName
  created_at timestamptz not null default now(),
  unique (owner_id, name_key)
);
alter table public.authors enable row level security;
create policy "authors: select own" on public.authors for select using (owner_id = (select auth.uid()));
create policy "authors: insert own" on public.authors for insert with check (owner_id = (select auth.uid()));
create policy "authors: update own" on public.authors for update using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy "authors: delete own" on public.authors for delete using (owner_id = (select auth.uid()));

-- ── book_authors: ordered, role-tagged link between a book and a contributor ──
create table public.book_authors (
  book_id uuid not null references public.books (id) on delete cascade,
  author_id uuid not null references public.authors (id) on delete cascade,
  owner_id uuid not null references auth.users (id) on delete cascade,
  position int not null default 0,
  role text not null default 'author'
    check (role in ('author', 'co_author', 'translator', 'illustrator', 'narrator', 'editor')),
  primary key (book_id, author_id, role)
);
create index book_authors_book_idx on public.book_authors (book_id);
create index book_authors_author_idx on public.book_authors (author_id);
alter table public.book_authors enable row level security;
create policy "book_authors: select own" on public.book_authors for select using (owner_id = (select auth.uid()));
create policy "book_authors: insert own" on public.book_authors for insert with check (owner_id = (select auth.uid()));
create policy "book_authors: update own" on public.book_authors for update using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy "book_authors: delete own" on public.book_authors for delete using (owner_id = (select auth.uid()));

grant select, insert, update, delete on public.authors to authenticated;
grant select, insert, update, delete on public.book_authors to authenticated;
grant all on public.authors to service_role;
grant all on public.book_authors to service_role;

-- Denormalized byline cache for cheap rendering where the join isn't loaded.
alter table public.books add column authors_display text;

-- ── Backfill (idempotent: re-running adds nothing new) ──
-- The normalized display name from the existing first/last columns.
create or replace function public.pg_temp_author_name(p_first text, p_last text)
returns text language sql immutable as $$
  select btrim(regexp_replace(btrim(coalesce(p_first, '') || ' ' || coalesce(p_last, '')), '\s+', ' ', 'g'))
$$;

insert into public.authors (owner_id, name, name_key)
select distinct on (owner_id, lower(public.pg_temp_author_name(author_first, author_last)))
  owner_id,
  public.pg_temp_author_name(author_first, author_last),
  lower(public.pg_temp_author_name(author_first, author_last))
from public.books
where public.pg_temp_author_name(author_first, author_last) <> ''
on conflict (owner_id, name_key) do nothing;

insert into public.book_authors (book_id, author_id, owner_id, position, role)
select b.id, a.id, b.owner_id, 0, 'author'
from public.books b
join public.authors a
  on a.owner_id = b.owner_id
  and a.name_key = lower(public.pg_temp_author_name(b.author_first, b.author_last))
where public.pg_temp_author_name(b.author_first, b.author_last) <> ''
on conflict (book_id, author_id, role) do nothing;

update public.books
set authors_display = public.pg_temp_author_name(author_first, author_last)
where authors_display is null
  and public.pg_temp_author_name(author_first, author_last) <> '';

drop function public.pg_temp_author_name(text, text);

-- ── set_book_contributors: replace a book's contributor list atomically ──
-- p_contributors = jsonb array of { name, role, position }. Upserts authors (deduped by name_key),
-- replaces the book_authors rows, and refreshes the denormalized primary (first/last) + byline.
create or replace function public.set_book_contributors(
  p_book uuid,
  p_contributors jsonb,
  p_first text,
  p_last text,
  p_display text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := (select auth.uid());
  c jsonb;
  aid uuid;
  nkey text;
begin
  if not exists (select 1 from public.books where id = p_book and owner_id = uid) then
    raise exception 'not owner of book';
  end if;

  delete from public.book_authors where book_id = p_book and owner_id = uid;

  for c in select * from jsonb_array_elements(coalesce(p_contributors, '[]'::jsonb)) loop
    nkey := lower(btrim(regexp_replace(c ->> 'name', '\s+', ' ', 'g')));
    continue when nkey = '';
    insert into public.authors (owner_id, name, name_key)
      values (uid, btrim(c ->> 'name'), nkey)
      on conflict (owner_id, name_key) do update set name = excluded.name
      returning id into aid;
    insert into public.book_authors (book_id, author_id, owner_id, position, role)
      values (p_book, aid, uid, coalesce((c ->> 'position')::int, 0), coalesce(c ->> 'role', 'author'))
      on conflict (book_id, author_id, role) do update set position = excluded.position;
  end loop;

  update public.books
    set author_first = nullif(p_first, ''),
        author_last = nullif(p_last, ''),
        authors_display = nullif(p_display, '')
    where id = p_book and owner_id = uid;
end;
$$;
grant execute on function public.set_book_contributors(uuid, jsonb, text, text, text) to authenticated;

-- ── merge_books: recreate to also reconcile contributor LISTS (union, dedupe, preserve order) ──
create or replace function public.merge_books(p_primary uuid, p_loser uuid, p_fields jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := (select auth.uid());
begin
  if p_primary = p_loser then
    raise exception 'cannot merge a book into itself';
  end if;
  if not exists (select 1 from public.books where id = p_primary and owner_id = uid) then
    raise exception 'not owner of primary book';
  end if;
  if not exists (select 1 from public.books where id = p_loser and owner_id = uid) then
    raise exception 'not owner of loser book';
  end if;

  -- 1. Carry the loser's reads onto the primary (dedup by date). Undated reads always move.
  insert into public.reads (book_id, owner_id, read_on, format, rating, notes)
  select p_primary, uid, r.read_on, r.format, r.rating, r.notes
  from public.reads r
  where r.book_id = p_loser
    and (
      r.read_on is null
      or not exists (select 1 from public.reads p where p.book_id = p_primary and p.read_on = r.read_on)
    );

  -- 2. Carry the loser's list memberships onto the primary.
  insert into public.list_items (list_id, book_id, owner_id, position)
  select li.list_id, p_primary, uid, li.position
  from public.list_items li
  where li.book_id = p_loser
  on conflict (list_id, book_id) do nothing;

  -- 3. Union the loser's contributors onto the primary (append after primary's; dedupe by
  --    author+role), then renumber positions in order.
  insert into public.book_authors (book_id, author_id, owner_id, position, role)
  select p_primary, ba.author_id, uid, ba.position + 1000, ba.role
  from public.book_authors ba
  where ba.book_id = p_loser
  on conflict (book_id, author_id, role) do nothing;

  with ranked as (
    select author_id, role, (row_number() over (order by position) - 1) as rn
    from public.book_authors where book_id = p_primary
  )
  update public.book_authors ba set position = r.rn
  from ranked r
  where ba.book_id = p_primary and ba.author_id = r.author_id and ba.role = r.role;

  -- 4. Apply the merged scalar/array fields to the primary.
  update public.books set
    title           = coalesce(p_fields ->> 'title', title),
    author_first    = coalesce(p_fields ->> 'author_first', author_first),
    author_last     = coalesce(p_fields ->> 'author_last', author_last),
    series          = coalesce(p_fields ->> 'series', series),
    position        = coalesce((p_fields ->> 'position')::numeric, position),
    series_count    = coalesce((p_fields ->> 'series_count')::smallint, series_count),
    status          = coalesce(p_fields ->> 'status', status),
    genre           = coalesce(p_fields ->> 'genre', genre),
    subgenre        = coalesce(p_fields ->> 'subgenre', subgenre),
    genres          = case when p_fields ? 'genres' then array(select jsonb_array_elements_text(p_fields -> 'genres')) else genres end,
    tags            = case when p_fields ? 'tags' then array(select jsonb_array_elements_text(p_fields -> 'tags')) else tags end,
    intensity       = coalesce((p_fields ->> 'intensity')::smallint, intensity),
    cover_url       = coalesce(p_fields ->> 'cover_url', cover_url),
    isbn            = coalesce(p_fields ->> 'isbn', isbn),
    fave            = coalesce((p_fields ->> 'fave')::boolean, fave),
    owned_physical  = case when p_fields ? 'owned_physical' then nullif(p_fields ->> 'owned_physical', '') else owned_physical end,
    owned_ebook     = coalesce((p_fields ->> 'owned_ebook')::boolean, owned_ebook),
    owned_audiobook = coalesce((p_fields ->> 'owned_audiobook')::boolean, owned_audiobook),
    format          = coalesce(p_fields ->> 'format', format),
    rating          = coalesce((p_fields ->> 'rating')::numeric, rating),
    read_status     = coalesce(p_fields ->> 'read_status', read_status),
    source          = coalesce(p_fields ->> 'source', source),
    pub_y           = coalesce((p_fields ->> 'pub_y')::smallint, pub_y),
    pub_m           = coalesce((p_fields ->> 'pub_m')::smallint, pub_m),
    pub_d           = coalesce((p_fields ->> 'pub_d')::smallint, pub_d),
    plan_date       = case when p_fields ? 'plan_date' then (p_fields ->> 'plan_date')::date else plan_date end,
    progress        = coalesce((p_fields ->> 'progress')::smallint, progress),
    boyfriend       = coalesce(p_fields ->> 'boyfriend', boyfriend)
  where id = p_primary;

  -- 5. Refresh the denormalized byline cache from the reconciled author/co-author names.
  update public.books set authors_display = (
    select string_agg(a.name, ', ' order by ba.position)
    from public.book_authors ba join public.authors a on a.id = ba.author_id
    where ba.book_id = p_primary and ba.role in ('author', 'co_author')
  ) where id = p_primary;

  -- 6. Delete the loser (cascade clears its reads + list_items + book_authors).
  delete from public.books where id = p_loser;
end;
$$;
grant execute on function public.merge_books(uuid, uuid, jsonb) to authenticated;
