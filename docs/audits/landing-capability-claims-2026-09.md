# Landing capability and claims audit — September 2026

Scope: the signed-out front door on public `main` at `b36c7f1`, plus the authenticated routes that
can substantiate a public claim. This audit contains no production screenshots, account names,
library titles, notes, ratings, or reading history.

The redesign should tell four product stories in order: a personal library with durable context,
a household catalog that preserves each reader's identity, series truth that can be reviewed and
managed, and discovery shaped by the reader rather than an aggregate score. Skins are the visual
proof that those systems still feel personal. The rest belongs in a quieter capability index, not
six equally weighted feature cards.

## Claim inventory

| Capability               | Shipped evidence                                                                                                                                       | Safe public claim                                                                                                                                     | Boundary that copy must keep                                                                                                                                                                          |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Personal library         | `LibraryRoute`, `BookDetailRoute`, `ShelvesRoute`, reads, moods, tropes, formats, possession and wishlist models                                       | Keep books, editions, reading history, shelves, rereads, notes, moods, tropes and personal ratings together                                           | Reverie does not publish or average reader ratings; possession flags are independent rather than one exclusive status                                                                                 |
| Add and import           | `AddRoute`, CSV/XLSX import, JSON backup/restore, intake de-duplication                                                                                | Search, scan in supported browsers, add manually, or bring a Goodreads/StoryGraph-style file; duplicate intake is reviewed rather than blindly copied | Camera barcode detection needs a Chrome-based browser; metadata can remain partial or await review; imports do not prove every series claim                                                           |
| Household library        | personal/household scope in `LibraryRoute`; explicit destinations and delegated neutral adds in `AddRoute`; household membership RPCs                  | Share one household catalog while keeping each reader's copy, ownership and reading history distinct                                                  | It is opt-in placement, not unattended whole-library synchronization; delegated adds are neutral records and cannot assert another reader's ownership, wishlist or history                            |
| Series                   | structured `series`/`series_entries`, primary and secondary membership, confirmed/review states, `SeriesIndexRoute`, `SeriesRoute`, `SeriesManagement` | See series together, preserve more than one justified membership, review uncertain history, and rename, merge or reversibly remove a series           | No series is inferred merely because a single book exists; unknown and pending data do not count toward progress or gaps; connected-series universes are a private Pro layer, not a public-core claim |
| Match                    | `MatchRoute` scores unread personal books from the reader's mood, intensity, pace, tropes and learned taste                                            | Ask what fits now and rank unread books already in the reader's library                                                                               | It is not a universal recommendation score and does not consider available reading time or page count                                                                                                 |
| Discover                 | `DiscoverRoute` leads with the shared corpus, then a wider external shelf ordered by learned taste                                                     | Browse a growing catalog and see closer-to-your-taste books first                                                                                     | Wider-source coverage can lag, especially for indie/KU releases; the app never presents an aggregate rating                                                                                           |
| Planner and reading now  | `HomeRoute`, `PlannerRoute`, per-read dates and flexible publication/plan precision                                                                    | Track current progress, finishes, plans, releases and yearly totals                                                                                   | Planner is a month grid, not a full year grid; percent is the current progress unit                                                                                                                   |
| Stats and Wrapped        | `StatsRoute` and local reader data                                                                                                                     | See the reader's own year across pace, formats, genres, authors, tropes and rereads                                                                   | Wrapped is private; no social-card publishing flow is claimed                                                                                                                                         |
| Shelves, lists and clubs | personal TBRs/collections, shared lists, clubs, spoiler-gated read-along comments                                                                      | Keep personal shelves, make a shared list, or read together without exposing comments ahead of progress                                               | A household library and an editable shared list are different models; comments unlock against the reader's own progress                                                                               |
| Skins                    | the registry-backed nine skins plus Adaptive, with dark/light/system modes                                                                             | Change the whole reading room—type, surfaces, objects and voice—or let Adaptive follow the library                                                    | Skin is genre-neutral presentation, not a restriction on which books can live in a library                                                                                                            |
| Indie links              | indie finder plus `revenueCopy(buyConfig())`                                                                                                           | Point purchase links toward independent bookstores and the reader's chosen local shop when configured                                                 | Money language must continue to come from the live attribution configuration; never hardcode a no-commission promise                                                                                  |
| Data control and privacy | authenticated account boundary, RLS, JSON export, explicit public share codes                                                                          | Private by default, exportable, and public only through an explicit share surface                                                                     | Data is hosted, not device-only; offline is a read cache with session constraints, not a complete offline mode or write queue                                                                         |
| Authentication           | password sign-up/sign-in, verification and recovery; Google/Apple UI only when configured                                                              | Create an account, log in, verify email and recover access                                                                                            | Do not promise a social provider unless its deployment configuration actually enables it                                                                                                              |
| Administration           | corpus completion/review, cover and series suggestion review, additive canonical promotion                                                             | None in the primary visitor story; it can appear in product documentation for approved administrators                                                 | Administrator tools are not normal reader permissions and must not be framed as crowd editing                                                                                                         |

