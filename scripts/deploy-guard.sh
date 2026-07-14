#!/usr/bin/env bash
#
# deploy-guard.sh — make an accidental production deploy mechanically hard.
#
# Wraps the two prod-touching Supabase commands (`functions deploy`, `db push`) behind a set of
# refusals + an explicit confirmation, so a deploy can only fire from a known-good state:
#
#   · you are on `main`
#   · the working tree has no uncommitted changes to tracked files
#   · `main` is not ahead of origin/main (nothing unpushed) and not behind it (nothing unpulled)
#
# It then prints EXACTLY what it will touch and waits for an interactive y/N. Nothing deploys until
# every check passes and you type `y`.
#
# Deliberate exceptions (a branch/hotfix deploy) go through an explicit, LOUD override:
#   scripts/deploy-guard.sh functions covers --force
#   DEPLOY_ALLOW_DIRTY=1 scripts/deploy-guard.sh migrations
# The override skips the state refusals only — it still prints the touch-list and still confirms.
#
# Motivated by the 2026-07-14 accidental prod touches (feature-branch deploys + a heredoc evaluating
# a deploy command in a PR body). See docs/DEPLOY.md and AGENTS.md.
#
# Testability: the Supabase binary is `${SUPABASE_BIN:-supabase}`, so tests inject a mock and no real
# deploy fires. Confirmation reads stdin, so tests pipe `y`/`n`.

set -euo pipefail

SUPABASE_BIN="${SUPABASE_BIN:-supabase}"
MAIN_BRANCH="${DEPLOY_MAIN_BRANCH:-main}"
REMOTE="${DEPLOY_REMOTE:-origin}"

# ── pretty output ──────────────────────────────────────────────────────────────────────────────
bold=$'\033[1m'; red=$'\033[31m'; yellow=$'\033[33m'; green=$'\033[32m'; dim=$'\033[2m'; reset=$'\033[0m'
say()  { printf '%s\n' "$*"; }
info() { printf '%s\n' "${dim}·${reset} $*"; }
ok()   { printf '%s\n' "${green}✓${reset} $*"; }
warn() { printf '%s\n' "${yellow}!${reset} $*"; }
die()  { printf '%s\n' "${red}${bold}✗ refusing to deploy:${reset} $*" >&2; exit 1; }

usage() {
  cat >&2 <<USAGE
usage: deploy-guard.sh <functions|migrations> [names/args...] [--force]

  functions [name...]   deploy edge functions (all, or only the named ones)
  migrations            push pending database migrations

  --force               skip the state refusals for a deliberate branch/hotfix deploy (loud)
  env DEPLOY_ALLOW_DIRTY=1   same as --force
USAGE
  exit 2
}

# ── parse args ─────────────────────────────────────────────────────────────────────────────────
[ "$#" -ge 1 ] || usage
MODE="$1"; shift
FORCE=0
[ "${DEPLOY_ALLOW_DIRTY:-0}" = "1" ] && FORCE=1
PASSTHRU=()
for a in "$@"; do
  case "$a" in
    --force) FORCE=1 ;;
    -h|--help) usage ;;
    *) PASSTHRU+=("$a") ;;
  esac
done

case "$MODE" in
  functions|migrations) ;;
  *) usage ;;
esac

command -v git >/dev/null 2>&1 || die "git not found"
git rev-parse --is-inside-work-tree >/dev/null 2>&1 || die "not inside a git repository"

# ── state checks (skipped, loudly, under --force) ────────────────────────────────────────────────
branch="$(git rev-parse --abbrev-ref HEAD)"

