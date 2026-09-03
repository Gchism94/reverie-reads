# Open-source combined baseline — 2026-09-03

This report replays the completed Open Library and Wikidata runs through the supplemental-strategy
scorer. It combines only relational book-to-series claims. Duplicate memberships are consolidated;
when sources agree on membership but disagree on position, the combined result keeps membership and
leaves position blank for review.

| Strategy | Work match | Relational series | Precision | Recall | False standalone | Order accuracy |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Open Library + Wikidata | 87.5% | 15.0% | 100.0% | 100.0% | 0.0% | 100.0% |

Accuracy uses 23 authority-reviewed cases: 12 positive series cases and 11 standalone controls. The
remaining 57 cases contain candidate references and do not count as ground truth. The perfect
reviewed result is encouraging but selection-biased and far below the 200-case procurement minimum;
it is not a production accuracy claim.

The strategy still fails commercial-use and persistent-storage gates because Open Library's
underlying contribution rights are not uniformly established. Wikidata's structured data is CC0.
Google Books and Hardcover were not included in this completed baseline: Google's daily quota was
exhausted, and no local Hardcover token was available.
