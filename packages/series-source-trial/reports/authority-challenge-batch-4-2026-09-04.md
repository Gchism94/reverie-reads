# Authority challenge batch 4 — 2026-09-04

## Outcome

The complete 2025 Kindle Storyteller shortlist, the complete Hachette “Standalone Books for
Romantasy Fans” list observed on 2026-09-04, and six additional Reverie seed series were added to
the authority trial without selecting on provider results.

The authority set now contains 108 selected works and 74 reviewed cases: 53 positive series cases
and 21 confirmed standalone controls. Twenty-five Reverie seed candidates and nine external
candidates still await sufficient first-party authority evidence.

The live four-provider resolver run completed all 74 reviewed cases with 100% citation
faithfulness, 100% automatic-fill precision, 88.7% membership recall, and zero false series claims
on confirmed standalones. The set is still below the fixed production gates.

## Capability boundary

This run evaluates the prospective production tool as a system, not an LLM trained on the reviewed
answers. Provider adapters acquired evidence first. The resolver received only exact-work identity,
provider relationships, source roles, and deterministic risk flags; it could not browse and did not
receive the author/publisher truth records used for scoring.

A production version may let a small model choose which approved acquisition tool to call next,
but retrieval must remain an explicit, attributable step. The LLM selects and explains eligible
evidence. Deterministic source cleaning and validation decide whether its proposal may become an
automatic fill. Authority pages remain evaluation and human-review evidence rather than prompt
facts or title-specific exceptions.

## Complete selection frames

Amazon's [2025 Kindle Storyteller shortlist](https://www.aboutamazon.co.uk/news/books-and-authors/how-to-enter-amazons-kindle-storyteller-award)
defines a complete five-work, self-published selection frame:

