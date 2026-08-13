# Audit: Discover recency — data problem or ranking problem?

Audited: 2026-08-05 · against the live Google Books API (the deployed fn's own key +
referer), the deployed `releases` function (ACTIVE, v2, deployed 2026-08-02 — postdates
the last code change to it, so deployed = `supabase/functions/releases/index.ts` as in
this repo), and the app code on `main` (`9929373`). AUDIT ONLY — no fix proposed here.

## Verdict up front

**It is a data problem, and the ranking is affirmatively not the culprit — it is the
only thing fighting the data.** Discover has no corpus of its own: every shelf is a
live window onto Google Books `subject:` queries, and for the big fiction genres that
window is structurally backlist. The server-side ranking is recency-FIRST (year-tiered:
last 2 years → last 8 → everything else), and measured surfaced-2020+ **exceeds**
pool-2020+ in every genre — the ranking amplifies what little recency exists; it never
suppresses it. The bottleneck is candidate acquisition: the reachable pool itself.

Two structural causes, both upstream of any code in this repo:

1. **Google's subject vocabulary is rich on backlist and nearly absent on recent trade
   frontlist.** Every major 2023–2025 release checked carries the bare category
   `['Fiction']` in Google's index — Funny Story (2024), Just for the Summer (2024),
   Fourth Wing (2023), The Will of the Many (2023), Project Hail Mary, Later (2021),
   Holly (2023), You Like It Darker (2024), Bury Your Gays (2024), The Thursday Murder
   Club, Vera Wong's Unsolicited Advice for Murderers (2023). None of these can EVER
   match `subject:romance` / `subject:horror` / `subject:mystery` — they are invisible
   to Discover's queries at any ranking weight. The two exceptions prove the mechanism:
   Divine Rivals carries `['Young Adult Fiction']` (and YA's pool is measurably
   fresher), and cozy titles do carry `subject:"cozy mysteries"` (and Cozy's pool is
   85–90% 2020+ — the healthiest shelf in the app, and the inverse of the complaint).
2. **The reachable window is tiny and got smaller.** Google now returns **20 items per
   page regardless of `maxResults=40`** (verified directly: `maxResults=40` →
   `items: 20`, `totalItems: 300`), so the fn's designed 40+40 candidate pool is
   actually 20+20 → ~16–20 after dedupe. The full paginated window tops out at ~300
   items per query — that ~300-item, backlist-dominated window IS the entire corpus
   Discover can ever see for a genre.

## What Discover actually is (read from code, not guessed)

- `apps/web/src/lib/discover.ts` — nine genre chips map to Google `subject:` queries
  (`GENRE_DISCOVER_QUERY`). `fetchDiscover` calls the `releases` edge fn
  (`mode: 'discover'`, per-genre 24h shared cache); fallback on fn failure is a direct
  client fetch: 20 `orderBy=newest` (+relevance filler if <9), **no year tiering**,
  slice 12.
- `supabase/functions/releases/index.ts` — `fetchDiscoverShelf`: both orderings
  (requests 40 each, receives 20 each), quality gate (title+cover+author), dedupe, then
  **tier by real year**: `fresh` (≥ thisYear−2, newest-first) → `recent` (≥ thisYear−8)
  → `rest`; slice 12. Missing-year hits fall to `rest` (year 0), so absent dates
  demote, never promote.
- `DiscoverRoute.tsx` — one flat grid of the ≤12 hits. Taste re-ranking (Tier 2b,
  `rankHitsByTaste`/`sortByTaste`) **re-orders** the grid toward the reader's taste
  centroid but cannot change membership — all hits render either way.
- **The reader's own corpus is never consulted for candidates.** Nothing in the path
  reads `books`, `corpus_seed.json`, or any local dataset. (The library feeds only the
  taste centroid used for ordering, and the "owned" badge.)

## 1 · Corpus side

**There is no local corpus behind Discover — that is the first finding.** The question
"does the corpus have 2020+ titles in these genres" resolves to two different objects:

**(a) The repo's own corpus (`data/corpus_seed.json`, 290 books): carries no
publication year at all.** No pub field exists in the file (fields: id, title, first,
last, series, position, seriesCount, isbn, genres, subgenre, tropes, status, spice) and
`scripts/seed-dev.mjs` maps `pub_y: b.pub?.y ?? null` — always null. Per-category
recency of the local corpus is **unmeasurable**, which the audit brief anticipated as
itself a finding. (It is also moot for this complaint, since Discover never reads it.)

**(b) The effective corpus — Google's reachable window per subject query.** Measured
two ways with the fn's own key + referer:

Fn-depth pool (exactly what `fetchDiscoverShelf` sees: 20 newest + 20 relevance,
quality-gated, deduped), all nine categories, 2026-08-05:

