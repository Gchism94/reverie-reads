# Reverie backlog

Living record. Items leave by being done or by an explicit decision, not by being
forgotten.

## In flight

- Nothing. The infrastructure arc is done: CI landed (`chore/ci`), the trio moved
  off the shared dev account (`test/trio-migration`), throughput stages 1–2
  landed and stage 3 was cancelled on its own measurements
  (`docs/archive/task-ci.md`). Everything below is product or its own branch.

## Real bugs, outstanding

- **`merge_books` doesn't fold `series_user_chosen` when a loser's series field wins the merge.**
  `feat/series-user-chosen` added the column and taught `sync_book_series`/`remove_series_entry` to
  set it, but left `merge_books` untouched: the primary keeps its own flag, which is correct in the
  common case (the primary's series was already provenance-tracked or blank). The narrow edge is a
  loser whose reader-chosen series wins via `p_fields` — the winning value carries no flag afterward,
  so a later enrichment sweep could treat it as fill-only and silently replace it. Folding OR logic
  into `merge_books` (winning flag = primary's OR loser's, whichever field actually won) is its own
  change with its own pgTAP.

- **Nothing scores confidence on a surviving `series` value the way `cover_confidence` does for
  covers.** `feat/series-user-chosen` withholds `low`/`none`-confidence series entirely rather than
  attaching a disclaimed one, so the immediate wrong-series risk is closed — but a `medium`-confidence
  series that does get attached has no recorded confidence for a future review bucket to key off, the
  way the cover pipeline's import-review "low-confidence cover" bucket does. Worth its own look if a
  series-side review bucket becomes wanted.

- **Reconciliation stamps machine-written series entries `user_edited: true`, which makes source
  correction permanently impossible — and it must be fixed BEFORE the backfilled series are opened
  at scale.** [`series.ts:302`](../apps/web/src/data/series.ts) seeds an entry for every library book
  naming a series and writes `user_edited: true`. That flag exists to mean "a reader placed this
  deliberately", so the Hardcover source merge will never reposition such a row — but nothing about
  a lazily-seeded row is a reader decision. Introduced by `ab9e1fe` (#77) and unchanged since;
  `git log -S` confirms no later commit touched it. The only path writing `false` is
  `useApplySeriesSource` (`series.ts:726`), a different code path entirely.

  **This was originally item 6 of `fix/series-backfill` and was dropped from that branch on the
  owner's call, for the right reason: a migration resetting history to `false` would be undone the
  moment reconciliation next ran, because the app still stamps `true`.** A reset that the app
  re-breaks is worse than no reset — it looks done. (The item also cited "#120's deploy" as the
  cutoff; `f398ed5` #120 is the `plan_date` work and touches nothing in series, so no such cutoff
  exists.)

  **Do it as one PR**: change `series.ts:302` to `user_edited: false` _and_ reset the historical
  rows, so the two can't drift apart. **Urgency**: `fix/series-backfill` backfills ~235 series, and
  reconciliation seeds entries lazily on first view — so every one of those series stamps a fresh
  batch of immune-to-correction rows the first time someone opens its page. Landing this after the
  backfill has been browsed means cleaning up a much larger mess than landing it before.

- **The six `sameRiskAsPowerSymbol` glyphs are the same defect, unfired.**
  `apps/web/src/lib/glyphAllowlist.ts` tiers `⏹` `⏱` `⌕` `⌂` `⌘` (Misc Technical,
  U+2300–U+23FF — the exact block `⏻` came from) and `⠿` (Braille Patterns,
  U+2800–U+28FF) as flagged, not fixed. No skin's custom font covers either
  block — verified against Hanken Grotesk's own `unicode-range` descriptors,
  which stop around U+206F — so all six already fall through to the OS on every
  skin, same as the sign-out button did. `⠿` is the `SeriesArranger` drag
  handle; the other five are `SettingsRoute`'s sweep Stop/trace buttons,
  `DiscoverRoute`'s search affordance, and `AppShell`'s nav icons. **Convert all
  six to inline SVG in a follow-up branch, matching `PowerGlyph`'s pattern,
  rather than waiting to spot each on a real device one at a time.**

- **`a11y.spec.ts:309` timed out once on `fix/signout-glyph-tofu`'s standing e2e
  run — `page.waitForLoadState` exceeded 600000ms, not an axe violation.**
  One run, not re-run (the standing-rule reason: a green re-run would launder a
  real defect into "just a flake," so a single red run is reported as red and
  left for a second occurrence to confirm). The diff on that branch was two new
  files (`PowerGlyph.tsx`, `glyphAllowlist.ts`/`.test.ts`) plus a JSX swap in two
  sign-out buttons — nothing touching routing, navigation, or load timing, so
  there's no mechanism in the diff that plausibly explains a page load stalling
  for ten minutes. Recorded so a recurrence has a prior to compare against,
  same reasoning as the `discover-search.spec.ts:275` entry under
  "Known-flaky, with a prior": a second failure here is a defect, not a flake.

- **The Supabase MCP connection reaches only project `cywpkhtpxekmjvuoloem`
  ("Steppe") — a different application, not Reverie.** Its tables are `groups`,
  `events`, `neighborhood_requests`, `moderation_actions`; `public.books` does
  not exist there. Discovered mid-`fix/sweep-pace-analysis`/`fix/sweep-instrumentation`
  after `get_logs` returned only infra health-check rows and `execute_sql`
  against `public.books` raised `42P01`. **Any prior report in this project's
  history that claimed to have read Reverie's production database or edge-function
  logs through the MCP connection was, without exception, reading Steppe's data
  (usually an empty result) and reporting the emptiness as a fact about Reverie.**
  I have not gone back to audit which specific past reports made that claim — flag
  and re-verify by hand if one is being relied on. Until the connection is pointed
  at the right project (or a different read path is set up), Reverie production
  reads are the owner's to run, not Code's — see `docs/reference/DEPLOY.md`'s existing rule
  that write access is never Code's; this extends the same boundary to reads
  through this particular tool, which silently produced wrong-project answers
  rather than an error.

- **Production ACL verification belongs in the deploy protocol — nothing checks it
  today.** `20260801010000` revoked EXECUTE from PUBLIC across every RPC and was
  deployed and reported as done. Nobody read prod's `proacl` afterwards. A
  platform-side bulk `grant ... on all routines in schema public to postgres,
anon, authenticated, service_role` later put an explicit `anon=X` back on all
  **17** functions in `public`, and it stayed that way for days — found only
  because a screenshot of an unrelated series bug prompted someone to look. The
  revoke itself never failed; it was made irrelevant by named grants layered over
  it, which `revoke ... from public` would not have touched.
  Two things follow. First, **deploying a grant is not the same as verifying it
  landed and stayed**: `docs/reference/DEPLOY.md` should require reading `proacl` after any
  migration that touches grants, and there is a case for a periodic check rather
  than a post-deploy one, since the change arrived with no deploy of ours. Second,
  the mechanism is outside this repo and can recur at any time with no
  notification — `fix/rpc-body-defense` responded by making every function refuse
  unauthorised callers in its own body, so the ACL is defence in depth rather than
  the boundary. Re-revoking alone would have been undone by the next platform
  event. A verification step is still worth having: it is how we would learn the
  grants had moved at all.

- **The deploy guard's `y/N` is the only real gate, and it is not the last one.**
  After the guard confirms, `supabase db push` asks its own question — _do you
  want to push these migrations_ — defaulting to **yes**, and it takes EOF as
  yes. So in any non-interactive invocation (a piped confirmation, CI, a script)
  that second prompt auto-accepts and is not a gate at all. Observed on the
  2026-07-28 production deploy: the guard consumed the piped `y`, then the CLI's
  own prompt hit EOF and proceeded by itself. Not dangerous today — the guard's
  confirmation is genuine and runs first — but the touch-list is written as
  though the guard's prompt were the final word, and it isn't. Options: pass
  `--yes` so the second prompt is acknowledged rather than accidental, or feed
  the CLI its own confirmation and stop depending on EOF semantics we don't
  control. Recorded during `fix/deploy-guard`, deliberately not fixed there.
- **Every `security definer` RPC in the repo is anon-callable, and the ownership
  `raise` is the only thing stopping it.** Postgres grants `EXECUTE` to `PUBLIC` by
  default, so `grant execute on function … to authenticated` is **additive, not
  gating** — it adds nothing that PUBLIC didn't already have. Observed against the
  local stack with the anon key: `POST /rest/v1/rpc/remove_series_entry` returns
  `P0001 not owner of series entry` and `rpc/merge_books` returns `P0001 not owner of
primary book` — both reached the function body and were turned away by the check
  inside it, not by a grant. `proacl` on both reads
  `=X/postgres | postgres=X/postgres | authenticated=X/postgres`, where the empty
  grantee is PUBLIC.
  **No exposure today**, and deterministically so: `security definer` runs the body,
  `auth.uid()` is null for anon, and `owner_id = null` is never true, so the first
  statement always refuses. The hazard is structural rather than current — it means
  the `raise` is the entire boundary on every RPC here, and any future RPC whose
  first statement is _not_ an ownership check inherits a function an unauthenticated
  caller can run. The two that exist are written correctly; nothing enforces that the
  third will be.
  Fix is a small migration revoking `execute … from public` across both (and a
  convention for new ones) — **its own branch**, because it should cover `merge_books`
  in the same change and a red run there needs to mean one thing. Found during
  `fix/atomic-series-removal-client` while testing the `pgrst_ddl_watch` schema-cache
  reload, which is how an anon call came to be made at all.
- **`useRemoveEntry`** (`apps/web/src/data/series.ts` ~L353): two sequential
  independently-committed writes, no transaction. A failure between them leaves
  `series_entries` removed while `books.series` still names it. The open question
  recorded here — whether the revive-on-refresh mechanism covers the half-committed
  shape — is answered, and the answer is the opposite of covering it: the revive pass
  (~L192-208) REVIVES any tombstone whose title matches a book still naming the
  series, so the half-committed state does not go stale, it silently **undoes the
  removal** on the next read of that page. **S3a landed the schema half** —
  `remove_series_entry` (`20260731010000`), atomic and ownership-checked, proven by
  `supabase/tests/series_removal_test.sql`. **S3b switched the client** — one
  `supabase.rpc('remove_series_entry')`, `bookId` no longer passed, guarded by an e2e
  request-shape assertion that carries the atomicity claim (state cannot: the old path
  also ended correct, just not simultaneously) plus a test that builds the
  half-committed state by hand, shows revive undoing the removal, and shows the RPC
  path leaving nothing to revive from. **This item closes when S3b merges AND
  `20260731010000` is deployed** — the client is useless without the RPC and merging
  ahead of the deploy ships a frontend calling a function production does not have.
  Rows already in this shape are not healed by the fix —
  `docs/queries/half-committed-series-removals.sql` finds them.
- **A book removed from its series still wears a "Series of N" pill.**
  `seriesStatusBadge` reads `status` and `series_count` and never `series`
  (`packages/core/src/seriesStatus.ts` ~L62), and the pill that renders it
  (`book/BookDetailRoute.tsx` ~L256) is ungated — unlike `SeriesStrip` one line up
  at ~L251, which correctly disappears. So the series door goes and the badge stays.
  **Verified in the browser** on `fix/atomic-series-removal-client`: after removing a
  linked slot, the removed book's page showed no series door and a `Series of 5` pill,
  with `series: null, position: 2, series_count: 5, status: 'ongoing'` in the row.
  Identical before and after S3b — neither `remove_series_entry` nor the two-write
  path it replaced touches `status` or `series_count`, so this is not a regression.
  `position` also survives a removal but is rendered nowhere once `series` is null, so
  the badge is the only visible symptom. Recorded rather than fixed on the owner's
  instruction: whether removal should also clear `status`/`series_count` is a product
  decision, not a bug fix.
- **`useMoveEntry`'s renumber is 2n sequential round trips, and it is not a transaction.**
  Per entry it issues one `UPDATE series_entries` and then `syncBookPosition`'s
  `UPDATE books`, awaited one after another — so a renumber costs **2n** requests, and a
  connection dropped partway leaves the series **half-renumbered**, some slots on new
  integers and the rest on old ones, with the book mirror in step for only the first half.
  It is a **tail** event: `positionBetween` only asks for a renumber when neighbours are too
  tight for a clean one- or two-decimal midpoint, which takes roughly **nine consecutive drops
  into the same gap**, and the common path is the 2-trip single move. But `/series`' arranger is
  drag-primary, so it reaches the tail sooner than the series page's older UI did.
  **Proposed shape:** one RPC taking `(entry_id, position)[]` doing the whole renumber plus the
  book mirror in a single transaction — 50 round trips becomes 1, and the half-renumbered state
  becomes unconstructible rather than merely unlikely.
  **Its own branch, with its own deploy ordering** — it is a migration, so the RPC has to be live
  in production before any client calls it, the same S3a/S3b split this repo has now done twice.
  Deliberately not folded into `feat/series-builder`: a red run there needs to mean one thing.
  Measured there against the local stack (baseline round trip 11.05 ms, median of 20 selects),
  replicating the write sequence exactly — a ghost-only series halves the trips, since there is no
  book mirror, and that is the only mitigation present today:
  - **10 entries** — 20 round trips, 112 ms median (min 92, max 149); ~1.2 s at 60 ms RTT, ~2.0 s at 100 ms
  - **25 entries** — 50 round trips, 302 ms median (min 235, max 375); ~3.0 s at 60 ms RTT, ~5.0 s at 100 ms
  - no optimistic UI on either, so the reader watches the whole thing
- **`series.ts:332`, `syncBookPosition`'s single-move mirror write is swallowed, and it is
  unretried.** `await supabase.from('books').update({ position }).eq('id', bookId)` has no error
  check and nothing re-runs it. Unlike the app's other bare writes — all self-healing on the next
  read — a dropped connection here leaves `books.position` diverged from the entry it is supposed
  to mirror, silently, and five surfaces then disagree with the series page: the book page's
  "#N of M" eyebrow, `BookDetailRail`, the edit dialog's prefill, the merge preview, and
  `groupSeries`' cover order in Library's Series mode. Found during
  `fix/supabase-error-surfacing`'s audit; left alone there because surfacing it (throw + toast)
  is a behavior change needing product sign-off, not error surfacing.
  **`feat/series-builder` made this more reachable than it was when the swallow was written**: the
  `/series` arranger's drag is the PRIMARY interaction, so this single-move write now fires on
  every drag and every ▲▼ nudge, not on the occasional series-page reorder the old UI offered.
  That is a different amplification from the renumber entry above — this is the common 2-trip
  path firing constantly, where renumber is the rare tail. Recorded, not fixed.
- **Archived tombstones are keyed on (series, position); every functional consumer keys on
  title.** `slotKey` (`importExport.ts`) identifies a backed-up removal by series name +
  position, and its own comment calls that "the only thing that identifies 'the same slot'".
  But nothing else agrees: suppressing a source-refresh resurrection matches by title
  (`mergeSourceEntries` against the tombstone's `title`), and reviving on re-add matches by
  normalized title (`series.ts` revive pass). Position is the archive's identity and title is
  the system's. Two consequences, both silent:
  - **Two tombstones at one position lose one.** Reachable today: remove #2, re-add, reposition,
    remove again. The backup exports both; restore's within-file dedupe collapses them on
    `slotKey`, so the second is dropped without a word.
  - **A restore into a non-empty library can drop a refusal.** If a live entry already occupies
    the archived tombstone's position, the tombstone is skipped ("existing state wins") — so the
    reader's removal is gone, and the next Hardcover refresh resurrects the ghost they dismissed.
    This **compounds the restore-guardrail item** below: restoring into a non-empty library
    already silently adds a second library, and this is the same operation quietly discarding
    negative space too.
    Renumber makes the second case likelier rather than causing it — it packs positions onto small
    integers 1..n, and small-integer collisions are the common case. Measured on
    `feat/series-builder`: renumber rewrites live entries only and never touches tombstone rows, so
    the "renumber orphans every archived tombstone" worry is not what happens.
    **The honest fix is keying archived tombstones on (series, normalized title)**, which closes
    both cases at once and aligns the archive with every consumer — a v-next backup-format decision,
    its own branch. Recorded rather than fixed on the owner's instruction.
- ~~**Revive matches on title alone, so a removal can revive the wrong slot.**~~ — done
  (`fix/revive-author-match`). `matchTombstoneForRevive` in `packages/core` now takes title
  first and consults author only to break a tie between same-title tombstones, refusing to
  revive anything when the tie can't be broken. Author is a discriminator and deliberately
  NOT a requirement: an empty author is a legitimate state (the manual ghost path prompts
  "Author (optional):"; Hardcover stores `''` when the upstream contribution is missing), so
  requiring it would have turned an optional field into a functional one. Both revive paths
  went through it — `useSeriesDetail`'s reconciliation and `revivedTombstone`, the latter of
  which had never selected `author` at all. Both queries also gained a deterministic
  `position, id` order; "first match wins" out of an unordered result meant the winner could
  differ between runs.
- ~~**`ghostMatchesBook` has the identical title-only weakness, one step earlier in the same
  function.**~~ — done (`fix/ghost-adoption-match`), and it closes the sequence the revive fix
  started. Adoption and revive were asking the same question — which of these candidate entries is
  this book — so they now share one answer: `matchEntryForBook`, with `ghostMatchesBook` and
  `matchTombstoneForRevive` both gone rather than left as two functions with one rule to drift
  apart. Callers filter their own population (`unlinkedEntries` for adoption, tombstones for revive)
  and decide what a refusal costs. A unique title still adopts regardless of author, deliberately:
  adoption exists because a catalog's author string almost never matches the reader's byline, so
  requiring author there would break the normal case rather than harden it.
  **The ordering worry recorded here turned out not to apply**: adoption and revive read the SAME
  entries query, which `fix/revive-author-match` had already ordered `position, id`, and the live
  set is a `.filter()` of it — so `.find` was already deterministic, just deterministically wrong on
  a tie. Guarded by an e2e that drives the interaction itself rather than a proxy: two same-title
  ghosts, a same-title tombstone whose author matches, one book — neither ghost may take it and the
  tombstone revives with `book_id` set.
  **One thing to know if you touch this again**: the `bookId == null` check moved OUT of the matcher
  (which sees only `{id,title,author}`) into `unlinkedEntries` at the call site. Without it a book
  can claim an entry that already belongs to a DIFFERENT book, re-pointing it and orphaning the
  first book's slot — mutation-verified, and held by its own e2e.
- **`useSyncBookSeries` has the same unprotected shape, inverted, and it spans two
  mutations.** The book page's save runs `updateBook` (writes `books.series`) and then
  `syncBookSeries` (tombstones the old slot) as separate mutations in that forced order
  (`book/dialogs.tsx` ~L263-284). A failure between them leaves `books.series` already
  changed and the old slot still **live** — no tombstone, so revive is irrelevant;
  instead the old series page keeps showing a book that no longer names it,
  permanently, because nothing removes a live entry whose book stopped naming the
  series. That is the #65 symptom `20260725010000` was written to eliminate, reachable
  again by failure rather than by design. Less harmful than `useRemoveEntry` in one
  respect: the dialog catches, stays open and names the failed step, so the reader is
  told. `remove_series_entry` cannot fix it — the inconsistency is between two
  mutations, not two statements, so closing it means one RPC for the whole book save.
  Found during `fix/atomic-series-removal`.
- **Scroll position is unmanaged app-wide.** TanStack Router ships a
  `scrollRestoration` option and it is simply unconfigured on `createRouter`. Wrong
  in both directions: back-navigation doesn't restore where you were, and forward
  navigation keeps the _previous_ page's scroll rather than starting at the top.
  Its own branch — one option flips behavior on every route at once, so a red run
  needs to mean one thing.
- **Search text lost on back-navigation**: `/tropes` `q`, `/discover` `query`,
  `/match` `vibeQ` — all `useState`, same defect class as the tab bug and the same
  fix shape (a validated search param). Not bundled with `fix/tab-routing` for the
  same reason.
- **`/shelves` `openListId` lost alongside the tab** — which shelf accordion is
  expanded is component state too. Same surface, same class; the tab fix landed
  without it because the reported defect was the tab.
- **`/library` filters, sort and mode live in a module-level Zustand store.**
  Survives back-navigation (the store outlives the unmount), lost on reload,
  invisible to deep-linking or sharing. That store _masks_ the back-nav symptom
  rather than having it, which is why `fix/tab-routing` deliberately left it
  alone. Moving it to the URL needs a store-vs-URL precedence decision first —
  what wins when both exist.
- **Swallowed Supabase errors**: a11y's `setupFixtures`, `cleanup`,
  `setProfileSkinMode` discard sign-in errors then dereference `.data.user!.id`,
  surfacing as a bare TypeError. Plus `db:seed`'s `Seed failed: {}`. Same
  empty-body shape `authFailure()` already solves; it should become the one way
  this repo reads a Supabase error.
- **`apps/web/e2e` is outside `tsc`'s reach** (`apps/web/tsconfig.json` includes only
  `["src", "vite.config.ts"]`), while `noUnusedLocals: true` makes a swallowed
  `const { error }` a compile error everywhere else — the reason every swallowed Supabase
  result in the repo lived under `e2e/` (`fix/supabase-error-surfacing`'s audit; 104 sites).
  **Correction to how this was first framed**: extending typecheck to `e2e` would **not** have
  prevented the 13 `.data!`/`.user!`/`.session!` non-null-assertion derefs — `!` is permitted by
  design under `strict: true`, so those are not type errors — nor the 83 bare write `await`s that
  bind nothing at all, since there is no unused binding to flag. `noUnusedLocals` only catches an
  `error` field that is destructured and then never read; it would have forced a handful of the
  sites, not the shape most of them took. The ESLint rule scoped to `apps/web/e2e/**` (bans a
  non-null assertion on `.data`/`.user`/`.session`) is what actually closes the deref gap;
  nothing closes the bare-await gap except a helper everyone routes through (`e2e/support/ok.ts`)
  and reviewing for it. Worth doing anyway — it would catch a real class of future regressions
  typecheck already prevents in `src/` — but it is not a substitute for either guard above, and
  its own branch: turning it on will surface whatever pre-existing type errors 19 spec files have
  accumulated while unwatched, and a red run there needs to mean one thing.
- **`cleanup()` is a sequential `await` chain, so any failing step skips every step after it —
  including the profile restore.** `a11y.spec.ts`'s `cleanup()` runs its deletes and
  `setProfileSkinMode('tryst', 'system')` one after another with nothing isolating them, so a
  throw partway through (a permission error, a constraint, anything `ok()` now surfaces) leaves
  every later step — not just the one that failed — un-run. The `shared_docs` delete below was
  exactly this: while it threw, `shared_refs`' delete and the profile restore silently never ran
  either. Fixed for that one case by removing the doomed step (see below), but the ordering hazard
  itself is general and outlives that fix — any future failing step in this chain hides every
  later one behind it, the same way. **Harmless today, and now loud rather than silent** — a
  swallowed step used to fail quietly with the same blast radius; `ok()` just made the failure
  visible, not the skip pattern new. Recorded rather than restructured, since making cleanup
  resilient to a mid-chain failure (run every step regardless, collect failures) is its own small
  change with its own trade-off (a cleanup that reports three failures instead of stopping at the
  first) — a call for whoever next touches this fixture, not a drive-by here.
- ~~**`a11y.spec.ts`'s `cleanup()` could never delete its `shared_docs` row.**~~ — done. Removed
  the delete entirely rather than granting the privilege: `20260624010400_grants.sql` grants only
  `select, insert, update` on `public.shared_docs` to `anon, authenticated`, `sharedLists.ts`
  matches it (the app itself never deletes that table), and `ownedTables.ts` documents that
  capability share docs persist by design. Granting `delete` to satisfy a test fixture would have
  been a production privilege change made for the wrong reason. Nothing was lost: `setupFixtures`
  upserts the row on the stable key `'A11YSMOKE'`, so each run overwrites it rather than leaving
  an undeletable table to accumulate one row per run.
- **Restore guardrail**: restoring into a non-empty library silently adds a second
  one. Warn with real counts before it happens. Merge-routed restore stays blocked
  on field-level merge picking — trading a visible duplicate for a silent loss is
  the wrong direction.
- **Flash of the wrong mode on a fresh device.** A reader whose profile `mode` is
  `dark`, on a device with no `reverie.mode` in localStorage — first-ever load, or
  right after the sign-out cache clear (`fix/offline-session`) — gets a light
  first paint (the boot script falls back to `system`, which resolves to
  whatever `prefers-color-scheme` says) and a ~180ms transition to dark once the
  profile loads and `useSkinSync` corrects it. Real, reader-facing — not the
  CI-only race the a11y sweep hit, though it's the same underlying gap: nothing
  pre-seeds localStorage before the app's own first paint. Made more reachable by
  the sign-out cache clear, which deliberately wipes local state. App-source; its
  own branch later.
- ~~**`merge_books` can silently null out a reader's plan.**~~ — fixed by
  `20260803010000_merge_plan_precision.sql`, guarded by
  `supabase/tests/merge_plan_test.sql`, both mutation-checked. `take_plan` is
  decided once before the update and all four plan columns follow it, so a null
  from the client can no longer clear a stored plan.
  **Correcting how this was first recorded here**: the mechanism was right —
  `plan_date` used an unconditional `case` where `pub_*` uses `coalesce`, and
  `toBookRow(merged)` on a full `Book` always supplies the key, so the first
  branch always fired. But "a merge that was only supposed to deduplicate can
  clear reader intent" overstated the **trigger**. `merge.ts` unions from
  `{ ...source }`, so a merge computed against fresh, correct data always carries
  the primary's own plan forward and the unconditional set writes back what was
  already there. The reachable path is narrower: a client whose cached `Book`
  lacks a plan the stored row actually has — stale or partially hydrated — where
  `merged.plan` is null and the RPC then clears the real one. Narrow trigger,
  total effect, and `pub_*` was immune to that same input all along. Verified by
  reading `merge.ts:72` (`const p: Book = { ...source }`) rather than re-asserted
  from the original note.
  Also settled while fixing it: the union is object-level, not per-column, so the
  latent per-column hazard flagged for `pub_*` (year from one book, month from
  another) was not inherited by `plan_*`. `pub_*` itself still has it, unexercised
  — its own item if it ever matters.
- **`OwnedCopies` has the same write-clobbering shape `PlanEditor` had.**
  `BookDetailRoute.tsx` ~L236/242 and `dialogs.tsx` ~L489/491 each format toggle
  (physical/ebook/audiobook) sends the WHOLE `Owned` object through
  `useUpdateBook`, unscoped at these two call sites (the hook itself now supports
  `scopeBookId`, added in `fix/book-write-race`, but nothing routes it through
  `OwnedCopies`'s `onChange`/`onPossessionChange` props). Fast toggling
  physical → ebook → audio can have an earlier, less complete write land last and
  overwrite a later one — the identical defect `PlanEditor` had before it
  committed once and serialized on the book id. Two things here, not one: the
  ordering hazard (fixed the same way scoping fixed it elsewhere) and a SEPARATE
  stale-read problem — each toggle's payload is built from the `owned` **prop**,
  which lags one render behind the store, so two fast toggles can each compute
  their payload from the same stale snapshot regardless of write ordering.
  Scoping the writes does not fix the stale read; they need separate fixes.
- **`ProgressSlider` writes the same book twice on every release, guaranteed.**
  `BookDetailRoute.tsx` ~L183-184: `onPointerUp` and `onBlur` both fire
  `updateBook.mutate(...)` with the identical `value`. Idempotent — ordering
  can't corrupt it, since both writes carry the same payload — so this is pure
  waste (a doubled request on every slider release), not the data-loss shape
  above. Drop one of the two handlers.
- **`useRealtimeRefetch` should cover `lists` and `books`, not just clubs and
  shared lists.** `fix/state-pills-flake` closed the reader-facing half of a
  stale-persisted-cache defect with `useConfirmedLookup` (below) — a route no
  longer trusts a restored-fresh absence without asking the server once. What it
  did NOT close is the window that produces that staleness in the first place: a
  reader on device A adding a shelf, or editing a book, leaves device B's
  persisted cache stale until something invalidates it, and today nothing does
  for `lists`/`books` outside the two routes `useRealtimeRefetch` already covers
  (`ClubRoute`, `SharedListRoute`). Subscribing `lists` and `books` to Postgres
  changes the same way would close that gap for real multi-device use, not just
  the single-client cache-restore case the guard handles.
  **Complementary, not a replacement for the guard** — say so explicitly before
  anyone reads this as "realtime makes `useConfirmedLookup` unnecessary." A page
  can always render in the gap between a remote change and its invalidation
  arriving over the realtime channel; the guard is what keeps that gap from
  reading as a permanent, wrong "gone." Realtime reduces how often the cache is
  stale; the guard bounds what staleness costs when it happens anyway. Own
  branch — it's an actual subscription surface change, not a follow-on to a bug
  fix, and its own measurement (connection cost, invalidation-storm risk under a
  large library) belongs with it.
- **`useConfirmedLookup` (`apps/web/src/hooks/useConfirmedLookup.ts`) is the
  established pattern for a param-addressed lookup that can be loading, found, or
  genuinely absent — use it rather than reinventing per route.** Before
  `fix/state-pills-flake`, `ShelfRoute`/`MoodRoute`/`TropeRoute` each collapsed
  three different situations (`undefined`) into one terminal not-found render:
  still loading, really deleted, and present-on-the-server-but-missing-from-a-
  stale-restored-cache — the third being durable rather than momentary, since
  `hydrate()` preserves `dataUpdatedAt` and a snapshot inside `staleTime` never
  refetches on its own. The hook refetches once before ever reporting `absent`,
  and terminates on a real deletion because `isFetchedAfterMount` derives from
  `dataUpdateCount`, which query-core increments on every successful fetch even
  when the data didn't change — not a guess, verified against query-core's own
  update logic. `SeriesRoute` is NOT a candidate: `useSeriesDetail` creates the
  row when absent, so its `!detail` can only ever mean loading, and the hook
  would be solving a problem that route doesn't have.

## Deliberately partial, and why

- **Logged reads do not reach any shelf or facet — the books cache carries
  `reads: []`.** `mappers.ts` loads reads separately and never merges them into
  the books list, so wherever `isBookRead` runs against that cache it collapses to
  `readStatus === 'Read'`. A book with three logged reads but no `Read` status is
  absent from the Read shelf and from the Library's Read facet, and `groupSeries`'
  read counts are computed on the same cache. Found while mutation-testing B2: an
  e2e fixture built specifically to exercise the `!isDnf` guard could not, because
  the app never saw the logged read. The guard is covered in `packages/core` where
  `reads` is populated. Not fixed here — merging reads into the list query is a
  data-layer change with its own performance question, and it would silently move
  every read count in the app.

- **Thumb-class surfaces carry borrowed/DNF to a screen reader but not to the eye.**
  `feat/state-pills` added the state to the accessible name on SeriesStrip,
  SeriesRoute rows, MoodRoute and TropeRoute, and deliberately drew no pill: at
  36–48px a text pill does not read small, it covers a third to half the cover.
  So a sighted reader browsing those surfaces still cannot tell an abandoned book
  from a finished one, while a screen-reader user can — an inversion of the usual
  gap, and worth closing rather than leaving as a quiet asymmetry.
  - The **~132px grid cells are the exception and the obvious next step**:
    MoodRoute, TropeRoute, Discover and FromYourAuthors render `aspect-[2/3]`
    cells at roughly CoverCard scale, which already carries the real pill. Those
    four could take `StatePill` as-is; the true thumbs (36–48px) need a different
    register — the ghost/dot convention, not text.
  - The genuinely small surfaces would need a non-text marker if they are ever to
    show state visually. The spine edge-marker idiom is the nearest precedent.

## Grep audit, 2026-08 (`docs/rules-and-grep-audit`) — recorded, not fixed

Four sweeps behind the three rules added to CLAUDE.md that session. Nothing here was changed.

- **`VITE_` env vars are all public — seven beyond the Supabase pair, and one is a real key.**
  Vite inlines every `VITE_`-prefixed var into the client bundle at build time, so each is readable
  by anyone with devtools. The full set and what each gates:

  | var                              | gates                                                                               | exposure                                                                                                                                                                                                                                               |
  | -------------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
  | `VITE_GOOGLE_BOOKS_KEY`          | `volumesUrl()` in `lib/googleBooks.ts` — appends `&key=` to every Google Books call | **an API key.** Documented in-file as an accepted decision ("free, referrer-restricted, client-safe for this read-only API"). The referrer restriction is the entire control; if it is ever removed or misconfigured the key is a free quota donation. |
  | `VITE_SENTRY_DSN`                | `lib/sentry.ts` init                                                                | Public **by design** (browser SDKs ship DSNs), but it lets anyone POST events into the project — a quota/noise vector, not a data leak.                                                                                                                |
  | `VITE_BOOKSHOP_AFFILIATE_ID`     | `lib/buyConfig.ts` → outbound buy links                                             | Public by nature; it appears in the outbound URL anyway. No action.                                                                                                                                                                                    |
  | `VITE_BUY_ATTRIBUTION_MODE`      | `lib/buyConfig.ts`; flipping it to `affiliate` changes public revenue copy          | Not secret, but it is the flag `revenueClaims.test.ts` exists to stop from publishing a false claim.                                                                                                                                                   |
  | `VITE_SOCIAL_AUTH_ENABLED`       | `AuthScreen.tsx` — shows OAuth buttons                                              | Not secret.                                                                                                                                                                                                                                            |
  | `VITE_BUILD_ID` / `VITE_RELEASE` | update watcher; Sentry release tag                                                  | Not secret; both injected by `vite.config.ts`.                                                                                                                                                                                                         |

  Only `VITE_GOOGLE_BOOKS_KEY` is a credential. Worth a scheduled check that its referrer
  restriction is still in place, since nothing in the repo can assert that.

- **`res.json()` in failure branches: one instance, already guarded.** `lib/covers.ts:88` parses
  the error body but wraps it `.catch(() => null)`, which is the correct shape. The unguarded case
  the rule targets is the _fall-through_ in `supabase/functions/enrich/index.ts`'s `fetchJson`: it
  handles 429 and 5xx by status and then `return await r.json()` for everything else, so a 400/403/
  404 with an HTML body throws inside the parse. The caller's catch only recognises `'429'` in the
  message, so a quota refusal degrades to "this source had nothing" — indistinguishable from an
  empty result, and it stamps `enriched_at` as though the book were checked.

- **A flat 600ms retry on a 429, in `supabase/functions/geo/index.ts`.** `fetchUpstream` retries
  `429 || >= 500` with a fixed 600ms sleep and ignores `Retry-After` entirely. A limiter asking for
  60s gets asked again in 0.6s, which cannot succeed — it spends a second request of quota and then
  throws anyway. **The two retry loops in the codebase disagree about the same status**: `enrich`'s
  `fetchJson` throws immediately on 429 (correct — a 429 is not retryable on that timescale) while
  `geo` retries it. One of them is wrong and it is `geo`. Nominatim, its upstream, publishes an
  absolute 1 req/sec policy; a 600ms retry is below it by construction.

- **37 exported symbols are unreachable; 26 of them carry tests.** Method: no reference inside the
  defining file beyond its own declaration, and none in `apps/web/src`, `packages/core/src`,
  `apps/web/e2e`, `scripts/` or `supabase/functions/`. Eight are _legitimately_ test-only —
  `*.fixture.ts` (`makeBook`, `FABLE5`, `WHITE_MARK_IN_DARK`), the `ForTests` seam
  (`resetUnreadableReportForTests`), and registries that are themselves the spec
  (`BACKED_UP_TABLES`, `STATE_PILL_TOKEN_FIELDS`, `SERIES_ARRANGER_TOKEN_FIELDS`,
  `resolvePlaceholderColors`, `gradientMatrix`). The remaining ~18 with tests are the actionable
  set, including `fetchCover`, `waitMsFor`, `parseCsvIncoming`, `visibleComments`, `coverKey`,
  `extractGoogleCover`, `buildGoogleBooksUrl` and `renumberEntries`. A further 11 have no test at
  all — notably **`useAddBook`** (`data/books.ts`), an entire unused mutation hook, plus
  `ALL_TROPES`, `SUBGENRES`, `OWNERSHIP_VALUES`, `CANONICAL_MOOD_NAMES`, `moodMatches`,
  `bookMoodNames`, `NEUTRAL_VOICE`, `clearWriteErrors`, `nextSortOrder`, `toList`.

  **Two of these are worth a second look beyond deletion**, because being dead is itself the
  finding: `parseCsvIncoming` is unreachable while CSV import is a headline feature, and
  `visibleComments` is unreachable while the spoiler gate is a CLAUDE.md-named core rule. Confirm
  the live path supersedes them before deleting either.

### The enforcement rule, shaped before committing to it

`import/no-unused-modules` with `unusedExports: true` is the obvious ESLint answer and is the
**wrong tool here**: `packages/core/src/index.ts` re-exports via `export * from` on 49 lines, and
that rule treats a barrel as a consumer, so it would report approximately nothing while appearing
to pass. Verified by inspection of the barrel, not assumed.

**Recommendation: `knip`, as its own gate step, not an ESLint rule.** It resolves `export *`
barrels, and it has a first-class notion of "exported but only used in tests" (`includeEntryExports`

- test-file classification) which is the exact predicate wanted. Shape:

```jsonc
// knip.json
{
  "workspaces": {
    "packages/core": { "entry": ["src/index.ts"], "project": ["src/**/*.ts"] },
    "apps/web": { "entry": ["src/main.tsx", "e2e/**/*.spec.ts"], "project": ["src/**/*.{ts,tsx}"] },
  },
  "ignore": ["**/*.fixture.ts"],
  "ignoreExportsUsedInFile": true, // intra-file use counts as live
}
```

The eight legitimate exemptions become explicit: `*.fixture.ts` by glob, `ForTests` by a small
`ignoreExportsMatching` pattern, and each spec-as-data registry by a listed entry **with a comment
giving the reason** — the `ownedTables` principle that an exclusion without a reason is the bug.
Expect a large first run; that is the point, and it should land as its own branch with the initial
list triaged rather than blanket-ignored.

## Pre-public tracked-data decisions, 2026-08 (`docs/audits/pre-public-secrets.md`) — recorded, not fixed

Sweep from the `docs/claude-md-rules-pass` CLAUDE.md rules pass. The audit named these; most of its
gaps are since **closed** (`.gitignore` gained `*.pem`/`*.key`/`*.p12`/`.vercel/` at lines 44-49;
gitleaks runs in CI at `.github/workflows/ci.yml:76-88` and fails the build on any leak; the geo
function's unowned-domain fallback was corrected to `reveriereads.app`). Two are still **open** and
are the owner's call, not a Code-session fix — recorded here so they don't disappear from view before
the repo goes public.

- **`.npmrc` is tracked** (`git ls-files .npmrc` → `.npmrc`). Contents today are two harmless pnpm
  flags, but the file is the canonical place a registry `_authToken` lands — the moment any registry
  auth is added, the token commits silently. The audit's recommended shape is ignore-with-checked-in
  example (`.npmrc` → `.gitignore`, `.npmrc.example` committed). Pre-public §3.
- **`data/raw/Chism_Books.xlsx` is tracked** (`git ls-files` → `data/raw/Chism_Books.xlsx`, 272 KB,
  since the initial commit `2378ffb`). The real library spreadsheet; its `GC Read` and **`TC Read`**
  columns are reading records for a **second person**, not only the owner. The owner's own data is
  theirs to publish; the second reader's column is the flagged part. Removing it from HEAD hides
  nothing from history (the audit's premise), so the decision is publish-as-is vs. history rewrite
  before the repo ever goes public — the one moment a rewrite still works. The derived JSON seeds
  (`data/corpus_seed.json` + `data/reader_seed.json`, the 290-book pair) carry the same data in
  another form and are flagged for the same decision. Pre-public §4.

## Known-flaky, with a prior

- **`discover-search.spec.ts:275` — "Shelf picker seam: search everywhere finds and adds an unowned
  book to this shelf".** Failed once in CI on PR #126 (run `30762811683`), passed on re-run with
  **no code change**; the same commit had passed 83/83 locally. Failure was the `expect.poll` on
  `list_items` timing out at 15s — expected 1, received 0 — after the `＋ Add` click.

  **Recording the process breach too, so it has a prior of its own:** the re-run violated the
  standing "never re-run until green" rule. It happened after reporting the failure red and asking,
  and the owner chose the re-run over investigation — but the rule exists because a green re-run is
  what turns a real defect into "just a flake", and this entry is what stops the next occurrence
  being read that way. **A second failure here is a defect, not a flake.**

  **The stale-offline-cache hypothesis is disproven, with evidence.** `discover-search.spec.ts`
  _does_ use `keepOfflineCacheEmpty`, called inside its own `signIn` helper (line 110) before
  `page.goto` — so the `fix/state-pills-flake` idiom reached this spec, in the correct
  `addInitScript` shape that deletes the IndexedDB before the app boots. It is not the
  self-inflicted stale cache.

  What to check on the next occurrence, in order: (1) the click targets
  `getByRole('button', { name: '＋ Add' }).first()` while `STUB_RESULTS` holds **two** entries —
  if library-dedupe has not settled, `.first()` may not be the Wildfire Vow row, and the poll would
  then correctly never see it; (2) `stubBackends` deliberately fails the covers ingest with a 422,
  so the add path's error branch is on the critical path to the insert; (3) CI runs single-worker
  on a shared runner, where 15s is a much thinner margin than locally.

  **Second occurrence, a different test in the same file — `discover-search.spec.ts:218` ("add a
  result to a shelf as unowned via the shelf chooser"), local standing e2e run on
  `fix/series-backfill`'s intake-fix commit.** Same shape exactly: `.first().click()` (this time on
  `'＋ Shelf'`, not `'＋ Add'`), then the identical `expect.poll` on `list_items` for the same
  `Wildfire Vow` book, same 15s timeout. Reported red, not re-run. That branch's diff is
  `packages/core/src/importMap.ts` (CSV/XLSX intake) — nothing touching Discover, shelf pickers, or
  `list_items` — so this is not attributable to that change either, same reasoning as the a11y
  timeout entry above. Two different tests in this one spec file, both failing on the same
  `Wildfire Vow` poll, is stronger evidence for hypothesis (1) than either occurrence alone: both
  tests click a `.first()` button while `STUB_RESULTS` holds two entries, and both then poll for
  exactly the book that ordering ambiguity would drop. Worth checking first on the next look.

## Test-infrastructure follow-ups

- Trio migration (a11y/fonts/cover-sheet onto per-user accounts) — buys
  `E2E_WORKERS` back above 1 once CI runtime is a real cost.
- Offline-path e2e specs recorded in `docs/archive/task-offline-session.md`. They become
  the stabilized suite's first real exercise.
- **The a11y sweep has never scanned `CoverPlaceholder`** — every seeded book has a
  `cover_url`, so the placeholder path has never been put in front of axe, despite
  being the surface with the most contrast-test investment in `packages/core`. Add
  a coverless book to the a11y fixture set on its own branch, where a red result
  means one thing. (Deliberately excluded from `test/trio-migration`: bundling it
  would have made a red acceptance run ambiguous between a migration break and a
  new discovery.)
- The a11y sweep's Playwright trace (~249MB) corrupts at write time on the CI
  runner in roughly 2 of 3 failures — the artifact uploads, its outer zip passes
  CRC, but the inner `trace.zip` is not a readable zip. Small traces from the
  same runs upload and open cleanly, so the mechanism is sound; likely a flush
  race on oversized captures. Another argument for splitting a11y into its own
  CI job.
- **No Deno runtime executes in the gate, so `paceSource`'s body never runs under
  test.** The outbound pacing enforcement lives in
  `supabase/functions/_shared/sourcePace.ts`, and `deno` is installed neither
  locally nor in CI — a test placed beside it would never run, which is worse than
  none. What IS covered: the policy (budgets + `waitMsFor` arithmetic) lives in
  `packages/core/src/sourcePace.ts` under Vitest, and `sourcePace.test.ts` reads
  the Deno file and fails when the two tables diverge, so the copied constants
  cannot drift silently. What is NOT covered: the in-process gap actually being
  awaited, the `rate_limit_consume` call, and the fail-open branches — all
  reasoned about, none executed. Wiring a Deno runner into the gate is its own
  branch; it would also cover `_shared/coverUrl.ts` and every other function-side
  module, which are uncovered for the same reason.
- **`cover-sheet.spec.ts` asserts cover _source selection_, never cover _render quality_**
  (`apps/web/e2e/cover-sheet.spec.ts:196,218,235,245`). Every assertion is
  `toHaveAttribute('src', new RegExp(STUB.…))` — which cover the sheet _picked_ — with zero
  `naturalWidth`/`naturalHeight` checks. The underlying `CoverImage.tsx:83` _is_ guarded by
  `isDegenerateGoogleCoverRender(src, img.naturalWidth, img.naturalHeight)`, so a degenerate
  render (a 1×1 tracking pixel, a blocked-image placeholder) would be caught at the component
  layer but never asserted at the e2e layer. This is the 5761bc0-class gap (the cover-degenerate
  audit's whole point) in its narrowest form: the test proves the right URL was selected, not
  that a real cover painted. Filed, not fixed — the judgment call is whether e2e should
  duplicate the component guard or trust it. The `src`-only assertions are _correct for what
  they test_ (cover-sheet selection logic); the gap is that nothing tests the other half.
- **`route-viewport.spec.ts` covers no signed-out surface.** The 24-route list
  (`apps/web/e2e/route-viewport.spec.ts:250-276`) signs in first (`await signIn(page, …)`, line 248) and then walks `/`, `/library`, … `/welcome`, `/onboarding`, plus a resolved trope detail.
  But `/welcome` and `/onboarding` redirect-or-render for a _signed-in_ reader; the genuinely
  signed-out shell — `/auth` and its `?mode=signin|signup` variants (`AuthRoute.tsx:16-23`,
  which redirects an authenticated reader to `/library` and renders the auth form only for the
  unauth shell) — is unreachable from a test that has already signed in. A layout-overflow
  regression on the auth/landing surface (the first thing a new reader sees) would not be
  caught. Filed, not fixed — adding it means a second `test(...)` block that does _not_ call
  `signIn` and walks the unauth routes, which is its own fixture scope.

- **`fetchCover` is still callerless after #123 — the ISBN-direct cover path is not live.**
  `git log -S"fetchCover(" --all -- apps/ supabase/` returns no commit, ever: its only references
  are its definition and two test files. So `buildOpenLibraryIsbnCoverUrl`, the `?default=false`
  guard that turns Open Library's 43-byte 1x1 blank plate into a clean 404, and the whole
  ISBN-direct chain are **not on any live path**. `ol-covers`' budget (100/300s, 3000ms gap) is
  dead configuration for the same reason — `paceSource('ol-covers')` has zero call sites — yet five
  tests in `packages/core/src/sourcePace.test.ts` assert its numbers and one asserts its key differs
  from `ol-search`. The tests pass and guard nothing reachable. Covers on the sweep's actual path
  come from the enrich merge (OL search's `cover_i`, Google `imageLinks`, Hardcover), which is why
  the observed 75% hit rate does not contradict the 25% measured for ISBN-direct — different
  mechanism. **Third instance of tested-but-uncalled code**, after `bookshopId` and
  `VITE_LIBRO_AFFILIATE_ID`. Decide per case: wire it, or delete it and its tests. The pattern
  itself is worth a lint rule — an exported symbol whose only importers are `*.test.ts`.
- **`normalizeImage` decodes the same bytes four times where one would do.** Each
  `ImageMagick.read` re-decodes from scratch: the full-size webp encode, the thumb encode, a read
  whose _only_ purpose is `width`/`height`, and the dominant-colour pass. The dimensions are
  already available inside the first read, and the colour pass could work from the decoded image
  rather than the source bytes. Measured locally (81KB source): 94/47/4/90ms cold, 59/38/4/12ms
  warm — so ~3 of 4 decodes are avoidable. It stays cheap **only because Open Library covers are
  ~384x500, comfortably under `FULL_EDGE = 1600`, so the resize never fires**. A source that
  actually serves large art (a camera upload at full resolution, or a future higher-res cover
  source) pays all four decodes on a big image, in a wasm sandbox, against Supabase's per-request
  CPU limit. Do not treat the current cost as the ceiling.

## Product queue

1. **Shelf-model redesign** — largest tester-facing item. Owned physical / ebook /
   audio, Read, Borrowed, Wishlist, with per-shelf visibility.
2. **P2 features** — reading-progress granularity, half stars, separate
   audiobook-vs-print ratings, field-level merge picking, spice standardization
   with toggle-off.
3. **Metadata sourcing** — series seeding Hardcover → Wikidata (P179 + P1545, CC0,
   decimal ordinals native); evaluate ISBNdb for the indie/KU gap.

## Deferred by decision, not forgotten

- Offline write queue. Writes currently fail visibly — a subsystem, not a branch.
- Realtime subscriptions across sign-out.
- Signed-out reader opening offline sees above-fold landing content only.
- iOS barcode wasm fallback — decide once tester platform mix is known.
- Year heatmap. No longer sold by copy.

## Parked design conversations

Calendar cluster; multi-series universe layer; borrowed-as-subsystem; Match
approach (b), library-signal-driven; opt-in genre-gradient personalization;
onboarding Stages B–D.

## Open decisions

- **DECIDED + REMOVED (2026-08): the global `{isbn}.jpg` cover cache is gone.** The enrich
  function's `scheduleCoverCache` fetched every resolved cover a second time and stored it at
  `covers/{isbn13}.jpg` — keyed by edition rather than by reader, in a public bucket — then patched
  the cache row to point at it, so the next book to hit that key adopted the shared object and
  skipped the client's ingest. Measured before removal: **33 books on client ingest, all complete;
  1 book on the global path, missing both `coverThumb` and `coverColor`** — 3% of covers and 100%
  of the degraded rows. It also had no host check (while `PRECEDENCE.cover` puts `google` second),
  no magic-byte sniff, no `MIN_COVER_EDGE_PX` floor, no size cap and no normalization, and once
  stored a cover carried our own host, defeating the host-matching audit in
  `docs/reference/reverie-metadata-sourcing.md`. Cross-reader sharing bought nothing — one library per
  account (CLAUDE.md decision 2), one reader. If it ever becomes a goal it gets rebuilt **through**
  the `covers` function that already gates everything, not beside it. Guarded by
  `packages/core/src/noGlobalCoverCache.test.ts`, which reads the Deno source (no Deno test runner
  exists) and fails if `enrich` regains any Storage write.

  **Two things the removal does NOT do, both left as owner data decisions:**

  1. **The 41 already-stored objects survive.** Deleting the writer does not unstore what it wrote.
     Any of them that are Google-origin are stored copies of covers the licensing analysis permits
     only as hotlinks, and they stay that way until deleted. Origin is recoverable only through
     `enrichment_cache.provenance->'cover'->>'source'` — the object path is just an ISBN and the
     book row, if any, now carries our host. Query 2 in
     `docs/queries/global-cover-cache-audit.sql`.
  2. **Adoption continues for up to 30 days after deploy.** Cache rows already rewritten still hold
     a global URL in `record.cover`, and a rewritten row has a cover and an isbn13 so `isComplete`
     is true and `isFresh` keeps it for `COMPLETE_DAYS = 30`. Every hit on such a row still hands
     the client a stored URL that `isIngestibleCoverUrl` declines to re-ingest — so new degraded
     rows can still appear, from `bulkComplete` and from `AddRoute`, until those rows age out or
     are cleared. Clearing them is a one-statement data fix; not done here.

  **The one degraded book cannot repair itself.** `useCoverBackfill` skips it (`isStoredCoverUrl`
  is true), and `resharpenSource` needs `coverSourceUrl` to re-fetch from — which the adoption path
  never set, because only the ingest sets it. It keeps a working cover and permanently lacks a
  thumb and a spine colour unless the cover is cleared and re-swept, or re-picked in Cover Studio.
  At N=1 that is a manual fix; if the count had been larger it would need a repair pass.

- **LICENSE**: a proprietary training-fork grant exists (87e0195). Review whether
  that text is right for a product repo before LLC formation. Contributor
  copyright ownership needs a CLA or work-for-hire agreement — hardens with time.
- **`NOTICES.md`**: generated from the pnpm tree, so it cannot see Deno-side Edge
  Function dependencies. `npm:@imagemagick/magick-wasm` (Apache-2.0, covers
  function) is missing and should be added.
- ~~**`CLAUDE.md` rules pass**~~ — done (#93). Six rules, each with its reason,
  now live under "Shell & deploy safety" and "Testing & verification discipline"
  in `CLAUDE.md`.
