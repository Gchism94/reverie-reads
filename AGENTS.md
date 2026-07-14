# AGENTS.md

Context for coding agent. Read this first, then `docs/CODING_AGENT_KICKOFF.md` for the
sequenced build plan. Keep this file updated as the project evolves.

## What this is
Reverie — a personal library app for romance / romantasy / dark-romance readers
(spice levels, tropes, series gaps, rereads, plus a book-club layer), with a gothic
New Orleans look. We have a complete single-file **prototype** and a finished **design**;
this phase builds the real front end + back end.

## Status & your job
- `prototype/Reverie_Library.html` = the current working app and **feature reference**.
  It is NOT the codebase to extend — rebuild properly. Behavior parity is the bar.
- Design is done; canonical tokens/components are in `design/DESIGN_SYSTEM.md`. If design
  exports exist, they're in `design/from-design-tool/`.
- Build the product per `ROADMAP.md` / `docs/CODING_AGENT_KICKOFF.md`, starting with a
  scaffold and a first vertical slice (Library + Book detail).

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

## Target layout (create these; keep existing folders as reference)
```
apps/web/            React app (UI, routes, components)
packages/core/       shared TS types + ported logic (merge, CSV import, spoiler gate)
supabase/            migrations, edge functions, seed (migrate backend/supabase_schema.sql here)
prototype/ data/ design/ docs/ backend/   ← reference material, not shipped
```

## Where the answers live
- Features to match → `docs/FEATURES.md`, `docs/REQUIREMENTS.md`
- Architecture & API surface → `docs/ARCHITECTURE.md`
- DB schema & object shapes → `docs/DATA_MODEL.md`
- Design tokens (two themes), type, motion, components → `design/DESIGN_SYSTEM.md`
- Cover/metadata/release data sources → `docs/DATA_SOURCES.md`
- Sharing & book-club design → `docs/SHARING.md`
- Seed data → `data/personal_seed.json` (290 real books); design-ready subset in
  `data/reverie_design_seed.json`

## Conventions
- TypeScript strict; functional components + hooks; small, focused modules.
- **No hardcoded colors** — use the design tokens (CSS vars / Tailwind theme) for both
  **Nocturne** (dark, default) and **Magnolia Dawn** (light). Those are the only two
  themes. (Nocturne has no crimson — magenta/violet/midnight-blue/gold.)
- Mobile-first; responsive to desktop.
- Accessibility is part of done: visible keyboard focus, adequate contrast in both
  themes, and **respect `prefers-reduced-motion`** (disable the night-sky drift/twinkle).
- **Port, don't rewrite** the prototype's already-tested logic: the merge engine, the
  Goodreads/StoryGraph CSV importer, and the spoiler-gating rule (`comment.unit <=
  myProgress`). Move them into `packages/core` with tests.
- Copy stays sentence case, plain verbs, no filler; empty states invite action.
- **Per-format ownership.** A book carries `owned: {physical, ebook, audiobook}` (toggles
  on book detail; physical may split paperback/hardcover). The **Owned · Physical /
  Ebook / Audiobook** shelves are *smart shelves* derived from those flags — separate
  shelves per format, not manual lists. Ownership is independent of the format read in
  the reread log.
- **No aggregate rating.** Never compute or display an averaged star rating anywhere.
  Keep the reader's own rating (`myRating` + per-read). Others' opinions appear only as
  an opt-in list of **individual** reviews on the book screen — never a single number.
- **Mass import + mass merge.** Bulk-add (CSV today; bulk ISBN/title) and a bulk
  de-dupe flow that resolves all detected duplicate groups at once (run on import).
  Reuse the ported merge engine.

## Commands (create these scripts during scaffold)
```
pnpm dev            # run web app
pnpm build          # production build
pnpm test           # unit tests (Vitest)
pnpm e2e            # Playwright
pnpm lint           # ESLint
supabase start      # local stack
pnpm deploy:migrations   # prod db push — via the deploy guard (main + clean + confirm)
pnpm deploy:functions    # prod functions deploy — via the deploy guard
```

## Shell & deploy safety
- **Never run a raw `supabase db push` / `supabase functions deploy` against prod.** Go through the
  guard (`pnpm deploy:migrations` / `pnpm deploy:functions`) — it enforces main + clean tree + in-sync
  + a `y/N`. Prod deploys happen from `main` after merge, never a feature branch (override is a loud,
  deliberate exception). See `docs/DEPLOY.md`.
- **Heredocs containing shell examples MUST be single-quoted** — `<<'EOF'`, not `<<EOF` — so backticks
  and `$(…)` inside are text, never evaluated. This applies to any heredoc feeding `gh pr create
  --body`, commit messages, or reports.
- **A deploy command must never appear as an un-quoted literal** in a PR body, commit message, or
  report. Write it fenced/inline in a single-quoted heredoc or a `--body-file`; an un-quoted
  `` `supabase functions deploy …` `` in a double-quoted string executes. (Codifies the 2026-07-14
  heredoc-eval incident, which deployed a function to prod from a PR-body backtick.)

## Definition of done (per feature)
Works against the data model; both themes; responsive; a11y pass; logic covered by
tests; matches the prototype's behavior and the design tokens.

## Decisions still needing the owner (use these defaults until told otherwise)
1. **App name — DECIDED (owner, 2026-07): Reverie is the name.** No longer a
   placeholder. Keep reading it from `APP_NAME` in `@reverie/core` (never hardcode);
   `docs/TRADEMARK.md` stays as history.
2. **Household model** — v1 default: one personal library per account; sharing happens
   via shared lists + clubs (defer a true shared household library).
3. **Spoiler gating** — v1 default: honor-based (client-side). Server-enforced via RLS
   is a later upgrade.
4. **Capability-code sharing** — keep it alongside real accounts (frictionless joins).
