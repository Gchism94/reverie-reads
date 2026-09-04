# Open graph series-source pilot — 2026-09-04

This frozen pilot ran the Inventaire and BookBrainz live adapters against the 23
authority-reviewed cases in `data/authority-gold.json`. It made no Supabase or Reverie corpus
writes. The full machine-readable local run remains ignored as
`reports/open-graph-pilot-current.json`.

| Provider   | Work match | Relational series | Precision | Recall | False standalone | Order accuracy | Errors | Latency p50/p95 |
| ---------- | ---------: | ----------------: | --------: | -----: | ---------------: | -------------: | -----: | --------------: |
| Inventaire |      87.0% |             30.4% |    100.0% |  58.3% |             0.0% |          75.0% |      0 |    2691/4030 ms |
| BookBrainz |      26.1% |              8.7% |    100.0% |  16.7% |             0.0% |            n/a |      0 |     214/1155 ms |

Accuracy figures are diagnostic because this is below the 200 reviewed-case, 100 positive-case,
and 50 standalone-case gates. Candidate seed references were excluded.

## Observations

- Inventaire recovered seven reviewed memberships, including recent works absent from the sparse
  Wikidata-only baseline. Its internal `inv:` entities therefore add real open-data coverage.
- BookBrainz recovered two memberships. Its clean CC0 relationship data is useful corroboration,
  but its target-corpus coverage is too sparse for a primary role.
- Inventaire returned _A Court of Silver Flames_ as position 4 while the reviewed publisher order
  is 5. The membership was correct but the order was not. This is the expected novella-exclusion
  ambiguity and demonstrates why membership and order remain separate claims.
- Both providers completed without request errors after the Inventaire adapter bounded relative
  graph expansion to title-plausible candidates. The shared HTTP client now also has a per-attempt
  timeout so a stalled public endpoint cannot stop an entire evaluation run.

The same adapters also completed all 80 reviewed-plus-candidate cases without errors. Inventaire
matched 38.8% of works and found relational series for 11.3%, at 2249/5917 ms p50/p95. BookBrainz
matched 7.5% and found relational series for 2.5%, at 217/1062 ms p50/p95. Accuracy is intentionally
reported only on the 23 reviewed cases above.

## Hardcover false-positive finding

The raw six-source union retained the prior 100% reviewed-positive recall but only 87.5% membership
precision and an 18.2% false-standalone rate. Both false claims originated in Hardcover:

- _A Brightness Long Ago_ was attached to “Sarantine Universe,” a connected-world grouping rather
  than an automatically safe primary-series claim.
- _The Space Between Worlds_ had an uncorroborated, self-titled two-work relationship.

The new resolver cleaner quarantines both patterns before the LLM runs. Hardcover now requires a
different source lineage to corroborate membership; a universe relation remains review-only;
self-titled relations are flagged; and an ordinal needs independent agreement. On this same small
retrospective sample, the deterministic eligible projection removes both false positives while
retaining all 12 reviewed positive cases. That is not a validation result—the rule was informed by
this pilot—and must be tested against the 200-case preregistered sample.

## Decision

Keep Inventaire and BookBrainz in the expanded trial. Inventaire is the strongest additional open
relational source found so far; BookBrainz remains low-cost corroboration. Neither is production
enabled, and neither can pass procurement until the full reviewed sample and policy gates pass.
