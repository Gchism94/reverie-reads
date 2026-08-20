#!/usr/bin/env bash
# spec-isolation-sweep.sh — run every e2e spec ALONE against a fresh database.
#
# ── WHEN TO REACH FOR THIS ───────────────────────────────────────────────────────────────────────
# When a FALSE GREEN is suspected: a spec that passes but may be leaning on state it does not own.
# The suite runs specs together against one database, so a spec can be fed by another spec's
# residue, by seed data it never asked for, or by row order nothing pinned — and it passes,
# asserting nothing about the code under test, until the day the residue is gone.
#
# Both known instances were found BY ACCIDENT, which is the argument for having this at all:
#   · shelf-regressions.spec.ts:426 — passing on Postgres scan-order luck for its ENTIRE life. The
#     fixture inserted two shelves with NULL sort_order and asserted their order; it was green
#     because the scan happened to return them that way. Surfaced by the WebKit probe (#298).
#   · star-touch-targets.spec.ts — passing on ANOTHER SPEC'S residue. Its seeder was inherited from
#     cover-card's scaffolding and deleted as "unused" when lint flagged it (#300); the spec then
#     ran on a book a previous cover-card run had left for the shared test user. A database restart
#     cleared it and the route rendered "That book isn't in your library." (#301).
#
# ── DO NOT PASS --project. THIS IS A PROHIBITION, NOT A PREFERENCE ───────────────────────────────
# Eight specs live only in the `mobile` project. A sweep run with `--project=rest` reports every one
# of them as passing WITHOUT EXECUTING A SINGLE TEST — a false green inside the false-green
# detector, which is the worst possible failure for this tool. It was caught in phase 0 only
# because a file that should take ~40s finished in 3. Let playwright.config.ts pick projects per
# file; that is what its testMatch/testIgnore rules are for.
#
# ── COST, so nobody optimises it blindly ─────────────────────────────────────────────────────────
# ~40 minutes for 39 spec files (39.9m measured, against ~46m predicted). `db reset` is 35–36s and
# FLAT — it does not vary with the spec — so resets are 57% OF TOTAL RUNTIME. That is the only real
# lever, and the obvious optimisation is circular: skipping the reset for "read-only" specs
# requires knowing which specs write, which is precisely what this sweep exists to establish. If
# you want it faster, make `db reset` faster; do not make the sweep less isolated.
#
# ── IT HOLDS THE STACK FOR ~40 MINUTES AND RESETS THE DATABASE REPEATEDLY ─────────────────────────
# Announce before running and run it when nothing else is. Three collisions in one week traced to
# two sessions sharing one stack, and this is the worst-shaped task for that: long, and destructive
# to shared state on a 36-second cycle.
#
# ── VALIDATE THE INSTRUMENT BEFORE BELIEVING A ZERO. THIS IS A PRECONDITION ──────────────────────
# A sweep that reports "0 false greens" is indistinguishable from a sweep that cannot detect one.
# Before trusting a clean result, replay a KNOWN-BAD case and confirm this harness fails on it:
#
#     canonical known-bad: star-touch-targets.spec.ts at 928d5d9^ (its state before the seeder was
#     restored). Run it alone against a fresh DB; expect rc=1, timing out waiting for the rating
#     slider on a book that another spec's residue used to supply.
#
# THE CHECKOUT IS DELIBERATELY MANUAL, AND THAT IS NOT LAZINESS. Scripting a `git checkout` of a
# historical file is the exact shape that destroyed real work twice here and produced
# scripts/safe-revert.sh. A validation step that can eat uncommitted work is a worse trade than one
# a person performs deliberately. Copy the file aside, check out the old version, run, restore from
# your copy.
#
# ── WHAT THIS SWEEP CANNOT SEE ───────────────────────────────────────────────────────────────────
# The INVERSE bug: a spec that passes ALONE and fails IN-SUITE — interference rather than
# dependence. Running specs in isolation cannot produce it by construction, so nothing here is
# evidence that the suite is order-independent.
#
# Known instances of that class: ZERO confirmed. Stated precisely because "no known instances" and
# "one we are not chasing" read very differently:
#   · The a11y/profile collision sometimes cited as an example was CROSS-SESSION, not intra-suite —
#     a second session's Playwright run on the shared stack, with the database container restarting
#     mid-run (container age 54s afterwards, load 6.98/9.92/11.54). The two suites also used
#     different test users (a11y-e2e vs cover-card-touch-e2e), which rules out profile contamination
#     between specs in one run.
#   · trope-rename-delete.spec.ts:180 has the right SHAPE (failed in-suite, passed 3/3 in isolation)
#     but its recorded mechanism is a carrier-count query not settling under full-suite LOAD — a
#     timing effect, not one spec disturbing another's state. Worth re-reading if a second
#     occurrence appears; see the BACKLOG's known-flaky ledger.
#
# ── RUN IT ───────────────────────────────────────────────────────────────────────────────────────
#     pnpm db:start                       # stack up first
#     scripts/spec-isolation-sweep.sh     # ~40 min, announce it
#     scripts/spec-isolation-sweep.sh apps/web/e2e/foo.spec.ts   # or a subset
set -uo pipefail

cd "$(dirname "$0")/.." || exit 1
specs=("$@")
if [ ${#specs[@]} -eq 0 ]; then
  # shellcheck disable=SC2207  # filenames here are repo-controlled and contain no whitespace
  specs=($(find apps/web/e2e -maxdepth 1 -name '*.spec.ts' | sort))
fi

pass=0; fail=0; failed=()
started=$(date +%s)
echo "isolation sweep: ${#specs[@]} spec file(s), fresh DB before each — expect ~1m per file"

for spec in "${specs[@]}"; do
  printf '\n── %s\n' "$spec"
  pnpm db:reset >/dev/null 2>&1 || { echo "   db reset FAILED — is the stack up?"; exit 1; }
  # NO --project: see the prohibition in the header.
  if pnpm --filter @reverie/web e2e "$(basename "$spec")" >/tmp/iso-$$.log 2>&1; then
    echo "   pass  ($(grep -oE '[0-9]+ passed' /tmp/iso-$$.log | tail -1))"
    pass=$((pass + 1))
  else
    echo "   FAIL  ← candidate false green: it passes in-suite but not alone"
    grep -E '✘|Error:|expect' /tmp/iso-$$.log | head -3 | sed 's/^/        /'
    fail=$((fail + 1)); failed+=("$spec")
  fi
done

printf '\n── sweep complete in %dm: %d passed, %d failed\n' $((($(date +%s) - started) / 60)) "$pass" "$fail"
if [ "$fail" -gt 0 ]; then
  printf '   %s\n' "${failed[@]}"
  echo "   Each of these passes in the suite but not alone — it is depending on state it does not own."
else
  echo "   Zero failures. This means nothing unless you validated the harness first — see the header."
fi
rm -f /tmp/iso-$$.log
