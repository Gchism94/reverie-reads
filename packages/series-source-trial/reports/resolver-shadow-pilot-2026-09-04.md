# Evidence resolver shadow pilot — 2026-09-04

This no-write pilot used a fresh 23-case run of Open Library, Wikidata, Inventaire, BookBrainz,
Google Books, and Hardcover. Every provider completed without request errors. The resolver then
processed the first 10 authority-reviewed cases with `gpt-5.6-luna`, strict structured output,
`store: false`, no browsing tools, and no Supabase or Reverie corpus write path.

## Result after correction

| Measure | Result |
| --- | ---: |
| Completed / structurally valid | 10 / 10 |
| Citation faithfulness | 100% |
| Unsupported fields | 0 |
| Policy violations | 0 |
| Policy-safe automatic memberships | 8 |
| Review decisions | 2 |
| Automatic membership precision | 100% |
| Automatic membership recall | 88.9% |
| False standalone rate | 0% |
| Input / output tokens | 20,568 / 1,704 |
| Mean API latency | 2,431 ms |

The two review decisions were correct and useful:

- *Grey* carried two eligible series relationships with unknown roles. The resolver retained the
  evidence but did not guess which relationship was primary.
- *A Brightness Long Ago* had only Hardcover's “Sarantine Universe” relationship. The resolver
  identified the universe-role risk and missing independent corroboration instead of turning it
  into an automatic series membership or an unsupported standalone assertion.

Membership and order stayed separate. *A Court of Silver Flames* was accepted as an *A Court of
Thorns and Roses* member while its conflicting 4-versus-5 ordinal was withheld. Other positions
without independent agreement were also returned as unknown rather than guessed.

## Issue found by the first run

The initial 10-case call produced 10 valid, fully cited outputs, but only six policy-safe automatic
memberships, with one rejected proposal. Two trial defects caused the loss:

1. Direct Wikidata relationships used full entity URLs while mirrored Inventaire relationships used
   `wd:` identifiers. They were the same origin but did not compare equal.
2. The prompt told the model to review an otherwise-safe membership whenever only its position was
   uncertain, despite the data model treating those as separate claims.

The correction canonicalizes both Wikidata identifier forms to one lineage and explicitly tells the
model to accept an eligible membership with a null position. It also tells the model to review
multiple distinct relationships whose roles remain unknown. Deterministic validation remains the
final gate regardless of the model's decision.

## Interpretation

This is a successful smoke test, not a production accuracy claim. It covers 10 of the 200 required
reviewed cases and includes only one standalone control. The next paid run should occur after this
correction merges: all 23 current reviewed cases, followed by the preregistered 200-case set once
its authority annotations are complete.
