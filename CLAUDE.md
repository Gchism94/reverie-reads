# CLAUDE.md

Context for Claude Code. Read this first, then `docs/reference/DATA_MODEL.md` before touching anything
that stores a book. `docs/archive/CLAUDE_CODE_KICKOFF.md` is the original build plan — history now,
not a to-do list. Keep this file updated as the project evolves.

## What this is

Reverie — a personal library app behind a skinnable, **genre-neutral** interface: nine
distinct skins (romance, fantasy, sci-fi, horror, mystery, literary, cozy, nonfiction, YA)
that reskin the whole app to the shelf you're in. It handles intensity levels, tropes, moods,
series gaps, rereads, per-format ownership, cover sourcing, offline caching, and a book-club
layer, and ranks what to read next against _your_ library rather than aggregated ratings.

It **began** as a romance / romantasy / dark-romance app with a gothic New Orleans look, and
that heritage survives as the Tryst skin. Do not write romance-only vocabulary, defaults or
logic into shared code — #69 and #72 de-romanced the taxonomy, the Match quiz and the copy.
Genre-specific language belongs in a skin, not in the core.

## Status & your job

- **The real app is built and shipped.** `apps/web` + `packages/core` + `supabase/` are the
  product; work happens there, on a feature branch, behind a PR.
- `prototype/Reverie_Library.html` is **historical reference only** — the original feature
  source. The shipped app has long since passed it (skins, moods, tropes-as-join, four-state
  ownership, series entries). Where they differ, the shipped app is right; do not "restore
  parity" with the prototype.
- Design: canonical tokens/components in `design/DESIGN_SYSTEM.md`; design exports, if any,
  in `design/from-claude-design/`.

## Stack (decided — don't re-litigate without asking)

- **Monorepo**, pnpm workspaces.
- **Web:** React + TypeScript (strict) + Vite + Tailwind (design tokens) +
  TanStack Router + TanStack Query. Light UI state via Zustand. Offline cache via
  IndexedDB (Dexie).
- **Backend:** Supabase — Postgres, Auth (email magic-link + OAuth), Realtime, Storage,
  Edge Functions.
- **Data layer:** Supabase client + TanStack Query with optimistic writes. Start with
  query-cache; add the Dexie offline mirror + background sync incrementally
  (local-first is the goal, not the v1 blocker).
- **Tests:** Vitest (unit), Playwright (e2e). **Lint/format:** ESLint + Prettier.

## Layout

```
apps/web/            React app (UI, routes, components) + Playwright e2e
packages/core/       shared TS types + pure logic (merge, CSV import, spoiler gate, skins,
                     covers, taste) — everything testable without a browser
supabase/            migrations, edge functions, seed
prototype/ data/ design/ docs/ backend/   ← reference material, not shipped
```

## Where the answers live

- Features to match → `docs/reference/FEATURES.md`, `docs/reference/REQUIREMENTS.md`
- Architecture & API surface → `docs/reference/ARCHITECTURE.md`
- DB schema & object shapes → `docs/reference/DATA_MODEL.md`
- Design tokens, type, motion, components → `design/DESIGN_SYSTEM.md`; the nine skins'
  token sets live in `packages/core/src/skins.ts` + `apps/web/src/styles/tokens.css`
