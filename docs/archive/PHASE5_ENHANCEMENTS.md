# Phase 5 — enhancements

Three workstreams for the next build phase. The first two form one pipeline
(**fetch → complete → de-dupe/merge**); the third is a separate UI workstream
(**dedicated desktop + installable mobile**). Build step-at-a-time with checks, as before.

---

## 1. Smart de-dupe + merge on import / new data

Every path that brings a book in — manual add, barcode, ISBN/title search, bulk
paste-a-list, CSV import, and API-enrichment results — must check for an existing
duplicate and either **auto-merge** or **let the user choose**, using the **most
complete record as the starting point** and **adding anything new** to it.

**Match keys (priority order)**

1. ISBN-13 / ISBN-10 exact — strongest.
2. Normalized title + primary author (the existing `dupKey`).
3. Normalized title + series + position.
4. Fuzzy title (subtitle/punctuation differences) → **soft** signal: route to review, do
   not auto-merge.

**Pick the primary = "most complete."** Score each candidate by populated, weighted
fields (reads, cover, series info, ISBN, pub date, tropes, rating, owned formats,
reviews). Higher score is primary — **whether that's the existing record or the incoming
one.** (Reuse the prototype's `richness()`.)

**Merge (fold the other into the primary)** — reuse the atomic `merge_books` RPC:

- Multi-value → **union**: reads (dedup by date), tropes, genres, owned formats (OR the
  flags), list/club memberships, reviews.
- Single-value → **fill blanks** from the other; if both differ, keep primary's.
- **Never clobber user-authored data:** `myRating`, user notes, curated tropes, and
  `owned` flags always win over imported/fetched values.
- Cover: keep primary's; else take the other's; enrichment may upgrade a missing/poor one.

**Modes (both required)**

- **Automatic:** merges silently on **strong** matches (ISBN exact, or exact normalized
  title+author); shows a post-import summary ("merged 12, added 134 new").
- **Choice / review:** side-by-side preview per detected duplicate — what's kept, what's
  added — with **Merge · Keep both · Always merge**. Single adds prompt inline.
- A Settings default ("auto-merge duplicates") with a per-import override. Soft/fuzzy
  matches **always** go to review, never auto.

**Acceptance**

- CSV overlapping the library merges by policy: most-complete primary, new info added,
  zero data loss; user-authored fields untouched. Tested in both auto and review paths.
- ISBN match and title+author match both work; a fuzzy near-match lands in review, not
  auto-merged. Bulk "merge all" stays atomic per pair and re-runnable.

---

## 2. API enrichment that completes the record (covers + metadata)

Extend the existing enrichment Edge Function (today: covers via Google Books → Open
Library → Hardcover) to return a **full normalized record** and **complete missing
fields**, feeding the merge policy above.

**Fetch & normalize:** title, author(s), series + position (Hardcover is best here),
publisher, publication date **with precision** (y / m / full), page count, ISBN-10/13,
language, description, subjects → genres, and the best available cover.

**Completion semantics:** fill only **missing** fields on the target; never overwrite
user-entered values; treat the fetched data as a candidate record merged in via §1
(most-complete-wins, fill blanks).

**Sources & caveats** (`docs/reference/DATA_SOURCES.md`): Google Books → Open Library → Hardcover.
KU/indie ASIN-only titles may have no ISBN and no cover from these sources → leave for
manual entry; don't fail the add. Cache results (extend `cover_cache` to a metadata cache
keyed by ISBN/work) and respect rate limits (Google ~1000/day; Open Library 100/IP/5min)
with throttling + backoff.

**Triggers:** auto on add (barcode/ISBN/title/manual); on import for missing fields; a
per-book "Fetch cover & details"; and a bulk "Complete missing covers/info" library
action (throttled, cached, progress shown).

**Acceptance:** add-by-ISBN auto-fills cover + metadata; a sparse imported record gets
completed without clobbering user data; fallback chain + cache verified; graceful "no
cover found → manual" path; bulk completion respects rate limits.

---

## 3. Dedicated desktop version (desktop site + mobile site / app)

Today it's mobile-first responsive. Add a **deliberate desktop layout** (not a stretched
mobile view) while keeping the mobile experience, and ship the mobile as an installable
**PWA**.

**Breakpoints:** mobile < 768 · tablet 768–1024 · desktop ≥ 1024 · wide ≥ 1440.