| Category        | Pool n | 2020+ | % 2020+ | Pool median year |
| --------------- | -----: | ----: | ------: | ---------------: |
| Romance         |     17 |     0 |    0.0% |             2004 |
| Fantasy         |     16 |     0 |    0.0% |             2004 |
| Science fiction |     19 |     0 |    0.0% |             1997 |
| Horror          |     17 |     2 |   11.8% |             2001 |
| Mystery         |     16 |     0 |    0.0% |             2001 |
| Literary        |     17 |     2 |   11.8% |             2014 |
| Cozy            |     19 |    17 |   89.5% |             2023 |
| Nonfiction      |     20 |     3 |   15.0% |             2007 |
| Young adult     |     19 |     8 |   42.1% |             2018 |

Full-window sweep (every page to the ~300-item ceiling, four representative
categories):

| Query window      |   n | % 2020+ | Notes                                         |
| ----------------- | --: | ------: | --------------------------------------------- |
| romance:newest    | 120 |    3.3% | window truncated by upstream 503 mid-sweep    |
| romance:relevance | 200 |    7.0% |                                               |
| fantasy (both)    | 200 |    6.0% | newest and relevance return identical buckets |
| horror (both)     | 200 |    6.0% | Stephen King alone is 24/200 rows — see §4    |
| cozy:relevance    | 200 |   85.0% | 170/200 are 2020+; 62 are 2024+               |

And the 2020+ slice itself overstates genuine recency: a large share are **reprint
editions of old works wearing new edition dates** — Dracula (2021), The Legend of
Sleepy Hollow (2021), The Viscount Who Loved Me (2022 reissue), Dr. Jekyll & Mr. Hyde
(2024). True new-work share in Romance/Fantasy/SF/Horror/Mystery is lower than the
already-low numbers above.

## 2 · Discover-surfaced side

Same nine categories, the fn's exact pipeline applied to the measured pool (and the
client-fallback path computed alongside):

| Category        | Pool % 2020+ | Surfaced % 2020+ (fn path) | Fallback % 2020+ (fn down) |
| --------------- | -----------: | -------------------------: | -------------------------: |
| Romance         |         0.0% |                       0.0% |                       0.0% |
| Fantasy         |         0.0% |                       0.0% |                       0.0% |
| Science fiction |         0.0% |                       0.0% |                       0.0% |
| Horror          |        11.8% |                      16.7% |                       8.3% |
| Mystery         |         0.0% |                       0.0% |                       0.0% |
| Literary        |        11.8% |                      16.7% |                      16.7% |
| Cozy            |        89.5% |                     100.0% |                      91.7% |
| Nonfiction      |        15.0% |                      25.0% |                      16.7% |
| Young adult     |        42.1% |                      66.7% |                      33.3% |

Sampled surfaced Romance shelf, for concreteness: Chain of Gold (2019), Above and
Beyond (1986), Mastering the Marquess (2009), an 1905 Bret Harte collection, three
mid-2000s Danielle Steels — exactly the complaint's experience, reproduced from the
real pipeline on the real API.

## 3 · Interpreting the gap

**Surfaced ≥ pool in every category.** The year-tiering front-loads whatever fresh
exists, so the fn path beats the pool average everywhere it can (YA 42→67%, nonfiction
15→25%, cozy 90→100%). No signal in this repo suppresses recent titles:

- No review/rating-count signal exists anywhere in the pipeline (nothing crowd-derived,
  by project principle).
- No series-completeness signal exists in Discover.
- The recency signal is present and correctly oriented (it is the PRIMARY sort tier).
- Taste re-ranking re-orders the same ≤12 hits; it cannot remove a recent title from
  the grid. (It can move the two recent ones below eight backlist ones the reader's
  centroid prefers — cosmetic ordering within a starved shelf, not the cause.)
- The client fallback path (fn down/undeployed) has no tiering and measures worse
  (YA 67→33%) — but the fn is deployed and ACTIVE, so the cached tiered path is what
  readers get; the fallback is a real but secondary degradation.

The gap between "what a contemporary reader expects" and "what surfaces" is created
entirely upstream: the subject-query window barely contains recent titles (§1), and
recent trade frontlist is categorically invisible to subject queries (bare
`['Fiction']` categories). **Scoring-weight changes cannot fix this; no reachable
candidate exists to re-rank in the worst genres.**

## 4 · The Stephen King exception — diagnostic, as suspected

Three stacked mechanisms, each confirmed:

1. **King's backlist dominates the horror window outright: 24 of 200 rows (12%) of the
   full `subject:horror` sweep are King titles** — decades of well-catalogued,
   subject-tagged editions (Thinner, Misery, Needful Things, The Long Walk in the
   surfaced sample). He is the best-catalogued author in the genre's backlist window,
   so he saturates a starved shelf.
