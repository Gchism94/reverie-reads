# Roadmap

From single-file prototype → front-end + back-end product. Phased so there's a working
app at the end of each step.

## Phase 0 — Decide (now)
- [ ] Lock the name (see `docs/TRADEMARK.md`) or consciously keep "Reverie" for now.
- [ ] Confirm the stack in `docs/ARCHITECTURE.md` (React+TS+Supabase is the default).
- [ ] Resolve the open decisions: local-first vs. REST; household model; spoiler gating
      honor-based vs. server-enforced; keep capability-code sharing alongside accounts?

## Phase 1 — Backend foundation
- [ ] Stand up Supabase: Auth, Postgres, Storage, Realtime.
- [ ] Implement the relational schema from `docs/DATA_MODEL.md` with row-level security.
- [ ] Seed the first account from `data/personal_seed.json`.
- [ ] Port the **CSV import** and **merge** logic into Edge Functions / typed utils.
- [ ] Cover/metadata **enrichment** Edge Function (Google Books → Open Library → Hardcover).

## Phase 2 — Front-end rebuild (single-user parity)
- [ ] Scaffold React + TS + Vite + Tailwind; wire the design tokens from
      `design/DESIGN_SYSTEM.md` (Nocturne + Magnolia Dawn).
- [ ] Build the component library (spine shelf, cover card, goal ring, filters, chips,
      modals) and the animated night-sky background.
- [ ] Rebuild the screens to parity: Home, Library (+ Series view), Book detail, Shelves,
      Planner (Calendar + Releases), Stats, Match, Add, Settings.
- [ ] Local store (IndexedDB) + sync to backend; offline-first.

## Phase 3 — Multi-user
- [ ] Accounts + multi-device sync (library follows the user).
- [ ] Household library with member identities/roles.
- [ ] Clubs on the backend: read-alongs with per-user progress; shared/club TBRs;
      comments with (optional) server-enforced spoiler gating.

## Phase 4 — Polish & launch
- [ ] Releases/author-following ("coming soon from your authors").
- [ ] Accessibility pass (focus, contrast in both themes, reduced motion).
- [ ] Performance + offline edge cases; backup/export.
- [ ] App-store / domain / name finalization.

## Backlog (from prototype roadmap)
Author-following feed; bulk trope-tagging; whole-library household sync; richer Wrapped.
