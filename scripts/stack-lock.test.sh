#!/usr/bin/env bash
#
# stack-lock.test.sh — prove scripts/stack-lock.sh actually serialises, and prove the proof.
#
# Modelled on deploy-guard.test.sh: a real invocation per case, no mocking of the lock itself (the
# lock IS the subject), and an injected lock path so nothing touches the machine-global file the
# real stack uses.
#
# The last two cases are the ones that matter. AGENTS.md: "a clean result from an instrument you
# haven't shown can fail is not evidence." So after the six behaviour cases, this file MUTATES a
# copy of the wrapper — removes the lock acquisition, and separately makes it run the command after
# a failed wait — and re-runs the cases that are supposed to catch exactly that. If a mutated
# wrapper still passes, the case was theatre and says so.

set -uo pipefail

SCRIPT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/stack-lock.sh"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
export RV_STACK_LOCK_FILE="$TMP/test.lock"
export RV_STACK_LOCK_NOTIFY=1 # heartbeat fast enough to observe inside a test

PASS=0
FAIL=0
ok() {
  echo "  ✓ $1"
  PASS=$((PASS + 1))
}
bad() {
  echo "  ✗ $1"
  FAIL=$((FAIL + 1))
}
now() { date +%s; }

echo "stack-lock.test.sh — binary: $(command -v lockf >/dev/null && echo lockf || echo flock)"
echo

# ── 1. Uncontended: acquires immediately ───────────────────────────────────────────────────────
echo "1. uncontended"
T0=$(now)
OUT="$(bash "$SCRIPT" echo "ran-uncontended" 2>/dev/null)"
EL=$(($(now) - T0))
[ "$OUT" = "ran-uncontended" ] && ok "command ran (output: $OUT)" || bad "command did not run: $OUT"
[ "$EL" -le 2 ] && ok "no measurable delay (${EL}s)" || bad "unexpected delay (${EL}s)"

# ── 2. Exit code passthrough, both directions ──────────────────────────────────────────────────
echo "2. exit-code passthrough"
bash "$SCRIPT" true >/dev/null 2>&1
[ $? -eq 0 ] && ok "0 stays 0" || bad "zero exit was not preserved"
bash "$SCRIPT" sh -c 'exit 42' >/dev/null 2>&1
RC=$?
[ "$RC" -eq 42 ] && ok "42 propagates unchanged" || bad "expected 42, got $RC"

# ── 3. Contended: the second acquirer waits, then runs AFTER the holder ────────────────────────
# Ordering is the assertion. "Both eventually ran" would pass without any lock at all.
echo "3. contended — ordering"
ORDER="$TMP/order"
: >"$ORDER"
bash "$SCRIPT" sh -c 'sleep 3; echo holder-done >>"'"$ORDER"'"' >/dev/null 2>&1 &
HOLDER=$!
sleep 1
T0=$(now)
bash "$SCRIPT" sh -c 'echo waiter-done >>"'"$ORDER"'"' >/dev/null 2>&1
WAITED=$(($(now) - T0))
wait "$HOLDER" 2>/dev/null
SEQ="$(tr '\n' ' ' <"$ORDER")"
[ "$SEQ" = "holder-done waiter-done " ] && ok "ordering held: $SEQ" || bad "ordering broken: $SEQ"
[ "$WAITED" -ge 1 ] && ok "waiter actually waited (${WAITED}s)" || bad "waiter did not wait (${WAITED}s)"

# ── 4. kill -9'd holder: the next acquirer proceeds immediately ────────────────────────────────
# The property that makes this safe to adopt — no stale-lock cleanup ritual, because the kernel
# drops the fd with the process.
echo "4. killed holder"
bash "$SCRIPT" sleep 30 >/dev/null 2>&1 &
sleep 1
pkill -9 -f "sleep 30" >/dev/null 2>&1
sleep 1
T0=$(now)
OUT="$(RV_STACK_LOCK_TIMEOUT=5 bash "$SCRIPT" echo "after-kill" 2>/dev/null)"
EL=$(($(now) - T0))
[ "$OUT" = "after-kill" ] && [ "$EL" -le 2 ] &&
  ok "acquired immediately after kill -9 (${EL}s) — no stale lock" ||
  bad "did not recover from a killed holder (out=$OUT, ${EL}s)"

