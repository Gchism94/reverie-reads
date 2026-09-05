# Authority seed batch 8 — 2026-09-05

## Outcome

The final three Reverie seed candidates with clear first-party evidence are now reviewed. The
authority sample still contains 108 selected works: 97 are reviewed, 76 are positive series cases,
21 are standalone controls, and 11 remain candidates. Only two of the 69 Reverie seed-series cases
remain unresolved: *Bulletproof* and *The Sacrifice*. Their current first-party pages do not
establish a bibliographic relationship strongly enough to replace abstention.

This batch also turns two failures from a targeted LLM acquisition run into reusable cleanup rules.
It records both explicit memberships for *Grey* instead of scoring a publisher umbrella as false,
and it quarantines a self-titled publisher catalog grouping unless an exact-work author or publisher
page also states the membership. All work remains inside the read-only trial harness; nothing writes
Supabase or the Reverie corpus.

## Reviewed seed cases

| Work | Reviewed membership | Position | First-party evidence |
| --- | --- | ---: | --- |
| Keep Me — Sara Cate | Sinful Manor | 1 | [author store series collection](https://saracate.shop/collections/sinful-manor-series), [Sourcebooks title record](https://www.sourcebooks.com/9781728282190-keep-me-tp.html) |
| A Tribute of Fire — Sariah Wilson | The Eye of the Goddess | 1 | [author title page](https://www.sariahwilson.com/book/32), [author catalog](https://www.sariahwilson.com/) |
| Dire Bound — Sable Sorensen | The Wolves of Ruin | 1 | [author catalog](https://sablesorensen.com/books), [Penguin series roster](https://www.penguin.co.uk/series/WOLVRUIN/the-wolves-of-ruin), [Hachette acquisition record](https://www.hachettebookgroup.com/little-brown-young-readers/requited-imprint-to-launch-with-major-new-acquisition-dire-bound-by-sable-sorensen/) |

The *Dire Bound* sampling path remains `independent`: Hachette records that the work was originally
self-published in February 2025 before Requited acquired it. A later traditional edition must not
rewrite how the work entered the market. *Keep Me* and *A Tribute of Fire* are classified as recent
traditional works from their Sourcebooks and Montlake records.

## Multi-membership correction

*Grey* has two defensible relational memberships. E. L. James's catalog places it first in the
Christian-perspective sequence, while Penguin Random House labels the exact work book 4 of its
six-book *Fifty Shades of Grey Series*. The gold record now retains:

- primary: *Fifty Shades as Told by Christian*, publication position 1;
- secondary: *Fifty Shades of Grey*, publication position 4.

The record declares its memberships complete and enters the multi-series challenge stratum. This is
the first gold case that exercises two live bibliographic memberships rather than treating a valid
publisher umbrella as provider noise.

## Live provider refresh

The complete 108-case refresh produced:

| Provider | Work match | Relational series | Precision | Recall | False standalone | Order accuracy |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Open Library | 81.5% | 6.5% | 100.0% | 9.2% | 0.0% | 100.0% |
| Wikidata | 30.6% | 7.4% | 100.0% | 10.5% | 0.0% | 75.0% |
| Google Books | 94.4% | 0.0% by policy | n/a | 0.0% | 0.0% | n/a |
| Hardcover | 94.4% | 74.1% | 89.0% | 94.7% | 23.8% | 98.5% |
| All providers | 99.1% | 74.1% | 89.2% | 94.7% | 23.8% | 98.5% |

For the three new cases, Open Library matched two identities and supplied no relationship; Wikidata
matched none; Google Books matched two and returned HTTP 429 for *Dire Bound*; Hardcover matched all
three and returned the correct named relationship and position for all three. Google also returned a
429 for *Enchantra*. Both are operational failures, never negative series evidence.

## Provider-only resolver

The resolver completed all 97 reviewed cases with structurally valid output:

- 69 policy-safe proposals, 8 review decisions, and 20 abstentions;
- 100% citation faithfulness, zero unsupported fields, and zero policy violations;
- 100% membership precision, 90.8% membership recall, and 0% false standalones.

It accepted all three new memberships but withheld their positions. Only Hardcover supplied order in
the provider packet, and Reverie's policy requires independent order corroboration. The first-party
authority pages establish the numbers for human review without weakening the automatic-fill rule.

## Targeted authority-acquisition capability check

The authority scout ran truth-blind against all 11 remaining candidates. It made 9 model calls,
reused 2 cached decisions, performed 26 web-search calls, and used 164,971 input tokens plus 6,512
output tokens. Output was 90.9% structurally valid, 63.6% policy-safe, and 100% URL-grounded. It
produced one review-worthy series proposal, six unresolved cases, and four quarantined cases. Its
cached results independently kept *Bulletproof* and *The Sacrifice* unresolved for the same semantic
reasons as human review.

The one candidate proposal was *Midsummer House* as *Applemore Bay* number 3, based on translated
publisher records. It remains a candidate because edition/work mapping needs human confirmation; the
model is a source scout, not its own promotion authority.

The scout then ran against the 28 reviewed cases where the provider-only resolver had abstained or
requested review. Before cleanup it resolved 50.0% with 85.7% accuracy, 75.0% membership precision,
one false series, and no false standalone. The two misses exposed distinct data problems:

1. *Grey* was assigned to Penguin Random House's explicit six-book umbrella, which the incomplete
   gold record did not yet retain.
2. *The Once and Future King* was placed in a self-titled publisher series page even though the same
   publisher's sampling frame identifies the exact work as standalone and the exact title page does
   not state series membership.

After adding *Grey*'s second membership and requiring exact-work corroboration for self-titled
catalog groupings, the same 28 cached responses rescored with zero new model calls:

- 100% structurally valid and 71.4% policy-safe;
- 46.4% resolved;
- 100% resolved accuracy, membership precision, and membership recall;
- 0% false standalone and 0% false series;
- 100% grounded URLs.

The lower resolution rate is intentional: a safe abstention is preferable to inventing a durable
series relationship from a publisher navigation bucket.

## Readiness after this batch

The sample is stronger but remains below its production procurement gates:

- 97 of 200 required authority-reviewed cases;
- 76 of 100 required positive series cases;
- 21 of 50 required standalone controls;
- 67 of 69 Reverie seed series reviewed, with the final 2 retained as abstention controls;
- 16 of 50 recent-independent cases, 27 of 50 recent-traditional cases, and 12 of 20 multi-series or
  connected-universe cases reviewed.

The next expansion should prioritize recent independent works, recent traditional works, and
affirmative standalone controls from complete selection frames. The authority scout can shorten
human review by finding first-party pages, but it should remain separated from deterministic
resolution and cannot promote or persist its own claims.
