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

## Phase 2 — Fix (shape approved after the audit)

Working plan, subject to what Phase 1 finds:

- **Worker-scoped test users.** Each worker gets its own account, created in
  setup and torn down after. Deletion is one delete from `auth.users` with
  everything cascading — verified in fix/landing-truth — so teardown is cheap
  and complete.
- **Per-worker seed.** Whatever fixture data specs need, seeded per user and
  idempotent. If the full 290-book seed is too heavy at N workers, report the
  cost and propose a minimal seed with specs creating their own data.
- **Genuinely shared state stays shared only if read-only.** Anything shared and
  mutated must be scoped, or its specs serialized deliberately and annotated with
  why.
- **Saturation, if it's real:** tune worker count to the machine rather than
  hardcoding four, and report the number chosen and the evidence.

## Acceptance — this is the part that matters

A single green run proves nothing about a flaky suite. Required:

- Full suite, default workers, **five consecutive runs, all green**, fresh DB
  before each. Report all five.
- One run at **higher worker count than default** — if it survives more
  contention pressure, that is evidence the mechanism is actually fixed rather
  than merely made less likely. If it fails there, say so; that is information,
  not defeat.
- `retries: 0` for these runs regardless of the config's normal value. We are
  measuring flake, not tolerating it.

## Out of scope — recorded
- The e2e cases recorded in docs/task-offline-session.md for the offline paths.
  They go in a follow-up branch, not this one — adding specs while stabilizing
  muddies the signal. Once the suite is trustworthy they become its first real
  exercise.
- Any app-source defect the serialized run reveals. Report and stop.

## Completion report

Item 1's three runs verbatim, the failure classification with error text, the
audit answers, the fix shape and why, the five acceptance runs, the
higher-worker run, and the gate. Whether e2e should now block merge, with your
recommendation.

No merge without my word.
