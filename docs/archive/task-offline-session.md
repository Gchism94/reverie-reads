# Task: fix/offline-session

Branch: `fix/offline-session` off `main`.
Repo: book-corpus.

Small branch. One defect.

## The defect

**Corrected after the Phase 1 audit.** The original wording here — "`setLoading(false)`
never runs and `RootRoute` never leaves its loading branch" — was wrong about the
mechanism, and the wrong mechanism points at the wrong fix. This doc is authoritative
and is held to the same standard as shipped copy, so the measured chain replaces it.

`AuthProvider` awaits `supabase.auth.getSession()`, which attempts a network token
refresh when the stored access token is stale. Offline, that produces a **three-defect
chain**, measured on a production build with the network cut and the token aged past
`expires_at`:

```
t=0.0s   boot /library                → "Turning the page…"
t=25.5s  loading clears, session=null → the marketing LANDING renders
t=25.6s  vite:preloadError            → below-fold chunk failed to fetch
t=25.6s  reload (installPreloadErrorReload, once-flag set)
t=51.1s  vite:preloadError again      → flag set, error propagates
final    "Something went wrong!"      → ErrorBoundary
         stored session in localStorage: PRESENT throughout
```

1. **A ~25s stall, not an infinite hang.** `_refreshAccessToken` retries with
   exponential backoff bounded by `AUTO_REFRESH_TICK_DURATION_MS` (30s).
   `setLoading(false)` does run.
2. **A false sign-out — the defect that matters.** `getSession()` resolves
   `{data: {session: null}, error: AuthRetryableFetchError}` and `AuthProvider`
   destructures **only `{ data }`**, dropping the error. `session` → null → RootRoute
   renders `UnauthShell`. The reader's library is replaced by the signed-out marketing
   page while a perfectly good session sits in localStorage — auth-js deliberately
   preserved it, because the error was retryable.
3. **The crash.** The landing lazily imports `below-fold`, which a reader who signed in
   and went to `/library` never fetched, so the service worker never cached it.

Within the token's ~1h life offline works correctly: auth-js's "proactive preserve" path
hands back the stored session when the refresh fails but the access token is still
inside its real expiry. Control: the same aged token **online** renders fine, so the
token is valid and refreshable — the failure is the offline refresh path.

**Consequence for the fix: unblocking the await is not enough.** With `session` still
null the app would boot fast, render the landing, hit the chunk and crash just the same.
The session must be _restored_, not merely resolved faster.

## Preconditions — stop and report if unmet

- `main` current at 3bfe107 or later, working tree clean.

## Phase 1 — DONE. Findings recorded above and in the branch report.

Items 2 (error-class distinguishability) and 3 (existing offline affordances) are
answered and need no re-audit:

- **The two error classes are reliably distinguishable, three ways.** Network failure →
  `AuthRetryableFetchError` (`status: 0`); rejected refresh token → `AuthApiError`
  (`status: 400`, local GoTrue body `{"code":400,"error_code":"validation_failed",
"msg":"Refresh token is not valid"}`). auth-js already does the right thing with
  storage: it preserves the session on a retryable error and calls `_removeSession()` on
  a genuine rejection. Measured — offline: settles 51.5s, session **preserved**; revoked
  token online: settles 0.5s, session **cleared**. So the dangerous case (falling back on
  a revoked token) cannot arise; by then storage is already empty. Phase 2's safety
  condition is satisfied.
- **Offline affordances: essentially none.** No indicator, banner or connectivity hook.
  The only `'online'` listener is the deploy-version poll.
- **Cache scoping was split out and shipped** as `fix/cache-scoping` (#85): the mirror is
  now keyed per reader and cleared on `SIGNED_OUT`.

### Original Phase 1 brief (kept for provenance)

1. **The boot path, traced end to end.** From app entry to first render, list
   every await that can touch the network, in order, with file:line.
   `AuthProvider` and `getSession()` are the known one; I want to know whether a
   profile fetch, skin resolution, feature-flag read, or anything else also
   blocks, because fixing one await and finding the next behind it is a wasted
   round.

2. **Error-class distinguishability.** When the token refresh fails, can the code
   tell a network failure from a rejected refresh token (revoked, expired beyond
   recovery, signed out elsewhere)? Quote the shapes both produce. This decides
   whether the fix is safe — falling back to a stored session on a _revoked_
   token would keep a signed-out reader looking signed in.

3. **Existing offline affordances.** Is there already an offline indicator,
   banner, or connectivity hook? Does sign-out clear the Dexie mirror, and does
   anything clear it on auth failure? Report what exists; propose nothing yet.

## Phase 2 — Fix

### Added scope (approved after Phase 1)

1. **Correct this doc's mechanism section.** Done above.
2. **Offline sign-out is a first-class item.** `_signOut` posts to the server _first_ and
   returns early on network failure, so the local session survives and no event fires — a
   reader on a shared device believes they signed out and has not. **Report the shape
   before coding**: can the local session be removed without the server round trip, and
   what reconciles the server side on reconnect? Do **not** add a direct mirror clear that
   fires while the reader stays signed in.
3. **On `SIGNED_IN`, evict persister rows not belonging to the signing-in reader.**
4. **Distinguish "no auth key" from "auth key present but unparseable"** in
   `storedUserId()`, and report the latter to Sentry. A silent fail-closed hides a future
   storage-format change forever.
5. **Confirm the Sentry chunk / once-guard question.** Answered — see below.

### Answered: item 5

Measured on a production build, offline, token past expiry:

```
t=0.0s   boot
t=25.6s  preloadError  below-fold-DSULAdAE.js
t=25.6s  boot                      ← the one reload
t=51.1s  preloadError  below-fold-DSULAdAE.js
once-guard flag: 1 | final: "Something went wrong!"
```

- **The Sentry chunk is NOT an independent source.** Only `below-fold` fails.
  `initErrorMonitoring()` runs at module scope on every boot, so the service worker has
  already cached the Sentry chunk under its cache-first `/assets/` rule. (Confirmed it is
  a separate chunk: the Vite output names it `index-*` after the package entry file.)
- **The once-guard IS holding.** The flag is set, the second `preloadError` does not
  trigger a third reload — it propagates, which is the documented design ("reload once…
  a second failure surfaces normally"). The reload-then-repeat in the Phase 1 timeline is
  that design working, not failing.
- **But the reload is pointless offline** and doubles time-to-error, 25.6s → 51.1s. The
  guard should not reload when `navigator.onLine === false`; there is no new deploy to
  pick up without a network.

### Original Phase 2 brief

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

## Chosen trades — accepted, not defects

Recorded here rather than only in a completion report, so the next session inherits the
reasoning and not just the behaviour.

- **A revoked-elsewhere reader briefly sees their own library.** Boot seeds `session`
  synchronously from the persisted session, so if the refresh token was revoked on another
  device the reader renders their library for the moment it takes `SIGNED_OUT` to land,
  then drops to the front door. It is their own data on their own device, and the exposure
  window is the price of never gating boot on the network — which is the whole fix. A
  bounded race or a timeout would have reintroduced the wait for every offline launch to
  narrow a window that shows a reader nothing they are not entitled to see.
- **A genuinely signed-out reader opening offline sees above-fold landing content only.**
  The `ChunkBoundary` keeps the hero, nav and CTA rather than crashing to
  "Something went wrong!", but the below-fold sections cannot be fetched and do not render.
  The target behaviour presumes a stored session, so this is out of scope; precaching the
  chunk would fix it and was deliberately not done. Recorded, not fixed.

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
