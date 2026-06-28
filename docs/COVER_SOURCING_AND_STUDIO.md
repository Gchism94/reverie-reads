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

## Build status (updated 2026-06-28)
- DONE — API auto-fetch (Part 1): title+author search -> ISBN self-resolution -> cover, across
  Hardcover -> Google -> Open Library, deployed live; covers cached to Storage/CDN (non-blocking, async)
  and globally cached. Measured ~87% cover / 87% ISBN on a 30-title real-Library sample (Hardcover
  dominant). Confidence tiers stored; a no-confident-match attaches NO cover (-> missing-cover triage).
- DONE — confidence persisted (books.cover_confidence) + the E3 import-review read-model
  (summary + buckets: missing / low-confidence / broken / odd-genre / likely-duplicate) + the /review
  screen rendering it (summary, genre breakdown, cover triage, lists).
- DONE — Cover Studio pillar #3 (skin-themed typographic placeholder) as a reusable fill-parent
  component, adopted across cover-render sites via <CoverImage> (cover -> placeholder fallback +
  dead-link detection). Remaining adoption: CoverCard + BookDetailRail (deferred until the in-flight
  desktop-align effort lands).
- DONE — broken-cover detection (client onerror -> brokenCover bucket + AGGREGATED Sentry summary).
- IN PROGRESS — Cover Studio actions: pick a found edition (E1 alternates) / use the themed placeholder.
  The full Studio surface (batch triage UX, upload, phone photo) remains DESIGN-gated + needs a per-user
  RLS Storage bucket for uploads/photos.

---

## Cover durability + dead-link handling (added 2026-06-27)
Context: in the current tool, covers are external image LINKS (and the export drops them). External links rot.

PRINCIPLE: Reverie stores covers as OWNED, cached images in Storage/CDN (extends H2) -- NEVER as bare
external links. Every entry path materializes to Storage: API enrichment (already), URL paste, upload,
phone photo, AND any imported cover links. A cover then cannot break because of someone else's server.

- IMPORT of existing cover links (IF the source can export the link column): fetch each -> cache to
  Storage -> done. Highest fidelity (preserves the exact covers currently shown), skips title+author
  matching for those books, and is immune to rot. Dead-at-ingest links -> missing-cover triage.
  ACTION: check whether the current tool can export the cover-link column; if yes, it's the PRIMARY
  cover source (coverage jumps immediately) and APIs+Studio only fill genuine gaps.
- DEAD/BROKEN detection (safety net, lean): client-side image onerror marks a cover broken -> adds it to
  the Cover Studio "needs attention" queue. No cron needed for v1 (caching makes bare links rare; a
  periodic server HEAD-sweep is optional/later).
- NOTIFICATION (decision 2026-06-27): use SENTRY for now -- broken-cover detection (client onerror)
  calls the existing captureMessage wrapper (H4) -> Sentry. This is OWNER/dev telemetry (you see it),
  NOT user-facing; fine as a stopgap while Greg is the primary user. Add the user-facing in-app "needs
  attention" badge LATER when other users manage their own covers.
  CAVEATS: (1) needs the Sentry DSN provisioned (parked owner action promoted to near-term) or events
  route to console only; (2) QUOTA -- do NOT log one event per broken cover (the import cover-tail can be
  hundreds -> would burn the 5K/mo free tier and drown real errors); AGGREGATE to a summary count
  ("import finished, N covers unresolved/broken") or rate-limit/sample broken-cover events.
- COVER-LINK EXPORT: NO -- the current tool can't export the cover-link column. So APIs + manual (Cover
  Studio) is the path; the hit-rate run's job stays "find covers" and the resulting tail size matters.

READ-MODEL (E3): add needsLook.brokenCover (distinct signal: had a cover, now dead -- vs missingCover =
never resolved). coverTriage = missingCover + lowConfidenceCover + brokenCover; the Studio "needs
attention" surfaces all three.
