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

  # `migration list` is a read-only comparison, and its table IS the touch-list. Three rules learned
  # from running this against a project the CLI had no rights to (2026-07-28):
  #
  #  1. CAPTURE BOTH STREAMS. The CLI writes its errors to STDOUT, not stderr, so the old
  #     `migration list 2>/dev/null | sed 's/^/    /'` indented a 403 JSON blob into the touch-list
  #     where the pending-migration table belongs. Read it into a variable; nothing reaches the
  #     screen until we know what it is.
  #  2. NAME THE FAILURE. "(offline?)" is a guess, and it was wrong: the API had answered and
  #     refused. Auth and connectivity call for opposite responses (fix credentials vs. wait and
  #     retry), so say which one happened and show the error.
  #  3. AN UNKNOWN TOUCH-LIST IS A REASON TO ABORT, NOT TO GUESS. The old fallback printed every
  #     local migration file — 48 of them when 2 were pending — under a heading promising to say
  #     EXACTLY what would be touched. Print nothing and refuse.
  #
  # Refusing costs nothing real: `db push` reaches the remote the same way `migration list` does
  # (same login role, same API), so a list this command cannot read is a push that cannot run.
  #
  # Target flags are forwarded so the list describes the SAME database the push will touch —
  # `--db-url`/`--linked`/`--local` retarget both commands, and a touch-list for a different
  # database is exactly the class of lie this block exists to prevent. Other `db push` flags
  # (`--include-all`, `--dry-run`, …) are not valid on `migration list` and are deliberately not
  # forwarded.
  list_args=()
  _want_value=0
  for a in ${PASSTHRU[@]+"${PASSTHRU[@]}"}; do
    if [ "$_want_value" = "1" ]; then list_args+=("$a"); _want_value=0; continue; fi
    case "$a" in
      --linked|--local) list_args+=("$a") ;;
      --db-url=*) list_args+=("$a") ;;
      --db-url) list_args+=("$a"); _want_value=1 ;;
    esac
  done

  # Streams are captured SEPARATELY, not merged. Both are needed on failure (the CLI puts errors on
  # stdout and progress on stderr, so a merged capture is the only way to be sure of catching the
  # error) — but on SUCCESS only stdout is rendered, so "Initialising login role…" and friends never
  # appear inside the table. Merging them would trade one kind of contamination for a quieter one.
  list_err_file="$(mktemp)"
  list_out=""
  list_status=0
  list_out="$("$SUPABASE_BIN" migration list ${list_args[@]+"${list_args[@]}"} 2>"$list_err_file")" \
    || list_status=$?
  list_err="$(cat "$list_err_file")"
  rm -f "$list_err_file"

  if [ "$list_status" -ne 0 ]; then
    # Classify from the captured text. Auth first: a refusal is a definite answer FROM the service,
    # so it outranks a transport guess when both could match.
    # Patterns are deliberately specific. A bare `*403*` would match the migration timestamp
    # 20260403…, and a bare `*EOF*` matches almost anything — a misread here sends the operator
    # to fix the wrong thing.
    #
    # NetworkError/TransportError are the CLI's OWN wrappers, observed by cutting this machine off
    # from the API: it does not surface Go's `dial tcp … no such host` at all, it reports
    # `LegacyDbConfigLoginRoleNetworkError` / `TransportError`. The raw-Go patterns are kept as a
    # fallback in case that changes, but the wrappers are what actually fires. Auth is matched first
    # because a refusal is a definite answer from the service; note the two wrappers are
    # distinguishable — …LoginRoleStatusError is auth, …LoginRoleNetworkError is transport.
    kind="unrecognised"
    case "${list_out}${list_err}" in
      *"status 403"*|*"status 401"*|*"403 Forbidden"*|*"401 Unauthorized"*|*[Uu]nauthorized*|\
      *[Ff]orbidden*|*"necessary privileges"*|*LoginRoleStatusError*|*"Access token not provided"*|\
      *"Invalid access token"*|*"not logged in"*|*"supabase login"*)
        kind="authentication" ;;
      *NetworkError*|*TransportError*|*"no such host"*|*"dial tcp"*|*"connection refused"*|\
      *"i/o timeout"*|*"context deadline exceeded"*|*"network is unreachable"*|\
      *"name resolution"*|*"no route to host"*|*"server misbehaving"*|*"TLS handshake"*)
        kind="network" ;;
      *"Cannot find project ref"*|*"not linked"*|*"supabase link"*)
        kind="not-linked" ;;
    esac

    say ""
    case "$kind" in
      authentication)
        warn "${bold}authentication failure${reset} — the service answered and refused."
        warn "this is NOT a connectivity problem: fix the credentials, retrying will not help."
        warn "check ${bold}supabase login${reset} and the linked ref in supabase/.temp/project-ref." ;;
      network)
        warn "${bold}network failure${reset} — the service could not be reached."
        warn "credentials are not implicated; check connectivity and retry." ;;
      not-linked)
        warn "${bold}project not linked${reset} — there is no remote to compare against."
        warn "run ${bold}supabase link${reset} first." ;;
      *)
        warn "${bold}could not read the migration list${reset} — cause not recognised."
        warn "the raw error is below; classify it before deploying." ;;
    esac
    say ""
    say "  ${dim}${SUPABASE_BIN} migration list${reset} exited ${list_status}:"
    [ -n "$list_out" ] && { say "  ${dim}stdout:${reset}"; printf '%s\n' "$list_out" | sed 's/^/    /'; }
    [ -n "$list_err" ] && { say "  ${dim}stderr:${reset}"; printf '%s\n' "$list_err" | sed 's/^/    /'; }
    say ""
    # Deliberately NOT listing local migration files here. A local file list is not the touch-list —
    # it is every migration ever written, which overstates the blast radius at the one moment the
    # operator is deciding. No touch-list, no deploy.
    die "the pending-migration list could not be determined, so what this would touch is unknown. Nothing deployed."
  fi

  printf '%s\n' "$list_out" | sed 's/^/    /'
  # bash 3.2 (macOS default) aborts on a bare "${PASSTHRU[@]}" when the array is EMPTY under `set -u`
  # (fixed in bash 4.4) — and zero passthrough args is the common `pnpm deploy:migrations` invocation.
  # The `${arr[@]+"${arr[@]}"}` idiom expands to nothing when empty and to the elements otherwise, on
  # every bash. Use it for any UNGUARDED possibly-empty array expansion. (The `names` array below is
  # instead guarded by a `die` on empty — deploying zero functions should error, not silently run.)
  DEPLOY_CMD=("$SUPABASE_BIN" db push "${PASSTHRU[@]+"${PASSTHRU[@]}"}")
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
