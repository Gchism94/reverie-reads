# CLAUDE.md

Context for Claude Code. Read this first, then `docs/DATA_MODEL.md` before touching anything
that stores a book. `docs/CLAUDE_CODE_KICKOFF.md` is the original build plan — history now,
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
- **Possession is four states; per-format ownership is a separate field.** `ownership` is
  `'owned' | 'borrowed' | 'wishlist' | 'unset'` (`unset` is the default — cataloguing a book
  must not force a possession category, and `borrowed` counts as possessed). `owned:
{physical, ebook, audiobook}` answers _which formats_, and only means anything for a
  possessed book. **Never infer possession from the `owned` booleans** — `all-false =
wishlist` was the pre-#68 model and is now wrong. Ask `ownership`, or use
  `bookOwnedFormats`. The **Owned · Physical / Ebook / Audiobook** shelves are _smart shelves_
  derived from both — not manual lists. Ownership is independent of the format read in the
  reread log, and never gates reading history.
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
