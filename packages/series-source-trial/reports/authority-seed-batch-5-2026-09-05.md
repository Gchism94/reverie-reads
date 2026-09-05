# Authority seed batch 5 — 2026-09-05

## Outcome

Five remaining Reverie seed candidates now have reviewed first-party series truth. The authority
sample contains 108 selected works: 84 reviewed and 24 candidates. The reviewed set contains 63
positive series cases and 21 standalone controls.

The complete four-provider refresh and 84-case resolver run support the proposed production shape:
Hardcover is valuable high-recall evidence, but it becomes safe only after deterministic semantic
cleaning and a resolver that can review or abstain. No result in this batch wrote to Supabase or the
Reverie corpus.

## Reviewed cases

| Work | Reviewed membership | Position | First-party evidence |
| --- | --- | ---: | --- |
| Off to the Races — Elsie Silver | Gold Rush Ranch | 1 | [Sourcebooks title record](https://www.sourcebooks.com/9781464220777-off-to-the-races-tp.html), [author reading order](https://www.elsiesilver.com/books) |
| Hooked — Emily McIntire | Never After | 1 | [author site](https://emilymcintire.com/), [author press-kit reading order](https://emilymcintire.com/press-kit/) |
| Priest — Sierra Simone | The Priest Collection | 1 | [author title page](https://www.thesierrasimone.com/priest), [author collection page](https://www.thesierrasimone.com/priest-series) |
| Wolf Gone Wild — Juliette Cross | Stay A Spell | 1 | [author series page](https://juliettecross.com/pages/stay-a-spell-series) |
| Five Broken Blades — Mai Corland | The Broken Blades | 1 | [Entangled Publishing title record](https://entangledpublishing.com/books/five-broken-blades) |

“Standalone” language on the Hooked and Priest pages describes whether a reader needs another book
first. It does not negate the same pages' explicit bibliographic series and order records. The gold
set therefore records both works as series members.

## Provider observations for these five works

The 2026-09-05 refresh queried every selected case again. For this batch:

| Provider | Exact work identity | Relational membership |
| --- | ---: | ---: |
| Open Library | 5/5 | 0/5 |
| Wikidata | 0/5 | 0/5 |
| Google Books | 5/5 | 0/5 by policy |
| Hardcover | 5/5 | 5/5, with the correct series and number |

This is the intended complementarity. Google closes identity gaps but is not relationship evidence;
Open Library identifies all five yet has none of their series relationships; Wikidata has neither;
Hardcover supplies the missing relational coverage.

## Complete provider refresh

The current 108-case run produced:

| Provider | Work match | Series precision | Series recall | False standalone |
| --- | ---: | ---: | ---: | ---: |
| Open Library | 81.5% | 100.0% | 11.1% | 0.0% |
| Wikidata | 30.6% | 100.0% | 12.7% | 0.0% |
| Google Books | 95.4% | n/a | 0.0% | 0.0% |
| Hardcover | 94.4% | 88.4% | 95.2% | 23.8% |

The all-provider strategy reaches 99.1% work identity coverage, but raw relational output still
inherits Hardcover's unsafe false positives. Source aggregation alone is not the solution.

## Resolver capability check

The truth-blind `gpt-5.6-luna` resolver evaluated all 84 reviewed cases from the fresh provider
capture:

- 84/84 structurally valid responses;
- 100% citation faithfulness;
- zero unsupported fields and zero policy violations;
- 54 policy-safe proposals, 10 review decisions, and 20 abstentions;
- 100% membership precision, 85.7% membership recall, and 0% false standalones.

For this five-case batch, it automatically accepted Gold Rush Ranch, Never After, Stay A Spell, and
The Broken Blades membership. It withheld all five positions because Hardcover was the only
relational source and the deterministic policy requires independent order agreement. It routed
Priest to review because a self-titled Hardcover relationship is deliberately quarantined. The
first-party authority pages prove that Priest is a real member, but those pages are evaluation truth,
not hidden input to the resolver.

That apparent miss is desirable system behavior: a broad provider's self-titled container cannot
become true merely because a model finds it plausible. A separate authority-source acquisition step
can gather the author evidence, after which a reviewed corpus decision may promote the relationship.

## Readiness and next work

The resolver now demonstrates the core safety property at useful recall, but production auto-write
remains gated. The reviewed sample is still below its 200 total / 100 positive / 50 standalone
targets, and provider storage/commercial-use terms remain unresolved where recorded by policy.

Next highest-value work:

1. Review the remaining 15 Reverie seed candidates, keeping ambiguous connected-world labels in
   review.
2. Add 29 more affirmative standalone controls and broaden the recent-publication cohorts.
3. Run the authority-source acquisition tool on resolver reviews and abstentions, then measure how
   often first-party evidence safely converts them without increasing false positives.
4. Keep production integration read-only/shadow until the sample and procurement gates pass.
