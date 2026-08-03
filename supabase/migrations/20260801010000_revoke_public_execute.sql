-- Revoke PUBLIC's default EXECUTE from every authenticated-only or service-role-only RPC
-- (fix/rpc-execute-grants).
--
-- Postgres grants EXECUTE to PUBLIC on every new function by default. `grant execute ...
-- to authenticated` is therefore ADDITIVE, not gating — it adds nothing PUBLIC did not already
-- have. Observed live against this project's own tables (see docs/BACKLOG.md): `remove_series_entry`
-- and `merge_books` are BOTH reachable with the anon key, returning their body's own `P0001`
-- ownership raise rather than a grant-layer 42501. No exposure follows from that alone, because
-- `security definer` runs the body and `auth.uid()` is null for anon, so `owner_id = null` never
-- matches and the first statement always refuses — but the `raise` was the ONLY boundary, and a
-- future RPC whose first statement is not an ownership check would inherit an anon-callable
-- function with no protection at all.
--
-- ONE FUNCTION'S BOUNDARY WAS ALREADY WEAKER THAN THAT, AND GENUINELY EXPLOITABLE:
-- `rate_limit_consume` is granted only to `service_role`, but PUBLIC's default execute let anon and
-- authenticated call it directly all along, and its body has no ownership check whatsoever —
-- `p_key` is caller-supplied with no binding to the caller's identity. Any signed-in reader (or
-- anon) could call it with another user's guessable bucket key ('enrich:user:<uid>') and exhaust or
-- spam their rate limit. This migration closes that; it is the one entry below that turns this
-- migration from hardening into a fix.
--
-- SCOPE: every function with an explicit grant to `authenticated` or `service_role`, plus two
-- internal SECURITY DEFINER helpers that never had an explicit grant — only the same implicit
-- PUBLIC default — but turned out to need one anyway, and a third that genuinely doesn't.
--
-- `is_club_member` / `club_progress` were first classified as "pure internal helpers, called only
-- from club_locked_info's own definer body, needing no grant of their own" — WRONG, caught by
-- actually running the pgTAP suite rather than trusting that reasoning: both are also called
-- directly from inside FOUR RLS POLICY expressions (`clubs: select`, `club_members: select`,
-- `club_comments: select` — the spoiler gate itself — and `club_comments: insert`, plus
-- `ugc_moderation`'s hide-check). A policy expression evaluates as the QUERYING role, not the
-- function owner, unlike a call from inside another SECURITY DEFINER function's body — so
-- `authenticated` needs its own explicit EXECUTE here, the same as everywhere else. Revoking
-- PUBLIC without this grant broke `rls_test.sql`, `spoiler_live_test.sql` and
-- `ugc_moderation_test.sql` outright the first time this migration ran; that failure is what
-- surfaced the mistake before it reached the guards below, let alone production.
--
-- `prune_rate_limits` really is standalone: no policy, no other function calls it, dormant awaiting
-- the `pg_cron` schedule its own comment says was never wired up. No re-grant needed — if a caller
-- legitimately needs to invoke it directly later, add the grant then.
--
-- NOT TOUCHED: `handle_new_user`, `set_updated_at`, `bump_club_activity` all `returns trigger`.
-- Confirmed directly (as superuser, so no grant could have been the reason): calling one raises
-- "trigger functions can only be called as triggers" — a hard Postgres restriction independent of
-- any GRANT/REVOKE. They were never RPC-shaped, so revoking PUBLIC here would be cosmetic.
-- `pg_temp_author_name` no longer exists — created and `drop function`-ed within the single backfill
-- migration that used it.
--
-- STABILITY ACROSS FUTURE RECREATION — verified against this database, not assumed: `create or
-- replace function` (same signature) PRESERVES the existing ACL; a genuine `drop function` followed
-- by `create function` resets it to the default (PUBLIC regains execute), because a fresh object has
-- no ACL row at all. Every historical recreation in this repo (`merge_books`, six times) has used
-- `create or replace`, never drop-and-recreate — `pg_temp_author_name`'s single explicit `drop
-- function` is the only one in the migration history, and it was dropped for good, not recreated.
-- So the revokes below hold as long as that convention holds. See AGENTS.md for the convention this
-- migration establishes: a new RPC needs BOTH `revoke execute from public` and `grant execute to
-- authenticated` (or `service_role`), because the grant alone was never gating.

-- ── merge_books' idiom: security definer, an ownership raise as the first statement ──
revoke execute on function public.merge_books(uuid, uuid, jsonb) from public;
grant execute on function public.merge_books(uuid, uuid, jsonb) to authenticated;

revoke execute on function public.remove_series_entry(uuid) from public;
grant execute on function public.remove_series_entry(uuid) to authenticated;

revoke execute on function public.set_book_contributors(uuid, jsonb, text, text, text) from public;
grant execute on function public.set_book_contributors(uuid, jsonb, text, text, text) to authenticated;

-- ── security invoker: RLS on book_embeddings/books scopes every read to the caller already; no
--    privilege elevation exists here to bypass. Revoked for the same reason as everything else —
--    PUBLIC should never be the thing standing between "signed in" and "not" ──
revoke execute on function public.similar_books(uuid, int) from public;
grant execute on function public.similar_books(uuid, int) to authenticated;

revoke execute on function public.vibe_books(extensions.vector, int) from public;
grant execute on function public.vibe_books(extensions.vector, int) to authenticated;

revoke execute on function public.taste_centroid() from public;
grant execute on function public.taste_centroid() to authenticated;

revoke execute on function public.taste_calibration() from public;
grant execute on function public.taste_calibration() to authenticated;

revoke execute on function public.taste_scores(uuid[]) from public;
grant execute on function public.taste_scores(uuid[]) to authenticated;

-- ── security definer, but the ownership boundary is weaker-shaped than merge_books' (see the
--    migration header) — currently safe by construction, not by an explicit auth.uid() guard. The
--    revoke closes the anon path at the grant layer regardless, without touching either body ──
revoke execute on function public.join_club_by_code(text, text) from public;
grant execute on function public.join_club_by_code(text, text) to authenticated;

revoke execute on function public.club_locked_info(uuid) from public;
grant execute on function public.club_locked_info(uuid) to authenticated;

-- ── the one entry that is a fix, not hardening: real, no ownership check at all today ──
revoke execute on function public.rate_limit_consume(text, int, int) from public;
grant execute on function public.rate_limit_consume(text, int, int) to service_role;

-- ── called directly from RLS policy expressions on clubs/club_members/club_comments, which
--    evaluate as the QUERYING role — authenticated needs its own explicit grant here ──
revoke execute on function public.is_club_member(uuid) from public;
grant execute on function public.is_club_member(uuid) to authenticated;

revoke execute on function public.club_progress(uuid) from public;
grant execute on function public.club_progress(uuid) to authenticated;

-- ── genuinely internal, and dormant: no policy, no caller, no re-grant needed ──
revoke execute on function public.prune_rate_limits() from public;
