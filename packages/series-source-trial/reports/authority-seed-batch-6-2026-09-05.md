# Authority seed batch 6 — 2026-09-05

## Outcome

Five more Reverie seed candidates now have reviewed author or publisher series truth. The authority
sample still contains 108 selected works, but 89 are now reviewed and 19 remain candidates. The
reviewed set contains 68 positive series cases and 21 standalone controls.

All five memberships and positions have affirmative first-party support from at least two records.
This batch changes only the reproducible trial dataset and expectations; it does not write to
Supabase or the Reverie corpus.

## Reviewed cases

| Work                                    | Reviewed membership | Position | First-party evidence                                                                                                                                                                                        |
| --------------------------------------- | ------------------- | -------: | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Distance — Luna Mason                   | Beneath the Mask    |        1 | [Kensington title record](https://www.kensingtonbooks.com/shop/distance/), [Penguin Random House series catalog](https://www.penguinrandomhouse.com/series/18W/beneath-the-mask/)                           |
| Ruthless Rival — L.J. Shen              | Cruel Castaways     |        1 | [author title page](https://www.authorljshen.com/books/ruthless-rival/), [author reading order](https://www.authorljshen.com/reading-order-2/)                                                              |
| War of Fire and Fury — Marion Blackwood | Flame and Thorns    |        5 | [author reading order](https://www.marionblackwood.com/books), [Simon & Schuster title record](https://www.simonandschuster.com/books/War-of-Fire-and-Fury/Marion-Blackwood/Flame-and-Thorns/9798347115570) |
| My Demon Hunter — Aurora Ascher         | Hell Bent           |        2 | [author series page](https://auroraascher.com/hell-bent/), [Kensington title record](https://www.kensingtonbooks.com/shop/my-demon-hunter/)                                                                 |
| Game On — Navessa Allen                 | Into Darkness       |        3 | [author title page](https://navessaallen.com/books-option-1/), [Zando title record](https://zandoprojects.com/books/game-on-paperback)                                                                      |

## Why these records are usable

Each decision binds the exact title and author to a named series. The publisher catalogs or author
pages then supply the numeric position directly; the review does not infer order from search rank,
cover sequence, or a generic series label. Distance and My Demon Hunter also carry exact edition
ISBNs from their publisher records, and Game On carries Zando's paperback ISBN.

Ruthless Rival and Game On additionally expand the recent-traditional cohort. Their first-party
records identify 2022 and 2026 publication respectively and connect the works to Montlake and
Zando/Slowburn publication paths.

## Live provider refresh

The complete 108-case refresh found this evidence for the five newly reviewed works:

| Provider     | Exact work identity |                   Relational membership |
| ------------ | ------------------: | --------------------------------------: |
| Open Library |                 4/5 |                                     0/5 |
| Wikidata     |                 0/5 |                                     0/5 |
| Google Books |                 5/5 |                           0/5 by policy |
| Hardcover    |                 5/5 | 5/5, with the correct series and number |

Across all 89 reviewed cases, the all-provider strategy reached 99.1% identity coverage. Raw
Hardcover relationship output reached 95.6% recall but only 89.2% precision and still assigned a
series to 23.8% of confirmed standalone controls. The additional reviewed positives improve the
precision estimate slightly, but do not change the safety conclusion: raw Hardcover output is a
candidate generator, not an automatic write source.

## Resolver capability check

The truth-blind resolver completed all 89 reviewed cases with structurally valid output:

- 100% citation faithfulness;
- zero unsupported fields and zero policy violations;
- 59 policy-safe proposals, 10 review decisions, and 20 abstentions;
- 100% membership precision, 86.8% membership recall, and 0% false standalones.

For this batch, it accepted all five memberships from exact, eligible Hardcover relationships. It
withheld all five positions because no independent open-data relationship corroborated Hardcover's
order. The first-party authority records establish those positions for evaluation and later review,
but remain hidden from this provider-only resolver run.

## Readiness after this batch

The sample remains below its production gates:

- 89 of 200 required authority-reviewed cases;
- 68 of 100 required positive series cases;
- 21 of 50 required standalone controls;
- 59 of 69 Reverie seed series reviewed, leaving 10 seed candidates.

The next useful step is to review the next five seed candidates, then run the authority-source
acquisition tool against resolver reviews and abstentions to measure how often first-party evidence
can safely recover withheld membership or order. Production integration remains read-only and
shadowed until the sample and procurement gates pass.