## Current landing findings

1. The gold-on-night hero and live skin showcase already match the authenticated product's visual
   language and should be evolved, not discarded.
2. The current feature grid predates household scope and structured series review, so the most
   differentiated shipped behavior is absent while smaller utilities receive equal emphasis.
3. “Tangled, interconnected series … in the exact order to read them” is too broad for the public
   repository. Public series preserves confirmed membership and in-series order; connected-series
   universe topology is Pro and must remain deployment-aware.
4. “Your data stays yours” is defensible only beside the concrete export and privacy explanation.
   It must not imply local-only storage or complete offline behavior.
5. The document has only a generic title and no description, Open Graph, Twitter, canonical or
   share-image metadata.
6. Signed-out desktop and mobile are not covered by their own acceptance spec. Existing generic axe
   coverage is useful but does not guard landing story order, auth destinations, navigation, or
   horizontal overflow.

## Redesign acceptance

- Use curated, publication-safe fixtures only; no production account data or screenshots.
- Lead with the four differentiated stories above and retain a compact, accurate capability index.
- Every auth call to action must preserve explicit sign-in/sign-up mode in the URL.
- Mobile uses a deliberate reading order and touch-sized navigation, not a desktop grid stacked
  without hierarchy.
- Reduced motion leaves the composition intact; focus, contrast and semantic heading order pass.
- Static metadata describes the shipped product accurately and includes a local share-preview
  asset.
- A browser acceptance spec covers desktop and 390px mobile, auth links, the mobile menu, story
  headings, metadata and horizontal overflow.

## Implementation verification

The redesigned page uses only curated fictional fixtures and local brand assets. It was inspected
as a real rendered page at 390px, 768px, 1024px and 1440px; none of those viewports overflowed
horizontally. The 1200 × 630 share image is a purpose-built capture of the same composition rather
than a production account screenshot.

The browser gate completed on 2026-09-01 with 219 passing checks, 10 intentional project-specific
skips and no failures across the 229-check matrix. That includes the signed-out landing and auth
axe scan, every registry-selected skin/mode accessibility sweep, the new desktop/mobile landing
contract, reduced motion, touch-sized navigation, metadata, auth destinations and route-wide phone
overflow coverage. The remaining gate is also green: formatting, lint, strict type checks, 3,206
unit/component tests, 1,084 database assertions and the production-shaped build (including its
local-URL and font-origin inspection) all pass.

The full matrix also exposed an independent destructive-action timing defect: a personal trope's
Delete control could become active after the trope name loaded but before its book assignments did.
Deletion now fails closed until both the book and assignment inventories succeed, and the existing
test proves the exact carrier count, cancel behavior and cascading cleanup in its original
full-suite position.
