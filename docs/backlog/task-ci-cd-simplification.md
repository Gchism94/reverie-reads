# Backlog task: CI/CD value, reliability, and simplification

Priority: **P1 after the owner-library reconciliation**.

## Objective

Replace the current collection of expensive, intermittently fragile checks with the smallest clear
pipeline that catches the same material defects reliably. This is an evidence-led reduction, not a
blanket deletion of tests and not another layer of orchestration.

## Audit first

For each workflow, job, required check, setup phase, cache, artifact, retry, and concurrency rule:

- record trigger, responsibility, median/p95 duration, queue time, compute cost, and recent failure
  history;
- distinguish product defects, deterministic harness defects, environmental failures, and flakes;
- identify duplicated installs, builds, local Supabase startups, seed/reset work, and browser suites;
- prove whether another check already covers the same failure class;
- inspect branch protection and Vercel deploy coupling so removing a job cannot silently remove a
  required release gate;
- include the current `gate`, `e2e`, `cla`, `e2e-a11y`, `e2e-mobile`, `pgtap`, and `secrets` checks,
  while distinguishing the Contributor License Agreement check from retired Claude tooling.

Fold the open CI/deploy residues in `docs/backlog/BACKLOG.md` into this review: bounded Supabase
startup recovery and cleanup, production RPC ACL verification, the deploy guard's second prompt,
e2e TypeScript coverage, resilient fixture cleanup, Deno-function execution coverage, trace
artifact integrity, and signed-out browser/a11y coverage.

## Decision standard

- Keep a check when it protects a distinct high-impact boundary or has demonstrated defect yield.
- Merge checks when setup dominates runtime and their isolation does not protect diagnosis or
  required-check policy.
- Remove checks that are redundant, dead, uncallable, or permanently monitoring a decision already
  enforced elsewhere.
- Fix deterministic races at their source. Do not normalize reruns, broad retries, longer sleeps, or
  ever-growing timeouts as the solution.
- Prefer straightforward scripts and native workflow features over a custom scheduler or another
  abstraction layer.

## Completion gate

Publish the before/after pipeline graph, required-check set, timings, failure taxonomy, and removed
coverage map. Exercise each retained failure boundary with a known-bad control. The simplified
pipeline must pass repeatedly on unchanged code, fail on those controls, clean up its resources,
and leave one documented path from PR to staged production to promotion.
