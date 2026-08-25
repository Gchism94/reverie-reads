# Completed task: household revocation and concurrency hardening

Status: **complete, independently reviewed, integrated, deployed, and smoke-tested in production**.

Completion: merged through `18f20af0fd276ca1ae2cd360f1d20ace91b1158f` on 2026-08-25. The
review reported no actionable findings. Migrations `20260828010000` and `20260829010000` were
recorded remotely; the exact deployment was promoted and passed public plus owner-authenticated
Account A/Account B smoke checks. This brief is retained as implementation and review provenance,
not remaining work.

Branch when implementation begins: create a fresh `codex/` branch from the then-current household
stack. Re-check every coordinate and ancestry before editing; the findings below describe the code
reviewed on 2026-08-25, not a promise that the tree will remain unchanged.

## Why this task exists

The household foundation and Library scope reviews found four reachable boundary defects. Three are
client-side authorization/state defects and one is a database concurrency defect. They belong in one
hardening task because the common contract is stronger than "the happy path works": revocation must
remove another member's data immediately, identity must remain stable through transitions, and the
last unlink must close the household under concurrency.

Do not merge or deploy the household feature stack with any finding below still reachable. This task
is deliberately queued rather than mixed into unrelated feature work, but it remains a household
merge gate.

## Findings to close

### 1. High — revoked household data can remain visible from the in-memory cache

Reviewed evidence:

- `apps/web/src/data/household.ts:178-211` keys roster and books only by reader ID.
- `apps/web/src/main.tsx:48-59` retains queries for one week, treats them as fresh for 30 seconds,
  and disables window-focus refetching.
- `apps/web/src/routes/LibraryRoute.tsx:439-448` authorizes rendering from potentially cached roster
  data and checks only `isLoading`, not `isFetching`.
- `apps/web/src/routes/LibraryRoute.tsx:460-545` can consequently render cached rows during
  revalidation.

Reachable failure: a reader views household A, is unlinked or relinked externally, switches to
Personal, then returns. Household A can render without a request during the fresh-cache window and
can remain visible during background revalidation. If household B's roster resolves before its
books, household B identity can temporarily be combined with household A books.

Required correction:

- Treat household queries as authorization-sensitive rather than ordinary cached content.
- Remove household queries when leaving household scope.
- Revalidate membership on every mount and focus, with no fresh-cache authorization window.
- Suppress prior household data while membership is being revalidated.
- Key books by both reader ID and the household ID established by the roster response.
- Clear the old household's book query immediately when that household ID changes or disappears.

Required regression: cache household A, unlink/relink without reloading the page, revisit household
scope, and prove that no household A card, member chip, or detail rail appears before or after
household B settles.

### 2. Medium — hidden selections survive authorization-state loss

Reviewed evidence:

- `apps/web/src/routes/LibraryRoute.tsx:437` stores only `selectedId`.
- `apps/web/src/routes/LibraryRoute.tsx:446-448` temporarily converts it to `null` when data is
  unavailable without clearing the stored selection.
- `apps/web/src/routes/LibraryRoute.tsx:565-570` reopens the drawer when that ID becomes available
  again.

Reachable failure: after an RPC error, unlink, or relink, a stale selection can automatically reopen
the drawer, move focus, make the background inert, and lock scrolling without a new reader action.

Required correction:

- Store the authorizing household ID with a household selection.
- Clear selection on roster error, membership disappearance, household-ID change, or when the
  selected book leaves the authorized result set.
- Cover populated → error/no household → recovered/relinked transitions.

### 3. Medium — duplicate member labels produce inconsistent owner identity

Reviewed evidence:

- `apps/web/src/data/household.ts:140-175` disambiguates roster rows and book rows independently.
- The independently derived labels are applied at `apps/web/src/data/household.ts:183-210` and
  rendered separately in `apps/web/src/routes/LibraryRoute.tsx:484-494` and `:530-539`.

Reachable failure: two members named Avery are disambiguated in the roster, while a book card can
show plain Avery when only one of them owns books. The apparent identity changes when the other
member later adds a book.

Required correction:

- Derive one owner-label map from the complete roster and apply it to roster chips and books.
- Use a suffix guaranteed unique within that roster rather than assuming an eight-character ID
  prefix is unique.
- Test duplicate names when one member has an empty library.

### 4. Medium — concurrent final unlinks can leave an empty household permanently

Reviewed evidence:

- `supabase/migrations/20260829010000_household_foundation.sql:217-224` locks only the departing
  user's profile and membership.
- Cleanup at `:233-239` deletes the household only when that transaction sees no remaining
  memberships.
- `scripts/unlink-household.mjs:100-120` does not verify the reviewed household's resulting state.

