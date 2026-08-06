# Discover, Rebuilt on Library Signal

Status: DRAFT for Greg's review · 2026-08-02
Depends on: series backfill (deployed), taste embeddings (pgvector, live), metadata-corpus strategy (Phase 0 doc)
Supersedes: the current Discover implementation and, where they overlap, the current recommendation paths. This also resolves the parked "Match approach (b): library-signal-driven" conversation — this document is that approach, applied to Discover.

## Verdict: keep Discover, but invert its source of authority

Discover today is a window onto external search results — thin metadata, low-res hotlinked thumbnails, no connection to anything the reader has told us. It looks bad because it _is_ outside the system: none of this session's cover, series, or enrichment work touches books the reader doesn't own, so the library got better around Discover while Discover stood still.

The fix is not better thumbnails on the same feature. It is inverting where authority lives: **the reader's library is the query.** 546 books now carrying 252 series, reader-authored tropes and moods, spice, ratings, crowns, and a taste embedding is a richer discovery signal than any external bestseller feed — and using it is the anti-consensus thesis applied to discovery. Nothing on this surface ever ranks by aggregate popularity, global ratings, or "readers also bought." Candidates are ranked by resemblance to _this_ library, steered by _this_ reader.

## The refused axis

Author demographics — sex, gender, race, ethnicity — will not be a similarity axis, default or optional. Three independent reasons, any one sufficient:

**No source carries it.** Goodreads exports, Open Library, Wikidata, Hardcover, ISBNdb: none supplies author demographic data with reliability. It would have to be inferred from names or photos, and demographic inference is a system that is wrong constantly and offensively, with the errors concentrated on exactly the authors it would most affect.

**It is special-category data.** Demographic attributes of identifiable living people sit in the highest-sensitivity tier of GDPR and its siblings. An LLC does not want a compliance surface built on inferred race data about real authors.

**It contradicts the thesis.** Reverie's claim is that reader taste — tropes, moods, pacing, spice — drives recommendation. "More authors of the same race as ones you've read" is not taste; it is a demographic filter wearing taste's clothes, and it would define the product in coverage terms nobody gets to choose.

The legitimate desire underneath ("help me read more diversely," "more sapphic romance," "more translated fiction") is served by **content** dimensions — representation _in the book_, original language, own-voices as a community tag — which come from tagging and metadata, not from classifying authors. Those enter the taxonomy the same way tropes did: reader-assigned, no derivation.

## Similarity axes (the base, on by default)

All computed from the reader's own library; each is a component of a single blended score with inspectable weights:

1. **Taste-vector proximity.** The pgvector embedding infrastructure already computes taste centroids; candidate embeddings are scored by cosine similarity against the reader's centroid, weighted toward highly-rated and crowned books. This is the workhorse axis and the one that degrades gracefully when candidate metadata is thin.
2. **Trope and mood overlap.** Direct intersection between a candidate's tropes/moods and the reader's most-loved ones (loved = attached to books rated high or crowned). This is the axis that is _only_ as good as candidate metadata — see seed data below, because it is the reason seed quality matters.
3. **Series-graph adjacency.** Same author as loved books; authors who co-occur in the reader's series universe; the next unread entry in a series the reader is inside (already partially served by "One you don't have yet" — Discover should surface it globally, not per-series-page).
4. **Genre proximity**, from the genre-neutral taxonomy, weighted by where the reader actually reads rather than what they claim.
5. **Spice range**, bounded to the band the reader demonstrably reads unless they widen it. A reader whose library sits at 1–2 should not get 5s in the default feed, and vice versa — this is a comfort boundary, not a preference guess.
6. **Format and length affinity** (novella vs. doorstop, audio-first authors) — weak signal, low default weight, but real.

Explicitly excluded from the base score: aggregate ratings from any external community, sales rank, "trending," and anything crowd-derived. Crowns remain un-aggregatable; nothing about this feature changes that.

## Steering (reader controls, all explicit)

- **Genre filter**, multi-select, from the reader's taxonomy.
- **Recency**: "newer" as a publication-date filter (last 1/2/5 years), now honest because `pub_y/m/d` precision exists.
- **Series posture**: series starters only · standalones only · continue-my-series.
- **Spice bounds**, overriding the default band in either direction.
- **"Surprise me"**: a deliberate inversion that samples _outside_ the reader's dominant signal — adjacent genres, unread trope clusters — clearly labelled as such. This is the honest answer to filter-bubble risk: the bubble is the default because that is the thesis, and leaving it is one explicit tap, never a silent injection.

Steering state lives in the route (the tab-routing pattern), so a steered Discover view is shareable and survives back-navigation.

## Seed data — where candidate quality actually comes from

This is the question that decides whether the feature works, and the answer is allowed to differ from the app's local-first habit. A recommendation is only as good as the candidate pool's metadata: axis 2 (tropes/moods) and axis 4 (genre) score against fields external search APIs simply do not return. Live search cannot power this.

**Recommendation: the bounded metadata corpus from the Phase 0 analysis stops being a someday-project and becomes Discover's candidate pool.** Discover is the corpus's first consumer and its concrete justification.

The stack, per the Phase 0 matrix, unchanged in licensing posture but re-prioritized for _this_ consumer:

