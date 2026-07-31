# AGENTS.md

Context for coding agent. Read this first, then `docs/DATA_MODEL.md` before touching anything
that stores a book. `docs/CODING_AGENT_KICKOFF.md` is the original build plan — history now,
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
  in `design/from-design-tool/`.

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

- Features to match → `docs/FEATURES.md`, `docs/REQUIREMENTS.md`
- Architecture & API surface → `docs/ARCHITECTURE.md`
- DB schema & object shapes → `docs/DATA_MODEL.md`
- Design tokens, type, motion, components → `design/DESIGN_SYSTEM.md`; the nine skins'
  token sets live in `packages/core/src/skins.ts` + `apps/web/src/styles/tokens.css`
- Decisions with a rationale → `docs/decisions/` (ADRs)
- Cover/metadata/release data sources → `docs/DATA_SOURCES.md`
- Sharing & book-club design → `docs/SHARING.md`
- Seed data → `data/personal_seed.json` (290 real books); design-ready subset in
  `data/reverie_design_seed.json`

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

- **Never run a raw `supabase db push` / `supabase functions deploy` against prod.** Go through the
  guard (`pnpm deploy:migrations` / `pnpm deploy:functions`) — it enforces main + clean tree + in-sync
  - a `y/N`. Prod deploys happen from `main` after merge, never a feature branch (override is a loud,
    deliberate exception). See `docs/DEPLOY.md`.
- **Heredocs containing shell examples MUST be single-quoted** — `<<'EOF'`, not `<<EOF` — so backticks
  and `$(…)` inside are text, never evaluated. This applies to any heredoc feeding `gh pr create
--body`, commit messages, or reports.
- **A deploy command must never appear as an un-quoted literal** in a PR body, commit message, or
  report. Write it fenced/inline in a single-quoted heredoc or a `--body-file`; an un-quoted
  `` `supabase functions deploy …` `` in a double-quoted string executes. (Codifies the 2026-07-14
  heredoc-eval incident, which deployed a function to prod from a PR-body backtick.)
- **No writes to the production database from a Code session — ever, including throwaway
  accounts meant for immediate deletion.** `docs/DEPLOY.md`'s smoke test uses exactly that
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

## Testing & verification discipline

Seven rules, each earned by a real failure this session. A rule without its reason gets dropped
by whoever inherits it, so the reason stays attached.

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
- **Commit before mutation testing.** Mutation testing deliberately corrupts the tree to prove a
  guard has teeth; `git checkout` against uncommitted work has destroyed a real implementation
  once already. Verify each revert with `git status --porcelain` before the next mutant.
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

## Definition of done (per feature)

Works against the data model; correct in **all nine skins**, light and dark; responsive;
a11y pass; logic covered by tests; uses the design tokens. Verify in the real browser UI —
several defects have been "fixed" in code paths no reader can reach.

## Decisions still needing the owner (use these defaults until told otherwise)

1. **App name — DECIDED (owner, 2026-07): Reverie is the name.** No longer a
   placeholder. Keep reading it from `APP_NAME` in `@reverie/core` (never hardcode);
   `docs/TRADEMARK.md` stays as history.
2. **Household model** — v1 default: one personal library per account; sharing happens
   via shared lists + clubs (defer a true shared household library).
3. **Spoiler gating** — v1 default: honor-based (client-side). Server-enforced via RLS
   is a later upgrade.
4. **Capability-code sharing** — keep it alongside real accounts (frictionless joins).
