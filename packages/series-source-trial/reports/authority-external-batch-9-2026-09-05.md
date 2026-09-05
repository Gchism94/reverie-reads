# Authority external batch 9 — 2026-09-05

## Outcome

Two external candidates now have authority-reviewed positive series truth. *Midsummer House* is
*Applemore Bay* book 3, and *Pyg* belongs to *The Leamington Bloom* with no defensible sequence
number. The sample still contains 108 selected works: 99 are reviewed, 78 are positive series
cases, 21 are true standalone controls, and 9 remain candidates.

This batch deliberately does not promote the other seven external candidates. A visually grouped
author catalog, a statement that a title is an author's third book, an identity page, a debut label,
or a publisher marketing list does not by itself establish a named bibliographic relationship or
affirmative standalone status. The work remains confined to the read-only trial harness and cannot
write Supabase or Reverie's corpus.

## Reviewed cases

| Work | Reviewed membership | Position | First-party evidence |
| --- | --- | ---: | --- |
| Midsummer House — Rachael Lucas | Applemore Bay | 3 | [Insel exact title record](https://www.suhrkamp.de/buch/rachael-lucas-midsummer-house-t-9783458683629), [Zomer & Keuning series catalog](https://www.zomerenkeuning.nl/series/applemore-bay/) |
| Pyg — Pip Landers-Letts | The Leamington Bloom | unknown | [author series page](https://www.pipwritesfiction.com/series) |

The publisher evidence for *Midsummer House* crosses translated editions without guessing. Insel
retains the English title on its German edition and labels it Applemore volume 3; Zomer & Keuning
names the publisher series *Applemore Bay* and includes the corresponding translated work. The
English work's own “standalone novel” note describes reading independence, not absence from the
publisher-assigned series.

The author-controlled *Leamington Bloom* page explicitly says the series brings together two
standalone sapphic novels and presents *Pyg* inside that catalog. The gold record therefore retains
the positive membership, marks the connected-world risk, attests that the in-scope memberships were
checked, and leaves position blank. The model or a provider must not convert page order, spin-off
language, or publication dates into an unsupported sequence number.

## Candidates deliberately retained

- *A Midlife Gamble*: the author's page labels a visual section *The Midlife Trilogy*, but the
  accessible work labels are cover-image filenames and the only explicit “third” statement is on
  the award page that selected the sample.
- *My Brother's Keeper*: the publisher identifies the author's Inspector Rohan Roy series but does
  not connect the exact work; the selection page is the only captured source calling this book the
  first entry.
- *The Bed in the Shed*: the author calls it the third Izzy Bromley book, but Izzy Bromley is a pen
  name and the site does not expose a stable named bibliographic series.
- *The Honey Witch*, *Wild and Wicked Things*, *The Carnivale of Curiosities*, and *The Princess of
  Thornwood Drive*: first-party pages establish identity or debut status, not affirmative standalone
  truth. Hachette's selection-frame heading remains quarantined because that same taxonomy contains
  known false standalone labels.

These abstentions are part of the capability test. They prevent the authority scout from converting
weak page structure, author-brand groupings, or source self-description into durable truth.

## LLM capability checks

The provider-only resolver replayed the latest 108-case four-provider packet against all 99 reviewed
cases. Ninety-seven decisions came from cache and the two newly reviewed works required fresh model
calls. All 99 outputs were structurally valid, with 100% citation faithfulness, no unsupported
fields, no policy violations, 100% membership precision, 89.7% membership recall, and no false
standalones.

The two new decisions demonstrate the intended boundary:

- *Midsummer House*: the resolver accepted Hardcover's exact non-singleton *Applemore Bay*
  membership, but removed position 3 because no independent provider in the packet corroborated the
  order.
- *Pyg*: the resolver abstained because Google and Hardcover established identity but supplied no
  relational membership. It did not use the authority gold label as model input or invent the author
  page's evidence.

A fresh truth-blind authority-scout run then used two model calls and six web searches. Both outputs
were valid, grounded, and policy-safe; *Midsummer House* was correctly resolved with its series and
position, while *Pyg* remained unresolved. The scout found the author's home and about pages but
missed the new, directly reachable `/series` page that human review found. This is a useful
capability limit rather than a reason to weaken source rules: hosted search can miss an unindexed
first-party page even when the site exposes it.

Before production, the acquisition design should test a bounded same-origin discovery step after it
finds an author or publisher domain—for example, reading a sitemap or a small allowlisted set of
book/series links—then pass the retrieved text through the same URL manifest and deterministic
source policy. That step must stay truth-blind, SSRF-safe, capped, and review-only. It should reduce
search cost and improve recall without allowing the model to bless its own sources.

## Readiness after this batch

The production gates remain unmet:

- 99 of 200 required authority-reviewed cases;
- 78 of 100 required positive series cases;
- 21 of 50 required standalone controls;
- 67 of 69 Reverie seed-series cases reviewed;
- 18 of 50 recent-independent cases, 27 of 50 recent-traditional cases, and 13 of 20 multi-series
  or connected-universe cases reviewed.

The next sample expansion should add new complete, externally selected frames rather than repeatedly
searching these seven unresolved works. Priority remains affirmative standalone controls, recent
traditional works, and recent independent works, with high-risk overlaps where possible.
