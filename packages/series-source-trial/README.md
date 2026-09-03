# Reverie series-source trial

This package compares book-series data providers against the same cases and acceptance policy.
It does not write to Supabase or modify Reverie's corpus.

## What is measured

- exact work matching;
- relational work-to-series membership;
- membership precision and recall on authority-reviewed cases;
- false series assignments on reviewed standalone books;
- order accuracy, separately from membership accuracy;
- request failures and latency;
- commercial-use, persistent-storage, and provenance gates.

A provider's search label never counts as series evidence. Candidate labels from Reverie's seed are
useful for measuring coverage and discovering disagreements, but they do not contribute to claimed
accuracy until an authority source has been reviewed.

The current first wave contains one difficult work from each of Reverie's 69 distinct seeded series,
12 authority-reviewed positive cases, and 11 publisher-declared standalone controls. Some reviewed
cases replace seed references, so the final distinct-case count is printed at runtime.

## Run the open-source baseline

From the repository root:

```sh
pnpm series:trial -- --scope all --providers openlibrary,wikidata
```

The Open Library adapter intentionally runs at roughly one request per second. Reports are written
under `packages/series-source-trial/reports/` and ignored by default because ad-hoc results are not
stable fixtures.

Google Books is supported as an identity baseline:

```sh
GOOGLE_BOOKS_API_KEY=your-key \
GOOGLE_BOOKS_REFERRER=https://your-authorized-origin.example \
pnpm series:trial -- --scope all --providers google-books
```

Keys are read from the environment, are never written to reports, and must not be committed.
The runner also loads `packages/series-source-trial/.env.local` when present; that path is ignored
by Git.
For reliable trials, use a dedicated Google Cloud project and Books-only key, monitor its daily
query quota, and request a quota increase before a full run. A browser-restricted production key is
not a general server credential. Google-derived content remains live/short-cache metadata because
Google's API terms prohibit building a permanent copy of returned content unless separately
permitted.

Hardcover is supported as a relational series source:

```sh
HARDCOVER_TOKEN=your-personal-token \
pnpm series:trial -- --scope all --providers hardcover
```

The adapter first searches for the exact book, then queries that book's `book_series` rows. The
search document's `series_names` field is never counted as membership evidence. Hardcover requires
a backend-only personal token and limits the beta API to 60 requests per minute, so the adapter
paces all requests at slightly over one second apart. Its published API documentation does not
grant commercial use or persistent-storage rights; both procurement gates remain unresolved until
Hardcover provides written terms for Reverie's use. A relation whose series contains only one known
book is retained as review-only evidence and never counted as an automatic membership.

## Score a commercial sample

Ask the vendor to return the trial cases using the shape in
`data/provider-result.example.json`, or transform its export into that shape locally. Then run:

```sh
pnpm series:trial:score -- packages/series-source-trial/private-results/vendor.json
```

`private-inputs/` and `private-results/` are ignored deliberately. Do not commit a vendor sample
until its contract explicitly permits publication.

## Decision rule

Accuracy is a hard constraint. A provider cannot pass by trading false claims for lower price or
greater coverage. After all hard gates pass, compare eligible providers using the weights in
`data/evaluation-policy.json`.

The current gold set is a pre-pilot. Procurement remains blocked until at least 200 cases are
authority-reviewed, including at least 100 positive series cases and 10 standalone controls.
The intended 200-case stratification is:

- the current 69-series Reverie sample;
- 50 recent independent or Kindle-first works;
- 50 recent traditionally published works;
- 20 multi-series or connected-universe cases;
- 11 standalone negative controls.

Overlap should be resolved while preserving the intended stratum counts. A work with multiple
memberships needs every in-scope membership annotated before claim-level precision is fair.

When both Open Library and Wikidata are in one run, the report also scores their combined baseline.
Google Books and Hardcover each receive a separate marginal-lift strategy, plus an all-four strategy
when both supplements are present. Only relational claims are combined. Agreement on a position
keeps the position; disagreement keeps the series membership but leaves its order blank for review.
Google can improve exact-work coverage, but cannot create a series membership without relational
evidence from another provider.

## Provider boundaries

- Open Library, Wikidata, and Hardcover are live adapters. For Open Library, only the structured
  `series_name` relationship counts as membership; its legacy `series` field is retained as a
  candidate label.
- Hardcover labels count only after the exact matched book's `book_series` relationship confirms
  them.
- Google Books is an identity comparison, not a durable corpus source.
- LibraryThing/Bowker and NielsenIQ enter through offline sample imports until commercial access is
  negotiated.
- The Internet Archive/Wayback Machine may be stored as provenance for an authority page, but it is
  not a series provider.
