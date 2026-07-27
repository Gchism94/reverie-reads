# Task: fix/e2e-contention

Branch: `fix/e2e-contention` off `main`.
Repo: book-corpus.

Test infrastructure only. No app source changes. If a spec fails for a real
reason, report it — do not fix it here.

## The problem

`pnpm e2e` fails nondeterministically and has for the whole of this arc. Measured
across three runs: 3, 4 and 6 failures, no two sets overlapping, every failing
spec passing in isolation, and unmodified `main` failing as readily as any
branch. Working hypothesis is parallel contention — `fullyParallel: true`, four
workers, one local Supabase instance, all mutating shared rows. "N did not run"
counts point the same way.

The cost is not the red. It is that we learned to read red as noise, which let
two PRs ship with broken UI flows.

## Preconditions — stop and report if unmet

- `main` current at 27e8540 or later, working tree clean, local Supabase running.

## Phase 1 — Audit and experiment. Change nothing permanent. Report and stop.

**Item 1 is the decisive experiment. Run it first.**

1. **Serialize and see.** Run the full suite on unmodified `main` with
   `workers: 1`, three consecutive times, fresh DB before each. Report every
   result. If all three are green, contention is confirmed and the rest of this
   task is about reclaiming parallelism safely. If any run is red, there are real
   defects hiding behind the flake — report them and stop, because the plan
   changes entirely.

2. **Two root causes, or one?** `fonts` and `a11y` were in the failing sets and
   neither obviously mutates data. Classify every failure you observed by
   mechanism, with the actual error text — not the spec name. Data contention
   (another worker changed a row), resource saturation (timeout under CPU/memory
   load from four browsers plus Supabase), ordering, or port/fixture collision.
   Report the machine's core count. If saturation is a separate cause, say so
   plainly; a data-scoping fix will not touch it and I don't want a partial fix
   read as a failed one.

3. **Shared mutable state inventory.** What does the suite mutate that is not
   owner-scoped? Specifically: does any spec write canonical (owner_id null)
   tropes or moods, storage buckets, edge-function state, embeddings, reading
   orders, or any singleton/config row? RLS scopes most things by owner and the
   canonical vocabulary should be read-only — verify that rather than assuming
   it, since the whole plan rests on it.

4. **How the suite authenticates today.** Do all workers sign in as the same
   seeded account? Report the mechanism (globalSetup, per-spec, storageState
   reuse) and whether the seeded 290-book library is shared across workers. Can
   the test environment mint users — is a service-role key available, does local
   signup require email confirmation, are there GoTrue rate limits that would
   bite at N users per run?

5. **Reset and reseed timing.** Does anything truncate or reseed the database
   during a run rather than before it? A reseed racing live workers would produce
   exactly the symptom we have, and it would be a different fix from user scoping.

6. **Is flake being masked?** Report `retries` in the Playwright config, whether
   e2e runs in CI, and whether it blocks merge. A suite with retries on hides the
   signal we are trying to restore.

## Phase 2 — Fix (revised after the audit; owner-approved 2026-07-27)

**Why this is narrower than the plan above.** The original plan led with
worker-scoped test users, because parallel data contention was the working
hypothesis. Phase 1 measured that hypothesis at **zero**: across two default-worker
runs (8 failures each, 6 overlapping), not one failure was attributable to another
worker changing a row. The isolation already in the suite held — ten spec files
already mint a dedicated per-file user, mutating files already declare
`mode: 'serial'`, and canonical vocabulary is provably unwritable (an authenticated
`owner_id: null` insert is refused `42501` on both `tropes` and `moods`). What the
runs actually showed was **backend and machine saturation**: PostgREST returning
`PGRST002 Could not query the database for the schema cache`, GoTrue returning
empty sign-in failures, and round-trips missing 15–20s budgets. Four Chromiums plus
axe plus the Vite dev server plus Docker Supabase do not fit on eight cores.

So the fix follows the measurement, not the hypothesis. Three items, and only these:

1. **Worker count from an env var, default 2 locally** — not a hardcoded 4. Four
   workers saturate this box; two is green and no slower, because the a11y sweep
   (~4.4m) is the wall-clock floor either way. A CI runner will have different
   capacity, which is why it is an env var rather than a new hardcoded number.
2. **`trace: 'retain-on-failure'`**, replacing `on-first-retry`. At `retries: 0`
   the old setting was inert, which is how the first round of error text was lost.
   Retries stay at 0.
3. **Sign-in helper error surfacing.** `test sign-in failed: {}` told us nothing
   about a real failure. Log the actual error shape.

**Deliberately NOT in this branch** — both wanted, both follow-ups. Landing either
alongside the worker change would make a green result prove nothing about which
change mattered:

- the per-user migration for `a11y` / `fonts` / `cover-sheet` (the three files still
  sharing the seeded dev account);
- serving a production build via `vite preview` instead of the dev server.

## Acceptance — revised

The doc's original higher-worker criterion no longer applies: it was written to
prove a data-scoping fix had removed a contention mechanism. This fix _concedes_
capacity rather than removing a mechanism, so surviving more pressure is not the
claim being made. Finding the ceiling is.

- Full suite at the new default, **five consecutive runs, all green**, fresh DB
  before each. Report all five with timings.
- **Then find the ceiling:** one run at 3 workers, one at 4. Report both. If 3 is
  green and 4 is not, we know 2 has margin and the number is not arbitrary.
- `retries: 0` for these runs regardless of the config's normal value. We are
  measuring flake, not tolerating it.

### Measured outcome — acceptance NOT met

| workers     | runs | green | mean wall clock         |
| ----------- | ---- | ----- | ----------------------- |
| 1           | 3    | **3** | 6.3m                    |
| 2 (default) | 5    | **4** | 5.7m                    |
| 3           | 1    | **1** | 5.2m                    |
| 4           | 3    | **0** | — (8, 8 and 3 failures) |

The five-consecutive-green bar was **not cleared**: run 2 of 5 failed on
`cover-sheet` waiting 15s for "Cover updated." after an edition pick, with the
a11y sweep occupying the other worker at the time. The ceiling probes behaved as
predicted — 3 green, 4 red — so the default is not arbitrary, but "2 has margin"
is the weaker claim the data actually supports: 2 is the cheapest mostly-reliable
setting, not a proven-clean one.

What this establishes: **worker count was a real cause but not the only one.**
Going from 4 to 2 took the failure rate from ~8 per run to ~1 in 5 runs. The
residue is the three specs still sharing the seeded dev account — the deferred
follow-up — which is now the highest-value next change rather than a
nice-to-have. Parallelism is worth little here regardless: serializing the whole
suite costs ~10%, because the a11y sweep is the wall-clock floor either way.

## Out of scope — recorded

- The e2e cases recorded in docs/task-offline-session.md for the offline paths.
  They go in a follow-up branch, not this one — adding specs while stabilizing
  muddies the signal. Once the suite is trustworthy they become its first real
  exercise.
- Any app-source defect the serialized run reveals. Report and stop.

## Completion report

Item 1's three runs verbatim, the failure classification with error text, the
audit answers, the fix shape and why, the five acceptance runs, the two
ceiling-finding runs (3 and 4 workers), and the gate. Whether e2e should now
block merge, with your recommendation.

No merge without my word.
