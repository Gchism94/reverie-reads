# Authority review batch 1 — 2026-09-04

## Outcome

Ten high-value Reverie candidates were reviewed against author or publisher evidence. The authority
set now contains 33 reviewed cases: 22 positive series cases and 11 standalone controls. Forty-seven
selected Reverie candidates remain to be reviewed.

This batch targets the errors most likely to distort automatic enrichment: misspelled seed names,
provider-created reading orders, competing relationship containers, and current books missing from
open graphs. Stable case IDs preserve the previously captured provider observations, so the raw
provider rescore required no new provider requests.

## Authority decisions

| Work | Reviewed truth | Correction or risk checked | First-party evidence |
| --- | --- | --- | --- |
| A Touch of Chaos | Hades x Persephone Saga, book 7 | Hardcover also returned a separate reading order and book 4 position | [Sourcebooks](https://www.sourcebooks.com/9781728259765-a-touch-of-chaos-hc.html), [author](https://www.scarlettstclair.com/book-atoc) |
| The Primal of Blood and Bone | Blood and Ash, book 6 | The cross-series Blood and Ash World Reading Order is guidance, not a second membership | [author book page](https://jenniferlarmentrout.com/books/the-primal-of-blood-and-bone/), [author reading-order FAQ](https://jenniferlarmentrout.com/faq/) |
| It Happened One Summer | Bellinger Sisters, book 1 | Replaces the seed's “Bellinger Series” label | [author](https://www.tessabailey.com/home/books/contemporary/bellinger-sisters/), [HarperCollins](https://www.harpercollins.com/products/it-happened-one-summer-tessa-bailey) |
| Realm of Wind and Vines | Flame and Thorns, book 4 | Corrects “Flame and Throns” | [author](https://www.marionblackwood.com/books) |
| The Defender | Gods of the Game, book 2 | Corrects “Gods of the Dame” | [author](https://anahuang.com/reading-order/), [Bloom Books](https://www.bloombooks.com/9781464223334-the-defender-deluxe-edition-tp.html) |
| Beneath the Stars | Sugarlake, book 1 | Corrects “Sugerlake”; the 2025 publisher edition is not treated as first publication | [author](https://emilymcintire.com/books/), [Bloom Books](https://www.bloombooks.com/9781464229718-beneath-the-stars-tp.html) |
| Rebel Witch | The Crimson Moth, book 2 | Current traditional release with weak open-graph series coverage | [Macmillan book](https://us.macmillan.com/books/9781250866929/rebelwitch/), [Macmillan series](https://us.macmillan.com/series/thecrimsonmoth) |
| Between Two Kings | Split or Swallow, book 2 | Corrects “Spit or Swallow” | [Sourcebooks](https://www.sourcebooks.com/9781464247606-between-two-kings-deluxe-edition-tp.html) |
| Bonds of Hercules | Villains of Lore, book 2 | Corrects “Villians of Lore” | [Harlequin](https://harlequin.com/products/bonds-of-hercules), [author](https://jasminemasbooks.com/) |
| Wolfsong | Green Creek, book 1 | Clean agreement control across Hardcover and Inventaire | [Macmillan](https://us.macmillan.com/books/9781250890313/wolfsong/) |

## Stored-observation rescore

These scores apply the current 33-case authority truth to provider responses already captured for
the same stable IDs. Candidate references remain excluded from accuracy metrics.

| Provider | Work match | Relational series | Membership precision | Membership recall | False standalone | Order accuracy |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Open Library | 87.5% | 8.8% | 100.0% | 31.8% | 0.0% | 100.0% |
| Wikidata | 32.5% | 10.0% | 100.0% | 36.4% | 0.0% | 75.0% |
| Google Books | 96.3% | 0.0% | n/a | 0.0% | 0.0% | n/a |
| Hardcover | 95.0% | 82.5% | 85.2% | 100.0% | 18.2% | 95.2% |
| Inventaire | 38.8% | 11.3% | 100.0% | 40.9% | 0.0% | 83.3% |
| BookBrainz | 7.5% | 2.5% | 100.0% | 9.1% | 0.0% | n/a |

The result sharpens the source roles. Google is the strongest identity supplement but supplies no
relational membership. Hardcover supplies the most series coverage, but its raw output fails both
the precision and false-standalone safety thresholds. Open Library, Wikidata, Inventaire, and
BookBrainz remain sparse but precise corroborators.

## Resolver policy correction

The original policy required independent open-graph corroboration for every Hardcover membership.
On this 33-case, four-provider packet, that produced 100% precision and zero false standalones but
only 36.4% membership recall.

The revised policy permits an exact-work, non-singleton Hardcover relationship to supply membership
while retaining deterministic quarantines for:

- reading-order containers;
- universe relationships;
- self-titled provider containers;
- singleton relationships;
- competing eligible series; and
- all uncorroborated order positions.

The 33-case `gpt-5.6-luna` shadow run then produced:

| Structurally valid | Automatic fills | Review | Abstain | Citation faithfulness | Unsupported fields | Policy violations | Precision | Recall | False standalone | Order accuracy |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 33/33 | 18 | 6 | 9 | 100.0% | 0 | 0 | 100.0% | 81.8% | 0.0% | 100.0% |

The prompt-version change required 33 new model calls totaling 50,066 input tokens and 4,769 output
tokens. Subsequent identical packets are cacheable. The resolver accepted all nine ordinary
Hardcover-backed memberships in this batch and withheld their uncorroborated positions. It kept The
Primal of Blood and Bone in review because the same work also carried the quarantined world reading
order. That is a conservative false negative, not an unsafe fill.

## Decision

The evidence supports Hardcover as a high-coverage decision input, not as trusted truth. The best
current combination is:

1. Google Books for identity only.
2. Open Library, Wikidata, Inventaire, and BookBrainz as sparse relational corroboration.
3. Hardcover for exact-book, non-singleton membership candidates after semantic quarantine.
4. The LLM for claim selection and review routing, followed by deterministic citation and policy
   validation.
5. Author or publisher evidence as the evaluation authority and the final review source.

No provider or resolver passes procurement yet: the authority set remains below its 200-case gate,
and source data-use rights remain separate from factual accuracy. This run did not write Supabase or
the Reverie corpus.
