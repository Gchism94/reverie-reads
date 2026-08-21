#!/usr/bin/env bash
#
# worktree-init.sh — set up a fresh worktree, then VERIFY the three things fresh worktrees have
# historically got wrong, so a broken bootstrap says so here rather than as a fake test failure
# later.
#
# Small on purpose. It used to be imagined bigger (env-file copying); committing apps/web/.env
# removed that job, and .githooks/ being committed removed hook arming. What is left is the
# install and the proof.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

pnpm install --frozen-lockfile

fail=0
# 1. Hooks resolve: the committed dir is present and the shared config points at it.
hp="$(git config core.hooksPath || true)"
if [ "$hp" = ".githooks" ] && [ -x .githooks/pre-push ]; then
  echo "✓ hooks: core.hooksPath=.githooks, pre-push present and executable"
else
  echo "✗ hooks: core.hooksPath='$hp' (expected .githooks) or .githooks/pre-push missing" >&2; fail=1
fi
# 2. Prettier is the pinned workspace version, not an npx-fetched latest (3.8.4 vs 3.9.6 disagree
#    on markdown — the false-fail class of 2026-08-21).
want="$(sed -n 's/^  prettier@\([0-9][0-9.]*\):$/\1/p' pnpm-lock.yaml | head -1)"
have="$(pnpm exec prettier --version)"
if [ -n "$want" ] && [ "$have" = "$want" ]; then
  echo "✓ prettier: workspace-pinned $have"
else
  echo "✗ prettier: have '$have', lockfile pins '$want'" >&2; fail=1
fi
# 3. Env loads: the committed base file is present with the local-stack URL.
if grep -q '^VITE_SUPABASE_URL=' apps/web/.env 2>/dev/null; then
  echo "✓ env: committed apps/web/.env present (VITE_SUPABASE_URL set)"
else
  echo "✗ env: apps/web/.env missing or lacks VITE_SUPABASE_URL" >&2; fail=1
fi
exit $fail
