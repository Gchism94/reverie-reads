#!/usr/bin/env bash

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DATABASE_URL="${REVERIE_LOCAL_DB_URL:-postgresql://postgres:postgres@127.0.0.1:55322/postgres}"
STATEMENT_TIMEOUT="${REVERIE_MIGRATION_STATEMENT_TIMEOUT:-20s}"

command -v supabase >/dev/null || {
  echo "library migration fixture: supabase CLI is required" >&2
  exit 69
}
command -v psql >/dev/null || {
  echo "library migration fixture: psql is required" >&2
  exit 69
}

cd "$REPO_ROOT"

echo "library migration fixture: resetting locally through 20260829010000"
supabase db reset --local --version 20260829010000 --no-seed

echo "library migration fixture: loading 25,005 works and 5,012 personal books"
psql "$DATABASE_URL" -X -q -v ON_ERROR_STOP=1 \
  -f scripts/fixtures/library-membership-migration-scale-setup.sql

for migration in \
  supabase/migrations/20260830010000_library_membership_foundation.sql \
  supabase/migrations/20260831010000_corpus_admin_enrichment.sql
do
  echo "library migration fixture: applying $(basename "$migration") with statement_timeout=$STATEMENT_TIMEOUT"
  psql "$DATABASE_URL" -X -q -v ON_ERROR_STOP=1 --single-transaction \
    -c "set local statement_timeout = '$STATEMENT_TIMEOUT'" \
    -f "$migration"
done

psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 \
  -f scripts/fixtures/library-membership-migration-scale-assert.sql

echo "library migration fixture: PASS (run pnpm db:reset before normal local development)"
