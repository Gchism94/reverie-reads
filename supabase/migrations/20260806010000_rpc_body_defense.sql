-- The body is the boundary; the grant is defence in depth.
--
-- ── Why this exists ─────────────────────────────────────────────────────────────────────────────
-- 20260801010000 revoked EXECUTE from PUBLIC across every RPC and granted it back narrowly. That
-- held. Then a PLATFORM action — not a migration in this repo, and not `create or replace`, both
-- ruled out by reproduction — issued a bulk `grant ... on all routines in schema public to postgres,
-- anon, authenticated, service_role`. All 17 functions in `public` came out carrying an explicit
-- `anon=X/postgres`. The revoke survived (PUBLIC is still absent everywhere) and was simply made
-- irrelevant by named grants layered on top.
--
-- Nobody was notified. It was invisible for days, and it was only found because a screenshot of an
-- unrelated bug prompted someone to look. Any ACL we set can be undone the same way, at a time we do
-- not choose. So the operating rule from here:
--
--     NO FUNCTION MAY DEPEND ON ITS GRANT FOR SAFETY.
--
-- The grant is a lock on the door; the body is the guard inside the room. This migration adds the
-- guard to the three functions that had none, and re-states the intended ACL knowing full well it
-- may be undone again.
--
-- ── What each function's defence actually is (audited, all 17) ──────────────────────────────────
-- Already body-defended, unchanged here:
--   merge_books, remove_series_entry, set_book_contributors   raise on an ownership check
--   is_club_member, club_progress                             can only ever read the CALLER's own
--                                                             row via auth.uid(); anon gets
--                                                             false / 0, never another reader's
--   club_locked_info                                          gated by is_club_member in its own
--                                                             WHERE clause; anon matches nothing
-- Not callable at all:
--   bump_club_activity, handle_new_user, set_updated_at       return `trigger`; Postgres refuses
--                                                             ("trigger functions can only be
--                                                             called as triggers"), verified
-- Defended by RLS, verified rather than assumed:
--   taste_centroid, taste_scores, taste_calibration,          SECURITY INVOKER over book_embeddings,
--   similar_books, vibe_books                                 whose only policy is
--                                                             owner_id = auth.uid(). Probed with
--                                                             embeddings PRESENT and anon holding
--                                                             BOTH routine and table grants (the
--                                                             production shape): owner got a vector,
--                                                             anon got NULL and zero rows.
--
-- Fixed below, because they had nothing:
--   rate_limit_consume    no guard whatsoever. Exposure demonstrated, not theorised: as anon, one
--                         call moved a bucket's count 1 -> 2. Any caller who guesses a bucket key
--                         can exhaust another party's budget, and the keys are guessable
--                         ('hardcover:global').
--   prune_rate_limits     no guard. Deletes windows older than a day — an unauthenticated caller
--                         wiping limiter state defeats the limiter it belongs to.
--   join_club_by_code     blocked from writing only INCIDENTALLY, by club_members.user_id being
--                         NOT NULL, and it LEAKS while failing: an invalid code returns NULL
--                         quietly, a valid one raises a NOT NULL violation. That difference is an
--                         oracle for enumerating join codes, which are capability secrets that
--                         grant club access (docs decision 4). Demonstrated.
--
-- ── The guard uses auth.role(), never current_user ──────────────────────────────────────────────
-- Verified over real HTTP against PostgREST, both keys, because a guard that locks out the
-- legitimate caller is worse than the gap it closes:
--
--     SERVICE_ROLE_KEY -> {"auth_role": "service_role", "current_user": "postgres"}
--     ANON_KEY         -> {"auth_role": "anon",         "current_user": "postgres"}
--
-- `current_user` is `postgres` on BOTH paths — SECURITY DEFINER makes it the owner — so it cannot
-- distinguish anything and a guard built on it would be inert. `auth.role()` reads the JWT claim and
-- does distinguish. All three callers of rate_limit_consume (search, covers, _shared/ratelimit)
-- send `Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}`, confirmed at each call site, so the
-- guard below admits them.
--
-- THE GUARD IS `is not null and <> 'service_role'`, AND THE NULL BRANCH IS NOT A HOLE. Over HTTP,
-- auth.role() is never null: PostgREST answers as `anon` even with no apikey and no Authorization
-- header at all — probed both ways. It is null ONLY for an in-database caller with no JWT: psql,
-- a trigger, or pg_cron. Refusing null instead would have locked out exactly the intended user of
-- prune_rate_limits, whose own migration says to "schedule via pg_cron" — a guard that breaks its
-- legitimate caller while the client-facing gap is closed either way. So null is admitted
-- deliberately: unreachable by any client, and the only path a scheduled job can arrive on.

-- ── 1. rate_limit_consume — service_role only ───────────────────────────────────────────────────
-- Body otherwise verbatim from 20260627030000.
create or replace function public.rate_limit_consume(p_key text, p_max int, p_window_secs int)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  w_start timestamptz := to_timestamp(floor(extract(epoch from now()) / p_window_secs) * p_window_secs);
  w_end timestamptz := w_start + make_interval(secs => p_window_secs);
  c int;
begin
  -- The limiter is infrastructure: it takes an arbitrary, unvalidated bucket key and has no reader
  -- to scope to, so there is nothing for an ownership check to compare. Callership IS the boundary.
  if auth.role() is not null and auth.role() <> 'service_role' then
    raise exception 'rate_limit_consume is service_role only'
      using errcode = 'insufficient_privilege';
  end if;

  insert into public.rate_limits (bucket, window_start, count)
    values (p_key, w_start, 1)
    on conflict (bucket, window_start) do update set count = public.rate_limits.count + 1
    returning count into c;
  return jsonb_build_object(
    'allowed', c <= p_max,
    'count', c,
    'limit', p_max,
    'remaining', greatest(0, p_max - c),
    'reset_at', w_end,
    'retry_after', greatest(0, ceil(extract(epoch from (w_end - now())))::int)
  );
end;
$$;

-- ── 2. prune_rate_limits — service_role only ────────────────────────────────────────────────────
-- Was `language sql`; now plpgsql so it can refuse. The DELETE is verbatim.
create or replace function public.prune_rate_limits()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() is not null and auth.role() <> 'service_role' then
    raise exception 'prune_rate_limits is service_role only'
      using errcode = 'insufficient_privilege';
  end if;
  delete from public.rate_limits where window_start < now() - interval '1 day';
end;
$$;

-- ── 3. join_club_by_code — refuse before the lookup, so the oracle closes ───────────────────────
-- The check must come BEFORE the `select ... from clubs`, not before the insert. Refusing later
-- would still answer "does this code exist?" through the difference between a quiet NULL and a
-- constraint error, which is the whole leak. Body otherwise verbatim from 20260624010600.
create or replace function public.join_club_by_code(p_code text, p_name text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  cid uuid;
begin
  -- Joining is an act by a specific reader; without one there is no membership to create and no
  -- reason to look a code up. Identical refusal for a valid and an invalid code, deliberately.
  if auth.uid() is null then
    raise exception 'join_club_by_code requires a signed-in reader'
      using errcode = 'insufficient_privilege';
  end if;

  select id into cid from public.clubs where join_code = lower(trim(p_code));
  if cid is null then
    return null;
  end if;
  insert into public.club_members (club_id, user_id, display_name)
  values (cid, auth.uid(), coalesce(p_name, (select display_name from public.profiles where id = auth.uid())))
  on conflict (club_id, user_id) do nothing;
  return cid;
end;
$$;

-- ── 4. Re-state the intended ACL — DEFENCE IN DEPTH, NOT THE BOUNDARY ───────────────────────────
-- This block restores what 20260801010000 intended and the platform grant overrode. It is expected
-- to be undone again: the same bulk grant can run at any time, for reasons outside this repo, with
-- no notification. That is precisely why the guards above exist and why this section is last rather
-- than first — if this were the defence, the defence would already have failed once.
--
-- Revoking from `anon` BY NAME, not just from PUBLIC: the platform grant was a named grant, so
-- `revoke ... from public` would not touch it. That is the specific mistake to avoid repeating.
revoke execute on all routines in schema public from anon;

-- Restore the narrow, intended grants.
grant execute on function public.merge_books(uuid, uuid, jsonb) to authenticated;
grant execute on function public.remove_series_entry(uuid) to authenticated;
grant execute on function public.set_book_contributors(uuid, jsonb, text, text, text) to authenticated;
grant execute on function public.similar_books(uuid, int) to authenticated;
grant execute on function public.vibe_books(extensions.vector, int) to authenticated;
grant execute on function public.taste_centroid() to authenticated;
grant execute on function public.taste_calibration() to authenticated;
grant execute on function public.taste_scores(uuid[]) to authenticated;
grant execute on function public.join_club_by_code(text, text) to authenticated;
grant execute on function public.club_locked_info(uuid) to authenticated;
grant execute on function public.is_club_member(uuid) to authenticated;
grant execute on function public.club_progress(uuid) to authenticated;
grant execute on function public.rate_limit_consume(text, int, int) to service_role;
