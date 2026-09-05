# Authority-source seed-candidate pilot — 2026-09-04

## Decision

Keep the authority scout in shadow evaluation and use this run to prioritize human evidence
review. The v3 prompt and deterministic validator are materially stronger than v2: they preserved
perfect series precision on an expanded reviewed holdout while separating bibliographic membership
from “standalone-readable” marketing language, shared worlds, and category headings.

Do not copy these candidate proposals into authority gold automatically. They are source leads, not
truth. No run in this batch wrote Supabase, the corpus, or an authority file.

## Cohorts

The candidate cohort contains all 25 unreviewed Reverie seed-series candidates. Each is the
highest-positioned seed work from a distinct series that had not already received authority review.
The model received title, author, and optional publication year only. Existing seed memberships,
authority truth, known source URLs, and provider packets were withheld.

The expanded truth-blind gold holdout contains 24 reviewed works: 13 series and 11 standalones. It
adds seven connected-universe or multi-series positives and five unrelated standalone controls to
the original balanced 12-work acquisition holdout.

## Failure-driven policy revision

The first 25-candidate pass used the v2 prompt. It produced 88% structurally valid and policy-safe
output, 98.6% URL grounding, 20 usable series proposals, one standalone proposal, one unresolved
case, and three quarantines. Four concrete problems drove v3:

1. Two responses added redundant deep links that were not present in the API's consulted-source
   manifest, even though separate consulted pages fully supported the same claims.
2. Enchantra was simultaneously called standalone and assigned to Wicked Games. Hachette describes
   it as a “stand-alone romantasy” while also explicitly setting its Series field to Wicked Games.
3. Bulletproof relied on a Linktree description for standalone status while its publisher page only
   says it is set in the Dark Forces world.
4. The Sacrifice was assigned to “A Dark College Romance” because several titles appeared under
   that heading on an author trigger-warning page. The page did not call the heading a series or
   number the book within it.

The v3 prompt now requires an explicit series/collection/duology/trilogy statement or explicit
numbering inside a named grouping. It treats standalone wording as reading independence when the
same authority assigns a bibliographic series. Link hubs are discovery-only. Deterministic cleanup
removes unconsulted redundant sources and demotes selection-frame or known-risk sources to
identity-only; a membership survives only when separate eligible evidence still supports it.
The private cache preserves the raw response and consulted-source manifest so later policy changes
can be replayed without laundering an earlier cleaned result into the new evaluation.

## Final candidate result

| Measure | Result |
| --- | ---: |
| Structurally valid outputs | 25/25 (100%) |
| Policy-safe outputs | 25/25 (100%) |
| Grounded cited URLs | 100% |
| Series proposals for review | 23 |
| Proposals with an explicit position | 18 |
| Membership-only proposals | 5 |
| Safely unresolved | 2 |
| False automatic promotions | 0 — all output remains review-only |
| API errors | 0 |

All 23 proposed series names agree with the seed references after generic suffix normalization.
That is reference agreement, not an accuracy claim: the seed is the unreviewed object being tested.

### Review queue

