# Authority scout same-origin experiment — 2026-09-05

## Decision

Do not adopt the two-pass same-origin search experiment. It did not reliably recover the known
Pyg miss, and one repeat instead inferred membership from spin-off context without consulting the
author's series page. Keep the existing one-request scout, add deterministic quarantine for this
false-positive shape, and leave every acquisition result review-only.

No run wrote Supabase, the corpus, authority gold, or any production service.

## Test case

The hard case was _Pyg_ by Pip Landers-Letts. The author's homepage and biography identify the
book, but their prose says that _Chameleon_ is a spin-off from _Pyg_. The navigation exposes a
separate [series page](https://www.pipwritesfiction.com/series). An exact-work series claim must
come from that direct series evidence, not from reversing the spin-off relationship.

_Midsummer House_ by Rachael Lucas was retained as a positive control because hosted search had
already found an explicit publisher statement that it is volume three of a named series.

## Results

| Experiment | Cases | Model calls | Web searches | Input/output tokens | Safe result |
| --- | ---: | ---: | ---: | ---: | --- |
| v4 prompt-only focused search | 2 | 2 | 3 | 20,380 / 1,103 | Midsummer resolved; Pyg unresolved |
| v5 mandatory focused search | 1 | 1 | 3 | 11,742 / 707 | Pyg unresolved |
| v6 allowed-domain Pyg run | 1 | 2 | 4 | 20,719 / 1,086 | Pyg unresolved |
| v6 allowed-domain two-case repeat | 2 | 2 | 6 | 29,527 / 1,019 | Midsummer accepted; Pyg quarantined after replay |

The v6 Pyg-only run correctly limited its second request to `www.pipwritesfiction.com`, but the
hosted search returned `/more` and `/event-list`, not `/series`. The two-case repeat appeared to
score 100% before audit because the first pass called Pyg part of The Leamington Bloom Series from
the homepage and biography. Those pages only support the inference that one book is a spin-off
from the other; they do not directly place Pyg in the named bibliographic series.

Replaying the two-case result under the corrected deterministic policy yields one accepted result
out of two, 100% precision among accepted memberships, and 50% series recall. The Pyg claim becomes
invalid and policy-withheld rather than an accepted false positive.

## Guard added

The canonicalizer now removes `series_membership` and `position` support when a model summary relies
only on:

- a spin-off, companion, shared-character, or same-world relationship without a direct
  bibliographic relationship;
- a trigger-warning or trope taxonomy; or
- an unlabelled heading.

A risky source may still support identity; it simply cannot establish membership or order.
Independent direct evidence for the same membership remains eligible, so one noisy contextual page
does not suppress a separately supported bibliographic relationship.

The replay also catches the previously observed _The Sacrifice_ proposal that treated “A Dark
College Romance” on a trigger-warning page as a series. It does not newly quarantine the other
accepted historical series outputs in the local acquisition reports.

## Next architecture gate

Search alone cannot reliably discover a first-party page that is linked in site navigation but is
not surfaced by the search index. The next useful experiment would therefore be a navigation-aware
retrieval gateway, not another prompt revision:

1. The scout finds and grounds an official author or publisher page.
2. A deterministic retriever extracts only same-origin navigation links from that consulted page.
3. One bounded candidate page is fetched and reduced to sanitized text.
4. The model may interpret that packet, but deterministic policy and human review still control
   source eligibility and promotion.

That retriever would add a real network boundary. It needs a separate design review for redirects,
DNS/IP validation, response size and type limits, timeouts, robots and source terms, privacy, and
provenance storage before implementation. The failed v6 code is not retained as dormant behavior.
