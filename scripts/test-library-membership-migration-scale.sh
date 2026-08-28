#!/usr/bin/env bash

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# env -i is load-bearing: libpq accepts ambient PGHOSTADDR/PGSERVICE independently of --host,
# which could otherwise redirect this destructive synthetic fixture away from the local stack.
PSQL=(env -i PATH="$PATH" PGPASSWORD=postgres psql \
  --host=127.0.0.1 --port=55322 --username=postgres --dbname=postgres)

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
"${PSQL[@]}" -X -q -v ON_ERROR_STOP=1 \
  -f scripts/fixtures/library-membership-migration-scale-setup.sql

echo "library migration fixture: applying 20260830010000 then 20260831010000 with a 20s per-statement timeout"
"${PSQL[@]}" -X -q -v ON_ERROR_STOP=1 \
  -f scripts/fixtures/library-membership-migration-scale-run.sql

echo "library migration fixture: PASS (run pnpm db:reset before normal local development)"
