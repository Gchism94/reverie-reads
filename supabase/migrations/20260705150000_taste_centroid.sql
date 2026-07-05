-- Tier 2b (owner-approved): the reader's TASTE CENTROID — the mean gte-small vector of the books
-- they demonstrably love (rating ≥ 4 or fave). The embed fn's rank mode measures external
-- candidates (Discover finds) against it, so "new & notable in your genre" becomes "new & notable
-- NEAR YOUR TASTE". SECURITY INVOKER: the book_embeddings/books RLS scopes everything to the
-- caller; a reader with no loved-and-embedded books gets NULL (cold start — callers pass through).

create or replace function public.taste_centroid()
returns extensions.vector(384)
language sql stable security invoker
set search_path = public, extensions
as $$
  select avg(e.embedding)::extensions.vector(384)
  from public.book_embeddings e
  join public.books b on b.id = e.book_id
  where b.rating >= 4 or b.fave
$$;

grant execute on function public.taste_centroid() to authenticated;
