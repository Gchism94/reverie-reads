# Reverie seed authority batch 3 — 2026-09-04

## Outcome

Six dynamically generated Reverie seed candidates were converted to authority-reviewed series
truth. A publisher-selected standalone list was also locked as a complete sampling frame and its
five previously missing works were added as negative controls.

The authority set now contains 95 selected works and 61 reviewed cases: 41 positive series cases
and 20 standalone controls. Thirty-one Reverie seed candidates and three external shortlist
candidates still await authority review.

## Sampling boundary

Penguin Random House's [Stand-Alone Science Fiction & Fantasy Reads](https://www.penguinrandomhouse.com/the-read-down/standalone-scifi-fantasy-books)
page affirmatively says the listed works wrap up in one book. The list is editorial and changed
over time, so the selection frame records the observation date rather than pretending the live URL
is immutable. On 2026-09-04 it contained sixteen titles. All sixteen are now included without
filtering on provider results; the five newly added controls are *Deerskin*, *The Once and Future
King*, *The Gone World*, *Project Hail Mary*, and *Orleans*.

Selection provenance remains separate from truth authority. The publisher URL can define the
complete sample and, because its statement is affirmative, can also support standalone truth; the
validator still applies those two roles independently. Selection frames without a common
publication year or publication path are now supported and covered by a regression test.

## Authority decisions

| Work | Reviewed truth | Correction or risk checked | First-party evidence |
| --- | --- | --- | --- |
| Accomplice to the Villain | Assistant and the Villain, book 3 | Corrects the seed's shortened author and series names | [Entangled](https://www.entangledpublishing.com/books/accomplice-to-the-villain) |
| Brimstone | Fae & Alchemy, book 2 | Recent traditional control | [Hachette UK](https://www.hachette.co.uk/titles/callie-hart/brimstone/9781399745499/) |
| First-Time Caller | Heartstrings, book 1 | Corrects malformed title spacing | [Penguin Random House series](https://www.penguinrandomhouse.com/series/HRT/heartstrings/), [book](https://www.penguinrandomhouse.com/books/737660/first-time-caller-by-bk-borison/9780593641200/) |
| Lost and Lassoed | Rebel Blue Ranch, book 3 | Corrects the seed's author typo | [author catalog](https://lylasage.com/books), [Penguin Random House](https://www.penguinrandomhouse.com/books/750327/lost-and-lassoed-by-lyla-sage/) |
| Long Live Evil | Time of Iron, book 1 | Sequel relationship confirms order | [author](https://www.sarahreesbrennan.com/), [Hachette series](https://www.hachettebookgroup.com/series/sarah-rees-brennan/time-of-iron/) |
| The Striker | Gods of the Game, book 1 | Shared universe and interconnected-standalone language do not create another membership | [author reading order](https://anahuang.com/reading-order/), [Sourcebooks](https://www.sourcebooks.com/9781464223327-the-striker-deluxe-edition-tp.html) |

## Live provider observations

Open Library, Wikidata, Google Books, and Hardcover each completed all 61 reviewed cases with zero
request errors. On the eleven newly added or reviewed cases:

| Provider | Exact work matches | Cases with relational claims | Observation |
| --- | ---: | ---: | --- |
| Open Library | 11/11 | 0/11 | Complete identity coverage; no series graph coverage in this batch. |
| Wikidata | 8/11 | 0/11 | Partial identity coverage; no P179 relationships in this batch. |
| Google Books | 11/11 | 0/11 | Complete identity coverage; no membership evidence by policy. |
| Hardcover | 11/11 | 7/11 | Found all six true series and one new self-titled false positive. |

On all 61 reviewed cases, the raw provider scores were:

| Provider | Work match | Relational coverage | Membership precision | Membership recall | False standalone | Order accuracy |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Open Library | 91.8% | 11.5% | 100.0% | 17.1% | 0.0% | 100.0% |
| Wikidata | 49.2% | 13.1% | 100.0% | 19.5% | 0.0% | 75.0% |
| Google Books | 95.1% | 0.0% | n/a | 0.0% | 0.0% | n/a |
| Hardcover | 100.0% | 73.8% | 87.5% | 100.0% | 20.0% | 97.5% |

Hardcover related *The Once and Future King* to a three-member series with the identical name. The
existing self-titled-relation rule quarantined it. Across all twenty standalone controls, the other
four suspect relationships were another self-titled container, a self-titled singleton, a universe
grouping, and a fractional connected-world position. Four counted as raw false series assignments;
all five were ineligible after deterministic cleaning.

## Resolver correction and result

The first 61-case resolver score safely accepted five of the six new positive cases. *Lost and
Lassoed* was sent to review solely because its one eligible Hardcover relationship supplied no
primary/secondary role. An earlier *Heat of the Everflame* result had the same shape. That is not a
membership conflict: Reverie keeps series membership and membership role as separate claims, and
the accepted record can retain role `unknown`.

The deterministic post-pass now accepts a review only when every reason concerns order or the
unknown role of a single eligible membership, every proposed position is null, and the existing
validator proves the result policy-safe. It cannot choose between multiple memberships and still
cannot promote a singleton, universe, reading-order, self-titled, or conflicting relationship.

The corrected production-shaped four-provider packet produced:

| Valid | Automatic fills | Review | Abstain | Citation faithfulness | Unsupported fields | Policy violations | Precision | Recall | False standalone | Order accuracy |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 61/61 | 38 | 6 | 17 | 100.0% | 0 | 0 | 100.0% | 92.7% | 0.0% | 100.0% |

The eleven new evidence packets required eleven model calls totaling 15,287 input and 1,474 output
tokens. The deterministic correction replay reused all 61 cached responses and made no model
request.

## Decision

The result strengthens the current architecture:

1. Google Books remains the strongest identity supplement in this batch and still contributes no
   membership claim.
2. Open Library and Wikidata remain precise but sparse relational sources.
3. Hardcover supplies the missing membership coverage, while deterministic cleaning catches its
   repeatable self-titled, singleton, universe, reading-order, and fractional-position errors.
4. The LLM selects and explains eligible evidence; deterministic validation remains the final
   automatic-fill boundary.
5. Author and publisher sources define evaluation truth and final human rulings.

Production integration remains blocked by the fixed 200-reviewed-case gate and unresolved source
data-use rights. This batch made no Supabase or Reverie corpus writes.
