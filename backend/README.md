# Backend

This folder holds the back-end pieces. Today that's just the prototype's sharing schema;
the real backend gets built here in Phase 1 (see `../ROADMAP.md`).

## `supabase_schema.sql` (current)
The prototype's sharing backend: a single capability-keyed document table
(`shared_docs`) where a random share code grants read/write. Good enough for a household
or club today; **not** the full relational model.

## What replaces/extends it (Phase 1)
The relational schema in `../docs/reference/DATA_MODEL.md` — accounts (`profiles`), `books`,
`reads`, `lists`/`list_items`, `households`/`household_members`, `clubs`/`club_members`/
`club_comments` — all under row-level security, plus:
- **Auth** (email magic-link + OAuth).
- **Realtime** subscriptions for live shared lists and club activity.
- **Storage** for cached covers, CSV uploads, and backups.
- **Edge Functions** for: cover/metadata enrichment (Google Books → Open Library →
  Hardcover; see `../docs/reference/DATA_SOURCES.md`), Goodreads/StoryGraph CSV import, and the
  merge operation.

## Decisions to make first
- Keep capability-code sharing alongside real accounts, or replace it.
- Spoiler gating: honor-based (client) vs. server-enforced via RLS/RPC.
- Household: one shared library vs. linked personal libraries.

See `../docs/reference/ARCHITECTURE.md` for the full picture.
