# Book data sources

Reliability is scored **for this project's use case** — covering romance / romantasy / dark-romance,
including indie and Kindle Unlimited titles, _and_ being usable from a personal app (several
"best" databases are effectively locked behind affiliate sales or library membership).

## Covers & backlist metadata

| Source                      | Reliability /5 | Cost                                                  | How to grab data                                                                                                                                                                                        |
| --------------------------- | -------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Google Books**            | 4.5            | Free; ~1,000 requests/day default, more on request    | `GET …/books/v1/volumes?q=isbn:X` or `intitle:"…"+inauthor:"…"`; JSON → `volumeInfo.imageLinks.thumbnail`. Optional API key                                                                             |
| **Hardcover**               | 4              | Free public API; ~$5/mo Supporter adds librarian edit | GraphQL `POST https://api.hardcover.app/v1/graphql` with a free Bearer token. Books carry editions, series, release dates, genres                                                                       |
| **ISBNdb**                  | 4 (paid)       | ~$15 / $36 / $100 / $300 per month tiers              | `GET https://api2.isbndb.com/book/{isbn}` with API-key header; ~1 req/sec; bulk up to 1,000/call on higher tiers                                                                                        |
| **Apple / iTunes Search**   | 3.5            | Free, no key (~20 calls/min)                          | `GET https://itunes.apple.com/search?media=ebook&term=…`; `artworkUrl100` → swap to higher res. Strong for audiobook art                                                                                |
| **Open Library**            | 3.5            | Free                                                  | Search `…/search.json?title=&author=`; covers `https://covers.openlibrary.org/b/isbn/{isbn}-L.jpg`. Cover-by-ISBN limited to 100 req/IP / 5 min; search 1 req/sec (3 with a User-Agent + contact email) |
| **LibraryThing covers**     | 3              | Free dev key; attribution                             | `https://covers.librarything.com/devkey/{KEY}/large/isbn/{isbn}`                                                                                                                                        |
| **Open Library bulk dumps** | 3              | Free                                                  | Monthly data dumps to match offline; zero runtime calls                                                                                                                                                 |

