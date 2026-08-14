-- Which migrations has PRODUCTION not applied yet?
--
-- READ-ONLY. This runs a single SELECT and writes nothing. Paste the whole file into the Supabase
-- dashboard SQL Editor (Project -> SQL Editor -> New query) and run it.
--
-- WHY THIS FILE EXISTS
-- Nothing in .github/workflows/ deploys migrations: CI runs changes/secrets/gate/e2e/e2e-a11y/
-- e2e-mobile/pgtap and never touches Supabase. Migrations reach production ONLY when someone runs
-- `pnpm deploy:migrations`, which wraps `supabase db push` behind scripts/deploy-guard.sh. So
-- merging to main does NOT apply anything, and the repo alone cannot say what production has.
--
-- The right-hand list below is the 72 migration files in supabase/migrations/ as of this
-- writing. The query compares them against supabase_migrations.schema_migrations — the table the
-- Supabase CLI itself uses to track what it has applied — and returns only the gap.
--
-- EXPECTED RESULT: zero rows means production is up to date and there is nothing to do.
-- Any rows returned are pending, listed in the order they must be applied.

with repo(version, name) as (
  values
    ('20260624010000', 'core_schema'),
    ('20260624010100', 'profiles_trigger'),
    ('20260624010200', 'clubs'),
    ('20260624010300', 'sharing'),
    ('20260624010400', 'grants'),
    ('20260624010500', 'profile_goal'),
    ('20260624010600', 'clubs_sharing'),
    ('20260624010700', 'ownership_reviews'),
    ('20260624010800', 'merge_rpc'),
    ('20260624010900', 'merge_prefs'),
    ('20260624011000', 'enriched_at'),
    ('20260624011100', 'default_store'),
    ('20260625120000', 'generalize_tags'),
    ('20260625120100', 'merge_rpc_tags'),
    ('20260625130000', 'skin_prefs'),
    ('20260626120000', 'adaptive_skin'),
    ('20260626130000', 'adaptive_pending'),
    ('20260626140000', 'rename_tryst_skin'),
    ('20260626150000', 'adaptive_dismissed'),
    ('20260626160000', 'enrichment_cache'),
    ('20260626170000', 'contributors'),
    ('20260626180000', 'reading_orders'),
    ('20260627010000', 'geo_cache'),
    ('20260627020000', 'covers_bucket'),
    ('20260627030000', 'rate_limits'),
    ('20260627040000', 'ugc_moderation'),
    ('20260627090000', 'enrichment_resolution'),
    ('20260627100000', 'book_cover_confidence'),
    ('20260705010000', 'match_feedback'),
    ('20260705120000', 'book_embeddings'),
    ('20260705150000', 'taste_centroid'),
    ('20260706010000', 'releases'),
    ('20260712010000', 'book_ownership'),
    ('20260713010000', 'shelf_system'),
    ('20260714010000', 'cover_system'),
    ('20260715010000', 'book_editing'),
    ('20260716010000', 'series_experience'),
    ('20260717010000', 'trope_system'),
    ('20260718010000', 'taste_calibration'),
    ('20260720010000', 'series_status_widen'),
    ('20260721010000', 'ownership_v2'),
    ('20260721020000', 'taxonomy_neutral'),
    ('20260721030000', 'mood_system'),
    ('20260722010000', 'merge_ownership_moods_tropes'),
    ('20260725010000', 'series_entry_removal'),
    ('20260726010000', 'page_count'),
    ('20260728010000', 'shelf_model_stage_a'),
    ('20260728010100', 'merge_shelf_model'),
    ('20260729010000', 'shelf_breakdown_toggles'),
    ('20260730010000', 'drop_reading_orders'),
    ('20260731010000', 'remove_series_entry'),
    ('20260801010000', 'revoke_public_execute'),
    ('20260802010000', 'plan_precision'),
    ('20260803010000', 'merge_plan_precision'),
    ('20260804010000', 'plan_date_backfill_window'),
    ('20260805010000', 'drop_plan_date'),
    ('20260806010000', 'rpc_body_defense'),
    ('20260807010000', 'sweep_traces'),
    ('20260808010000', 'clear_global_cover_cache_rows'),
    ('20260809010000', 'series_backfill'),
    ('20260810010000', 'reset_seeded_user_edited'),
    ('20260811010000', 'enriched_stamp_invalidate'),
    ('20260812010000', 'merge_series_entries_reparent'),
    ('20260813010000', 'series_integrity_schema'),
    ('20260814010000', 'set_series_order'),
    ('20260815010000', 'merge_books_derive_series'),
    ('20260816010000', 'series_position_uidx'),
    ('20260817010000', 'sync_book_series'),
    ('20260818010000', 'series_user_chosen'),
    ('20260821010000', 'set_series_order_collision_skip'),
    ('20260822010000', 'series_merge_decisions'),
    ('20260823010000', 'merge_series')
)
select
  repo.version,
  repo.name,
  'PENDING — not in supabase_migrations.schema_migrations' as status
from repo
left join supabase_migrations.schema_migrations m on m.version = repo.version
where m.version is null
order by repo.version;

-- ── REVERSE VIEW (optional): anything production applied that the repo does NOT contain — a
-- ── migration run by hand, or a file deleted after deploy. Swap the join direction on the same
-- ── `repo` CTE above:
-- ──
-- ──   select m.version, m.name, 'IN PROD, NOT IN REPO' as status
-- ──     from supabase_migrations.schema_migrations m
-- ──     left join repo on repo.version = m.version
-- ──    where repo.version is null
-- ──    order by m.version;
-- ──
-- ── (Paste it in place of the final SELECT, keeping the `with repo(...) as (values ...)` block.)
