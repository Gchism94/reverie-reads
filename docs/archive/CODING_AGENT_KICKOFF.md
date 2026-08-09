# coding agent kickoff

A sequenced, agent-friendly build plan. Each step is small and ends with a check. Work
top to bottom; commit at each checkpoint. Full context is in `AGENTS.md` and `docs/`.

## Paste-to-start prompt

> Read `AGENTS.md` and `docs/archive/CODING_AGENT_KICKOFF.md`. Then do Step 1 (scaffold) and stop
> for review. After I approve, continue one step at a time, committing at each checkpoint.
> Use the decided stack; keep both themes (Nocturne default + Magnolia Dawn) wired from
> `design/DESIGN_SYSTEM.md`; port — don't rewrite — the prototype's tested logic.

---

## Step 1 — Scaffold

- pnpm monorepo: `apps/web` (React+TS+Vite+Tailwind+TanStack Router/Query),
  `packages/core` (types + logic), `supabase/`.
- ESLint + Prettier + Vitest + Playwright configured; the `pnpm` scripts in `AGENTS.md`.
- Wire design tokens for **Nocturne** (default) and **Magnolia Dawn** as CSS vars +
  Tailwind theme; add the Fraunces + Hanken Grotesk fonts.
- **Check:** `pnpm dev` renders a themed shell with a working light/dark toggle;
  `pnpm lint` and `pnpm test` pass.

## Step 2 — Backend foundation

- Migrate `backend/supabase_schema.sql` into `supabase/` and expand to the relational
  schema in `docs/reference/DATA_MODEL.md` (profiles, books, reads, lists/list_items, clubs/…),
  with row-level security scoped to the user.
- Supabase Auth (magic-link). A `profiles` row on signup.
- **Check:** `supabase start` + migrations apply; a signed-in user can CRUD their own
  `books` and nothing else (RLS verified by test).

## Step 3 — Shared core (`packages/core`)

- TypeScript types for Book / List / Read / Club from `docs/reference/DATA_MODEL.md`.
- Port with unit tests: **merge engine**, **CSV importer** (Goodreads/StoryGraph),
  **spoiler-gate** rule. Port cover-URL helpers.
- **Check:** Vitest covers merge (unions reads/tropes/lists, dedup), CSV parse, and the
  gate (`unit <= progress`).

## Step 4 — Data layer + seed

- Supabase client + TanStack Query hooks (books, lists, reads) with optimistic writes.
- Import `data/personal_seed.json` (290 books) as the dev account's seed.
- **Check:** the app reads/writes books through the backend; seed shows up.

## Step 5 — First vertical slice: Library + Book detail

- Library: cover grid, search, filter panel (tropes, subgenre, series status, series
  length incl. **"None set"**, reading status, format, faves, sort), Grid ⇄ Series view
  (owned-of-total, gap badges, set length). Show small owned-format icons on cards.
- Book detail: tropes/spice, the reader's own rating (no aggregate), reading status +
  progress, **per-format ownership toggles** (physical/ebook/audiobook), **reread log**
  (date/format/rating/notes), an opt-in **Reviews** list (others' individual reviews,
  never averaged), add-to-shelf chips, Merge…, edit/remove.
- **Check:** behavior matches the prototype + the ⭐ items in `docs/reference/REQUIREMENTS.md`;
  both themes; mobile + desktop; a11y pass.

## Step 5b — Owned smart-shelves + mass tools

- Shelves: auto **Owned · Physical / Ebook / Audiobook** shelves derived from `owned`
  (separate shelves, pinned above manual TBRs/collections), with live counts.
- **Mass import** (CSV + bulk ISBN/title) and **mass merge** (resolve all detected
  duplicate groups in one flow; run de-dupe after import).
- **Check:** toggling ownership moves a book into the right owned shelf instantly; a CSV
  import lands many books and auto-dedupes.

## Step 6 — Remaining screens to parity

Home (greeting, goal ring, reading-now progress, priority shelf, coming-soon) · Shelves
(TBRs incl. priority + Collections as spine shelves) · Planner (Calendar with/without
rereads + planned dates; Releases with flexible precision) · Stats ("Wrapped") · Match ·
Add (barcode + ISBN/title search + manual) · Settings (theme, goal, backup/restore, CSV
import, merge duplicates).

- **Check:** each screen matches `docs/reference/FEATURES.md` and the design.

## Step 7 — Multi-user

- Accounts + multi-device sync (library follows the user).
- Clubs on the backend: read-alongs (per-user progress), shared/club TBRs, comments with
  the spoiler gate; Realtime for live updates; keep capability-code joins.
- Household per the owner decision (default: lists/clubs sharing only for v1).
- **Check:** two accounts can share a list and run a read-along; comments stay gated.

## Step 8 — Offline + polish

- Dexie offline mirror + background sync; optimistic UI everywhere.
- Server-side enrichment Edge Function (Google Books → Open Library → Hardcover;
  see `docs/reference/DATA_SOURCES.md`); CSV import as an Edge Function.
- Accessibility + performance pass; backup/export; reduced-motion verified.
- **Check:** works offline and reconciles on reconnect; Lighthouse/a11y clean.

---

## Guardrails

- Don't extend the 262 KB single-file prototype — it's reference only.
- Don't hardcode colors or the app name.
- Keep exactly two themes.
- Reuse the prototype's tested logic; don't reinvent it.
- Stop at each checkpoint for review rather than running the whole plan unattended.