> **Open Library cover resolution — credit.** The ISBN-direct cover endpoint
> (`/b/isbn/{isbn}-L.jpg?default=false`) and eager batch ingest into our own Storage — rather than
> ingesting only when a reader happens to open a book's detail page — were adapted from work shared
> by **Annabelle** ([somnia-library](https://github.com/Annabelle0726/somnia-library)). The
> `default=false` parameter is load-bearing: without it a miss returns a 43-byte 1×1 GIF at HTTP 200
> that sniffs as a valid image and would be stored as a durable cover.
>
> Adapted, not copied wholesale. Her project also falls back to Amazon, Goodreads and image search
> when Open Library misses; we deliberately do not: Amazon's terms bar
> use as a general covers backend outside an affiliate context, Goodreads' developer terms prohibit
> storing their data, and re-hosting scraped art is the unresolved rights risk named below. A personal, non-commercial library can take that rights risk; this one
> distributes to other readers and cannot.
> | **BookBrainz** | 2 | Free (CC0) | REST/GraphQL + dumps; sparse for romance |
> | **WorldCat / OCLC** | 2 practical (4 data) | Gated | Discovery/Search API needs library membership + OAuth |
> | **Amazon (PA-API → Creators API)** | 2 practical (5 data) | "Free" but gated | Best covers, but the API is being retired, closed to new sign-ups, and requires an Associates account with qualifying sales |
> | **Goodreads** | 1 practical (5 data) | n/a | Public API discontinued; only unofficial scrapers remain (against ToS) |
> | **Bowker / Books in Print / ONIX** | 1 practical | Enterprise | Authoritative ONIX feeds via contract; overkill |

### Caveats that hit a romance library hard

- **KU / indie ebooks frequently have no ISBN — only an Amazon ASIN.** ISBN lookups (ISBNdb, Open Library covers) miss them; covers really only live on Amazon/Goodreads. Expect a manual cover-paste fallback for those.
- **Hotlinking + CORS.** Cover URLs scraped from Amazon/B&N break unpredictably from a browser. API-served image URLs (Google / Open Library / Apple) are CORS-safe.
- **Cache aggressively.** Open Library will `403` quickly otherwise. The app caches covers at runtime; the enrich scripts bake them into the seed.

### Recommended stack (all free, no gatekeeping)

**Google Books primary → Open Library cover fallback → Hardcover for the misses**, then a manual
cover-URL / upload field for ASIN-only stragglers. The app already does this chain at runtime;
`scripts/enrich_covers.mjs` and `scripts/enrich_hardcover.mjs` pre-bake it into the seed.

## Series membership and order

Series classification is a separate evidence problem from matching a book. A provider may identify
the correct title, author, and ISBN while still attaching a search-only label that is not a real
series. Reverie therefore stores identity confidence and membership confidence independently and
accepts an automatic corpus default only when a relationship source actually contains that work.

Use this hierarchy by question:

| Question                              | Preferred evidence                                                                                                                                                                                                                                              |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Has the book actually been published? | A live publisher product page, issued ISBN/ONIX distributor data, or a post-publication national-library record. A product announcement or Library of Congress CIP record may be prepublication evidence, not proof of release.                                 |
| Is the series complete or continuing? | An explicit, dated author statement, then the publisher/imprint or rights catalog. “Latest release” and the current number of known books never prove completion.                                                                                               |
| What is the exact order?              | The author's recommended-order page, then a publisher series page, then corroborating relational databases. Preserve whether the value means `publication`, `recommended`, `narrative`, or `unspecified`; never silently collapse those into one kind of order. |
| Which edition/history is involved?    | National-library and ISBN/ONIX records; ISFDB is useful corroboration for speculative fiction. Edition publication does not by itself prove work-level series membership.                                                                                       |
| What breaks a tie?                    | Two independent sources, with author/publisher evidence controlling. A disagreement remains an administrator review item rather than being decided by source count alone.                                                                                       |

Current automatic classification uses Hardcover's structured series-to-book relationship and its
provider cardinality. Candidate labels returned during ordinary Google Books/Open Library/Hardcover
search are not relationship evidence. The evidence model also accepts author, publisher,
ISBN/ONIX, national-library, Wikidata, ISFDB, and Open Library observations as supported connectors
are added; unavailable sources remain retryable and cannot become a negative ruling. Open Library's
own guidance reserves its APIs for low-volume real-time use and points bulk consumers to monthly
dumps, so a future corpus-wide connector must use the dumps rather than request every work live.

Inventaire and BookBrainz are implemented in the reproducible trial only, not production
classification. Inventaire's CC0 graph can add work-to-series relationships beyond Wikidata, but a
`wd:` entity observed through Inventaire retains Wikidata lineage and is not independent
corroboration. BookBrainz's CC0 relationship graph is useful corroboration but its alpha API and
sparse target-corpus coverage keep it supplemental. Both adapters verify the exact work through an
author relationship and then inside the provider's series roster; a one-member roster remains
review-only evidence.

The trial's LLM resolver is also not a source. It receives only already-fetched provider evidence,
has no browsing tools or truth labels, emits strict structured proposals, and has no Supabase write
path. A deterministic validator rejects any field or citation absent from the evidence packet and
keeps singletons, conflicts, and unsupported order/role claims out of automatic fills. Production
use remains blocked until the authority-reviewed accuracy, standalone-safety, provenance, privacy,
latency, and cost gates pass.

Provider data is cleaned before it reaches that resolver. Google contributes identity only.
Open Library, Wikidata, Inventaire, and BookBrainz contribute a membership only after the exact
author-matched work appears in a structured relationship; mirrored Wikidata observations share one
lineage. Hardcover is a high-coverage candidate supplement, not an automatic authority: its
relationship needs corroboration from an independently originated open-graph claim. A self-titled
Hardcover relation is flagged, a relation labeled or typed as a universe is quarantined, and an
unknown provider cannot corroborate anything until its policy profile is defined. Every current
community source needs independent agreement before an ordinal is automatic; a position conflict
keeps the membership but clears the order.

The same profiles keep data-use boundaries visible to the resolver: Wikidata, Inventaire, and
BookBrainz claims are durable CC0 inputs; Google is live identity-only; Open Library remains trial
input pending its rights review; and Hardcover remains decision input pending usable terms. A
model-generated restatement does not change a source's license or storage boundary.

That cleaning layer addresses false positives by preventing them from becoming corpus defaults; it
does not manufacture a negative fact. A resolver may route a suspect Hardcover relation to review
or abstain, but “standalone” still requires affirmative author/publisher evidence. Missing Open
Library, Wikidata, Inventaire, or BookBrainz data remains an observation only.

### Fantastic Fiction boundary

Fantastic Fiction is conflict/omission discovery and administrator corroboration only. Reverie may
retain only the fact that this corpus work is a member, the series name, the order value/type, the
page URL, and the observation time. It does not retain the site's series-size count and must not
ingest descriptions, covers, reviews, biographies, lists, or other site content. Fantastic Fiction
never promotes a singleton or overrides an
author/publisher source by itself. There is no supported public API in use, so the background worker
does not scrape it; automation requires written permission or a supported licensed feed.

Public accessibility is not blanket scraping authorization. In the Ninth Circuit, _hiQ v.
LinkedIn_ limits one CFAA theory for public pages, but contract, copyright/compilation, state-law,
technical-control, and non-U.S. database-right questions remain separate. Site terms and robots
rules are checked before any connector is enabled, and a technical refusal remains a refusal.

## Future / upcoming releases

There is **no reliable free feed of upcoming romance** — indie/KU release dates live as Amazon
pre-orders and author newsletters, and Goodreads (which did author-follow + new-release alerts)
closed its API. The viable model is **follow the authors you already own and check for their next
book** (`scripts/fetch_upcoming.mjs`).

| Source                   | Reliability /5    | Cost                                | How to get upcoming dates                                                                                                    |
| ------------------------ | ----------------- | ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| **Hardcover**            | 4                 | Free                                | GraphQL; editions carry `release_date` you can filter/sort. Query by author → `release_date >= today` → titles you don't own |
| **Penguin Random House** | 3 (trad only)     | Free key (manual ~7-day activation) | Public title/author API; `onsale` is the public release date, filterable. PRH imprints only — blind to indie/KU              |
| **Google Books**         | 3                 | Free                                | `inauthor:"…"` then keep results with a future `publishedDate`. Spotty on pre-orders but a fine keyless fallback             |
| **ISBNdb**               | 2.5               | Paid                                | Pre-pub ISBNs exist but it isn't a "what's coming" feed; KU ebooks without ISBNs never appear                                |
| **Amazon pre-orders**    | data 5 / usable 1 | Gated                               | Where indie dates actually are, but the API is closed to new sign-ups                                                        |
| **Manual + newsletters** | 5                 | Free                                | You often know a date before any API does; the app takes flexible (year / month / full) future dates                         |
