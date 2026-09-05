# Reverie seed authority batch 2 — 2026-09-04

## Outcome

Ten dynamically generated Reverie seed candidates were converted to authority-reviewed truth. The
batch deliberately favors difficult cases: inconsistent series names, connected worlds, crossover
marketing, spinoff reading orders, and recent books with little open-graph coverage.

The authority set now contains 90 selected works and 50 reviewed cases: 35 positive series cases
and 15 standalone controls. Thirty-seven Reverie seed candidates and three external shortlist
candidates still await authority review.

## Authority decisions

| Work | Reviewed truth | Correction or risk checked | First-party evidence |
| --- | --- | --- | --- |
| Keeping 13 | Boys of Tommen, book 2 | Consolidates “The Boys of Tommen” alias | [Hachette](https://www.hachette.co.uk/titles/chloe-walsh/keeping-13/9780349439273/) |
| Hopeless | Chestnut Springs, book 5 | Confirms final numbered installment | [Sourcebooks](https://www.sourcebooks.com/9781728297040-hopeless-tp.html) |
| Slaying the Vampire Conqueror | Standalone set in the Crowns of Nyaxia world | Setting and reading-order placement are not membership | [Macmillan](https://us.macmillan.com/books/9781250368928/slayingthevampireconqueror/) |
| Final Offer | Dreamland Billionaires, book 3 | Recent traditional control | [author](https://laurenasher.com/books-final-offer/), [Sourcebooks](https://www.sourcebooks.com/9781728272221-final-offer-tp.html) |
| The Ever King | The Ever Seas, book 1 | Broken Kingdoms crossover is context, not another membership | [author](https://ljandrews.net/the-ever-seas/), [Penguin Random House](https://www.penguinrandomhouse.com/books/787633/the-ever-king-by-lj-andrews/) |
| The Ever Queen | The Ever Seas, book 2 | Consolidates three seed labels; separates crossover context | [author](https://ljandrews.net/the-ever-seas/), [Penguin Random House](https://www.penguinrandomhouse.com/books/787634/the-ever-queen-by-lj-andrews/) |
| Spark of the Everflame | The Kindred's Curse Saga, book 1 | Original independent release and shortened provider label | [author](https://www.penncole.com/spark-of-the-everflame), [author press kit](https://www.penncole.com/press-kit-tkcs), [Simon & Schuster](https://www.simonandschuster.com/books/Spark-of-the-Everflame/Penn-Cole/The-Kindred-s-Curse-Saga/9781668085721) |
| Heat of the Everflame | The Kindred's Curse Saga, book 3 | Corrects the seed's shortened series label | [author](https://www.penncole.com/heat-of-the-everflame), [author press kit](https://www.penncole.com/press-kit-tkcs), [Simon & Schuster catalog](https://www.simonandschuster.com/p/kindreds-curse-series) |
| Flock | The Ravenhood Series, book 1 | Ravenhood Legacy is a separate spinoff sequence | [author reading order](https://katestewartwrites.com/pages/reading-order), [author catalog](https://katestewartwrites.com/pages/about) |
| The Finish Line | The Ravenhood Series, book 3 | Separates the later Ravenhood Legacy numbering | [author reading order](https://katestewartwrites.com/pages/reading-order), [author product page](https://katestewartwrites.com/products/one-last-rainy-day) |

## Live provider observations

Open Library, Wikidata, Google Books, and Hardcover each completed all 50 reviewed cases with zero
request errors. On the ten newly reviewed cases:

| Provider | Exact work matches | Cases with relational claims | Observation |
| --- | ---: | ---: | --- |
| Open Library | 7/10 | 0/10 | Identity coverage only in this batch. |
| Wikidata | 0/10 | 0/10 | No coverage in this batch. |
| Google Books | 9/10 | 0/10 | Strong identity supplement; no membership evidence. |
| Hardcover | 10/10 | 10/10 | Broad coverage, including one connected-world false positive. |

On all 50 reviewed cases, the raw provider scores were:

| Provider | Work match | Relational coverage | Membership precision | Membership recall | False standalone | Order accuracy |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Open Library | 90.0% | 14.0% | 100.0% | 20.0% | 0.0% | 100.0% |
| Wikidata | 44.0% | 16.0% | 100.0% | 22.9% | 0.0% | 75.0% |
| Google Books | 94.0% | 0.0% | n/a | 0.0% | 0.0% | n/a |
| Hardcover | 100.0% | 76.0% | 82.9% | 94.3% | 20.0% | 96.9% |

Hardcover matched *Slaying the Vampire Conqueror* exactly and returned a Crowns of Nyaxia
relationship at position 2.5 in a seven-book container. Macmillan affirmatively calls the work a
standalone and lists it under “Crowns of Nyaxia Standalones.” The fractional ordinal is therefore a
useful deterministic warning for intermediate reading-order placement. It is not proof that every
fractional position is false: legitimate novellas exist. The safe action is to hold fractional
Hardcover relationships for review rather than discard them or fill them automatically.

## Resolver correction and result

The first 50-case resolver run exposed two apparent errors. One was a truth-normalization issue:
Hardcover's “Kindred's Curse” is an alias of the authority name “The Kindred's Curse Saga.” The
other was the real *Slaying the Vampire Conqueror* false positive above. Adding the authority alias
fixed the evaluation; quarantining fractional Hardcover positions fixed the unsafe claim.

The model then abstained on the rejected Slaying relationship but repeated it as low-confidence
explanatory content. A deterministic normalization now empties every abstention's membership list.
That operation can only remove claims; it cannot promote an answer or create evidence.

The corrected production-shaped four-provider packet produced:

| Valid | Automatic fills | Review | Abstain | Citation faithfulness | Unsupported fields | Policy violations | Precision | Recall | False standalone | Order accuracy |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 50/50 | 31 | 6 | 13 | 100.0% | 0 | 0 | 100.0% | 88.6% | 0.0% | 100.0% |

The ten new authority cases required ten initial model calls totaling 13,702 input and 1,490 output
tokens. The changed Slaying evidence packet required one additional call with 1,443 input and 163
output tokens. The final identical replay used the cache for all 50 cases and made no model request.

## Decision

The result strengthens the existing architecture rather than changing it:

1. Google Books remains identity-only.
2. Open Library and Wikidata remain precise but sparse relational sources.
3. Hardcover remains the highest-coverage supplement, with deterministic semantic quarantine
   before model resolution.
4. The LLM selects or routes supplied evidence; deterministic code remains the final automatic-fill
   boundary.
5. Author and publisher evidence defines evaluation truth and human review outcomes.

Production integration remains blocked by the fixed 200-reviewed-case gate and unresolved source
data-use rights. This batch made no Supabase or Reverie corpus writes.
