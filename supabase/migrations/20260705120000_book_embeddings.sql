-- Tier 2 (owner-approved): semantic book embeddings. One 384-dim gte-small vector per book,
-- computed by the embed edge function from a deterministic text signature (title/author/world/
-- tropes/heat — packages/core/src/embedding.ts is the source of truth). A SEPARATE table on
-- purpose: the app's `books` select('*') stays light — vectors never ride along with the library.
-- "More like this" and vibe search are nearest-neighbour SQL over this table, RLS-scoped.

create extension if not exists vector with schema extensions;

create table public.book_embeddings (
  book_id uuid primary key references public.books (id) on delete cascade,
  owner_id uuid not null references public.profiles (id) on delete cascade,
  -- FNV-1a hex of the embedding text; the sweep re-embeds only when this moves
  sig text not null,
  embedding extensions.vector(384) not null,
  updated_at timestamptz not null default now()
);

create index book_embeddings_owner_idx on public.book_embeddings (owner_id);
-- cosine HNSW — a personal library barely needs it, but it keeps similar/vibe snappy at scale
create index book_embeddings_hnsw_idx on public.book_embeddings
  using hnsw (embedding extensions.vector_cosine_ops);

alter table public.book_embeddings enable row level security;

create policy "book_embeddings: own rows" on public.book_embeddings
  for all using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

-- RLS decides WHICH rows; the role still needs base privileges (house rule, grants migration).
grant select, insert, update, delete on public.book_embeddings to authenticated;
grant all on public.book_embeddings to service_role;

-- Nearest library neighbours of one book. SECURITY INVOKER → the books RLS above scopes every
-- read to the caller; gte-small vectors are normalized, so cosine similarity = 1 - distance.
create or replace function public.similar_books(p_book_id uuid, p_count int default 8)
returns table (book_id uuid, similarity real)
language sql stable security invoker
set search_path = public, extensions
as $$
  select e.book_id, (1 - (e.embedding <=> s.embedding))::real as similarity
  from public.book_embeddings e,
       (select embedding from public.book_embeddings where book_id = p_book_id) s
  where e.book_id <> p_book_id
  order by e.embedding <=> s.embedding
  limit p_count
$$;

-- Free-text vibe: the caller's library ranked against a query vector (the edge function embeds
-- the reader's words with the same model, then calls this).
create or replace function public.vibe_books(p_query extensions.vector(384), p_count int default 12)
returns table (book_id uuid, similarity real)
language sql stable security invoker
set search_path = public, extensions
as $$
  select e.book_id, (1 - (e.embedding <=> p_query))::real as similarity
  from public.book_embeddings e
  order by e.embedding <=> p_query
  limit p_count
$$;

grant execute on function public.similar_books(uuid, int) to authenticated;
grant execute on function public.vibe_books(extensions.vector, int) to authenticated;
