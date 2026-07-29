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
- **`useRemoveEntry`** (`apps/web/src/data/series.ts` ~L353): two sequential
  independently-committed writes, no transaction. A failure between them leaves
  `series_entries` removed while `books.series` still names it. Needs a
  dropped-connection audit; a revive-on-refresh mechanism elsewhere in that file
  may or may not already cover the half-committed shape.
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
