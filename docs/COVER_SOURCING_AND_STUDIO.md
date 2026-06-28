# Cover sourcing strategy + Cover Studio

## Context
The real import files (Library, Chism) carry NO cover URLs and NO ISBNs -- only title/author/series/
genre/tags/read-status. So covers can't be imported directly; they must be sourced. Decision (Greg,
2026-06-27): best-effort via the APIs, manual entry for the rest, with a first-class user-facing way to
add covers easily (the "Cover Studio").

## Part 1 -- API auto-fetch (best effort)
Run during enrichment (reuses D1 aggregator + H2 cover-caching to Storage/CDN):
- Match by TITLE + AUTHOR (no ISBN in the data). Adapters must support a title+author SEARCH path,
  not ISBN-only lookup.
- SELF-RESOLVE an ISBN from the search result, then fetch the best cover from that ISBN. The resolved
  ISBN also improves all other enrichment. This is what makes covers work without manual ISBN entry.
- Source priority for THIS catalog (romance/romantasy/fantasy/horror, indie-heavy):
  Hardcover (best romance/indie coverage) -> Google Books -> Open Library. ISBNdb (paid, deferred)
  would mop up more of the tail if enabled later.
- Cache every fetched cover to Storage/CDN (H2). Record match confidence (exact title+author vs fuzzy)
  so low-confidence matches can be surfaced for review (wrong-cover risk is real with title-only match).
- Expect a strong majority to auto-populate; a meaningful tail (indie/obscure/ambiguous titles) will
  miss or mis-match -> handled by the Cover Studio.

## Part 2 -- Cover Studio (the manual surface; deliberately NOT a Hardcover clone)
PURPOSE: Hardcover/Open Library/Goodreads maintain ONE canonical cover per book, shared by everyone.
Reverie is a PRIVATE, personal library. The Cover Studio exists for the opposite reason: to make your
library faithfully and beautifully YOURS -- your editions, your copies, your aesthetic -- where catalogs
only offer the generic canonical version. A cover is a personal expression of your shelf, not a data
field to get "right." One-liner: "Hardcover catalogs the book; the Cover Studio curates your copy of it."

PILLARS:
1. EDITION-FAITHFUL, not canonical. Offer the editions the APIs found and let the user pick the one
   that matches the copy they own (special/illustrated/signed editions common in romance/romantasy).
2. PHOTOGRAPH YOUR COPY. Snap the physical book (mobile) -> becomes the thumbnail. Mirrors the real
   shelf, including editions no database tracks. Structurally impossible for a shared catalog.
3. SKIN-THEMED PLACEHOLDERS for cover-less books. Generate a typographic cover from the ACTIVE skin's
   tokens (display font + palette) client-side -- instant, free, offline, always on-brand. No AI image
   gen needed (could be an optional later flourish). Rides the skin system = uniquely Reverie.
4. COVER TRIAGE as a calm batch ritual. The post-import "missing / low-confidence covers" queue is a
   quick swipe-through: pick a found candidate / upload / snap a photo / use a themed placeholder /
   skip. Bounded + satisfying, not open-ended cleanup.
5. PRIVATE + LEAN. Covers live in the user's own Storage under RLS. No shared pool, no community
   editing, no moderation queue -- consistent with the v1 lean scope and the non-overlap with Hardcover.

WHERE IT LIVES:
- Batch: the onboarding/import REVIEW screen surfaces a "missing or low-confidence covers" bucket ->
  enters Cover Studio triage. (Acceptance hook for the onboarding/import build.)
- Anytime: each book's detail has an "edit cover" entry into the same Studio options, so curation is
  ongoing, not just at import.

## Build hooks
- ENRICHMENT (Claude Code): add title+author search + ISBN self-resolution + cover fetch + confidence
  score; cache via H2. (Extends D1; informs the import task.)
- ONBOARDING/IMPORT review acceptance: include the missing/low-confidence covers batch -> Studio.
- DESIGN backlog: Cover Studio is a new user-facing surface -> its own Claude Design prompt (book-detail
  cover editor + batch triage + themed-placeholder preview across skins).
