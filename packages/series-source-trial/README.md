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

The expanded open-data comparison adds Inventaire and BookBrainz:

```sh
pnpm series:trial -- --scope all --providers openlibrary,wikidata,inventaire,bookbrainz
```

Inventaire results preserve their origin: an `inv:` entity is distinct Inventaire evidence, while
a `wd:` entity observed through Inventaire remains Wikidata evidence. BookBrainz relationships are
also checked against the series roster. Neither adapter promotes a one-member provider series into
automatic evidence.

The Open Library adapter intentionally runs at roughly one request per second. Reports are written
under `packages/series-source-trial/reports/` and ignored by default because ad-hoc results are not
stable fixtures.

Google Books is supported as an identity baseline:

```sh
GOOGLE_BOOKS_API_KEY=your-key \
GOOGLE_BOOKS_REFERRER=https://your-authorized-origin.example \
pnpm series:trial -- --scope all --providers google-books
```

`GOOGLE_BOOKS_KEY` is accepted as an alias for `GOOGLE_BOOKS_API_KEY`, matching the production
Supabase secret name. Production uses `BOOKS_KEY_REFERER`; the trial uses
`GOOGLE_BOOKS_REFERRER`. Both should name an origin allowed by the Google Cloud key restriction.

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

## Run the evidence resolver in shadow mode

The resolver is an optional, no-write interpretation layer over a completed JSON trial report. It
cannot browse, receives no authority truth labels, and cannot modify Supabase or Reverie's corpus.
It may only return fields and evidence IDs present in the supplied provider packet; deterministic
validation rejects unsupported values and keeps singleton or conflicting relationships in review.

Before a packet reaches the model, a deterministic cleaner assigns each claim a source role,
membership rule, lineage, risk flags, and separate membership/order eligibility:

| Source       | Usable resolver input               | Automatic membership rule                     | Automatic order rule                    |
| ------------ | ----------------------------------- | --------------------------------------------- | --------------------------------------- |
| Google Books | Work identity only                  | Never                                         | Never                                   |
| Open Library | Exact structured relationship       | Non-singleton exact-work relation             | Independent agreement                   |
| Wikidata     | Exact P179 relationship             | Non-singleton exact-work relation             | Independent agreement on P1545          |
| Inventaire   | Exact `serie-parts` roster relation | Non-singleton; `wd:` mirrors remain Wikidata  | Independent non-mirror agreement        |
| BookBrainz   | Exact series-roster relation        | Non-singleton exact-work relation             | Never until dependable order is exposed |
| Hardcover    | Exact `book_series` relation        | Independent open-graph corroboration required | Independent agreement                   |

This is deliberately asymmetric. Hardcover adds broad candidate coverage, but a Hardcover-only
relationship cannot become an automatic fact. Self-titled relationships are flagged, connected
“universe” groupings are quarantined, and series order is withheld when sources disagree. An
Inventaire view of the same Wikidata entity is one lineage, not two votes. Unknown providers cannot
corroborate a source until a profile is added.

The LLM's job is to select, explain, or route these cleaned claims—not to make an unsafe
claim true. It can suppress a Hardcover false positive by choosing review or abstain. Declaring a
book standalone still requires affirmative author/publisher evidence; silence from another dataset
is never enough.

Put the server-side API key in `packages/series-source-trial/.env.local`:

```dotenv
OPENAI_API_KEY=your-server-side-key
BOOK_RESOLVER_MODEL=gpt-5.6-luna
```

Then run a small reviewed shadow sample before spending against the whole report:

```sh
pnpm series:resolve -- \
  --input packages/series-source-trial/reports/your-trial.json \
  --scope gold \
  --max 10
```

Requests use strict JSON Schema output and `store: false`. Responses are cached by the complete
evidence packet, model, and prompt version under ignored `private-results/resolver-cache/`, so an
unchanged evaluation does not pay twice. The generated score reports citation faithfulness,
unsupported fields, policy violations, membership precision/recall, and false-standalone behavior.
Only policy-safe proposals count as automatic fills; review and abstain decisions do not.

This shadow harness is intentionally not a production Edge Function. Production integration waits
until the authority-reviewed sample meets the gates below.

The first live 10-case shadow, the prompt/lineage correction it exposed, and the corrected full
23-case pilot are recorded in
`reports/resolver-shadow-pilot-2026-09-04.md`.

## Build the 200-case authority set

Audit the sample before running another provider or resolver comparison:

```sh
pnpm series:sample:audit
```

The audit reports selection coverage and authority-review coverage separately. The current 57
Reverie seed candidates count as selected works, but never as truth and never toward an accuracy
gate. It also validates that every reviewed result has affirmative author or publisher evidence,
that a reviewed standalone has no memberships, and that a reviewed series work has at least one.

`data/authority-sample-plan.json` owns the fixed targets and stratum definitions.
`data/authority-candidates.json` is the queue for additional works; moving a work into
`data/authority-gold.json` is a human evidence-review action. A candidate has the ordinary case
identity plus a truth placeholder:

```json
{
  "id": "candidate-example",
  "title": "Example",
  "authors": ["Example Author"],
  "sampleOrigin": "external_sample",
  "strata": ["recent_independent_or_kindle_first"],
  "publicationYear": 2025,
  "publicationPath": "independent",
  "truth": {
    "status": "candidate",
    "standalone": null,
    "memberships": [],
    "sources": []
  }
}
```

Allowed publication paths are `independent`, `kindle_first`, and `traditional`. Complex cases also
carry `riskFeatures` containing `multi_series` or `connected_universe`. Once reviewed, a complex
case must set `truth.membershipsComplete` to `true`; this is the reviewer attestation that all
in-scope memberships—not only the provider's preferred one—were checked. Strata may overlap, which
is how the minimums fit within 200 distinct works without weakening any category.

An authority source is an author page, publisher page, or publisher catalog. A shared authority
page may be declared under the gold file's `sharedSources` and referenced by `truth.sourceGroups`;
the existing standalone controls retain the equivalent legacy stratum reference. An archived copy
may preserve provenance, but does not turn a non-authority page into authority evidence. Provider
output and LLM output can prioritize the review queue; neither can write gold truth.

## Decision rule

Accuracy is a hard constraint. A provider cannot pass by trading false claims for lower price or
greater coverage. After all hard gates pass, compare eligible providers using the weights in
`data/evaluation-policy.json`.

The current gold set is a pre-pilot. Procurement remains blocked until at least 200 cases are
authority-reviewed, including at least 100 positive series cases and 50 standalone controls.
The intended 200-case minimum stratification is:

- the current 69-series Reverie sample;
- 50 recent independent or Kindle-first works;
- 50 recent traditionally published works;
- 20 multi-series or connected-universe cases;
- at least 50 standalone negative controls, with overlaps rebalanced across the other strata.

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
- Inventaire is a live CC0 adapter. Its work-to-series claim is checked against `serie-parts`; `wd:`
  entities retain Wikidata lineage and do not become a second independent vote.
- BookBrainz is a live CC0 corroboration adapter. Its API is alpha and its observed series roster
  does not provide dependable order, so the adapter leaves position blank.
- Hardcover labels count only after the exact matched book's `book_series` relationship confirms
  them.
- Google Books is an identity comparison, not a durable corpus source.
- LibraryThing/Bowker and NielsenIQ enter through offline sample imports until commercial access is
  negotiated.
- The Internet Archive/Wayback Machine may be stored as provenance for an authority page, but it is
  not a series provider.
- The LLM resolver is not a provider. It can select and explain supplied claims, but its
  output is never source evidence and never bypasses the deterministic review policy.