run_state_checks() {
  # branch must be main
  [ "$branch" = "$MAIN_BRANCH" ] || die "on branch '${branch}', not '${MAIN_BRANCH}'. Deploys run from ${MAIN_BRANCH} after merge."

  # no uncommitted changes to TRACKED files (untracked files are only a warning — they can't reach a
  # deploy of committed functions/migrations)
  if ! git diff --quiet || ! git diff --cached --quiet; then
    die "uncommitted changes to tracked files. Commit or stash first, then deploy from a clean ${MAIN_BRANCH}."
  fi

  # sync with the remote (read-only fetch), then compare
  info "fetching ${REMOTE}/${MAIN_BRANCH}…"
  git fetch --quiet "$REMOTE" "$MAIN_BRANCH" || die "could not fetch ${REMOTE}/${MAIN_BRANCH}"
  local ahead behind
  ahead="$(git rev-list --count "${REMOTE}/${MAIN_BRANCH}..HEAD" 2>/dev/null || echo 0)"
  behind="$(git rev-list --count "HEAD..${REMOTE}/${MAIN_BRANCH}" 2>/dev/null || echo 0)"
  [ "$behind" = "0" ] || die "local ${MAIN_BRANCH} is behind ${REMOTE}/${MAIN_BRANCH} by ${behind} commit(s). Pull first."
  [ "$ahead" = "0" ]  || die "local ${MAIN_BRANCH} is ahead of ${REMOTE}/${MAIN_BRANCH} by ${ahead} unpushed commit(s). Push (and merge) first."

  ok "on ${MAIN_BRANCH}, clean, in sync with ${REMOTE}/${MAIN_BRANCH}"

  # untracked files are harmless to the deploy but worth surfacing
  local untracked
  untracked="$(git ls-files --others --exclude-standard | wc -l | tr -d ' ')"
  [ "$untracked" = "0" ] || warn "${untracked} untracked file(s) present (ignored by the deploy)"
}

if [ "$FORCE" = "1" ]; then
  say ""
  say "${yellow}${bold}════════════════════════════════════════════════════════════${reset}"
  say "${yellow}${bold}  ⚠  OVERRIDE: state checks bypassed (--force)${reset}"
  say "${yellow}${bold}════════════════════════════════════════════════════════════${reset}"
  warn "branch: ${bold}${branch}${reset}  (not enforcing '${MAIN_BRANCH}')"
  git diff --quiet && git diff --cached --quiet || warn "working tree has uncommitted changes to tracked files"
  warn "this is a deliberate, out-of-band deploy — only proceed if you meant it"
  say ""
else
  run_state_checks
fi

# ── touch-list: exactly what this will change on prod ────────────────────────────────────────────
say ""
say "${bold}This will deploy to PRODUCTION:${reset}"

if [ "$MODE" = "functions" ]; then
  names=()
  if [ "${#PASSTHRU[@]}" -gt 0 ]; then
    names=("${PASSTHRU[@]}")
  else
    # every function directory with an entrypoint (excludes _shared and other non-function dirs)
    while IFS= read -r d; do names+=("$(basename "$d")"); done < <(
      find supabase/functions -mindepth 1 -maxdepth 1 -type d ! -name '_*' | sort
    )
  fi
  [ "${#names[@]}" -gt 0 ] || die "no functions found to deploy"
  say "  ${bold}edge functions${reset} → ${REMOTE} project:"
  for n in "${names[@]}"; do say "    • ${n}"; done
  DEPLOY_CMD=("$SUPABASE_BIN" functions deploy "${names[@]}")
else
  say "  ${bold}database migrations${reset} (pending local → remote):"
  # migration list is a read-only comparison; show the operator the Local/Remote table
  if ! "$SUPABASE_BIN" migration list 2>/dev/null | sed 's/^/    /'; then
    warn "could not read migration list (offline?) — files present locally:"
    find supabase/migrations -maxdepth 1 -name '*.sql' -exec basename {} \; | sort | sed 's/^/    • /'
  fi
  DEPLOY_CMD=("$SUPABASE_BIN" db push "${PASSTHRU[@]}")
fi

say ""
say "  ${dim}command:${reset} ${DEPLOY_CMD[*]}"
say ""

# ── confirm (always, even under --force) ─────────────────────────────────────────────────────────
printf '%s' "Proceed with this production deploy? [y/N] "
read -r reply || reply=""
case "$reply" in
  y|Y|yes|YES) ;;
  *) say "${dim}aborted — nothing deployed.${reset}"; exit 0 ;;
esac

# ── deploy ───────────────────────────────────────────────────────────────────────────────────────
say ""
info "running: ${DEPLOY_CMD[*]}"
"${DEPLOY_CMD[@]}"
ok "deploy complete."
