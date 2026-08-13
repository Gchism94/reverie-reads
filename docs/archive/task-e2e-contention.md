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

1. **Worker count from an env var, default 1 locally** — not a hardcoded 4. Four
   workers saturate this box; two is green and no slower, because the a11y sweep
   (~4.4m) is the wall-clock floor either way. A CI runner will have different
   capacity, which is why it is an env var rather than a new hardcoded number.
   (Revised again below, after the workers=2 acceptance run itself failed once
   in five — see "Decision — default lowered to 1".)
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

### Decision — default lowered to 1 (owner, 2026-07-27)

Two of the numbers cited above when workers=2 was chosen were wrong: the
comment said "two is green" (it was 4-of-5) and estimated workers=1 as "~40%
slower" (measured: ~10%, ~36 seconds). Corrected in the commit that fixed the
comment, but the conclusion changes too once the numbers are right — a setting
that fails one run in five is not an acceptable default to gate merge on, and
the thing it was bought with (speed) turns out to be nearly free to give back,
because the ~4.4m a11y sweep is the wall-clock floor at any worker count.
`E2E_WORKERS` default is now **1**. Re-run: five consecutive full-suite runs at
the new default, fresh DB before each, retries 0 — see below. The 3-vs-4-worker
ceiling probes already recorded above are kept as-is; they still show the
default isn't an arbitrary number, even though the default itself moved.

### Acceptance re-run at the new default (workers=1) — NOT MET, 0/5

Run with both other Docker Supabase stacks (`high-desert`, `redmond-compass`)
stopped first, so book-corpus had the machine to itself. Fresh DB before every
run, retries 0.

| run | exit | result                             | wall clock |
| --- | ---- | ---------------------------------- | ---------- |
| 1   | 1    | 1 failed, 6 did not run, 42 passed | 4.4m       |
| 2   | 1    | 1 failed, 6 did not run, 42 passed | 4.2m       |
| 3   | 1    | 1 failed, 6 did not run, 42 passed | 4.1m       |
| 4   | 1    | 1 failed, 6 did not run, 42 passed | 4.0m       |
| 5   | 1    | 1 failed, 6 did not run, 42 passed | 4.1m       |

All five failed on the **identical** assertion, at nearly identical speed —
1.6–1.9s, nowhere near any timeout budget:

```
✘ e2e/series-removal-positions.spec.ts:140:1 › series page: a linked book can
  be removed, and stays removed
  Error: expect(received).toBeFalsy()
  Received: "Audit Cycle"
    > 165 | expect((await bookRow(c, 'Audit Bravo'))?.series).toBeFalsy()
```

**This is not the saturation/contention pattern this branch was built to fix.**
5-for-5 identical, at sub-2-second speed, is deterministic, not flaky — and
worker count is irrelevant to it, since it fails the same way fully serialized.
Root cause, read from source rather than guessed: `useRemoveEntry` in
`apps/web/src/data/series.ts` (~L353) does two **sequential**, independently
committed writes in one mutation — `series_entries.update(removalPatch())`,
then, only if that succeeds, `books.update({ series: null })` — not a single
transaction. The test polls only the first write
(`expect.poll(...liveEntries...)` at line ~160) and then makes a **plain,
unpolled** `expect()` against the second write immediately after. There's a
real window, however small, between the two writes committing, and the test
has no wait covering it. This is a missing-`expect.poll` bug in the spec, not
an app-source defect — the app's own UI never observes the intermediate state,
because `onSuccess` fires only after both writes resolve; only a third-party
reader (this test's direct `c.sb` query) can see the gap.

**Why this didn't fail in the Phase-1 workers=1 runs (3/3 green, same
assertion, same code, same test).** The only variable that changed between
then and now is the Docker environment: the other two stacks were still
running during Phase 1 and are stopped now. That doesn't touch worker count or
retries, but it very plausibly changes backend latency and therefore exactly
where in that race window the test's poll happens to land — a smaller,
more-heavily-loaded-then-idle Postgres could easily flip this from "usually
wins the race" to "usually loses it." Not re-run with the stacks back up to
confirm, on purpose — reintroducing contention to make a result look greener
would be adjusting the protocol to reach five, which was ruled out explicitly.

**Acceptance was not met at this point in the branch.** Reported as red, as
instructed — no fix applied yet, no retry, no protocol change. Fixed below,
once the owner ruled this specific gap in scope: it's test infrastructure, not
an app defect, and the "report, don't fix" rule was aimed at the latter.

