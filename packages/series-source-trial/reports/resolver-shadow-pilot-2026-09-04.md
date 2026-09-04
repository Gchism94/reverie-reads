# Evidence resolver shadow pilot — 2026-09-04

This no-write pilot used a fresh 23-case run of Open Library, Wikidata, Inventaire, BookBrainz,
Google Books, and Hardcover. Every provider completed without request errors. The resolver then
processed the first 10 authority-reviewed cases with `gpt-5.6-luna`, strict structured output,
`store: false`, no browsing tools, and no Supabase or Reverie corpus write path.

## Ten-case corrected smoke

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

## Full reviewed-set result

After the correction merged, the resolver processed all 23 authority-reviewed cases: 12 positive
series cases and 11 standalone controls.

| Measure | Result |
| --- | ---: |
| Completed / structurally valid | 23 / 23 |
| Citation faithfulness | 100% |
| Unsupported fields | 0 |
| Policy violations | 0 |
| Policy-safe automatic memberships | 11 |
| Review / abstain decisions | 4 / 8 |
| Automatic membership precision | 100% |
| Automatic membership recall | 91.7% |
| False standalone rate | 0% |
| Comparable order accuracy | 100% (3 / 3) |
| Logical input / output tokens | 40,465 / 3,315 |
| API latency p50 / p95 | 2,163 / 3,663 ms |

The resolver automatically recovered 11 of 12 true memberships without creating a false series
claim on any standalone control. The one held positive was *Grey*: its supported “Fifty Shades as
told by Christian” membership arrived beside a broader “Fifty Shades” relationship, while both
roles remained unknown. Review was safer than guessing a primary relationship.

Eight clean standalone controls produced abstentions. The other three produced review items for the
exact unsafe patterns the trial targets:

- *A Brightness Long Ago*: Hardcover-only “Sarantine Universe” relationship.
- *Stranger in a Strange Land*: singleton, self-titled Hardcover relationship.
- *The Space Between Worlds*: uncorroborated, self-titled Hardcover relationship.

Two prior cached responses were reused. This invocation made 21 new model calls using 37,204 input
tokens and 3,049 output tokens. Cached and generated response JSON remains local and ignored.

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

This is a successful pilot, not a production accuracy claim. The accuracy and standalone-safety
results pass their thresholds on this sample, but procurement remains blocked by the 200-case,
100-positive, and 50-standalone minimums plus unresolved durable-use rights for every selected
source path. The next paid evaluation is the preregistered 200-case set once its authority
annotations are complete.
