# Independent/Kindle-first authority batch 1 — 2026-09-04

## Outcome

The complete five-book Kindle Storyteller Award shortlists for 2022 and 2023 were added as the
first recent independent/Kindle-first cohort. Seven of the ten cases have affirmative
author/publisher truth; three remain candidates rather than borrowing truth from provider output.

The authority set now contains 90 selected works and 40 reviewed cases: 26 positive series cases
and 14 standalone controls. The independent/Kindle-first stratum is 10 selected, 7 reviewed, and 3
awaiting authority review.

## Sampling boundary

The shortlist is a reproducible selection frame rather than series authority. Amazon's award pages
identify all five finalists and their Kindle Direct Publishing/self-published context:

- [2022 complete shortlist](https://www.aboutamazon.co.uk/news/retail/amazons-kindle-storyteller-award-2022-shortlist-announced)
- [2023 complete shortlist](https://www.aboutamazon.co.uk/news/books-and-authors/amazon-self-publishing-awards-2023)

`platform_award` is therefore accepted for sampling provenance but excluded from
`authoritySourceKinds`. The audit requires exactly five cases in each declared selection frame and
checks their source, stratum, year, and publication path. It also proves that a platform-award URL
alone cannot validate reviewed truth.

## Authority decisions

| Work | Reviewed truth | Authority evidence |
| --- | --- | --- |
| King of War | Viking Blood and Blade Saga, book 4 | [author catalog](https://petermgibbons.com/king-of-war/) |
| The Woman in Room 19 | Standalone | [author's dated launch post](https://www.goodreads.com/author/show/14179591.Ann_Girdharry/blog?page=1) |
| City of Scars | DCI Logan, book 14 | [author reading order](https://jdkirk.com/readingorder/) |
| It Started with a Kiss | Standalone | [author catalog](https://www.clarelydon.co.uk/books/) |
| Greek Secret | Standalone; shared setting/characters are not membership | [author catalog](https://francescacatlow.co.uk/books), [original publisher description preserved by Google Books](https://books.google.com/books/about/Greek_Secret.html?id=hAU80AEACAAJ) |
| Forsaken Commander | Aternien Wars, book 1 | [author catalog](https://www.gjogden.com/product-page/forsaken-commander) |
| Silent Ruin | DCI Harry Grimm Crime Thrillers, book 14 | [author series site](https://dciharrygrimm.com/book-series/book-14-silent-ruin/) |

The remaining three selected cases stay candidates:

- Midsummer House: provider catalogs agree on Applemore placement, but no sufficiently explicit
  author or original-publisher relationship page has been captured.
- My Brother's Keeper: the award page calls it the first DCI Rohan Roy book, but no separate
  author-controlled or publisher catalog source has been captured.
- A Midlife Gamble: the author's image-led catalog and Amazon's prose imply Midlife Trilogy book 3,
  but the author page does not expose the relationship as verifiable text.

## Live provider observations

All six adapters completed all 90 selected cases with zero provider errors. On the ten new cases:

| Provider | Exact work matches | Relational series claims | Observation |
| --- | ---: | ---: | --- |
| Open Library | 6/10 | 0 | Useful identity coverage; no indie series graph in this cohort. |
| Wikidata | 0/10 | 0 | No coverage in this cohort. |
| Inventaire | 0/10 | 0 | No coverage in this cohort. |
| BookBrainz | 0/10 | 0 | No coverage in this cohort. |
| Google Books | 7/10 | 0 | Best open identity supplement; still not membership evidence. |
| Hardcover | 8/10 | 5 | Found all four reviewed series plus candidate Midsummer House; returned no relation for the three reviewed standalones. |

The five Hardcover claims were City of Scars / DCI Logan 14, King of War / The Viking Blood and
Blade Saga 4, Midsummer House / Applemore Bay 3, Forsaken Commander / The Aternien Wars 1, and
Silent Ruin / DCI Harry Grimm 14.

On all 40 reviewed cases, current raw results were:

| Provider | Work match | Membership precision | Membership recall | False standalone | Order accuracy |
| --- | ---: | ---: | ---: | ---: | ---: |
| Open Library | 95.0% | 100.0% | 26.9% | 0.0% | 100.0% |
| Wikidata | 55.0% | 100.0% | 30.8% | 0.0% | 75.0% |
| Google Books | 95.0% | n/a | 0.0% | 0.0% | n/a |
| Hardcover | 100.0% | 87.1% | 100.0% | 14.3% | 96.0% |

Hardcover was perfect on the seven newly reviewed cases, but its aggregate false positives remain;
the new cohort does not erase the earlier failure mode.

## Resolver result and deterministic correction

The production-shaped packet contains Open Library, Wikidata, Google Books, and Hardcover. On all
40 reviewed cases, `gpt-5.6-luna` plus deterministic validation produced:

| Valid | Automatic fills | Review | Abstain | Citation faithfulness | Unsupported fields | Policy violations | Precision | Recall | False standalone |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 40/40 | 23 | 5 | 12 | 100.0% | 0 | 0 | 100.0% | 88.5% | 0.0% |

One new response exposed a consistency defect: the model correctly retained King of War's eligible
membership with a null position, but chose `review` solely because the position lacked independent
corroboration. Other equivalent cases chose `accept_membership`. The post-pass now canonicalizes
that narrow state only when all reasons are `position_conflict` or `position_uncorroborated`, every
position is null, and changing the decision passes the existing deterministic policy validator.
Membership conflicts, semantic risks, multiple eligible series, and unsupported claims are never
promoted.

The four newly reviewed series were all accepted with positions withheld; all three reviewed
standalones abstained. The three unresolved candidates were run separately and did not affect the
accuracy score: Midsummer House produced a policy-safe Applemore Bay membership proposal with no
position, while A Midlife Gamble and My Brother's Keeper abstained for lack of evidence.

Adding Inventaire and BookBrainz to the same 40-case decision packet preserved 100% precision and
zero false standalones but lowered safe recall to 76.9% by surfacing more conflicts. They remain
useful discovery/review inputs, not default automatic-decision inputs.

The exact four-provider packets reused 33 cached responses and required seven new model calls
(8,973 input and 865 output tokens). The three candidate probes required three calls (3,866 input
and 311 output tokens). An exploratory six-provider run used 40 new calls (69,357 input and 5,876
output tokens); it is retained as evaluation evidence, not the recommended request shape.

## Decision

The recommended stack remains:

1. Google Books for identity only.
2. Open Library and Wikidata for precise but sparse relational evidence.
3. Hardcover for exact-work, non-singleton membership after semantic quarantine.
4. The LLM for evidence selection and review routing, bounded by deterministic citation, semantic,
   and order validation.
5. Inventaire and BookBrainz for discovery and administrator review until a larger sample shows they
   improve the automatic decision packet.
6. Author or publisher evidence as evaluation authority and the source for final human rulings.

Production integration remains blocked by the fixed 200-reviewed-case gate and unresolved source
data-use rights. This batch made no Supabase or corpus writes.