**Desktop layout**

- Persistent **left sidebar nav** (replaces the mobile top/bottom bar).
- Denser multi-column grids; content max-width on wide screens.
- **Master–detail** where it helps: Library grid/list + book-detail pane; Clubs list +
  discussion; Shelves list + shelf contents.
- Filters as a **docked sidebar** (not a bottom sheet); hover states; keyboard shortcuts
  (e.g. `/` to search); Stats as a horizontal dashboard; spine shelves show more spines.

**Mobile / app**

- Keep the mobile-first UX; make it an **installable PWA**: web app manifest + icons +
  service worker building on the existing **Dexie offline mirror**. (Native via
  Capacitor/React Native is a later option if app-store presence is wanted — deferred.)

**Shared:** both themes (Nocturne / Magnolia Dawn) across all breakpoints; night-sky and
filigree scale appropriately; `prefers-reduced-motion` respected.

**Acceptance:** every screen has an intentional desktop layout (sidebar nav + master–
detail where specced), verified at desktop + wide widths in **both themes**; mobile
unchanged and installable (Lighthouse PWA pass); the both-themes axe smoke runs at a
desktop viewport too.

> Recommended: a short **Claude Design** pass for the desktop screens (sidebar +
> master-detail + dense grid) before implementation, since it's new visual territory.

---

## Decisions (defaults chosen; change any)

1. **Auto vs choice default** → default **review** for the first import, with an
   "always auto-merge" setting; single adds prompt inline.
2. **What auto-merges** → only **strong** matches (ISBN / exact title+author); fuzzy →
   review.
3. **"Most complete" tiebreak on conflicting single values** → keep primary's;
   user-authored fields always beat imported/fetched.
4. **Mobile "app"** → **PWA** now; native deferred.
5. **Desktop design** → do a Claude Design pass first (recommended), or have Claude Code
   implement responsive layouts directly from this spec.

---

## 4. Find your local indie bookstore

Help the reader discover and support independent bookstores near them, and buy in a way
that funds indies instead of Amazon. This is **discover + support**, not live inventory —
no public API exposes per-store stock, so don't promise "in stock near you."

**Location input:** browser geolocation (with consent) or manual ZIP / city. Don't
persist precise coordinates server-side; treat location as ephemeral.

**Discovery (nearby stores):**

- v1 default: **OpenStreetMap Overpass** `shop=books` near the location (free, no key) →
  name, address, hours, phone, website, distance; render a **map + list** in both themes.
  Bias toward independents with a maintained **chain-exclusion list** (B&N, Books-A-Million, etc.).
- Upgrade options (flag for owner): **Google Places** (richer data, ratings, hours; needs
  an API key + billing) and cross-referencing the **ABA / Bookshop.org** participating-
  store directory to mark "verified indie." The ABA/IndieBound finder is members-only and
  has no official public API, so treat it as a verification layer, not the primary feed.

**Buy / support integration:**

- Print & ebook → **Bookshop.org** affiliate links (the "choose your local store" model;
  the chosen store gets the full profit). Let the user **set a default local store**,
  surfaced on book detail as "Buy at <store>".
- Audiobook → **Libro.fm** affiliate links (indie audiobook channel; ties to the
  audiobook ownership format).
- Book detail shows a format-aware "Buy at an indie" action; the standalone "Indie
  bookstores near you" view lists/maps nearby shops with directions + website.

**Owner actions (needed before this ships):** sign up for a Bookshop.org affiliate
account (affiliate ID), a Libro.fm affiliate account, and — if using Google Places — a
Places API key with billing. Verify each service's current terms at build.

**Caveats:** ABA/Bookshop directories are US-centric; POI sources include chains (filter
needed) and have uneven hours/coverage; no live inventory. Non-US or no-results must
degrade gracefully to a Bookshop.org link + "no indies found nearby" empty state.

**Acceptance:** a test location returns nearby bookstores on a map + list in both themes,
independents flagged, chains excluded; book detail offers a format-aware indie buy link
(Bookshop.org for print/ebook, Libro.fm for audio); a default local store can be set and
persists; graceful empty/non-US states; geolocation is consented and not persisted.

### Decision (default chosen; change it)

6. **Nearby-store source** → v1 **OSM Overpass + chain-exclusion** (free, no key);
   upgrade to **Google Places + ABA/Bookshop cross-ref** later for verified-indie quality.
