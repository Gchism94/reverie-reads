# Task: fix/offline-session

Branch: `fix/offline-session` off `main`.
Repo: book-corpus.

Small branch. One defect.

## The defect

`AuthProvider` awaits `supabase.auth.getSession()`, which attempts a network
token refresh when the stored access token is stale. Offline that never resolves,
so `setLoading(false)` never runs and `RootRoute` never leaves its loading branch
— "Turning the page…" for ~45s, then the ErrorBoundary at ~70s. Within the
token's ~1h life offline works correctly. Control: the same aged token online
renders fine, so the token is valid and refreshable — the hang is the offline
refresh path.

## Preconditions — stop and report if unmet
- `main` current at 3bfe107 or later, working tree clean.

## Phase 1 — Audit only. Change nothing. Report before writing code.

1. **The boot path, traced end to end.** From app entry to first render, list
   every await that can touch the network, in order, with file:line.
   `AuthProvider` and `getSession()` are the known one; I want to know whether a
   profile fetch, skin resolution, feature-flag read, or anything else also
   blocks, because fixing one await and finding the next behind it is a wasted
   round.

2. **Error-class distinguishability.** When the token refresh fails, can the code
   tell a network failure from a rejected refresh token (revoked, expired beyond
   recovery, signed out elsewhere)? Quote the shapes both produce. This decides
   whether the fix is safe — falling back to a stored session on a *revoked*
   token would keep a signed-out reader looking signed in.

3. **Existing offline affordances.** Is there already an offline indicator,
   banner, or connectivity hook? Does sign-out clear the Dexie mirror, and does
   anything clear it on auth failure? Report what exists; propose nothing yet.

## Phase 2 — Fix

Target behaviour: **with a stored session present and no connectivity, the app
renders from cache in read-only mode. It never hangs.**

- Do not let boot block on a network round-trip. Resolve the session from
  persisted storage and let refresh happen without gating first render — a
  bounded race with a short timeout is acceptable if that's the smaller change,
  but say which shape you chose and why.
- **Network failure and auth failure must diverge.** Network failure → fall back
  to the stored session, render, retry refresh on reconnect. Rejected refresh
  token → treat as signed out, clear the session and the Dexie mirror, route to
  auth. If Phase 1 finds the two are not reliably distinguishable, stop and
  report rather than guessing; a wrong guess here either strands a signed-out
  reader in a stale library or logs out a reader on a train.
- On reconnect, refresh and reconcile without a full reload if that's achievable;
  if it isn't, report what forces the reload.

**Writes are out of scope.** In the degraded state, mutations must fail visibly
and honestly rather than appearing to succeed — an offline write queue is a
subsystem, not part of this branch. If blocking them cleanly is more than a small
change, report the shape and stop.

Any UI string describing the degraded state is held to the standard the last
branch set: it must describe what is actually true. Read-only and unsynced, not
"working offline."

## Drive-by — scoped, report separately

Rename the misleading idempotency test in `importExport.test.ts` to describe what
it actually asserts: a re-restore adds a second library and never duplicates a
row within a book. **Rename only** — no behaviour change, no assertions touched,
no other test touched. A test name is a promise about what's proven; this one
overclaimed and cost a round of contradiction between reports.

## Guards

Unit/component level, driven off a client stubbed to hang or reject on refresh:
boot with a hanging refresh must reach rendered state within the bound and must
render library content from cache; boot with a rejected refresh token must land
on auth with the mirror cleared. Mutation-check both.

**Do not add e2e specs in this branch.** The suite is untrustworthy pending the
contention work; a new spec added now teaches us nothing and inherits the flake.
Record the e2e cases you would have written, in this task doc, for the branch
that follows.

Manual verification on a **production build** (`vite preview`) — the service
worker is prod-only, so a dev-server test proves nothing. Reproduce the original
failure on `main` first and report the timings, then the same protocol on the
branch: offline + fresh token, offline + expired token, expired token online as
control, and reconnect-while-open.

## Completion report

Phase 1 findings, the fix shape and why, both guard runs (pre-fix red on the hang
case, post-fix green), the four manual conditions with timings, the drive-by
rename reported separately, and the full gate. Commit before mutation testing —
it corrupts the tree deliberately, and a `git checkout` against uncommitted work
is how fix/landing-truth lost an hour.

No merge without my word.

## Out of scope — recorded, not for this branch
- Restore duplication semantics. Answered: a restore is an add, not a sync.
  Book-keyed rows multiply with the duplicated books; user-keyed and series-keyed
  rows don't. The guardrail (warn before restoring into a non-empty library, with
  real counts) is its own task, after the e2e work.
- e2e parallel contention against the single local Supabase instance. Next task
  after this one.

## Standing rules reaffirmed this session
- No writes to the production database from a Code session, ever — including
  throwaway accounts intended for immediate deletion.
- Grepping a bundle for strings measures dead-code elimination, not rendering.
  Serve the build and read the DOM.
