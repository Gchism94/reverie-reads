# Changelog

Prototype milestones (single-file web app). Dates approximate.

## Prototype 0.2 — overhaul + merge
- Home dashboard (greeting, goal ring, reading-now progress, priority shelf, coming-soon).
- Stats / "Your Reading, Wrapped".
- Library Grid ⇄ Series view (owned-of-total, gap badges, set series length).
- Collections rendered as spine shelves (parity with TBRs).
- Theme toggle; Settings with JSON backup/restore + Goodreads/StoryGraph CSV import.
- **Merge duplicates** (contact-style): auto-detect + manual, unions reads/tropes/
  genres/cover/rating/series/lists; tested in isolation.
- Navigation refactor: Home · Library · Shelves · Planner · Stats · Match · Clubs · Add.

## Prototype 0.1 — clubs & sharing
- Capability-keyed sharing layer (Supabase REST → window.storage → local export codes).
- Shared lists + book-club TBR (everyone edits).
- Read-alongs with spoiler-gated comments (unlock at your chapter).

## Prototype 0.0 — core library
- Multiple TBRs + priority; collections; deep filters incl. series "None set".
- Reread log (date/format/rating/notes); flexible publish dates.
- Reading calendar (with/without rereads, planned dates); barcode add.
- Cover enrichment (Google Books → Open Library), cached.

## Pre-Reverie
Nightshade scanner → Swoon community concept → pivot to Reverie personal library.

---

## Next: see ROADMAP.md (front-end + back-end rebuild).