# ── 5. Timeout: exits non-zero AND the command does not run ────────────────────────────────────
# "Did not run" is the half that matters: proceeding after a failed wait is the original bug.
echo "5. timeout"
MARK="$TMP/should-not-exist"
bash "$SCRIPT" sleep 10 >/dev/null 2>&1 &
HOLDER=$!
sleep 1
RV_STACK_LOCK_TIMEOUT=2 bash "$SCRIPT" sh -c "touch '$MARK'" >/dev/null 2>&1
RC=$?
[ "$RC" -ne 0 ] && ok "non-zero exit on timeout ($RC)" || bad "timeout exited 0"
[ ! -f "$MARK" ] && ok "the command did NOT run" || bad "the command ran after a failed wait"
kill -9 "$HOLDER" 2>/dev/null
pkill -9 -f "sleep 10" >/dev/null 2>&1
wait "$HOLDER" 2>/dev/null

# ── 6. Re-entrancy: a nested invocation passes through ─────────────────────────────────────────
echo "6. re-entrancy"
OUT="$(bash "$SCRIPT" bash "$SCRIPT" echo "nested-ok" 2>/dev/null | tail -1)"
[ "$OUT" = "nested-ok" ] && ok "nested invocation passed through (no self-deadlock)" ||
  bad "nested invocation did not complete: $OUT"

# ── 7. The lock file survives a release, so every acquirer shares one inode ────────────────────
# Regression guard for a hazard found while building this: macOS lockf unlinks the file on release
# unless -k, and a waiter on the unlinked inode plus a fresh creator is two simultaneous holders.
echo "7. lock file persists across release"
rm -f "$RV_STACK_LOCK_FILE"
bash "$SCRIPT" true >/dev/null 2>&1
[ -e "$RV_STACK_LOCK_FILE" ] && ok "lock file kept after release (one inode for all acquirers)" ||
  bad "lock file was UNLINKED on release — two waiters could land on different inodes"

# ── INSTRUMENT VALIDATION — mutate the wrapper and confirm the cases catch it ──────────────────
echo
echo "── mutation: does case 3 actually test the lock? ──"
MUT="$TMP/stack-lock.nolock.sh"
# Strip the acquisition: run the command directly instead of under lock_wait.
sed 's|^lock_wait "\$TIMEOUT" bash -c "\$RUN_HOLDING" _ "\$@"|bash -c "$RUN_HOLDING" _ "$@"|' \
  "$SCRIPT" >"$MUT"
# ...and neuter the fast path's lock too, so nothing serialises at all.
sed -i.bak 's|^if lock_try true 2>/dev/null; then|if false; then|' "$MUT" 2>/dev/null || true
grep -q 'lock_wait "\$TIMEOUT"' "$MUT" && echo "  (warning: mutation did not apply — check the sed)"

: >"$ORDER"
bash "$MUT" sh -c 'sleep 3; echo holder-done >>"'"$ORDER"'"' >/dev/null 2>&1 &
HOLDER=$!
sleep 1
bash "$MUT" sh -c 'echo waiter-done >>"'"$ORDER"'"' >/dev/null 2>&1
wait "$HOLDER" 2>/dev/null
MUTSEQ="$(tr '\n' ' ' <"$ORDER")"
if [ "$MUTSEQ" = "holder-done waiter-done " ]; then
  bad "MUTANT SURVIVED — case 3 passes without a lock, so it was testing nothing"
else
  ok "mutant killed — unlocked ordering is '$MUTSEQ', locked was 'holder-done waiter-done '"
fi

echo
echo "── mutation: does case 5 actually test 'did not run'? ──"
MUT5="$TMP/stack-lock.runanyway.sh"
# Make the timeout branch fall through to running the command instead of exiting 75.
sed 's|^  exit 75$|  bash -c "$RUN_HOLDING" _ "$@"; exit 75|' "$SCRIPT" >"$MUT5"
MARK5="$TMP/mutant-mark"
bash "$SCRIPT" sleep 10 >/dev/null 2>&1 &
HOLDER=$!
sleep 1
RV_STACK_LOCK_TIMEOUT=2 bash "$MUT5" sh -c "touch '$MARK5'" >/dev/null 2>&1
if [ -f "$MARK5" ]; then
  ok "mutant killed — with the guard removed the command DID run, so case 5's check is real"
else
  bad "MUTANT SURVIVED — case 5 cannot distinguish 'did not run' from 'ran'"
fi
kill -9 "$HOLDER" 2>/dev/null
pkill -9 -f "sleep 10" >/dev/null 2>&1
wait "$HOLDER" 2>/dev/null

echo
echo "passed: $PASS   failed: $FAIL"
[ "$FAIL" -eq 0 ]
