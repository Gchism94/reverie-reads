# CI/CD simplification — measured topology reduction

Date: 2026-08-30
Branch base: `main` at `e7bd408` (PRs #372 and #373 merged)

## Outcome

The PR pipeline keeps every existing test and every browser project, but removes two redundant PR
runners and two redundant main-push runners. Browser projects remain parallel; this is a topology
and setup reduction, not a smaller test surface.

```text
BEFORE (PR)                              AFTER (PR)

changes ─┬─> e2e                        changes ─> browser matrix ─┬─> e2e + pgTAP
         ├─> e2e-a11y                                            ├─> e2e-a11y
         ├─> e2e-mobile                                          └─> e2e-mobile
         └─> pgtap
gate                                      gate + full-history secrets
secrets                                   cla (separate workflow, unchanged)
cla (separate workflow)

BEFORE (main push)                       AFTER (main push)

changes                                  changes
gate                                     gate + secrets + browser-cache warm
secrets
warm-browser-cache
```

Required contexts move from seven to five:

- before: `gate`, `e2e`, `e2e-a11y`, `e2e-mobile`, `pgtap`, `secrets`, `cla`;
- after: `gate`, `e2e`, `e2e-a11y`, `e2e-mobile`, `cla`.

`changes` remains intentionally non-required. On a documentation-only PR, the matrix still expands
so all three required browser context names are published, while every checkout, install, database,
and browser step is skipped. Skipping the matrix job itself happens before expansion and may publish
only one unresolved context; a workflow-level path filter would publish none. Either can leave the
three required checks permanently “Expected.”

## Fresh measurement

Source: GitHub Actions API, the 30 most recent pull-request runs through PR #373. Durations are
whole-job elapsed minutes. This refreshes rather than reuses the 2026-08-17 cost/value audit.

| Job        | n   | Median |   p90 |   Max | Failed |
| ---------- | --- | -----: | ----: | ----: | -----: |
| changes    | 30  |   0.18 |  0.38 |  0.57 |      0 |
| secrets    | 30  |   0.25 |  0.35 |  2.07 |      0 |
| gate       | 30  |   1.83 |  1.93 |  1.98 |      0 |
| e2e        | 30  |  16.65 | 17.33 | 18.15 |      2 |
| e2e-a11y   | 30  |   8.68 |  9.23 | 12.73 |      1 |
| e2e-mobile | 30  |   6.38 |  6.77 |  7.05 |      2 |
| pgtap      | 30  |   1.57 |  1.75 |  2.28 |      0 |

Before, a code PR consumes about 35.55 runner-minutes at the median. Step timings from the 15 most
recent runs show why merging pgTAP is safe and useful: its standalone job spends a median 83 seconds
starting Supabase and only five seconds running the assertions. The desktop browser runner already
starts the same fully migrated stack. Moving those five seconds there removes roughly 1.5 duplicate
runner-minutes with about five seconds added to the existing critical path.

The secret runner spends a median six seconds checking out full history and three seconds scanning
it. Gate already checks out and installs the repository; making its checkout full-depth and keeping
the named scan step preserves the boundary with one fewer status context. The estimated new total is
about 33.9 runner-minutes (roughly 4.6% lower), while the critical path remains the desktop suite at
about 16.7 minutes. The larger simplification is structural: active PR checks fall from eight to six
including `changes` and CLA, and active main-push jobs fall from four to two.

## Failure taxonomy in the measurement window

Twenty-eight of the 30 runs were green. The two red runs were useful signals, not reasons to remove
a browser project:

1. Run `33144240473` caught a real function-privilege regression: browser fixture writes failed
   closed on `library_work_key` with SQLSTATE `42501`.
2. Run `33324399913` on PR #373 caught three distinct issues: real cross-skin contrast failures in
   accessibility, a stale desktop Add contract, and a mobile scroll-test setup that recorded its
   baseline before the reader-equivalent scroll gesture.

There were no secret-scan or pgTAP failures and no infrastructure-red run in this 30-run window.
That does not make either boundary redundant. It means their execution can share setup with a
required job without deleting the check itself.

## Removed-job coverage map

| Removed definition        | Coverage after simplification                                                                     |
| ------------------------- | ------------------------------------------------------------------------------------------------- |
| `secrets`                 | `gate` → named “Full-history secret scan” step using the same gitleaks action and configuration   |
| `pgtap`                   | `browser`/`rest` → named pgTAP step on the already-started migrated database                      |
| `e2e`, `e2e-a11y`, mobile | one `browser` matrix; exact names, projects, timeouts, workers, independent runners and artifacts |
| `warm-browser-cache`      | main-push-only final step in `gate`, reusing its checkout, Node, pnpm and dependency install      |

The matrix sets `fail-fast: false`, so one browser failure does not cancel evidence from its peers.
The browser step uses `always()` after a successful Supabase start, so a pgTAP assertion failure
does not hide the independent desktop-browser result. A source-level unit test guards the exact
matrix names and relocated boundaries because those strings are also the branch-protection API.

The first live rollout run found one deterministic ordering interaction: `gitleaks-action` writes a
clean `results.sarif` report into the checkout, so placing it before Prettier made the formatter fail
on generated output. The scan now runs last with `always()`. Its report cannot contaminate a later
step, and it still executes when another gate boundary is already red.

Corrected live run `33334335752` then passed every boundary on PR #374:

| Check        | Result | Whole-job time | Relocated boundary observed                         |
| ------------ | ------ | -------------: | --------------------------------------------------- |
| `gate`       | pass   |          2m03s | final always-run full-history secret scan passed    |
| `e2e`        | pass   |         17m41s | pgTAP passed before the desktop Playwright project  |
| `e2e-a11y`   | pass   |          7m52s | pgTAP step skipped; accessibility project ran alone |
| `e2e-mobile` | pass   |          6m41s | pgTAP step skipped; mobile project ran alone        |

The repository ruleset (`19911612`) was then read back with exactly five required contexts:
`gate`, `e2e`, `e2e-a11y`, `e2e-mobile`, and `cla`. The old `pgtap` and `secrets` contexts were
removed only after their replacement steps had passed live.

## Backlog residues reviewed, not conflated

- **Bounded Supabase startup recovery:** no recurrence in the fresh 30-run window. Adding a retry to
  the same change that moves pgTAP would make a red result ambiguous, so this remains a separate
  reliability change if the recorded Docker port-bind failure recurs.
- **Always-run Supabase cleanup:** ephemeral hosted runners leak no shared state; required before any
  move to self-hosted runners, not useful work today.
- **Production RPC ACL verification:** local grant/RLS assertions remain in pgTAP. Production stays
  read-only and owner-run; CI must not gain production credentials.
- **Deploy guard second prompt:** a deploy-script correctness item, independent of PR check topology.
- **E2E TypeScript coverage, resilient fixture cleanup, Deno execution, signed-out route/a11y
  coverage:** real coverage work, but each adds or changes assertions. None is represented as a CI
  simplification or silently closed here.
- **Large a11y trace integrity:** independent artifacts and retention remain unchanged. Corruption
  needs an artifact-format experiment; merging jobs would not repair it.

## Verification contract

- workflow source guard passes and fails if a removed standalone job returns, a matrix name changes,
  the docs-only skip moves back to the matrix job, pgTAP leaves the rest entry, secrets leave gate,
  or cache warming leaves main gate;
- local typecheck, lint, unit tests, formatting, and build pass;
- the PR must report exact checks `e2e`, `e2e-a11y`, and `e2e-mobile`, all independently;
- the rest job log must show pgTAP passing before Playwright;
- gate must show the full-history secret step;
- after those contexts are observed, the ruleset may remove only `pgtap` and `secrets`, then must be
  read back and compared to the five-context target above.
