#!/usr/bin/env bash
#
# pretooluse-guard.test.sh — drives .claude/hooks/pretooluse-guard.sh against the same
# PreToolUse JSON shape Claude Code sends on stdin (documented at
# https://code.claude.com/docs/en/hooks), so the guard's block/allow behaviour is proven, not
# assumed from reading it. No live Claude Code session required.
#
# Run: bash scripts/pretooluse-guard.test.sh

set -uo pipefail
cd "$(git rev-parse --show-toplevel)"

GUARD=".claude/hooks/pretooluse-guard.sh"
[ -x "$GUARD" ] || { echo "FAIL: $GUARD missing or not executable" >&2; exit 1; }

pass=0
fail=0

# $1 = case name, $2 = tool_name, $3 = command (or "-" for none), $4 = expected exit code
case_() {
  local name="$1" tool="$2" cmd="$3" want="$4"
  local json got
  if [ "$cmd" = "-" ]; then
    json=$(node -e "console.log(JSON.stringify({tool_name: process.argv[1]}))" "$tool")
  else
    json=$(node -e "console.log(JSON.stringify({tool_name: process.argv[1], tool_input: {command: process.argv[2]}}))" "$tool" "$cmd")
  fi
  echo "$json" | "$GUARD" >/tmp/pretooluse-guard.test.out 2>&1
  got=$?
  if [ "$got" -eq "$want" ]; then
    pass=$((pass + 1))
    printf 'ok   %s (exit %s)\n' "$name" "$got"
  else
    fail=$((fail + 1))
    printf 'FAIL %s: want exit %s, got %s\n' "$name" "$want" "$got"
    sed 's/^/       /' /tmp/pretooluse-guard.test.out
  fi
}

# ── 1. git checkout -- ───────────────────────────────────────────────────────────────────────
case_ "blocks: git checkout -- <file>"                 Bash 'git checkout -- src/foo.ts'            2
case_ "blocks: git checkout <ref> -- <file>"            Bash 'git checkout HEAD~1 -- src/foo.ts'     2
case_ "blocks: multi-file checkout --"                  Bash 'git checkout -- a.ts b.ts c.ts'        2
case_ "blocks: checkout -- as second command"           Bash 'echo hi && git checkout -- a.ts'       2
case_ "allows: git checkout <branch>"                   Bash 'git checkout main'                     0
case_ "allows: git checkout -b <branch>"                Bash 'git checkout -b feat/thing'             0
case_ "allows: branch name containing --"               Bash 'git checkout feat/foo--bar'             0
case_ "allows: unrelated -- elsewhere in compound cmd"  Bash 'git commit -m "fix -- x" && git checkout main' 0

# ── 2. supabase db reset ───────────────────────────────────────────────────────────────────────
case_ "blocks: supabase db reset (raw)"                 Bash 'supabase db reset'                     2
case_ "allows: pnpm db:reset"                           Bash 'pnpm db:reset'                         0
case_ "allows: wrapped via stack-lock.sh directly"      Bash 'bash scripts/stack-lock.sh supabase db reset' 0
case_ "allows: escape hatch"                            Bash 'RV_ALLOW_RAW_STACK_CMD=1 supabase db reset' 0

# ── 3. playwright test ─────────────────────────────────────────────────────────────────────────
case_ "blocks: npx playwright test"                     Bash 'npx playwright test'                   2
case_ "blocks: bare playwright test"                    Bash 'playwright test --project=rest'         2
case_ "blocks: pnpm exec playwright test"               Bash 'pnpm exec playwright test'              2
case_ "allows: pnpm e2e"                                Bash 'pnpm e2e --project=rest'                0
case_ "allows: wrapped via stack-lock.sh directly"      Bash 'bash ../../scripts/stack-lock.sh playwright test' 0
case_ "allows: escape hatch"                            Bash 'RV_ALLOW_RAW_STACK_CMD=1 npx playwright test' 0

# ── 4. everything else passes through ──────────────────────────────────────────────────────────
case_ "allows: git status"                              Bash 'git status'                             0
case_ "allows: unrelated command"                       Bash 'ls -la'                                 0
case_ "allows: non-Bash tool, no tool_input"             Read '-'                                     0

echo ""
echo "${pass} passed, ${fail} failed"
[ "$fail" -eq 0 ]
