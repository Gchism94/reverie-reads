# Task: chore/ci

Branch: `chore/ci` off `main`.
Repo: book-corpus.

Infrastructure only. No app source changes, no spec changes.

## Why

The e2e suite is now trustworthy locally — five consecutive green at
`E2E_WORKERS=1`, poll gap fixed, mutation-checked. But there is no `.github/`
directory: nothing runs it but discipline. A suite nobody is required to pass is
a suite whose red means nothing, which is where this whole arc started. CI is
what converts a local property into an enforced one.

## Preconditions — stop and report if unmet
- `main` current at f48e246 or later, working tree clean.

## Phase 1 — Audit and measure. Change nothing. Report and stop.

1. **The gate, precisely.** List the exact commands that constitute the local
   gate (lint, typecheck, unit tests core and web, prettier, build), with the
   package.json script names and measured runtimes for each on a cold install.
   Report total wall clock for the non-e2e gate.

2. **What e2e needs from cold.** Everything required to run the suite on a
   machine with nothing installed: Supabase CLI version, which Docker images
   `supabase start` pulls and how long cold, the seed path, Playwright browser
   install, and every environment variable read anywhere in the e2e path.
   For each variable, state whether it is a local-stack demo value that can be
   committed or a genuine secret that must be a repo secret. Name any secret
   explicitly — I need to know what I'm being asked to add before I add it.

3. **Anything that assumes no CI.** Does any script write into the repo, depend
   on a local path, shell out to `supabase` expecting a running stack, or
   otherwise break in a clean checkout? Check `scripts/deploy-guard.sh`
   specifically — it must never be reachable from CI. Also report whether Vercel
   already builds on PRs, so we don't duplicate a build we're already paying for.

4. **Runner sizing.** GitHub-hosted runners are 2-core for public repos on the
   free tier and 4-core on some plans — report which applies to this repo, and
   whether it is public or private. Estimate total e2e job time from cold
   (`supabase start` + browsers + seed + 49 tests at `E2E_WORKERS=1`). If it is
   likely to exceed 20 minutes, say so and propose what to cut.

Do not write workflow YAML in this phase.

## Phase 2 — Shape approved after the audit

Working plan, subject to Phase 1:

- **Fast gate on every push and PR**: install, lint, typecheck, unit tests,
  build. This should be minutes, and it should be the thing that gates most of
  the time.
- **e2e on pull requests**, as its own job: `E2E_WORKERS=1`, `retries: 0`, fresh
  DB. Upload Playwright traces as artifacts on failure — `retain-on-failure` is
  already configured and currently produces traces nothing collects.
- Cache the pnpm store and Playwright browsers. Do not cache the Supabase
  Docker images unless Phase 1 shows it actually helps.
- Concurrency group per branch, cancelling superseded runs.
- `scripts/deploy-guard.sh` must not be reachable from any workflow. Migrations
  and function deploys stay manual from main, unchanged.

## Acceptance

The same bar the suite itself had to clear:

- **Five consecutive green CI runs on the runner**, triggered deliberately, not
  five green runs locally. Report all five with job durations.
- One deliberately-failing run — break something trivial in a scratch commit,
  confirm the job goes red, confirm the trace artifact uploads and is openable,
  then revert. A gate that has never been seen to fail is not known to work.

Branch protection is mine to configure in GitHub settings; do not attempt it and
do not ask for admin permissions. Report which checks I should mark required and
their exact names as they appear in the PR checks list.

## Out of scope — recorded
- The per-user migration for a11y/fonts/cover-sheet. It comes after CI, and what
  it buys is raising `E2E_WORKERS` back above 1 once runner time is a real cost.
- a11y's three fixture helpers swallowing sign-in errors, and db:seed's
  `Seed failed: {}`. Same follow-up branch.
- useRemoveEntry's two non-transactional writes (apps/web/src/data/series.ts
  ~L353). App source, needs its own audit.

## Completion report

Phase 1 findings, the workflow shape and why, the five green runs with durations,
the deliberate failure with confirmation the trace uploaded, the required-check
names, and the standing full e2e run.

No merge without my word.
