---
description: Deploy migrations and/or edge functions to production through the deploy guard
argument-hint: migrations | functions
---

Deploy to production: $ARGUMENTS

## Refuse unless all of these hold

- On `main`, clean tree, in sync with `origin/main` (nothing unpushed or unpulled)
- The change is merged — never deploy from a feature branch
- The user's instruction names deployment explicitly

Report and stop if any fails. Approval to merge is **not** approval to deploy.

## How

Only through the guard — it enforces main + clean + in-sync + a `y/N`:

- `pnpm deploy:migrations`
- `pnpm deploy:functions`

Never run `supabase db push` or `supabase functions deploy` directly. See `docs/DEPLOY.md`.

## Before

List what will deploy — `supabase migration list` for the local/remote gap — and show the user
that list. A migration on `main` but not in production means prod is running code expecting
columns it doesn't have; say so.

## After

Confirm what landed and what remains. Report failures with the guard's output verbatim.