- **Spine: Open Library monthly dumps (CC0)**, filtered hard. Not 20M editions — a curated 200–500k slice biased toward the genres this product serves (romance, romantasy, fantasy, contemporary indie). DuckDB/Parquet ingest, slim serving table into Postgres with pgvector embeddings computed per work. Field-level provenance from day one.
- **Series layer: Wikidata P179 + P1545 (CC0)** — decimal ordinals native, crosswalk IDs for reconciliation. Fills series membership for candidates the way the parenthetical backfill just did for the library.
- **Genre backbone: LCSH + FAST + OL subjects** (freely republishable), mapped into the genre-neutral taxonomy.
- **Contemporary/indie gap-filler: ISBNdb ($35.99 tier, bulk endpoint).** This re-opens the ISBNdb decision the cover work closed — correctly closed _for the library_, where Hardcover delivered 94%. The corpus is a different problem: Phase 0's own finding is that indie/KU coverage is the persistent gap no open source solves, and the reader's library proves the product lives exactly there. ISBNdb fields stay in a flagged non-redistributable layer, never published, never in the CC0 export.
- **Trope/mood layer: ours alone.** No open trope dataset exists (TV Tropes is NC, disqualified). Candidate tropes/moods start from three legal sources: mapping LCSH/FAST/OL subjects into the taxonomy where they honestly correspond; the reader's own library as ground truth for books that overlap the corpus; and, later, cross-reader contributed tags under the same reader-assigned guarantee. This layer will be thin at launch — the design must degrade gracefully to axes 1, 3, 4, 5 when a candidate has no trope data, and must _show_ thinness ("matched on genre and taste vector") rather than faking confidence.
- **What stays out:** Goodreads (dead), Amazon (affiliate-gated, ToS-barred), Google Books as a stored source (cache-header restriction — live lookup and hotlinked thumbnails only), LibraryThing CK (BY-SA contamination), TV Tropes (NC). Hardcover's API remains a _runtime_ enricher for the reader's own books under its personal-use terms, but its ambiguous license keeps it out of the corpus.
- **ASIN-only KDP titles** remain structurally invisible to every ISBN-keyed source. Accepted gap at launch; the eventual answer is reader contribution ("add this book for everyone" with reader-supplied metadata), which fits the product's politics better than scraping ever would.

**Covers for candidates:** hotlink-only, per the licensing analysis — OL cover IDs where the corpus has them, Google thumbnails via `upgradeCoverUrl` at display time otherwise, and honest placeholders (now visually distinct per book) when neither exists. Candidate covers are never ingested into Storage; ingest remains reserved for books a reader owns. This is the same line that killed `scheduleCoverCache`, and it holds here.

## Architecture sketch

Corpus lives in its own tables (`corpus_works`, `corpus_editions`, provenance columns), never mixed into `books`. A nightly/weekly job embeds new corpus rows. Discover queries: filter by steering → score by blended similarity against the reader's centroid → exclude everything already in the library (any shelf, including wishlist and tombstoned removals — a book the reader deliberately removed from a series must not be re-pitched). Adding a book from Discover copies the corpus record into `books` with provenance, then normal enrichment applies.

Scoring runs server-side (edge function or RPC) against pgvector; the client gets ranked candidates with per-axis contributions so the UI can say _why_ ("shares 4 tropes with books you crowned; same author-cluster as Chestnut Springs") — legibility is part of the anti-consensus posture. No reader's taste data ever leaves their scope; the corpus is shared, the query against it is private, and reading-stats privacy scope applies to the whole surface.

## Phasing

**Phase A — stop the bleeding (days).** Keep current Discover; route every thumbnail through `upgradeCoverUrl`, add the distinct-per-book placeholder, fix the worst layout. No new data. Ships while the rest is built.

**Phase B — corpus spine (weeks).** OL slice + Wikidata series + LCSH/FAST mapping, DuckDB→Postgres, embeddings, provenance. Threshold from Phase 0 stands: resolve ≥80% of a 1,000-title test set before proceeding. ISBNdb subscription starts here, not before. Source availability re-verified 2026-08-02 (see metadata-sourcing-verification-2026-08.md): all pillars active; OL now ships a `wikidata` author-crosswalk dump that Stage 1 should ingest alongside editions/works/authors; OL's own docs demonstrate DuckDB directly against the dumps. Two gate items before anything publishes or spends: FAST's current license terms, ISBNdb's redistribution clause and daily limits. Also ship the OL identified User-Agent header at runtime — the identified tier is 3 req/s vs 1 anonymous, a 3× budget gain for one header.

**Phase C — the new Discover.** Similarity scoring, steering, surprise-me, per-axis explanations, library exclusion. Old Discover retires.

Phase A is a normal Code branch. B and C each need their own specs; B also needs a decision from Greg on the corpus's initial genre boundaries and the ISBNdb spend.

## Open questions for Greg

1. Corpus scope at seed: romance/romantasy/fantasy-first (matches the library) or broader from day one? Narrower is cheaper and better-curated; broader serves future readers sooner.
2. ISBNdb: approve the $35.99/mo spend at Phase B, or defer until the OL+Wikidata slice's indie coverage is measured?
3. "Surprise me": one global inversion, or per-axis ("surprise me on genre, hold my spice band")? The latter is more honest and more work.
4. Cross-reader contributed tags (the eventual trope layer for candidates): in principle acceptable under the reader-assigned guarantee, or does any cross-reader aggregation need its own design conversation first?
