# High-risk authority review — 2026-09-04

## Decision

Promote five of the seven highest-risk Reverie seed candidates to authority-reviewed series truth.
Keep Bulletproof and The Sacrifice unresolved. The review used current author or publisher pages
and did not use provider output, the seed's existing labels, retailer metadata, search-result
snippets, or LLM output as truth.

The five promotions deliberately retain blank positions where the authority establishes
membership but does not number the exact work. Two are collected editions, and two first-party
pages use standalone-readable marketing while also establishing a named bibliographic group.

## Reviewed results

| Work | Reviewed result | Evidence interpretation |
| --- | --- | --- |
| Court of the Vampire Queen | Bloodline Vampires; no position | The [author page](https://www.kateerobert.com/books/court-of-the-vampire-queen) calls the exact work the Bloodline Vampires Trilogy and lists it among all books in the series. Sacrifice, Heir, and Queen—not the collection—carry positions 1–3. |
| Mate | Bride; no position | The [author](https://alihazelwood.com/mate/) and [book publisher](https://www.penguinrandomhouse.com/books/775877/mate-by-ali-hazelwood/) call it Bride's companion novel. A separate [Penguin Random House Bride-and-Mate page](https://www.penguinrandomhouse.com/books/841853/ali-hazelwoods-bride-and-mate-bookmark-by-out-of-print/) explicitly places both couples in the Bride series. None of these sources assigns a number. |
| All He'll Ever Be | Merciless Series; no position | The [author's reading-order page](https://willowwinterswrites.com/pages/merciless-world) maps the complete Merciless Series collection to All He'll Ever Be. The numbered works are the four contained Carter and Aria installments. |
| One Pucked Up Pack | Pucked Up Omegaverse; no position | The [author's dedicated group page](https://authorsarahblue.com/pucked-ov/) lists the exact work under The Pucked Omegaverse and calls the group interconnected. “Can be read as standalones” is reading guidance, not a denial of bibliographic membership. |
| Enchantra | Wicked Games; no position | Hachette's [title page](https://www.hachettebookgroup.com/titles/kaylie-smith/enchantra/9781538770801/) assigns a Series field of Wicked Games, and the [publisher series catalog](https://www.hachettebookgroup.com/series/kaylie-smith/wicked-games/) lists Enchantra. Its “stand-alone romantasy” description means independently readable because the same record carries affirmative series metadata. |

## Unresolved results

| Work | Why it remains a candidate |
| --- | --- |
| Bulletproof | The [publisher page](https://www.sourcebooks.com/9781464265587-bulletproof-standard-edition-tp.html) says only that the story is set inside the Dark Forces world. It provides no named-series field, series catalog, position, or explicit bibliographic-membership statement. Shared setting is insufficient. |
| The Sacrifice | The [title page](https://shanteltessier.com/the-sacrifice/) identifies the work but makes no series claim. The author site's [trigger-warning page](https://shanteltessier.com/trigger-warnings/) places it beneath “A Dark College Romance,” while a neighboring group is explicitly labeled “Dark Kingdom Series.” That contrast makes the former a category or marketing heading, not affirmative series evidence. |

## Sample effect

| Measure | Before | After |
| --- | ---: | ---: |
| Authority-reviewed cases | 74 | 79 |
| Reviewed positive series cases | 53 | 58 |
| Candidates awaiting review | 34 | 29 |
| Reviewed Reverie seed-series cases | 44/69 | 49/69 |
| Reviewed recent independent or Kindle-first cases | 13 | 14 |
| Reviewed recent traditional cases | 15 | 17 |

The fixed selection remains 108 of the 200-case target. No Supabase table, production catalog,
Edge Function, or provider cache was changed.

## Recorded open-data rescore

Rescoring the captured 2026-09-03 Open Library and Wikidata observations against the expanded truth
set made no network requests. Open Library had exact-work matches for four of the five newly
reviewed cases but no relational series claim for any of them; Wikidata had neither an exact-work
match nor a relationship for these five. This is a real authority-acquisition gap rather than an
identity-search failure.

| Provider | Overall series precision | Overall series recall | Newly reviewed relationships recovered |
| --- | ---: | ---: | ---: |
| Open Library | 100% | 14.6% | 0/5 |
| Wikidata | 100% | 16.7% | 0/5 |

The result reinforces the provider-first, authority-fallback design: open providers remain useful
and precise where they expose relational evidence, while a bounded authority lookup handles exact
works whose catalogs omit that relationship.

## LLM-policy implications

These cases preserve four distinctions the production acquisition tool must make before proposing
an automatic fill:

1. A collected edition may have series membership without an installment position.
2. A companion relationship plus an explicit publisher series statement can establish membership,
   but neither implies order.
3. “Can be read as a standalone” or “stand-alone romantasy” describes reading independence when the
   same authority explicitly assigns a named series.
4. Shared-world wording and category headings remain identity or discovery evidence only; they
   cannot create a series claim.

All authority-scout output remains review-only. This batch changes evaluation truth, not the
production promotion gate.