| Work | Scout proposal | Primary first-party evidence lead |
| --- | --- | --- |
| Distance | Beneath the Mask #1 | [Kensington](https://www.kensingtonbooks.com/shop/distance/) |
| Court of the Vampire Queen | Bloodline Vampires; collected trilogy, no position | [Katee Robert](https://www.kateerobert.com/books/court-of-the-vampire-queen) |
| Mate | Bride; companion, no position | [Penguin Random House](https://www.penguinrandomhouse.com/books/841853/ali-hazelwoods-bride-and-mate-bookmark-by-out-of-print/) |
| Ruthless Rival | Cruel Castaways #1 | [Penguin](https://cdn.penguin.co.uk/dam-assets/books/9781405959582/9781405959582-sample.pdf) |
| Bulletproof | Unresolved; Dark Forces world only | [Sourcebooks](https://www.sourcebooks.com/9781464265587-bulletproof-standard-edition-tp.html) |
| War of Fire and Fury | Flame and Thorns #5 | [Marion Blackwood](https://www.marionblackwood.com/books) |
| Off to the Races | Gold Rush Ranch #1 | [Simon & Schuster](https://www.simonandschuster.co.uk/books/Off-to-the-Races/Elsie-Silver/Gold-Rush-Ranch/9781398539204) |
| My Demon Hunter | Hell Bent #2 | [Aurora Ascher](https://auroraascher.com/hell-bent/) |
| Game On | Into Darkness #3 | [Penguin Random House](https://www.penguinrandomhouse.com/books/811678/game-on-by-navessa-allen/) |
| The Sacrifice | Unresolved; category heading only | [Shantel Tessier](https://shanteltessier.com/the-sacrifice/) |
| Wyatt | Lucky River Ranch #2 | [Jessica Peterson](https://jessicapeterson.com/wyatt) |
| Honey Cut | Lyonesse #2 | [Sourcebooks](https://www.sourcebooks.com/9781728276663-honey-cut-tp.html) |
| All He'll Ever Be | Merciless Series collection; no position | [Willow Winters](https://willowwinterswrites.com/pages/merciless-world) |
| Hooked | Never After #1 | [Emily McIntire](https://emilymcintire.com/books/) |
| Fall With Me | Playing for Keeps #4 | [Becka Mack](https://www.beckamack.com/books) |
| Priest | Priest Collection #1 | [Sierra Simone](https://www.thesierrasimone.com/priest) |
| One Pucked Up Pack | Pucked Up Omegaverse; no position | [Sarah Blue](https://authorsarahblue.com/pucked-ov/) |
| Wild Card | Rose Hill #4 | [Sourcebooks](https://www.sourcebooks.com/9781464247866-wild-card-standard-edition-tp.html) |
| Keep Me | Sinful Manor #1 | [Sourcebooks](https://www.sourcebooks.com/9781728282190-keep-me-tp.html) |
| Secret Haven | Sparrow Falls #6 | [Sourcebooks](https://www.sourcebooks.com/9781464241666-secret-haven-standard-edition-tp.html) |
| Wolf Gone Wild | Stay A Spell #1 | [Juliette Cross](https://juliettecross.com/pages/stay-a-spell-series) |
| Five Broken Blades | The Broken Blades #1 | [Entangled](https://entangledpublishing.com/books/five-broken-blades) |
| A Tribute of Fire | The Eye of the Goddess #1 | [Sariah Wilson](https://www.sariahwilson.com/book/32) |
| Dire Bound | The Wolves of Ruin #1 | [Sable Sorensen](https://sablesorensen.com/books) |
| Enchantra | Wicked Games; no position | [Hachette](https://www.hachettebookgroup.com/titles/kaylie-smith/enchantra/9781538770801/) |

The five membership-only proposals need especially careful review. Mate's strongest explicit
“Bride series” wording comes from a publisher merchandising page; Court of the Vampire Queen and
All He'll Ever Be are collected editions rather than ordinary numbered installments; One Pucked Up
Pack is marketed as independently readable; and Enchantra combines a series field with standalone
marketing language.

## Expanded reviewed holdout

| Measure | Result |
| --- | ---: |
| Structurally valid outputs | 24/24 (100%) |
| Policy-safe outputs, including safe abstentions | 22/24 (91.7%) |
| Grounded cited URLs | 100% |
| Safely resolved classifications | 18/24 (75%) |
| Accuracy among safely resolved classifications | 18/18 (100%) |
| Effective accuracy including abstentions | 75% |
| Series membership precision | 100% |
| Series recall | 13/13 (100%) |
| False standalone rate | 0% |
| False series rate | 0% |
| API errors | 0 |

All 13 reviewed series were recovered, including every added connected-universe/multi-series
challenge. Five of 11 standalones were affirmatively established. Six remained unresolved or
policy-withheld because no independent first-party source explicitly called the exact work
standalone. That lower standalone coverage is intentional; absence of series evidence is not
standalone evidence.

The two policy-withheld outputs demonstrate the guard rather than a classification error. Mexican
Gothic relied on the same Penguin Random House standalone list that selected the control. The Woman
in Room 19 relied on an author post hosted by Goodreads, a discovery-only domain. Neither source was
allowed to establish truth.

## Cost

The final v3 candidate cohort used 25 model calls, 42 web searches, 356,575 input tokens, and 12,753
output tokens. At the published 2026-09-04 standard rates, it cost approximately $0.49, or 1.9
cents per work. The expanded 24-case gold cohort used 34 web searches and cost approximately $0.41,
or 1.7 cents per work.

The discarded v2 diagnostic pass cost approximately $0.52. Total experimental spend for this
failure-driven iteration was therefore about $1.41. Replays from the unchanged local cache made no
new API requests. Pricing can change; see
[OpenAI API pricing](https://developers.openai.com/api/docs/pricing).

Web-search calls again dominate cost. The production hypothesis remains provider-first: use Open
Library, Wikidata, Google Books, and cleaned Hardcover evidence first, then invoke the authority
scout only for unresolved/conflicting works and cache by stable identity plus prompt policy.

## Next gate

1. Human-review the 25 candidate evidence leads, beginning with the five membership-only cases and
   the two unresolved seed references. Only that review may move a case into authority gold.
2. Keep the hard acquisition safety gates at 100% URL grounding, 100% series precision, and zero
   false standalone/series classifications. Do not optimize standalone coverage by weakening the
   affirmative-evidence rule.
3. Add duplicate-title, pen-name, translated-edition, redirect/dead-page, and explicit
   multi-membership cases to the fixed acquisition gold set before production integration.
4. Design the future review queue so source eligibility is a stored human decision; the model may
   discover and summarize a source but may not approve its own domain or page type.