2. **His contemporary titles reach the reader through a different feature.** Later /
   If It Bleeds / Holly / You Like It Darker carry bare `['Fiction']` or empty
   categories — invisible to `subject:horror` like everyone else's frontlist. But the
   Planner's author-releases rail (`mode: 'authors'`, `inauthor:"Stephen King"`,
   sorted newest-first by REAL date, top 25) surfaces exactly his recent+upcoming
   books for any reader whose library derives him as "your author" (loved book or 2+
   shelved). A King reader therefore sees contemporary King in-app while Discover
   shows backlist King — the two surfaces blur into "the app surfaces King's new
   stuff but nobody else's."
3. **Taste re-ranking plausibly floats King to the front of the horror grid** for a
   King-reading library (same-author embedding proximity), making his cards the face
   of the shelf.

So the King contrast is not a ranking privilege — it is (a) catalog-depth saturation
of a starved window plus (b) the `inauthor:` path being the ONLY route by which
anyone's 2020+ frontlist reliably enters this app today. That second half is the
diagnostic: recency arrives per-author, never per-genre.

## 5 · Where scarcity is worst, and its shape

- **Worst (effectively zero recent titles reachable): Romance, Fantasy, Science
  fiction, Mystery** — 0% 2020+ at fn depth; 3–7% across the full window, much of that
  reprints.
- **Low: Horror, Literary, Nonfiction** (12–15% at fn depth, reprint-inflated).
- **Middle: Young adult** (42% — its subject label does get applied to frontlist).
- **Healthy: Cozy** (85–90% — modern subject vocabulary, largely 2020+ indie/trade).
- **Shape: NOT "indie missing, trad present."** It is worse than Phase 0's flagged
  indie/KU gap: even flagship traditionally-published 2023–2025 titles (Emily Henry,
  Rebecca Yarros, Osman, King himself) are unreachable through subject queries. The
  scarcity is a property of Google's subject-classification pipeline for recent trade
  releases, uniform across publisher size. (Phase 0's indie gap is real but is an
  additional layer beneath this one, not the explanation of it.)
- The one place the complaint's "younger contemporary readers" are actually served
  today is Cozy — and partially YA — purely because those shelves' subject vocabulary
  happens to be modern.

## 6 · Rails — the premise dissolves, with one real finding

**Discover has no rails.** One flat grid per genre chip; no named sub-groupings exist
in `DiscoverRoute.tsx`, and no "Into the Dark" string exists in the repo's UI copy as
a rail label. What was observed is the **taste-tier chip** rendered under individual
cards: "Into the dark" is the **marrow (horror) skin's floor tier label**
(`packages/core/src/tasteTier.ts:77` — marrow's four tiers are "In your blood" /
"Your kind of dread" / "A curious chill" / "Into the dark").

The real finding inside the mistaken premise: **tier labels are keyed to the active
SKIN, not the browsed category** (`TasteTier` renders `tasteTierLabel(skin, …)`).
Browsing the Cozy tab while wearing marrow shows horror-voiced labels ("Into the
dark") under cozy books — cross-genre voice leakage that reads as curation ("this is a
dark-cozy rail") when it is actually "this book is far from your taste centroid, said
in horror dialect." Several same-tier cards in a row visually cluster into what looks
like a named rail. No recency bias is introduced by any of this (the tier chip is
display-only), but it explains the observed "rail" and it misleads about what the
grouping means.

## Method + caveats, so this is reproducible and honestly bounded

- Measurements replicate `fetchDiscoverShelf` exactly (same queries, orderings, quality
  gate, dedupe key, tiering, slice) against the live API with the fn's key + referer
  from `supabase/functions/.env`, 2026-08-05. Scripts + raw JSON in the session
  scratchpad (`measure-discover.mjs`, `measure-window.mjs`, `measure-known-titles.mjs`).
- The prod `releases_cache` payloads themselves were not read (prod DB is out of bounds
  for a Code session); the cache is a 24h TTL snapshot of this same pipeline, so
  day-to-day snapshots vary in composition but not in structure.
- Google's responses are not fully deterministic; two 503s truncated one full-window
  sweep (romance:newest stopped at 120 of ~300; noted in the table). One fn-depth
  relevance call returned 0 items (literary) on the first sample — upstream flakiness,
  not app behavior.
- Full-window sweeps covered 4 of 9 categories (romance, fantasy, horror, cozy — the
  two worst, the King case, and the inverse case); the other five are characterized at
  fn depth only. The fn-depth numbers are the ones readers actually experience.
- "2020+" counts edition dates, which overstate genuine recency (reprints of classics
  carry new dates); the true new-work share is lower than every number above.

## Answer to the audit's core question

**Data, not ranking** — with the precise shape: not "the corpus lacks 2020+ titles"
(there is no corpus behind Discover to lack them) but "the external window Discover
queries cannot see recent frontlist for the major fiction genres, at any ranking
weight." The ranking layer is already recency-maximal over what it can reach. Fix
scoping is out of scope for this audit and is not proposed here.
