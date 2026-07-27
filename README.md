# Reverie

Reverie is a personal book library. It tracks the books you own and read behind a
skinnable, genre-neutral interface — nine distinct "skins" (romance, fantasy, sci-fi,
horror, mystery, literary, cozy, nonfiction, YA) that reskin the whole app to the shelf
you're in. Its guiding idea: **your own taste should drive discovery**, so the app ranks
what to read next against *your* library rather than aggregated star ratings — it never
computes or shows an averaged rating.

It handles spice levels, tropes, series gaps, rereads, per-format ownership, cover
sourcing, offline caching, and a book-club layer, and calibrates a personal "taste tier"
for recommendations from your own loved books.

## Stack

- **Web:** React + TypeScript (strict) + Vite + Tailwind (design tokens) + TanStack
  Router/Query, light Zustand state, IndexedDB (Dexie) offline cache.
- **Backend:** Supabase — Postgres (with `pgvector` for taste/semantic search), Auth,
  Realtime, Storage, Edge Functions (Deno).
- **Repo:** pnpm-workspaces monorepo — `apps/web` (UI), `packages/core` (shared logic),
  `supabase/` (migrations + functions).
- **Hosting:** Vercel (web) + Supabase (backend).

## Local setup

**Prerequisites:** Node ≥ 20.11, `pnpm` 11, the [Supabase CLI](https://supabase.com/docs/guides/cli),
and Docker (for the local Supabase stack).

```bash
pnpm install
supabase start          # local Postgres + Auth + Storage + edge runtime
pnpm db:migrate         # apply migrations + reload the PostgREST schema
pnpm db:seed            # optional: load the dev library
pnpm dev                # run the web app
```

### Environment variables (names only — never commit values)

Copy `.env.example` / `apps/web/.env.example` to the matching `.env.local` and fill in your
own values. Names only:

- **Required:** `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_GOOGLE_BOOKS_KEY`
  (referrer-restricted).
- **Optional:** `VITE_SENTRY_DSN`, `VITE_SOCIAL_AUTH_ENABLED`,
  `VITE_BUY_ATTRIBUTION_MODE`, `VITE_BOOKSHOP_AFFILIATE_ID`.
- **Set by the build, not by you:** `VITE_BUILD_ID` and `VITE_RELEASE` are both baked to the
  deploy's commit SHA by a `define` in `apps/web/vite.config.ts`. Setting either in a `.env`
  has no effect — the define substitutes them at build time.
- **Server / edge secrets** (deployment environment only — never in the repo): the Supabase
  service-role key, `HARDCOVER_TOKEN`, and any provider API keys. See `docs/DEPLOY.md`.

The publishable anon key is client-safe by design; the service-role key and all API keys
are not and live only in deployment secrets.

### Commands

```bash
pnpm dev      # web app (Vite dev server)
pnpm build    # production build (core tsc + web tsc/vite)
pnpm test     # unit tests (Vitest, all packages)
pnpm e2e      # Playwright end-to-end (includes the axe sweep — four skins x both modes)
pnpm lint     # ESLint
```

## Deploy discipline

Production deploys run **from `main`, after a PR merges**, through the guarded scripts —
never from a feature branch mid-flight:

```bash
pnpm deploy:migrations    # supabase db push, behind the deploy guard
pnpm deploy:functions     # supabase functions deploy, behind the deploy guard
```

The guard refuses to run unless you're on a clean, in-sync `main` and confirm the touch
list. Full runbook: [`docs/DEPLOY.md`](docs/DEPLOY.md).

## License

**Proprietary — all rights reserved.** See [`LICENSE`](LICENSE). A limited training-fork
grant allows designated collaborators to run and modify the code locally for personal
learning and for contributions back to this repository; no redistribution, production
deployment, or commercial use. Contributions are accepted under that grant — see
[`CONTRIBUTING.md`](CONTRIBUTING.md).

Book cover images and bibliographic metadata are **third-party** and not the repository
owner's to license — see [`NOTICES.md`](NOTICES.md).

## Build-phase docs (working notes)

> These are internal working notes from the build-out, kept for continuity. They are not
> onboarding docs for a new reader of the repo.

- `AGENTS.md` — context loaded by coding agent; the working conventions.
- `docs/CODING_AGENT_KICKOFF.md` — the sequenced build plan.
- `ROADMAP.md` — path from prototype to shipped product.
- `docs/ARCHITECTURE.md`, `docs/DATA_MODEL.md`, `docs/FEATURES.md`,
  `docs/REQUIREMENTS.md` — specs and object shapes.
- `prototype/Reverie_Library.html` — the original single-file prototype (behavior
  reference; not the code that ships).
