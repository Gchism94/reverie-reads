# Authority seed batch 7 — 2026-09-05

## Outcome

Five more Reverie seed candidates now have reviewed author or publisher series truth. The authority
sample still contains 108 selected works, but 94 are now reviewed and 14 remain candidates. The
reviewed set contains 73 positive series cases and 21 standalone controls.

This batch includes three useful data-cleaning challenges: two seed rows whose `Standalone` status
contradicts their numbered series tuple, one connected-world relationship that must not become a
second series, and one incorrect seed position. It also adds a deterministic cleanup for a
Hardcover author-surname disambiguator exposed by the live capability run. The changes remain
inside the reproducible trial harness and do not write Supabase or the Reverie corpus.

## Reviewed cases

| Work | Reviewed membership | Position | First-party evidence |
| --- | --- | ---: | --- |
| Wyatt — Jessica Peterson | Lucky River Ranch | 2 | [author title page](https://jessicapeterson.com/wyatt), [Sourcebooks title record](https://www.sourcebooks.com/fiction/9781464249518-wyatt-deluxe-edition-tp.html) |
| Honey Cut — Sierra Simone | Lyonesse | 2 | [author series catalog](https://store.thesierrasimone.com/collections/lyonesse), [Sourcebooks title record](https://www.sourcebooks.com/9781728276663-honey-cut-tp.html) |
| Fall With Me — Becka Mack | Playing for Keeps | 4 | [author catalog](https://www.beckamack.com/home-1), [Penguin Random House title record](https://www.penguinrandomhouse.com/books/814799/fall-with-me-by-becka-mack/), [publisher series catalog](https://www.penguinrandomhouse.com/series/PF3/playing-for-keeps/) |
| Wild Card — Elsie Silver | Rose Hill | 4 | [author catalog](https://www.elsiesilver.com/books), [Sourcebooks title record](https://www.sourcebooks.com/9781464220845-wild-card-deluxe-edition-tp.html) |
| Secret Haven — Catherine Cowles | Sparrow Falls | 6 | [author title page](https://catherinecowles.com/pages/secret-haven), [author reading order](https://catherinecowles.com/pages/reading-order), [Sourcebooks title record](https://www.sourcebooks.com/9781464241666-secret-haven-standard-edition-tp.html) |

Each decision binds the exact title and author to a named series. Each membership has at least two
first-party records, and each number is explicit in an exact author or publisher record. The trial
does not infer order from search rank, cover order, or a generic series label.

## Corrections represented by the batch

- Reverie's seed marks Fall With Me and Wild Card as `Standalone` even while storing numbered
  series tuples. The author and publisher records establish that both are series works; standalone
  readability or an anthology-style status cannot override relational membership.
- Sierra Simone calls Lyonesse a series set in the same world as New Camelot. Honey Cut therefore
  has one complete bibliographic membership—Lyonesse—not an invented second membership in New
  Camelot.
- Reverie's seed places Secret Haven at Sparrow Falls number 5. Sourcebooks' exact record identifies
  it as number 6, so the authority truth corrects the seed instead of laundering the existing value.
- Sourcebooks describes Wyatt as an interconnected standalone and simultaneously records Lucky
  River Ranch number 2. The first phrase describes reading independence; the relational series
  field owns bibliographic classification.

## Live provider refresh

The complete 108-case refresh found this evidence for the five newly reviewed works:

| Provider | Exact work identity | Relational membership |
| --- | ---: | ---: |
| Open Library | 5/5 | 0/5 |
| Wikidata | 0/5 | 0/5 |
| Google Books | 5/5 | 0/5 by policy |
| Hardcover | 5/5 | 5/5, with the correct series and number |

Across all 94 reviewed cases, the all-provider strategy reached 99.1% identity coverage. Raw
Hardcover relationship output reached 94.5% recall but only 88.6% precision and still assigned a
series to 23.8% of confirmed standalone controls. Google Books returned five HTTP 429 errors; the
trial records those as operational failures rather than evidence that a work lacks a series.

## Resolver capability check and cleanup

The first truth-blind resolver pass completed all 94 cases with structurally valid output, 100%
citation faithfulness, zero unsupported fields, and zero policy violations. Its membership precision
fell to 98.5% because Hardcover named the correct Wild Card relationship `Rose Hill (Silver)` while
the author and publisher call the series `Rose Hill`.

The cleaner now removes a terminal parenthetical from a Hardcover series label only when that text
exactly matches the target author's full normalized name or surname. It preserves the original
provider text as `reportedSeries`, leaves unrelated parentheticals untouched, and gives the resolver
the canonical cleaned label. This is a narrow provider normalization, not an LLM guess.

After the fix, the resolver produced:

- 94 completed and structurally valid decisions;
- 66 policy-safe proposals, 8 review decisions, and 20 abstentions;
- 100% citation faithfulness, zero unsupported fields, and zero policy violations;
- 100% membership precision, 90.4% membership recall, and 0% false standalones.

It accepted all five new memberships. It withheld all five positions because only Hardcover
supplied provider-level order and independent order corroboration is required. The first-party
authority pages establish the positions for evaluation and later review, but remain hidden from the
provider-only resolver run.

## Readiness after this batch

The sample remains below its production gates:

- 94 of 200 required authority-reviewed cases;
- 73 of 100 required positive series cases;
- 21 of 50 required standalone controls;
- 64 of 69 Reverie seed series reviewed, leaving 5 seed candidates;
- 25 of 50 recent-traditional cases and 11 of 20 connected-universe cases reviewed.

The next useful step is to review the three remaining seed candidates with clear first-party
evidence, retain the two genuinely ambiguous seed cases as abstention controls, and then run the
authority-source acquisition tool against resolver reviews and abstentions. Production integration
remains read-only and shadowed until the sample and procurement gates pass.