**Why this passed 3-for-3 in Phase 1 and then failed 5-for-5 here, with no
app-source or spec change in between:** machine contention was scattering
where the test's poll landed relative to the two-write race window described
above — sometimes catching it after both writes had committed, sometimes
before. An idle machine hits the same window on every attempt. The flake was
masking a hole in the test, not the reverse.

### Fix — `expect.poll` added, mutation-checked

`series-removal-positions.spec.ts:165` now polls `bookRow(c, 'Audit
Bravo')?.series` with a 15s bound, matching the `liveEntries` poll immediately
above it, instead of asserting once with no wait. Diff is one assertion plus
its comment — four lines changed, no other spec touched.

Mutation-checked before trusting it: temporarily short-circuited
`useRemoveEntry`'s second write (`apps/web/src/data/series.ts` ~L361 — `if
(false && input.bookId)`) so `books.series` would never clear, re-ran the
single test against a fresh DB, reverted, and confirmed `git status
--porcelain` clean before re-running the full suite.

| condition                             | result                                                                    |
| ------------------------------------- | ------------------------------------------------------------------------- |
| unmodified app source                 | 7/7 passed (isolated file run); target test 3.6s                          |
| second write short-circuited (mutant) | **failed** — waited the full 15s, then reported `Received: "Audit Cycle"` |

The poll fails on a genuinely broken write rather than passing on a timing
accident, which is the property the old unwaited `expect()` didn't have.

### Acceptance re-run #2 (workers=1, after the fix) — MET, 5/5

Same conditions as the first re-run: both other Docker Supabase stacks
stopped, fresh DB before every run, retries 0.

| run | exit | result    | wall clock |
| --- | ---- | --------- | ---------- |
| 1   | 0    | 49 passed | 4.3m       |
| 2   | 0    | 49 passed | 4.3m       |
| 3   | 0    | 49 passed | 4.4m       |
| 4   | 0    | 49 passed | 4.3m       |
| 5   | 0    | 49 passed | 4.2m       |

Five consecutive, fully green, mean 4.3m. **Acceptance is met.**

## Follow-up — recorded here, not fixed on this branch

**`useRemoveEntry`'s two writes are not transactional.** `series_entries` and
`books.series = null` are two separate, sequentially-committed calls inside
one mutation (`apps/web/src/data/series.ts` ~L353), not one atomic write. The
UI never observes the gap between them — it invalidates only after both
resolve — but a failure or dropped connection between the two commits would
leave `series_entries` marked removed while the book's own `series` column
still names it, with no compensating write ever issued. (An existing
revive-on-refresh path in `series.ts` reconciles a book that still names a
series it's linked to elsewhere, which may or may not cover this exact
half-committed shape — that's part of what the audit needs to check.) Needs an
audit of the dropped-connection path and, if it's a real gap, an atomic fix
(single RPC or transaction). App-source change — not for this branch.

These belong on the per-user-migration branch that closes the a11y /
cover-sheet sharing (see "Deliberately NOT in this branch" above), not here —
test-infrastructure-only scope. Noted so they aren't lost between branches:

- **`a11y.spec.ts`'s `setupFixtures`, `cleanup`, and `setProfileSkinMode` discard
  their sign-in error and then dereference `.data.user!.id`.** A failed sign-in
  in any of the three surfaces as a bare `TypeError` on the `.id` access rather
  than a diagnosis — the same class of defect `authFailure()` fixed at the
  actual sign-in helpers, just not yet applied to these three fixture-setup
  call sites.
- **`pnpm db:seed` prints `Seed failed: {}`.** Same empty-response-body shape
  that `authFailure()` exists to unpack, in the seed script rather than a spec.
- **The failure that survived workers=2 was the shared dev account, not
  contention in general.** `a11y` occupies one worker for its ~4.4m sweep while
  `cover-sheet` — the heaviest of the remaining specs — runs concurrently
  against the same seeded user. `workers=1` dissolves this by serializing
  everything, which is a real fix for _this_ branch's scope but doesn't touch
  the underlying cause. The per-user migration is what actually fixes it, and
  is what would make raising the worker count back above 1 worth doing.

## Out of scope — recorded

- The e2e cases recorded in docs/archive/task-offline-session.md for the offline paths.
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