- Decisions with a rationale → `docs/decisions/` (ADRs)
- Cover/metadata/release data sources → `docs/reference/DATA_SOURCES.md`
- Sharing & book-club design → `docs/reference/SHARING.md`
- Seed data → `data/corpus_seed.json` (bibliographic, CC0) + `data/reader_seed.json` (this
  reader's own data, not published, not licensed), 290 books joined by `id` — split from the
  single `personal_seed.json` in the pre-public-licensing pass so the CC0 corpus dedication in
  `LICENSE-CORPUS` scopes to a file, not a field-kind boundary inside a mixed one. Design-ready
  subset in `data/design_corpus_seed.json` + `data/design_reader_seed.json` (same split, same
  reason — `data/reverie_design_seed.json` carried the identical bibliographic/reader-data
  blend and was split the same way in `chore/split-design-seed`)

## Conventions

- TypeScript strict; functional components + hooks; small, focused modules.
- **No hardcoded colors** — use the design tokens (CSS vars / Tailwind theme). There are
  **nine skins**, not two themes: `tryst`, `grimoire`, `aphelion`, `marrow`, `umbra`, `folio`,
  `hearth`, `almanac`, `bloom` (`packages/core/src/skins.ts`), each with its own token set and
  its own light/dark pair; `mode` is light/dark/system, independent of the skin. "Nocturne /
  Magnolia Dawn" is prototype-era naming and no longer names anything in the code.
- Mobile-first; responsive to desktop.
- Accessibility is part of done: visible keyboard focus, adequate contrast in **every skin** in
  both modes, and **respect `prefers-reduced-motion`** (disable the night-sky drift/twinkle).
  Two layers guard contrast, and they cover different amounts: the **core contrast tests** are
  keyed off the `SKINS` registry, so all nine are checked and a new skin fails until it has
  tokens; the **e2e axe sweep** runs four (`tryst`, `grimoire`, `aphelion`, `marrow`) × both
  modes. A new component's contrast belongs in a registry-keyed core test — that is the layer
  that is exhaustive.
- **Port, don't rewrite** the prototype's already-tested logic: the merge engine, the
  Goodreads/StoryGraph CSV importer, and the spoiler-gating rule (`comment.unit <=
myProgress`). Move them into `packages/core` with tests.
- Copy stays sentence case, plain verbs, no filler; empty states invite action.
- **Possession is five independent flags, and every shelf is a derived view.** `ownership` is
  `'owned' | 'unowned'` (default `unowned`) and answers only _do you own a copy_. `borrowed`
  and `wishlist` are **flags beside it, not values inside it** — all combinations are legal
  ("own the paperback, borrowed the audio, still want the special edition") and the schema
  constrains none of them. `owned: {physical, ebook, audiobook}` answers _which formats_ and
  only means anything for a book **in hand**. Ask `isPossessed` (= `owned || borrowed`) or
  `bookOwnedFormats`; **never infer possession from the `owned` booleans** — `all-false =
wishlist` was the pre-#68 model and is long wrong. Format flags **suppress, never clear**, so
  drop → re-acquire loses nothing. A control that must show one word uses `possessionState()`
  (owned > borrowed > wishlist > unset) and writes back through `possessionPatch()`; both are
  views, never stored. The **Owned · Physical / Ebook / Audiobook** shelves are _smart shelves_
  derived from possession — not manual lists. Possession is independent of the format read in
  the reread log, and never gates reading history.
- **`isBookRead` and `hasReadingHistory` disagree on DNF on purpose.** `isBookRead` feeds series
  progress, taste and stats, where an abandoned book must not count as read. `hasReadingHistory`
  adds DNF and feeds **visibility only** (`inDefaultLibrary`), so a book you started and gave up
  on stops being invisible. Do not collapse them.
- **No aggregate rating.** Never compute or display an averaged star rating anywhere.
  Keep the reader's own rating (`rating` on the book + per-read). Others' opinions appear only
  as an opt-in list of **individual** reviews on the book screen — never a single number.
- **Mass import + mass merge.** Bulk-add (CSV today; bulk ISBN/title) and a bulk
  de-dupe flow that resolves all detected duplicate groups at once (run on import).
  Reuse the ported merge engine.

## Commands

```
pnpm dev            # run web app
pnpm build          # production build (core tsc, then web tsc/vite)
pnpm test           # unit tests (Vitest, all packages)
pnpm e2e            # Playwright (includes the axe sweep — four skins x both modes)
pnpm lint           # ESLint
pnpm typecheck      # tsc --noEmit, all packages
pnpm db:start       # local Supabase stack   (db:stop / db:reset / db:status)
pnpm db:migrate     # apply migrations + reload the PostgREST schema
pnpm db:seed        # load the dev library
pnpm deploy:migrations   # prod db push — via the deploy guard (main + clean + confirm)
pnpm deploy:functions    # prod functions deploy — via the deploy guard
```

## Shell & deploy safety

- **A migration that changes what a WRITE DOES TO USER DATA gets a human at the keyboard for the
  guard's `y/N` — never a piped `y`.** (Owner rule, 2026-08-15.) The guard's confirmation is a human
  gate; answering it from a script satisfies the letter and removes the thing it exists for. Schema
  that only adds a column, an index, or a grant may be confirmed by whoever is running the deploy;
  anything that alters the OUTCOME of an existing write path — a changed RPC body, a backfill, a
  trigger — waits for a person. A Code session has no TTY, so in practice this means **a Code session
  does not run these deploys at all**: it reports the migration as ready and holds. The precedent
  this corrects: `enrich` was deployed earlier that day with `printf 'y\n' | pnpm deploy:functions`,
  which was authorised and idempotent but is exactly the shape that stops being safe the moment the
  thing being deployed can rewrite rows.

- **Never run a raw `supabase db push` / `supabase functions deploy` against prod.** Go through the
  guard (`pnpm deploy:migrations` / `pnpm deploy:functions`) — it enforces main + clean tree + in-sync
  - a `y/N`. Prod deploys happen from `main` after merge, never a feature branch (override is a loud,
    deliberate exception). See `docs/reference/DEPLOY.md`.
- **Heredocs containing shell examples MUST be single-quoted** — `<<'EOF'`, not `<<EOF` — so backticks
  and `$(…)` inside are text, never evaluated. This applies to any heredoc feeding `gh pr create
--body`, commit messages, or reports.
- **A deploy command must never appear as an un-quoted literal** in a PR body, commit message, or
  report. Write it fenced/inline in a single-quoted heredoc or a `--body-file`; an un-quoted
  `` `supabase functions deploy …` `` in a double-quoted string executes. (Codifies the 2026-07-14
  heredoc-eval incident, which deployed a function to prod from a PR-body backtick.)
- **No writes to the production database from a Code session — ever, including throwaway
  accounts meant for immediate deletion.** `docs/reference/DEPLOY.md`'s smoke test uses exactly that
  pattern — a self-deleting account exercising the full lifecycle against prod — but that is the
  owner's checklist to run by hand, not something a Code session does on its own. Verification
  that requires a real prod account is the owner's to run, not Code's.
- **A new RPC needs BOTH `revoke execute ... from public` and `grant execute ... to
authenticated`** (or `to service_role`) **— the grant alone was never gating.** Postgres grants
  `EXECUTE` to `PUBLIC` on every new function by default, so `grant execute to authenticated` is
  additive, not a boundary. Observed live: `remove_series_entry` and `merge_books` were both
  reachable with the anon key before `20260801010000_revoke_public_execute.sql`, returning their
  body's own `P0001` ownership raise rather than a grant-layer refusal — meaning the `raise` was the
  _only_ thing stopping anon, and a future RPC whose first statement isn't an ownership check would
  inherit an anon-callable function with no protection at all. One function's boundary was already
  weaker than that in practice: `rate_limit_consume`, granted only to `service_role`, had no
  ownership check whatsoever and was genuinely callable by anon/authenticated with an arbitrary,
  unvalidated `p_key` — able to exhaust or spam another user's guessable rate-limit bucket. `create
or replace function` (same signature) **preserves** an existing revoke; only a genuine `drop
function` + fresh `create` resets it to the PUBLIC-execute default — verified against this
  database (a throwaway probe: revoke, then replace → unchanged; revoke, then drop+recreate → the
  revoke is gone). No migration in this repo's history has ever dropped-and-recreated a function
  (`merge_books`, six times, always via `create or replace`), so the convention only breaks if that
  changes. **Guard it at the grant layer, not the body**: a pgTAP assertion of `remove_series_entry`
  or `merge_books` refusing anon must check for SQLSTATE `42501` specifically, never a body-level
  `P0001` — a `P0001` from that assertion means `PUBLIC` regained execute and the call reached the
  ownership check anyway, which is the exact silent regression this rule exists to catch.
  **One classification mistake worth keeping visible**: `is_club_member` / `club_progress` were
  first assumed to be pure internal helpers needing no grant, since they're only called from within
  another `security definer` function's body — true for THAT call path (which runs as the function
  owner), but both are also called directly from inside four RLS POLICY expressions on
  `clubs`/`club_members`/`club_comments`, which evaluate as the QUERYING role, not the owner.
  Revoking `PUBLIC` without granting `authenticated` there broke three pgTAP files outright on the
  first run. Caught by running the suite, not by re-reading the reasoning — a function's callers
  include its RLS policies, not just its own migration file and its obvious call sites.
- **A data-fix script is NOT a migration.** A one-time repair scoped to a single incident — row ids
  that mean nothing on another database, a backfill that must not run twice — lives in `docs/queries/`
  and is run by hand against the target, never in `supabase/migrations/`. `pnpm db:migrate` pushes
  every file in `supabase/migrations/` on every deploy, so a repair there would either re-fire on the
  next database (idempotent ones harmlessly, non-idempotent ones destructively) or sit in the deploy
  path forever as dead weight. The durable _closure_ of an incident — the schema/trigger/constraint
  that stops it recurring — _does_ belong in a migration; the incident-specific repair that produced
  the closure does not. `fix/merge_books-series-reparent` (41290d0) is the clean separation: the
  repair SQL for Iron Flame's mis-parented series slot sat in `docs/queries/iron-flame-merge.sql`
  scoped to those row ids, while the step-3c-series re-parenting that makes the next merge correct went
  into the `merge_books` body via migration. Twelve incident files already live under `docs/queries/`
  on this pattern; do not promote one into `supabase/migrations/` because it "feels like" a migration.
- **Irreversible DB operations are silent by default — make them loud.** `alter table … drop column`
  on a dependency nothing tracks (no FK, no view, no function arg) **succeeds silently**: no error,
  no warning, just a column gone. `delete from …` with no `where` empties the table the same way.
  Any migration that drops a column, drops a constraint, or deletes rows must (a) name in a comment
  _what_ it removes and _why_, and (b) where live data exists, do the durable guard _first_ and the
  destructive act _second_ — never assume a later step will catch a silent drop. `drop_plan_date`
  (658ede0) documents this directly: `plan_date` was "a string, not a tracked dependency, so
  `alter table … drop column plan_date` SUCCEEDS SILENTLY," and the migration reorders the body to
  write the replacement columns and backfill before the drop, so a silent failure of the drop would
  leave the replacement in place rather than the reader with neither. The silence is the failure mode;
  a comment and a guard ordering are the antidote.

- **Create the branch BEFORE the first edit, never after.** `git checkout -b` costs nothing at the
  start and is the only moment it is free. Starting work on whatever branch happens to be checked
  out — usually the last PR's — means the commit lands on that PR, and splitting it out afterward
  costs a cherry-pick onto a fresh branch plus a `git reset --hard` on the polluted one to drop the
  duplicate. That reset is recoverable only because the commit already exists elsewhere; it is one
  slip away from discarding real work, and `--force`-pushing the polluted branch instead is
  forbidden. This happened TWICE in one session: the font-spec rewrite (#207) and the suite-wide
  font stub (#208) were both authored on #206's branch and both had to be extracted. Neither reached
  the remote, so no PR was corrupted — but that was luck about push timing, not the process working.
  The tell is reaching for `git checkout -b` while `git status` already shows modified files.

## Testing & verification discipline

Thirteen rules, each earned by a real failure. A rule without its reason gets dropped by whoever
inherits it, so the reason stays attached.

- **Assert the thing itself, not a proxy that would look the same if the thing were absent.** This is
  the general form several rules below are instances of, stated once at the top so it covers cases
  the specific ones don't reach. The canonical case: `fix/spine-shelf-overlay` (df8cfb4) guarded the
  track-width invariant by measuring `scrollWidth` across scroll-driven **and** tap-driven
  transitions at both content edges — **not** a `scrollLeft`-reachability test, which the
  `mobile-shelf-interaction` audit proved "reaches the ends fine while the real gesture fails" and so
  passes against the broken build and proves nothing. A proxy guard certifies a property adjacent to
  the defect (the scroll position can be set; the row is `NULL`; the bundle contains the string) while
  the defect itself (the width mutates mid-gesture; the row is invisible under RLS; the branch is dead
  code) is invisible to it. Before writing a guard, name the defect in one sentence and ask whether
  the assertion would fail if _that specific thing_ broke — if it would still pass, you are guarding a
  proxy. See the negative-assertion, bundle-grep, and dead-export rules below for three instances of
  the same failure in different domains.

- **Grepping a bundle for strings measures dead-code elimination, not rendering.** Vite
  constant-folds and eliminates unused branches, so a string's presence or absence in the built
  output tracks the bundler's optimization, not what reaches the screen. Serve the build and read
  the DOM.
- **A negative assertion must first wait for the moment the thing would appear, and must be able to
  tell absence from invisibility.** `waitFor(() => expect(...).not.toBeInTheDocument())` succeeds on
  its very first tick, before any async work has had a chance to produce what's being denied — it
  fails in the safe-looking direction, certifying an absence that was never actually tested. The same
  failure shows up in pgTAP: `is()` is null-safe equality (two `NULL`s compare equal), so
  `is(removed_at, null)` passes identically whether a row was genuinely left untouched or the row is
  invisible to the querying role under RLS and the subquery itself returned zero rows — both collapse
  to the same `NULL`. `fix/atomic-series-removal`'s first draft asserted as `authenticated` and got
  four green-for-the-wrong-reason failures from exactly this. `ok(x is null)` does not have the hole:
  moving the null check inside the expression means a hidden row's zero-row subquery never evaluates
  it at all and the outer value stays bare `NULL`, which fails `ok()` rather than passing it — verified
  directly against this database (`is(x, null)` passes on a nonexistent row; `ok(x is null)` fails on
  the same row). The more durable fix beneath the assertion-shape one: assert as a role nothing
  filters (`reset role`) and let only the action under test run as the restricted one. The same hole
  reopens comparing two things that are each supposed to exist, not just one: `feat/plan-precision-schema`
  compared `plan_*`'s CHECK constraint definitions against `pub_*`'s, to prove the sibling columns
  hadn't diverged. `is(a, b)` would have passed if BOTH constraints had vanished — `NULL` compares
  equal to `NULL` — certifying a mirror between two things that no longer exist. `ok(a = b)` doesn't
  have the hole: a missing operand makes `=` yield `NULL`, and `ok(NULL)` fails rather than passing.
  Same rule, same mechanism, wherever an assertion needs a missing operand to fail loudly.
- **A test name is a promise about what is proven.** "restoring the same file twice does not
  double the assignments" described behavior the test did not assert, and two reports
  contradicted each other for a full round because of it. Name what the assertions actually
  check, not what you hope the surrounding code does.
- **Revert mutants with `scripts/safe-revert.sh <file>`, not `git checkout --`. Commit first as
  well — but the script is the rule, because "commit first" alone has now failed twice.** Mutation
  testing deliberately corrupts the tree to prove a guard has teeth, and `git checkout -- <file>`
  resets the WHOLE file to HEAD: the mutant you meant to undo and any other uncommitted work in it,
  silently, unrecoverably. Twice destroyed real work:
  **2026-08-14** — `git checkout -- src/routes/IndieScreen.tsx` mid-run wiped six uncommitted
  `.skin-control` migrations, found only when a later carrier count came back 0; and **2026-08-15**
  (`a2bdfd7`, `feat/card-surface-rulings-coverage`) — the same command destroyed the uncommitted
  `card`/`line` fixture additions, discovered when 35 tests went red and the next mutant's anchors
  stopped resolving.
  This rule has existed since 2026-07-28 (#93) and being written down did not make it a reflex,
  because the failure happens inside a fast revert loop rather than at a moment of deliberation —
  which is why the fix is now a command that backs up unconditionally before reverting, rather than
  a third restatement. `safe-revert.sh` copies the file's current content to
  `/tmp/mutation-revert-backups/…` and prints the path, then reverts; it deliberately does NOT try
  to tell a deliberate mutant from real work, since that judgment is precisely what failed both
  times. Still verify each revert with `git status --porcelain` before the next mutant.
- **Run the full gate before reporting, not the subset that looks relevant.** Vitest runs on
  esbuild, which strips types without checking them, so a type-broken test file can pass `pnpm
test` outright and only fail `tsc`. This has bitten twice, by two different tools: a broken
  mutation-testing revert once passed `pnpm lint` clean, because ESLint parses syntax but does not
  typecheck; and on `feat/plan-precision-app`, a test helper that spread over `makeBook`'s required
  `id`/`title` and a fixture that was `as`-cast rather than satisfied both passed every Vitest run
  and were only caught when `pnpm typecheck` ran. Green unit tests are not evidence the code
  typechecks — only `/gate`'s own typecheck step is.
- **Every completion report on a branch touching `apps/`, `packages/`, `supabase/`, or test
  infrastructure includes one full e2e run** at the default worker count, fresh DB, retries 0. If
  it's red, report it red — do not re-run until it's green. Docs-only branches are exempt, and
  the report should say so explicitly rather than silently omitting the run.
- **A bulk insert's column set is the UNION of every row's keys, not each row's own.** PostgREST
  sends one `INSERT` for the whole array, and the column list it builds is every key any row in
  the batch supplies — so a row that omits a key the batch is inserting gets an explicit `NULL`
  for it, not the column's default. A `NOT NULL` column then rejects the **entire batch**, and the
  error names the constraint, not the row or the omission that caused it. This has bitten twice:
  `state-pills.spec.ts` documented it once (a rejected insert read as an empty grid, until the
  swallowed error was surfaced), and `a11y.spec.ts`'s `series_entries` fixture hit it independently
  — twice over, first on `author`, then on `user_edited` once `author` was fixed — and because the
  insert was a bare, unchecked `await`, it had **never once succeeded**: `/series/A11y Saga` had
  been axe-scanned as an empty series since the route's introduction (`911dd6f`), with neither the
  linked entry nor the ghost slot ever in front of axe. `fix/supabase-error-surfacing`'s conversion
  of that `await` into `ok()` is what surfaced it — a defect that had been invisible specifically
  because nothing read the result. Give every row in a bulk insert every column the batch uses,
  explicitly, even where a value is just the column default.
- **Never call `res.json()` inside an `if (!res.ok)` branch.** The failure body is the one least
  likely to be JSON: an HTML gateway page, an empty 429, a plain-text proxy error. The parse throws
  _inside the failure handler_, the outer `catch` swallows it, and the status code — the only thing
  that decides whether to retry, back off, or give up — is destroyed on the way. What reaches the
  caller is a generic parse error indistinguishable from "the source had nothing", which is exactly
  backwards: a 403 quota refusal and an empty result set demand opposite responses. **Read the
  status first, then the body defensively** (`await r.json().catch(() => null)`). The same rule
  applies to a fall-through: `enrich`'s `fetchJson` handles 429 and 5xx by status and then parses
  everything else, so a 4xx with an HTML body still reaches `.json()` and still loses its status.
  Branching on `.ok` is not enough — every path that reaches a parse must have already captured the
  status.
- **An exported symbol whose only importers are `*.test.ts` is dead code wearing tests.** Passing
  tests on an uncalled function read as proof the feature works, and that is precisely how
  `fetchCover` survived a PR _about_ `fetchCover`: its `?default=false` guard and ISBN-direct chain
  were reviewed, tested, merged and reported as shipped while nothing had ever called it, and
  `ol-covers`' budget and 3000ms gap were dead configuration guarded by five passing tests.
  Measured on `docs/rules-and-grep-audit`: **37 exported symbols are unreachable** — no intra-file
  use, no non-test use anywhere including `e2e/`, `scripts/` and `supabase/functions/` — of which
  **26 carry tests**. Earlier instances (`bookshopId`, `VITE_LIBRO_AFFILIATE_ID`, `cacheCoverUrl`)
  were each deleted only after being mistaken for working features first. **Delete it or wire it;
  do not leave it.** Three exemptions are legitimate and should stay declared rather than inferred:
  `*.fixture.ts` files, names ending `ForTests`, and registries that ARE the spec (`ownedTables`,
  the contrast-test `*_TOKEN_FIELDS`) — the last of which needs a written reason, on the
  `ownedTables` principle that an exclusion without one is the bug.
- **Verify a deploy landed before building on it.** The claim and the act happen in different
  places — a Code session writes the migration, the owner runs it, and nothing closes the loop — so
  "it's deployed" is an assumption wearing the costume of a fact. Four times this session work was
  built on a deploy that had not happened. Check `supabase migration list --linked` (the remote
  column is the truth) or `supabase functions list` before depending on it, and say which you
  checked. This is cheap and the alternative is a branch built on a schema that does not exist.
- **Local dev DB schema can run ahead of the checked-out tree — the mirror image of the rule
  above.** `supabase migration up` / `db:migrate` applies migrations to the local Postgres instance
  independently of git; checking out `main` or any branch that hasn't merged a migration yet leaves
  the local schema ahead of the code until a `db:reset`. Observed on `chore/series-position-index`
  (2026-08-10): its pgTAP suite only meant something with the migration actually applied, so it went
  in via the incremental path (`supabase migration up`, not a full `db:reset` — no local dev data
  lost), and the local stack stayed at `20260816010000` after, ahead of `main`. Same command, same
  confusable label, opposite direction: `supabase migration list --local`'s `remote` column reports
  the LOCAL database's applied migrations, not production's. Don't read a `--local` run as evidence
  about prod's state, and don't read your local stack's schema as evidence about what's actually
  merged into the tree you're standing on.

- **Key a guard to the declaration, the measurement, or the rendered pixel — never to something
  merely correlated with it.** This is the general rule the ratchet rule below is one instance of,
  stated separately because each instance looked fine in review and each died only to mutation
  testing. In one session three guards were written and **all three first drafts were proxies**: a
  ratchet whose budget was _derived_ rather than measured (63 against a tree of 61, so the mutant
  landed inside the slack and read as "this guard has no teeth"); a ratchet keyed to a **marker
  comment**, which Prettier reflows onto the next property, so deleting the override it marked left
  the comment — and the green — in place; and a render assertion keyed to **`textContent`**, which
  `text-transform` never touches, so it would have passed identically against the broken build. Each
  certified something adjacent to the defect while the defect itself stayed invisible.
  **The CSS-invisible-to-the-DOM case deserves naming, because it is a whole family.**
  `text-transform`, `content`, `::before`/`::after`, `visibility`, `order` and `direction` all change
  what a person perceives while leaving the DOM byte-identical — so any assertion about what a reader
  SEES must read rendered output (`innerText`, Playwright's `toHaveText`, a computed style, a
  screenshot), never the node. Measured here: under `--control-transform: uppercase`, one element
  gave `textContent = 'A Court of Thorns and Roses'` and `innerText = 'A COURT OF THORNS AND ROSES'`.
  The test to apply before writing any guard: **name the defect in one sentence, then ask what the
  guard would report if that exact thing were true.** If the answer is "the same thing it reports
  now", it is keyed to a proxy — and a proxy guard is worse than none, because it also stops the next
  person from looking.

- **A ratchet's budget must be a MEASUREMENT taken from the tree, never a calculation.** A budget that
  is derived — "we had 112, this batch migrates 26, so it's 86" — is indistinguishable from a correct
  one for as long as it stays green, because slack does not fail. It only stops catching things.
  Observed on the control-radius meter (batch 4, `skinRadiusMigration.test.ts`): the derivation
  dropped a term and set the budget to 63 when the tree measured 61. Nothing said so. The mutation
  written to prove the guard had teeth — revert a migrated control — landed at 62, sailed under 63,
  and **read as "this guard has no teeth"**, which is the dangerous part: that is a conclusion a
  reviewer shrugs past and a author is tempted to explain away, when the real fault was two counts of
  slack in the number the mutant was tested against. The gap was found only by setting the budget to
  `-1`, letting the assertion fail, and reading the actual count out of the failure message. So:
  **print the count, don't infer it from green.** Take the number from the tree, then write it down;
  a budget you computed rather than observed is a guess wearing a ratchet's clothes. The same shape
  as the negative-assertion rule above — an assertion that passes for a reason other than the one you
  think is worse than no assertion, because it also stops anyone else from looking.

## Data-integrity & sourcing discipline

Two rules, both earned by the series-position-integrity audit (`audit/series-position-integrity`,
2026-08). They govern the moment a Code session proposes a value for a stored field — a series
ordinal, a series membership, a title canonicalization — that asserts a fact about the world rather
than a fact about the code.

- **A claim treated as ground truth must be sourced, not assumed — and that includes the owner's own
  uncorroborated guess.** "I think this book is #3 in the series" is a hypothesis, not data; treat it
  as such until a source confirms it. Default to **Wikidata** (`P179` part-of-series, `P1545` series
  ordinal) over a guess: it is CC0, carries native decimal ordinals (so `3.1` vs `3.5` is expressible
  without a custom scheme), and is auditable. Before proposing to overwrite a stored position, **paste
  the per-title QID + `P1545` literal** into the work record so the claim is checkable, not asserted.
  Bring splits (a book belongs to two series; an omnibus collects #1–#3) as a flagged question for the
  owner rather than self-resolving them — a self-resolution looks the same in the diff whether it was
  sourced or guessed, and the audit's whole point was that too many stored positions already were
  guesses wearing the costume of data. The recurring failure this names: a series ordering that
  "looked right" had drifted from every source, and nothing in the pipeline could tell, because the
  value was never traceable to one.
- **`series_entries.user_edited = true` is a hard rule: never silently overwrite a reader-set
  position.** The flag marks a position the reader deliberately set — corrected, reordered, or
  disambiguated against a source the backfill doesn't know about. A backfill or repair that rewrites
  `position` while leaving `user_edited` false (or, worse, flipping it false) destroys the reader's
  intent and is invisible in the diff because the row still "has a position." Any repair touching
  `series_entries.position` must filter `where user_edited is distinct from true` and must not touch
  the flag; one-shot repair functions (e.g. `20260810010000_reset_seeded_user_edited.sql`) are
  `revoke execute from public` + `grant to service_role` and run once. This is the data-integrity twin
  of the "assert the thing itself" testing rule: the thing to protect is the reader's set value, not
  the column's mere non-nullness.

## Definition of done (per feature)

Works against the data model; correct in **all nine skins**, light and dark; responsive;
a11y pass; logic covered by tests; uses the design tokens. Verify in the real browser UI —
several defects have been "fixed" in code paths no reader can reach.

## Decisions still needing the owner (use these defaults until told otherwise)

1. **App name — DECIDED (owner, 2026-07): Reverie is the name.** No longer a
   placeholder. Keep reading it from `APP_NAME` in `@reverie/core` (never hardcode);
   `docs/reference/TRADEMARK.md` stays as history.
2. **Household model** — v1 default: one personal library per account; sharing happens
   via shared lists + clubs (defer a true shared household library).
3. **Spoiler gating** — v1 default: honor-based (client-side). Server-enforced via RLS
   is a later upgrade.
4. **Capability-code sharing** — keep it alongside real accounts (frictionless joins).
