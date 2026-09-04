#!/usr/bin/env bash
#
# deploy-guard.test.sh — exercise the guard's touch-list paths without touching production.
#
# The guard has always advertised "tests inject a mock and no real deploy fires" in its header, but
# no test existed until the touch-list bugs shipped (see fix/deploy-guard). These are those tests.
#
# Each case injects SUPABASE_BIN pointing at a fake CLI that reproduces a REAL observed output —
# the 403 blob is copied verbatim from the 2026-07-28 production run — and asserts on what the
# operator would see. State checks are skipped with --force so the tests can run from any branch;
# the touch-list block under test runs identically either way.
#
#   bash scripts/deploy-guard.test.sh

set -uo pipefail

GUARD="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/deploy-guard.sh"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

pass=0
fail=0
ok()   { printf '  \033[32m✓\033[0m %s\n' "$1"; pass=$((pass + 1)); }
bad()  { printf '  \033[31m✗\033[0m %s\n' "$1"; fail=$((fail + 1)); }

# Spelled out rather than `cond && ok || bad`: in that idiom `bad` also runs if `ok` itself fails
# (SC2015). It happens to be safe here, but a test helper that can double-report is the last thing
# this branch should ship.
# assert_has <label> <haystack-file> <needle>
assert_has() {
  if grep -qF -- "$3" "$2"; then ok "$1"; else bad "$1 — expected to find: $3"; fi
}
# assert_lacks <label> <haystack-file> <needle>
assert_lacks() {
  if grep -qF -- "$3" "$2"; then bad "$1 — expected NOT to find: $3"; else ok "$1"; fi
}
assert_eq() {
  if [ "$2" = "$3" ]; then ok "$1"; else bad "$1 — expected '$3', got '$2'"; fi
}

# Build a fake supabase CLI. $1 = mode; it answers `migration list` per mode and refuses to do
# anything else destructive (a real `db push` must never fire from a test).
mock() {
  local mode="$1" bin="$TMP/bin-$1"
  mkdir -p "$bin"
  cat > "$bin/supabase" <<MOCK
#!/usr/bin/env bash
if [ "\$1" = "migration" ] && [ "\$2" = "list" ]; then
  case "$mode" in
    valid|deploy)
      echo '{"migrations":[{"local":"20260726010000","remote":"20260726010000","time":"2026-07-26 01:00:00"},{"local":"20260728010000","remote":"","time":"2026-07-28 01:00:00"}],"message":"Migrations listed"}'
      exit 0 ;;
    auth)
      # verbatim from the real 2026-07-28 run — note it goes to STDOUT, not stderr
      echo 'Initialising login role...' >&2
      echo '{"_tag":"Error","error":{"code":"LegacyDbConfigLoginRoleStatusError","message":"unexpected login role status 403: {\"message\":\"Your account does not have the necessary privileges to access this endpoint.\"}"}}'
      exit 1 ;;
    network)
      # verbatim from cutting this machine off from the API (HTTPS_PROXY at an unresolvable host).
      # The CLI does NOT surface Go's "dial tcp ... no such host" — it wraps it in its own codes,
      # on STDOUT. Guessed patterns missed this; only running it for real found it.
      echo 'Initialising login role...' >&2
      echo '{"_tag":"Error","error":{"code":"LegacyDbConfigLoginRoleNetworkError","message":"failed to initialise login role: TransportError"}}'
      exit 1 ;;
    network_go)
      # the raw-Go shape, kept in case a future CLI stops wrapping
      echo 'failed to connect: dial tcp: lookup api.supabase.com: no such host' >&2
      exit 1 ;;
    weird)
      echo 'something nobody has seen before' >&2
      exit 1 ;;
    timestamp403)
      # a pending migration dated 3 April — the digits 0403 must NOT read as an HTTP 403
      echo 'failed to connect: dial tcp: lookup api.supabase.com: no such host  (20260403010000_x.sql)' >&2
      exit 1 ;;
  esac
fi
if [ "\$1" = "db" ] && [ "\$2" = "push" ] && [ "$mode" = "deploy" ]; then
  printf '%s\n' "\$*" > "\${DEPLOY_GUARD_MOCK_LOG:?}"
  exit 0
fi
echo "MOCK REFUSES: \$*" >&2
exit 99
MOCK
  chmod +x "$bin/supabase"
  printf '%s' "$bin/supabase"
}

# run <mode> <stdin-reply> [extra guard args...]
run() {
  local mode="$1" reply="$2"; shift 2
  printf '%s\n' "$reply" | DEPLOY_GUARD_MOCK_LOG="$TMP/push-log" \
    SUPABASE_BIN="$(mock "$mode")" bash "$GUARD" migrations --force "$@" > "$TMP/out" 2>&1
  printf '%s' $?
}

printf '\ndeploy-guard touch-list paths\n\n'

