# Production deployment

Reverie runs hosted as of 2026-07-06. This file is the record of the production topology and
the runbook for shipping to it. Owner decisions: **Reverie** is the name (2026-07);
**reveriereads.app** is the domain (2026-07-06).

## Topology

| Piece | Where | Notes |
|---|---|---|
| Backend | Supabase project `tzimctugmzuadrsitnpr` (us-west-2) | Postgres + Auth + Storage + Edge Functions; pgvector enabled |
| Web app | Vercel — https://reveriereads.vercel.app | custom domain: reveriereads.app |
| External APIs | Google Books (keyed, client-side) | key lives in env, never committed |

## Web env (Vercel project settings)

```
VITE_SUPABASE_URL=https://tzimctugmzuadrsitnpr.supabase.co
VITE_SUPABASE_ANON_KEY=sb_publishable_kp8TvVCeARWRqqk4z0a0CA_35y5KZgQ   # publishable — client-safe by design
VITE_GOOGLE_BOOKS_KEY=<the referrer-restricted Books key>
# optional: VITE_SENTRY_DSN, VITE_SOCIAL_AUTH_ENABLED, VITE_BUY_ATTRIBUTION_MODE + affiliate ids
```

## Shipping changes

- **Schema**: `supabase db push` (repo is linked to the project; `supabase migration list` to
  compare local↔remote first). Local dev uses `pnpm db:migrate` (adds the PostgREST schema reload).
- **Edge functions**: `supabase functions deploy` (all) or `supabase functions deploy embed` (one).
- **Web**: Vercel deploy (git-connected or `vercel --prod`).

## Post-deploy configuration checklist (dashboard tasks)

- [ ] Supabase → Auth → URL Configuration: site URL + redirect URLs include
      `https://reveriereads.vercel.app` and `https://reveriereads.app` — magic links bounce without it.
- [ ] Google Cloud console → Books API key referrers: `https://reveriereads.vercel.app/*`,
      `https://reveriereads.app/*`, plus localhost patterns (`http://localhost:4317/*`,
      `http://localhost:5173/*`) so local dev keeps the key's quota.
- [ ] Optional fn secrets (`supabase secrets set`): `HARDCOVER_TOKEN` (enrichment source),
      `ISBNDB_ENABLED`/`ISBNDB_KEY` (paid, off by default), `SENTRY_DSN` (edge observability).

## Smoke test

A throwaway user exercises the full lifecycle against production, then deletes itself through
the real `delete-account` fn: sign-in → profile trigger → book inserts → embed sweep (hosted
Supabase.ai — the piece local dev can't fully mirror) → `similar_books` / vibe / rank →
`match_feedback` write → cleanup. Email confirmation is ON in prod, so the smoke account needs
its confirm link clicked once.

## Local ↔ prod

Local dev is the full mirror (`supabase start`, seeded dev user, `apps/web/.env.local` pointing
at 127.0.0.1:55321). Known divergence: the local edge runtime is ~10× slower per gte-small
inference — the embed fn's time-budgeted batching absorbs this (few embeds/call locally, full
batches hosted), so behavior differs only in backfill speed.