| Work | Review state | Authority result |
| --- | --- | --- |
| When Death Calls | Reviewed | Hidden Norfolk, book 16 — [Penguin](https://www.penguin.co.uk/books/481534/when-death-calls-by-dalgliesh-j-m/9781529991772) |
| The Gathering of Clan McFee | Reviewed | Heathcliff Lennox, book 14 — [author](https://karenmenuhin.com/titles/the-gathering-of-clan-mcfee/) |
| Tales of The Witch's Cat: Escape From Petopia | Reviewed | Tales of The Witch's Cat, book 2 — [author](https://www.kirstiewatsonauthor.co.uk/product-page/tales-of-the-witch-s-cat-escape-from-petopia) |
| Pyg | Candidate | The author describes a spin-off and a broader label, but the captured page does not explicitly establish this work's membership and order. |
| The Bed in the Shed | Candidate | The author calls it the third Izzy Bromley book but does not expose a stable named series relationship. |

Hachette's [romantasy list](https://www.hachettebookgroup.com/book-list/best-books-for-romantasy-fans/)
currently places eight titles under a standalone heading. The label is not reliable enough to copy
as truth: stronger current relational evidence contradicts three of the eight entries.

| Work | Review state | Authority result |
| --- | --- | --- |
| Half a Soul | Reviewed correction | Regency Faerie Tales, book 1 — [author](https://oliviaatwater.com/book/half-a-soul) |
| Immortal Dark | Reviewed correction | Immortal Dark, book 1 — [publisher series](https://www.hachettebookgroup.com/series/tigest-girma/immortal-dark/) |
| The Undertaking of Hart and Mercy | Reviewed correction | Hart and Mercy, book 1 — [author guide](https://www.meganbannen.com/uploads/7/1/9/9/7199229/the_undermining_of_twyla_and_frank_discussion_guide.pdf), [third-book page](https://www.meganbannen.com/rosieandadam.html) |
| A Dowry of Blood | Reviewed standalone | The author's catalog explicitly places it under Vampire Standalones — [author](https://stgibson.com/works/) |
| The Honey Witch | Candidate | Hachette's label lacks a second affirmative standalone source. |
| Wild and Wicked Things | Candidate | Hachette's label lacks a second affirmative standalone source. |
| The Carnivale of Curiosities | Candidate | Hachette's label lacks a second affirmative standalone source. |
| The Princess of Thornwood Drive | Candidate | Hachette's label lacks a second affirmative standalone source. |

The four unresolved works remain selected challenge cases but do not count toward any accuracy
gate. Missing series evidence is still unknown, never standalone proof.

## Reverie authority decisions

| Work | Reviewed truth | First-party evidence |
| --- | --- | --- |
| Restitution | The Edge of Darkness Trilogy, book 3 | [Penguin Random House](https://www.penguinrandomhouse.com/books/830415/restitution-by-leigh-rivers/) |
| Goldfinch | The Plated Prisoner, book 6 | [author](https://www.ravenkennedybooks.com/the-plated-prisoner-series) |
| House of Striking Oaths | The Kingdom of Crows, book 3 | [author](https://oliviawildenstein.com/books/house-of-striking-oaths/) |
| The Fae Princes | Vicious Lost Boys, book 4 | [author](https://www.nikkistcrowe.com/vicious-lost-boys-series/the-fae-princes) |
| Play Along | Windy City, book 4 | [author](https://liztomforde.com/play-along) |
| Her Soul to Take | Souls Trilogy, book 1 | [Penguin Random House](https://www.penguinrandomhouse.com/series/H8T/souls-trilogy/) |

## Live provider observations

Open Library, Wikidata, Google Books, and Hardcover each completed all 74 reviewed cases with zero
request errors. On the thirteen newly reviewed cases:

| Provider | Exact work matches | Cases with relational claims |
| --- | ---: | ---: |
| Open Library | 8/13 | 0/13 |
| Wikidata | 3/13 | 0/13 |
| Google Books | 13/13 | 0/13 |
| Hardcover | 11/13 | 11/13 |

On all 74 reviewed cases, the raw provider scores were:

| Provider | Work match | Relational coverage | Membership precision | Membership recall | False standalone | Order accuracy |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Open Library | 86.5% | 9.5% | 100.0% | 13.2% | 0.0% | 100.0% |
| Wikidata | 44.6% | 10.8% | 100.0% | 15.1% | 0.0% | 75.0% |
| Google Books | 95.9% | 0.0% | n/a | 0.0% | 0.0% | n/a |
| Hardcover | 97.3% | 75.7% | 86.4% | 94.3% | 23.8% | 98.0% |

The all-provider strategy matched every work, but its raw membership precision and false-standalone
rate remained limited by Hardcover. Google again supplied identity coverage rather than relational
membership. Open Library and Wikidata remained precise but sparse.

Hardcover correctly found ten of the twelve new true-series cases it matched. It also assigned the
author-confirmed standalone *A Dowry of Blood* to “Vampire Companion.” The provider relationship is
a companion grouping, not sufficient bibliographic series evidence. A general Hardcover
companion-collection risk now makes such a relationship review-only. The validator regression
proves that even a model proposal to accept it cannot become an automatic fill.

## Resolver result

The cleaned, truth-blind four-provider packets produced:

| Valid | Automatic fills | Review | Abstain | Citation faithfulness | Unsupported fields | Policy violations | Precision | Recall | False standalone | Order accuracy |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 74/74 | 47 | 7 | 20 | 100.0% | 0 | 0 | 100.0% | 88.7% | 0.0% | 100.0% |

The resolver accepted nine of the twelve new positive cases. It correctly withheld the two 2025
Kindle works no provider matched. It routed *The Undertaking of Hart and Mercy* to review because
the only relationship was a self-titled Hardcover container, while accepting the independently
clean *Half a Soul* and *Immortal Dark* relations. It abstained on *A Dowry of Blood* after the new
companion-collection quarantine. Every automatic order remained subject to independent
corroboration.

## Cost and cache correction

The first 74-case run made 74 model calls totaling 106,012 input and 10,359 output tokens. Final
accounting showed that no old cache entry was reused because the prior cache key hashed the entire
provider packet, including storage identifiers and source URLs that can drift without changing the
decision. That behavior was too expensive.

The resolver now hashes a canonical decision packet. It excludes provider-internal work/series IDs,
source URLs, and lineage storage identifiers, while retaining the target, claims, eligibility,
risk flags, corroboration, provider policy, and prompt/model version. A changed series claim or
changed eligibility invalidates the decision; storage churn does not. Legacy exact-packet cache
entries migrate automatically on a hit.

A verified replay of all 74 cases used 74 cached responses, made zero model calls, and reproduced
the score exactly. Regression tests cover both reuse and semantic invalidation.

## Decision

The architecture remains viable and the capability test is still in progress:

1. Google Books should remain an identity supplement, never a series authority.
2. Open Library and Wikidata provide durable, precise relational evidence but cannot supply enough
   coverage alone.
3. Hardcover is the high-coverage candidate relationship source; its claims require deterministic
   semantic quarantine and final validation.
4. The LLM is useful for selecting, explaining, and routing cleaned evidence, not inventing missing
   book facts or overriding source policy.
5. Author and publisher relationships remain the authority-review layer, and a source's own stale
   taxonomy must be challengeable.
6. Semantic cache keys are required for the intended low operating cost.

Production integration remains blocked by the fixed 200-reviewed-case, 100-positive-case, and
50-standalone-case gates plus unresolved source data-use rights. This batch made no Supabase or
Reverie corpus writes.
