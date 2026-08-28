\set ON_ERROR_STOP on

-- Keep one backend session across both explicit commits and the postconditions. If any temporary
-- identity table loses ON COMMIT DROP, the assertion file can still see it and fails loudly.
begin;
set local statement_timeout = '20s';
\ir ../../supabase/migrations/20260830010000_library_membership_foundation.sql
commit;

begin;
set local statement_timeout = '20s';
\ir ../../supabase/migrations/20260831010000_corpus_admin_enrichment.sql
commit;

\ir library-membership-migration-scale-assert.sql
