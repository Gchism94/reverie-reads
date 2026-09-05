# Authority-source acquisition pilot — 2026-09-04

## Decision

Continue the capability trial. Do not integrate this scout into production yet.

The acquisition layer is useful and inexpensive, particularly for finding positive series evidence.
It is not an authority by itself. Its durable role is to find and cite candidate author/publisher
pages; deterministic source policy and human review decide whether those pages can establish truth.
The existing provider cleaner and resolver remain separate downstream stages.

## What was added

- A truth-blind `series:authority:acquire` command. The model receives only stable case ID, title,
  author, and optional publication year.
- Responses API `web_search` with live access, strict structured output, `store: false`, low
  reasoning, and at most three tool calls per book by default.
- Complete consulted-URL capture from both web-search sources and response citations.
- Deterministic validation for HTTPS provenance, exact source-manifest citations, identity,
  membership, position, and affirmative standalone evidence.
- Deterministic canonicalization for harmless URL-manifest drift and unsupported positions.
- A separate policy verdict that blocks selection-frame pages from validating the cases they
  selected and quarantines the Hachette standalone marketing taxonomy that the earlier challenge
  batch proved unreliable.
- Local per-case caching keyed by model, prompt version, and normalized target. No API request is
  made for an unchanged replay.
- No Supabase access, corpus writes, authority-gold writes, or provider truth labels in model input.

OpenAI's documentation confirms that Responses can require the hosted web-search tool, return the
complete consulted source list, cap total tool calls, use strict structured output, and disable
response storage. The implementation follows those controls:
[web-search guide](https://developers.openai.com/api/docs/guides/tools-web-search) and
[Responses API reference](https://developers.openai.com/api/reference/cli/resources/responses/methods/create).

## Balanced gold holdout

The fixed holdout contained 12 reviewed works: six series and six true standalones. It intentionally
mixed ordinary series, recent Kindle-first books, misleading publisher taxonomy, and a standalone
inside a connected universe. Known truth labels and known authority URLs were withheld.

Final score after deterministic cleaning and source policy:

| Measure | Result |
| --- | ---: |
| Structurally valid outputs | 12/12 (100%) |
| Policy-safe outputs, including safe abstentions | 11/12 (91.7%) |
| Grounded cited URLs | 100% |
| Safely resolved classifications | 9/12 (75%) |
| Accuracy among safely resolved classifications | 9/9 (100%) |
| Effective accuracy including abstentions | 75% |
| Series membership precision | 100% |
| Series membership recall | 100% |
| False standalone rate | 0% |
| False series rate | 0% |
| API errors | 0 |

All six true series were recovered. Three true standalones were affirmatively established. Mexican
Gothic and Greek Secret correctly remained unresolved because the scout found first-party identity
pages but no explicit standalone statement. A Dowry of Blood was classified correctly by the model,
but the policy layer withheld it because the cited Hachette standalone lists are the same taxonomy
that incorrectly labeled other series books as standalones.

The first prompt exposed two fixable mechanics. A correct publisher phrase, “Hidden Norfolk crime
series,” initially missed the reviewed alias “Hidden Norfolk”; the scorer now strips only generic
terminal grouping words. A standalone inside Crowns of Nyaxia initially appeared with a universe
entry in `memberships`; the strict schema now permits only bibliographic series there and routes
universe context to uncertainties.

## Candidate queue trial

The scout then evaluated all nine pending external candidates without adding any result to gold.
All nine outputs were structurally valid and fully URL-grounded; six were policy-safe.

- Two usable series proposals: Midsummer House as Applemore #3, and The Bed in the Shed as the third
  Izzy Bromley book.
- Four safe unresolved results: The Honey Witch, Wild and Wicked Things, My Brother's Keeper, and
  Pyg. The scout found identity or discovery evidence but correctly withheld classification.
- Three quarantined proposals: The Carnivale of Curiosities and The Princess of Thornwood Drive
  relied on Hachette's conflicting standalone marketing list; A Midlife Gamble relied on the Amazon
  award page that selected the case, not independent author/publisher series evidence.

This is the clearest result of the pilot: a model cannot be allowed to declare its own source role.
It called the Amazon award page a publisher catalog and treated a publisher marketing category as
truth. Citation grounding proves that the page was consulted; it does not prove that the page is an
eligible authority for that claim. Those are separate checks now.

## Cost

The fresh 12-case gold run used 12 model calls, 17 web-search calls, 166,642 input tokens, and 6,259
output tokens. The nine-candidate run used nine model calls, 17 web-search calls, 141,174 input
tokens, and 5,043 output tokens.

At the published 2026-09-04 standard rates for GPT-5.6 Luna and web search, the measured cost is
approximately $0.20 for the 12-case holdout and $0.20 for the nine-candidate run—about $0.40 total,
or 1.9 cents per book. This estimate accounts for ordinary input, cached input, cache-write tokens,
output, and $10 per 1,000 web-search calls. Search content is already included in the reported input
tokens. Pricing can change; see [OpenAI API pricing](https://developers.openai.com/api/docs/pricing).

The web-search fee dominates. That argues for using provider adapters first, invoking authority
search only for unresolved/conflicting cases, and caching by stable work identity and prompt policy.

## Production shape under test

```text
provider APIs ──> deterministic provider cleaning ──> evidence resolver
     │                                                    │
     └── unresolved/conflict ──> authority scout ──> review queue
                                      │
                           URL grounding + source policy
```

The scout is not a replacement for Open Library, Wikidata, Google Books, or Hardcover. It is a
targeted fallback and review accelerator. In production, only previously approved source profiles
could become automatic resolver evidence; a newly discovered author/publisher page would remain a
proposal until reviewed. The model may choose which approved source tool to call, but cannot make a
source eligible by naming it “author” or “publisher.”

## Next capability gates

1. Run the scout over the 25 remaining Reverie series candidates to prioritize positive evidence;
   do not promote the output to gold.
2. Expand the gold acquisition holdout before changing production: duplicate titles, pen names,
   translated editions, dead/redirected author pages, explicit multi-series membership, and more
   first-party standalone statements.
3. Keep the hard safety expectations at 100% URL grounding, zero policy bypasses, and zero false
   standalone/series classifications. Optimize coverage only inside those constraints.
4. Defer model comparison until the larger holdout shows a repeatable failure class. At current
   pricing, search calls—not Luna's generation tokens—are the main cost to optimize.
