# Task: Discover Search

> **Status: shipped in #55.** This is the brief the work was built against, not a description of
> how the app behaves today. For current behavior, read the code and `docs/reference/DATA_MODEL.md`.

**Branch:** `feat/discover-search`
**Dependencies:** `feat/ownership-model` merged (add-as-unowned actions). Pairs with the picker seam left in `feat/shelf-system`.
**Golden rule applies:** eyeball on the real authenticated app before merge.

## Context

Launch feedback: "you cannot search in discover, it only gives you a short list of 'you could enjoy' books." Discover currently serves only the Tier 2b taste-ranked rail. Add real search without displacing it — the rail is the personality; search is the utility.

## 1. Search

- A search field at the top of Discover: title / author / ISBN.
- **Sources:** Hardcover as primary via the backend (backend-only per architecture; 60 req/min — debounce input ≥400ms, minimum 3 chars, cache query results server-side with a short TTL). Google Books as secondary fill for misses. Note: a server-side Google Books key for an edge proxy is planned but may not exist yet — if absent, use the referrer-restricted client key from the client for the Google leg and leave a clearly-marked seam for the proxy; do not create new keys.
- **Results:** cover (honest placeholder if none — same policy as import-quality), title, author, year, series name if the source provides it. De-dupe against the user's library: books already in the library render with their state ("On your shelf ✓") instead of add actions.

## 2. Actions on a result

- **Add to library** → owned record.
- **Add to shelf/TBR** → picker of the user's shelves/TBRs → unowned record placed there (ownership-model context default).
- Both actions pull full metadata from the source at add time (don't store thin stubs). If series data comes with it and series-experience has merged, link/create the series.

## 3. Wire the shelf picker seam

- `feat/shelf-system` left a stubbed "search everywhere" path in the per-shelf add picker. Wire it to this same search backend so adding an unowned book to a TBR works from the shelf itself, not only from Discover. One search implementation, two surfaces.

## 4. Keep the rail

- The taste-ranked "you could enjoy" rail remains, below or beside search, untouched in logic. Empty search state = the rail; search results replace it only while a query is active.

## Out of scope

Ranking changes to the taste model, the unresolved per-shelf cosine display band question (still open, still Greg's call), releases/author-following, any social/consensus signals in results (no average ratings, review counts, or popularity badges — anti-consensus thesis holds in Discover too).

## Acceptance / eyeball checklist

- [ ] Search a known title → results with covers; a library-owned book among results shows its state instead of add buttons
- [ ] Add a result to library (owned) and another to a TBR (unowned); both land correctly with full metadata
- [ ] Shelf picker's "search everywhere" finds and adds the same way
- [ ] Rapid typing doesn't spray requests (verify debounce + cache in network tab); Hardcover rate limit respected
- [ ] Clearing search restores the taste rail intact
- [ ] Eyeballed across ≥3 skins; contrast test, axe, full suite green

## Completion report

Report: search architecture (backend endpoints, caching TTLs, source-fallback logic), the Google key seam status, de-dupe strategy, picker wiring, rate-limit safeguards, surfaces eyeballed, test results.
