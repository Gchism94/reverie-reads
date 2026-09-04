# Supplemental-source live results — 2026-09-03

Google Books and Hardcover were run against all 80 trial cases using credentials loaded from the
ignored trial `.env.local`. Neither credential is present in this report.

| Strategy | Work match | Relational series | Reviewed precision | Reviewed recall | False standalone |
| --- | ---: | ---: | ---: | ---: | ---: |
| Open Library + Wikidata | 87.5% | 15.0% | 100.0% | 100.0% | 0.0% |
| Baseline + Google Books | 97.5% | 15.0% | 100.0% | 100.0% | 0.0% |
| Baseline + Hardcover | 97.5% | 82.5% | 87.5% | 100.0% | 18.2% |
| All four | 97.5% | 82.5% | 87.5% | 100.0% | 18.2% |

Google Books independently matched 77 of 80 works with no request errors. It returned no named
relational series memberships, so its useful role is identity, edition, cover, and other live
bibliographic metadata. The configured project key resolved the earlier daily-quota failure for
this run.

Hardcover independently matched 76 of 80 works and returned admissible non-singleton relationships
for 66. It recovered all 12 reviewed positive series cases. Its initial self-titled one-book series
for _Stranger in a Strange Land_ was correctly downgraded to review-only evidence after checking the
provider's series cardinality.

The two remaining standalone-control disagreements were _A Brightness Long Ago_ in “Sarantine
Universe” and _The Space Between Worlds_ in a two-book same-world grouping. They are exact-work
matches, not identity errors. They expose a taxonomy issue: a work can be a standalone narrative
while also belonging to a connected universe or companion grouping. Hardcover does not supply
enough relationship semantics to promote those automatically as numbered series.

These accuracy measurements use only 23 authority-reviewed cases: 12 positive series cases and 11
standalone controls. The other 57 cases have candidate references and measure agreement, not truth.
The result remains a pre-pilot rather than a production guarantee.
