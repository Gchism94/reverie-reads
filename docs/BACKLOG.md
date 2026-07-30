# Reverie backlog

Living record. Items leave by being done or by an explicit decision, not by being
forgotten.

## In flight

- Nothing. The infrastructure arc is done: CI landed (`chore/ci`), the trio moved
  off the shared dev account (`test/trio-migration`), throughput stages 1–2
  landed and stage 3 was cancelled on its own measurements
  (`docs/task-ci.md`). Everything below is product or its own branch.

## Real bugs, outstanding

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

## Test-infrastructure follow-ups

- Trio migration (a11y/fonts/cover-sheet onto per-user accounts) — buys
  `E2E_WORKERS` back above 1 once CI runtime is a real cost.
- Offline-path e2e specs recorded in `docs/task-offline-session.md`. They become
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

- **LICENSE**: a proprietary training-fork grant exists (87e0195). Review whether
  that text is right for a product repo before LLC formation. Contributor
  copyright ownership needs a CLA or work-for-hire agreement — hardens with time.
- **`NOTICES.md`**: generated from the pnpm tree, so it cannot see Deno-side Edge
  Function dependencies. `npm:@imagemagick/magick-wasm` (Apache-2.0, covers
  function) is missing and should be added.
- ~~**`CLAUDE.md` rules pass**~~ — done (#93). Six rules, each with its reason,
  now live under "Shell & deploy safety" and "Testing & verification discipline"
  in `CLAUDE.md`.
