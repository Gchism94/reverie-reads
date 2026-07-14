-- Taste display calibration (owner-approved: fixed per-user anchors, replacing per-shelf min-max).
--
-- The sort stays raw cosine (unchanged). Only the DISPLAY of match strength changes: instead of
-- rescaling each shelf's loaded candidates (which made the number a property of shelfmates, unstable
-- per book, uncomparable across shelves), we anchor the display to two FIXED points computed from the
-- reader's OWN data, so a book's tier is stable between recalibrations and comparable everywhere.
--
--   · upper anchor (hi) — "what deeply-me looks like": a high point of the self-similarity
--     distribution of the reader's LOVED books against their taste centroid.
--   · lower anchor (lo) — the baseline floor: a low point of the WHOLE library's cosine-to-centroid
--     (an average book in my library; the point where books stop resembling the reader).
--
-- Both use the same cosine the edge rank/similar paths use (pgvector <=> is cosine distance, operands
-- normalized internally, so 1 - dist = true cosine to the unnormalized centroid direction — matching
-- the embed fn's dot/‖centroid‖). SECURITY INVOKER: book_embeddings/books RLS scopes to the caller.
-- Cold start (no loved-and-embedded books → NULL centroid) returns no row; callers pass through.
--
-- Recompute cadence: none stored — computed live from the caller's current rows, exactly like
-- taste_centroid(). It therefore tracks the taste vector as the library evolves, for free.

-- Per-user anchors. Observed band on real data (290-book seed, 44 loved): lo≈0.894 (p10 all),
-- hi≈0.930 (p75 loved) — a ~0.036-wide band inside the raw 0.874–0.946 cosine range. Even quarter
-- boundaries over that band spread the seed library ~72/62/84/72 across the four tiers (non-monotone).
create or replace function public.taste_calibration()
returns table (lo real, hi real)
language sql stable security invoker
set search_path = public, extensions
as $$
  with c as (select public.taste_centroid() as v),
  cos as (
    select (b.rating >= 4 or b.fave) as loved,
           (1 - (e.embedding <=> c.v)) as sim
    from public.book_embeddings e
    join public.books b on b.id = e.book_id
    cross join c
    where c.v is not null
  ),
  anchors as (
    select
      percentile_cont(0.10) within group (order by sim)                        as lo_raw,
      percentile_cont(0.75) within group (order by sim) filter (where loved)    as hi_raw
    from cos
  )
  -- guard a degenerate band (tiny/uniform library): keep hi strictly above lo so the map never /0.
  select lo_raw::real,
         (case when hi_raw is null or hi_raw <= lo_raw then lo_raw + 0.02 else hi_raw end)::real
  from anchors
  where lo_raw is not null
$$;

grant execute on function public.taste_calibration() to authenticated;

-- Per-book taste = cosine of each requested book to the reader's centroid. Lets non-Discover surfaces
-- (More like this — own shelves) show the SAME taste tier a book would show in Discover, so the tier
-- is a property of (book, reader), not the shelf it appears on. NULL centroid → empty (cold start).
create or replace function public.taste_scores(p_book_ids uuid[])
returns table (book_id uuid, taste real)
language sql stable security invoker
set search_path = public, extensions
as $$
  with c as (select public.taste_centroid() as v)
  select e.book_id, (1 - (e.embedding <=> c.v))::real as taste
  from public.book_embeddings e
  cross join c
  where c.v is not null
    and e.book_id = any(p_book_ids)
$$;

grant execute on function public.taste_scores(uuid[]) to authenticated;
