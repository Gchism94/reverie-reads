#!/usr/bin/env bash
#
# pretooluse-guard.sh — blocks specific Bash commands from Claude Code sessions that have,
# documented and repeatedly, either destroyed uncommitted work or silently bypassed this repo's
# stack lock (scripts/stack-lock.sh). Wired via .claude/settings.json's PreToolUse hook on the
# Bash tool. Exit 2 blocks the tool call and Claude sees this script's stderr as the reason
# (Claude Code's documented PreToolUse contract).
#
# THREE GUARDED PATTERNS. Each has a wrapped-safe alternative that does everything the raw form
# does; this only refuses the raw path, it does not remove any capability.
#
#   1. `git checkout -- <path>` / `git checkout <ref> -- <path>` — resets the whole file to HEAD,
#      silently, with nothing recoverable. A note in CLAUDE.md ("commit before mutation testing",
#      #93) asked people and Claude to avoid this by memory since 2026-07-28. It was violated
#      three times anyway — the failure mode is a fast revert inside a loop, not a moment anyone
#      would have stopped to reconsider. `scripts/safe-revert.sh` backs up before reverting and
#      covers every case `git checkout --` does for a tracked file; see its own header. No escape
#      hatch: there is no legitimate reason to reach past it for what this blocks.
#
#   2. `supabase db reset` invoked directly — bypasses scripts/stack-lock.sh, the machine-global
#      advisory lock serialising every command that touches the local Supabase stack. Use
#      `pnpm db:reset`.
#
#   3. `playwright test` / `npx playwright test` invoked directly — same bypass, for the e2e
#      suite. Use `pnpm e2e` (repo root or apps/web; forwards flags, e.g. `pnpm e2e
#      --project=rest`).
#
# scripts/stack-lock.sh's own header named #2 and #3 as a documented, deliberately-scoped-out
# gap: "someone reaching past those is out of scope by choice." Two real incidents changed that
# call — a parallel session's raw `npx playwright test` collided with another session's e2e run
# on the fixed port 4317 (17x ERR_CONNECTION_REFUSED), and a `db:reset` overlapped a live session
# by ordering luck, not because the lock enforced anything. This hook is the enforcement stack-
# lock.sh's own comment said was missing. (Playwright is additionally gated a second, independent
# way — see apps/web/playwright.config.ts — because this hook only fires for Claude Code
# sessions; the config-load check fires for every invocation, including a human's own terminal.)
#
# Escape hatch for #2 and #3, typed not defaulted (same shape as stack-lock.sh's own
# RV_STACK_LOCK_DISABLE): include RV_ALLOW_RAW_STACK_CMD=1 in the command itself, e.g.
# `RV_ALLOW_RAW_STACK_CMD=1 supabase db reset`.
#
# Verification: scripts/pretooluse-guard.test.sh drives this against the same PreToolUse JSON
# shape Claude Code sends on stdin, without needing a live Claude Code session to prove it.

set -euo pipefail

input="$(cat)"

# Pull fields with `node`, not `jq` — node is this project's own hard dependency
# (package.json engines >=20.11); jq is not assumed anywhere else in this repo's scripts, and a
# missing-binary failure here must never silently pass a dangerous command through.
extract_field() {
  node -e '
    let d = "";
    process.stdin.on("data", c => (d += c));
    process.stdin.on("end", () => {
      try {
        const v = JSON.parse(d)[process.argv[1]];
        process.stdout.write(typeof v === "string" ? v : "");
      } catch {
        process.stdout.write("");
      }
    });
  ' "$1" <<<"$input"
}

extract_nested_field() {
  node -e '
    let d = "";
    process.stdin.on("data", c => (d += c));
    process.stdin.on("end", () => {
      try {
        const o = JSON.parse(d);
        const v = o[process.argv[1]] && o[process.argv[1]][process.argv[2]];
        process.stdout.write(typeof v === "string" ? v : "");
      } catch {
        process.stdout.write("");
      }
    });
  ' "$1" "$2" <<<"$input"
}

tool_name="$(extract_field tool_name)"
[ "$tool_name" = "Bash" ] || exit 0

command="$(extract_nested_field tool_input command)"
[ -n "$command" ] || exit 0

# Never fires on the wrapped forms. None of this repo's sanctioned commands (`pnpm db:reset`,
# `pnpm e2e`, `bash scripts/stack-lock.sh ...`) contain the literal text "stack-lock.sh" is
# itself the signal they route through the lock — checked first so the specific blocks below
# never need to special-case the wrapper's own internals.
if printf '%s' "$command" | grep -q 'stack-lock\.sh'; then
  exit 0
fi

if printf '%s' "$command" | grep -qE '(^|[[:space:]])RV_ALLOW_RAW_STACK_CMD=1([[:space:]]|$)'; then
  exit 0
fi

block() {
  printf '%s\n' "$1" >&2
  exit 2
}

# 1. `git checkout -- ...` / `git checkout <ref> -- ...` — the explicit path-restore form.
# The `[^;&|]*` between "checkout" and "--" keeps this from firing on an unrelated "--" elsewhere
# in a compound command (e.g. a commit message containing "--"); it does not need to be a full
# shell parser, only to catch the same clause `git checkout` is in.
if printf '%s' "$command" | grep -qE 'git[[:space:]]+checkout[^;&|]*--([[:space:]]|$)'; then
  block "BLOCKED by .claude/hooks/pretooluse-guard.sh: \`git checkout --\` resets a file to HEAD and destroys any uncommitted work in it, silently — this has happened three times in this repo. Use \`scripts/safe-revert.sh <file> [<file2> ...]\` instead; it backs up before reverting (see the script's own header for where the backup lands and how to recover from it). No escape hatch — safe-revert.sh covers every case this blocks."
fi

# 2. `supabase db reset`, invoked directly.
if printf '%s' "$command" | grep -qE 'supabase[[:space:]]+db[[:space:]]+reset\b'; then
  block "BLOCKED by .claude/hooks/pretooluse-guard.sh: \`supabase db reset\` invoked directly bypasses scripts/stack-lock.sh's machine-global lock. Use \`pnpm db:reset\` instead. Deliberate raw run, typed not defaulted: prefix the command with RV_ALLOW_RAW_STACK_CMD=1."
fi

# 3. `playwright test` / `npx playwright test`, invoked directly (also matches `pnpm exec
# playwright test`, which bypasses the lock the same way).
if printf '%s' "$command" | grep -qE '(^|[[:space:]])(npx[[:space:]]+)?playwright[[:space:]]+test\b'; then
  block "BLOCKED by .claude/hooks/pretooluse-guard.sh: \`playwright test\` invoked directly bypasses scripts/stack-lock.sh's machine-global lock — this is the exact incident that collided two sessions on the fixed port 4317. Use \`pnpm e2e\` instead (forwards flags, e.g. \`pnpm e2e --project=rest\`). Deliberate raw run, typed not defaulted: prefix the command with RV_ALLOW_RAW_STACK_CMD=1."
fi

exit 0