Reachable failure: two members of a two-person household unlink concurrently. The transactions lock
different membership rows, each sees the other's uncommitted membership, and both skip household
deletion. Both memberships commit as deleted while the empty household survives permanently.

Required correction:

- Lock the reviewed `public.households` row with `FOR UPDATE` before deleting membership or deciding
  final-member cleanup.
- Add a repeatable two-session test that concurrently unlinks both members and proves:
  - both auth accounts, profiles, and personal books remain;
  - both memberships are removed;
  - the household row is deleted exactly once.
- Make the operator path verify the reviewed household's resulting lifecycle state rather than
  reporting success solely because the RPC returned.

### Review follow-up — paused authorization and deterministic concurrency proof

A review of `8aceb77^{}..3e769bd` found two remaining integration blockers:

- TanStack Query retains cached data with `status: 'success'`, `fetchStatus: 'paused'`, and
  `isFetching: false` when an authorization-sensitive revalidation cannot start offline. Household
  rendering must therefore require every needed query to be both successful and idle, return no
  renderable roster/books while paused, clear selection through that authorization loss, and tell
  the reader that household access cannot be verified offline.
- The first two-session regression used a fixed 750 ms delete-trigger delay. Startup or pool delay
  could let an old implementation escape the intended overlap. The committed harness must instead
  synchronize real RPC transactions with advisory locks, inspect both worker sessions in
  `pg_locks`, and release them only after it has proved either household-row serialization (fixed)
  or two independently completed cleanup decisions (old).

## Coverage gaps this task must close

- Existing pgTAP household tests are single-session and do not assert final-member deletion.
- Existing core tests cover arguments and preview logic, not the operator scripts' database
  behavior.
- Existing loading/error tests start without populated cached household data.
- Existing unlink coverage reloads and signs in afresh instead of exercising an already-open tab.
- Drawer coverage should additionally assert modal state, backdrop dismissal, attempted background
  interaction, scroll restoration, and repeated open/close cleanup where those assertions remain
  absent when implementation begins.
- Curated-RPC sentinel coverage should inspect returned payloads for tags, notes, tropes, and moods,
  not only rendered text.

## Preserve what the reviews exonerated

Do not redesign these without new evidence:

- RPC ACLs are correctly scoped: authenticated helpers and service-role-only link/unlink helpers
  revoke unintended roles, and pgTAP checks effective privileges.
- Complete-roster enforcement, cross-household refusal, deterministic profile-lock ordering for
  links, stale-household unlink refusal, personal-data preservation, and exact RPC field allowlists
  were otherwise correct in the reviewed diff.
- `DrawerDialog`'s native modal, focus, keyboard, overflow, restoration, and listener-cleanup
  implementation was judged sound; the defect is stale selection ownership, not the dialog
  primitive.
- Private sentinel fixtures genuinely cover tags, notes, tropes, and moods, and unlink coverage
  preserves the auth account and personal book.

## Review provenance

- Household Library UI review:
  `1f11d56d61648b9cdb8c37b04647e5069532846d..c6750c62bc82e456ac2f1de065fb7c7bf521d9cb`
- Household foundation concurrency follow-up:
  `3fd745d817d3bb4897715d9a1fabe938ad6fb6d6..1f11d56d61648b9cdb8c37b04647e5069532846d`

Both reviews were read-only: no files were edited by the reviewers and no push, merge, deployment,
or production-data access occurred.

## Completion gate

This task is complete only when all four reachable failures have regression tests at the appropriate
layer, the full unit/type/lint/format/e2e/database gates pass from a clean committed worktree, and a
fresh review finds no remaining authorization, identity, or final-unlink lifecycle defect. No merge,
deployment, or production access without the owner's explicit authorization.

## Candidate verification — 2026-08-25

- Full unit suite: 2,944 assertions passed (2,341 core + 603 web).
- Full database suite: 460 pgTAP assertions passed.
- Deterministic two-session final-unlink harness passed using a controller-owned advisory barrier
  and observed `pg_locks` state, with both accounts, profiles, and personal books preserved; both
  memberships removed; empty household deleted.
- Focused household browser suite: 9 passed, 1 expected project-specific skip across desktop and
  mobile.
- Full browser suite: 218 passed, 10 expected project-specific skips across 228 cases.
- Type checking, lint, production build, formatting, and diff checks passed.

The first final-HEAD full-browser attempt had one unrelated, non-reproducible personal-trope fixture
count failure. Its exact three-test file then passed in isolation, and a complete rerun passed all
218 runnable cases. No application change was made for the transient failure.

The candidate has not been pushed, merged, deployed, or exercised against production. Re-run the
documented gates from the final committed HEAD after any review-driven change.
