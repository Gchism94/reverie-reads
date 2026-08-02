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
> when Open Library misses; we deliberately do not — see `packages/core/src/covers.ts`'s `fetchCover`
> for the reasoning. A personal, non-commercial library can take that rights risk; this one
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
