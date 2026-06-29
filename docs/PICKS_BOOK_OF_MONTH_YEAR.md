# Book of the Month / Year — sentiment-ranked picks (2026-06-28)

## Concept (Greg)
Lightweight sentiment/NLP ranks your read books by RATING x REVIEW sentiment, surfaces the top
candidate(s) (or the single one if only one exists); USER crowns "Book of the Month." Year-end: surface
the year's standouts (the 12 monthly crowns + high-ranked also-rans); USER crowns "Book of the Year."

## Why it fits the privacy rule (elegant, not a breach)
The ranking, sentiment scores, ratings, and runners-up are PRIVATE decision-support (help YOU choose).
The ONLY public output is a single human-chosen CROWN, stripped of all numbers. A crown is UN-AGGREGATABLE
by design (no "community average crown") -> advances the "no conglomerate ratings, taste-not-consensus"
through-line instead of straining it. Shared = the crowned book + period, attributed to you; NO stars,
NO scores, NO stats, ever -- even though raw ratings may be public elsewhere (the crown is a deliberately
number-free signal). Value: discovery -- "what people read + loved," a high-signal, scarce primitive
(1/month, 1/year -> meaningful, un-spammable, no inflation incentive).

## Design decisions (made)
- RANKING = suggester, not judge. Rating = primary/reliable signal; review SENTIMENT = within-rating
  discriminator (breaks "which of my three 5-stars was THE one"). Human always makes the final call ->
  NLP can be imperfect, low-stakes.
- SENTIMENT = pure, offline, lexicon-based in @reverie/core (no LLM cost, no network, unit-testable). NOT
  an API/LLM call. "Lightweight" as requested.
- ELIGIBILITY = books finished that month with a rating; review optional (boosts via sentiment). 1 eligible
  -> auto-candidate; 0 -> no crown that month.
- MONTHLY = gentle skippable prompt, top candidate pre-highlighted, confirm/override.
- YEAR-END = 12 monthly crowns (+ a few high-ranked also-rans as write-ins) -> user crowns Best of Year.
  Same season as Wrapped, but Wrapped stays PRIVATE while the crown is the one shareable artifact.
- SHARE SURFACE = a "Picks" section: crowned covers + period label, attributed, number-free.
- PHASING = personal ritual (private crowns + year-end ceremony) ships BEFORE the social layer; sharing/
  discovery lights up with the public layer. Delight works standalone.

## FLAGS / open
- SENTIMENT genre-vernacular caveat: in romance/romantasy "wrecked me / sobbing / feral / unhinged /
  ruined me" = top PRAISE; a generic lexicon scores them NEGATIVE and buries favorites. Mitigate: rating
  primary (sentiment only refines) + a small custom reader-vernacular lexicon (flip those terms). Human
  final call de-risks misreads.
- REVIEW must be a DISTINCT field from private NOTES. Today only "notes" exists (per reread) and it's
  PRIVATE (already decided). Add a separate REVIEW field = shareable-eligible opinion that sentiment reads.
  Notes stay private; don't let a shared crown leak a note. (Ranking may read notes PRIVATELY as fallback
  since ranking is never shared; sharing only ever shows the review.)
- OPEN DECISION (Greg): shared crown = book-only (default, rec) vs optional opt-in to attach the REVIEW
  blurb ("why I loved it")? Never the rating either way. -> awaiting Greg.

## Cross-refs
SOCIAL_DISCOVERY_PHASE.md (crown = a number-free, un-aggregatable discovery primitive on the follow graph);
STATS_PRIVACY_AND_FEATURES.md (ranking/sentiment/ratings stay private; crown is the lone shareable output).