# ── 1. valid auth ────────────────────────────────────────────────────────────────────────────────
printf 'valid auth (declines at the prompt)\n'
status="$(run valid n)"
assert_eq   "exits 0 when the operator declines"      "$status" "0"
assert_has  "renders the pending-migration table"     "$TMP/out" '"message":"Migrations listed"'
assert_has  "reaches the confirmation prompt"         "$TMP/out" 'Proceed with this production deploy?'
assert_has  "declining reports nothing deployed"      "$TMP/out" 'aborted — nothing deployed.'
assert_lacks "no failure banner on the happy path"    "$TMP/out" 'refusing to deploy'

# ── 2. broken auth ───────────────────────────────────────────────────────────────────────────────
printf '\nbroken auth (403 on stdout)\n'
status="$(run auth y)"
assert_eq   "refuses with a non-zero exit"                    "$status" "1"
assert_has  "names it an authentication failure"              "$TMP/out" 'authentication failure'
assert_has  "says retrying will not help"                     "$TMP/out" 'NOT a connectivity problem'
assert_has  "labels the error with the command's exit code"   "$TMP/out" 'exited 1:'
assert_has  "shows the raw CLI error text"                    "$TMP/out" 'LegacyDbConfigLoginRoleStatusError'
assert_has  "states the touch-list is unknown"                "$TMP/out" 'could not be determined'
assert_lacks "never misreports it as offline"                 "$TMP/out" 'offline'
assert_lacks "never reaches the prompt"                       "$TMP/out" 'Proceed with this production deploy?'
assert_lacks "does not list local migration files"            "$TMP/out" '• 20260726010000'
# fix #1: the error must be LABELLED, never rendered where the table belongs.
#
# Deliberately not awk: `exit 1` inside a rule jumps to END, so an `END{exit 0}` silently overrides
# it and the assertion can never fail. The first draft of this test had exactly that, passed against
# the unfixed guard, and certified an absence it had never checked.
hdr_line="$(grep -n 'pending local' "$TMP/out" | head -1 | cut -d: -f1)"
if [ -z "$hdr_line" ]; then
  bad "touch-list header missing entirely — cannot check what follows it"
else
  after_hdr="$(sed -n "$((hdr_line + 1))p" "$TMP/out")"
  case "$after_hdr" in
    *_tag*|*Error*|*error*)
      bad "error rendered as though it were the pending-migration table: ${after_hdr}" ;;
    *)
      ok "error never renders inside the touch-list block" ;;
  esac
fi

# ── 3. no network ────────────────────────────────────────────────────────────────────────────────
printf '\nno network (the CLI wraps it in its own error code)\n'
status="$(run network y)"
assert_eq   "refuses with a non-zero exit"                 "$status" "1"
assert_has  "names it a network failure"                   "$TMP/out" 'network failure'
assert_has  "clears the credentials of blame"              "$TMP/out" 'credentials are not implicated'
assert_has  "shows the raw error"                          "$TMP/out" 'TransportError'
assert_lacks "does not misreport it as auth"               "$TMP/out" 'authentication failure'
assert_lacks "not left unclassified"                       "$TMP/out" 'cause not recognised'
assert_lacks "never reaches the prompt"                    "$TMP/out" 'Proceed with this production deploy?'

printf '\nno network — raw Go transport shape (fallback patterns)\n'
status="$(run network_go y)"
assert_eq   "refuses with a non-zero exit"                 "$status" "1"
assert_has  "still names it a network failure"             "$TMP/out" 'network failure'
assert_has  "shows the raw error"                          "$TMP/out" 'no such host'

# ── 4. unrecognised failure ──────────────────────────────────────────────────────────────────────
printf '\nunrecognised failure\n'
status="$(run weird y)"
assert_eq   "still refuses"                          "$status" "1"
assert_has  "admits it cannot classify"              "$TMP/out" 'cause not recognised'
assert_has  "still shows the raw error"              "$TMP/out" 'something nobody has seen before'
assert_lacks "never reaches the prompt"              "$TMP/out" 'Proceed with this production deploy?'

# ── 5. a migration timestamp must not be read as an HTTP status ──────────────────────────────────
printf '\nclassification is not fooled by a 0403 timestamp\n'
status="$(run timestamp403 y)"
assert_has  "still classified as network"            "$TMP/out" 'network failure'
assert_lacks "not misread as authentication"         "$TMP/out" 'authentication failure'

# ── 6. the guard owns the only human confirmation ──────────────────────────────────────────────
printf '\napproved migration deploy\n'
rm -f "$TMP/push-log"
status="$(run deploy y --include-all)"
assert_eq   "approved deploy exits 0"                         "$status" "0"
assert_has  "reports deploy completion"                       "$TMP/out" 'deploy complete.'
assert_eq   "passes exact downstream approval after y/N"      "$(cat "$TMP/push-log")" 'db push --yes --include-all'

printf '\n%s passed, %s failed\n\n' "$pass" "$fail"
[ "$fail" -eq 0 ]
