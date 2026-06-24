# Requirements

The complete master feature list, with status and where each lives. This is the source
of truth for scope — Claude Code builds to this. Status: ✅ done in prototype · ◑ partial
(works, but the full version is a build-phase goal) · ⭐ new / changed, to build.

## Library & shelves
| # | Requirement | Status | Notes / where |
|---|---|---|---|
| 1 | Create multiple TBRs | ✅ | `tbrs[]` |
| 1a | — priority TBR | ✅ | `priority` flag, spine shelf |
| 2 | Filterable library | ✅ | `renderFilterPanel`/`libPass` |
| 2a | — by tropes | ✅ | multi-select |
| 2b | — by completed / series status | ✅ | Standalone / Series / Complete |
| 2c | — by number of books in series | ✅ | series-length buckets |
| 2d | — **"none" option** (what needs completing) | ✅ | `seriesCount === null` → "None set" |
| 3 | Create collections | ✅ | `collections[]`, spine shelves |
| S1 | **Per-format ownership** (own it in physical / ebook / audiobook) | ⭐ | toggles per format on book detail; replaces single `format`/`source`. Physical may sub-split paperback/hardcover |
| S2 | **Separate owned shelves per format** | ⭐ | auto/smart shelves: **Owned · Physical**, **Owned · Ebook**, **Owned · Audiobook** (distinct shelves), derived from S1 — not hand-edited. Small owned-format icons on cover cards |

## Reading log & dates
| # | Requirement | Status | Notes |
|---|---|---|---|
| 4 | Date read / reread log | ✅ | `book.reads[]` |
| 4a | — log format read | ✅ | per-read `format` (independent of ownership — you can read a borrowed copy) |
| 4b | — rating + notes per reread | ✅ | per-read `rating`, `notes` |
| 5 | New-release books | ✅ | `renderReleases` |
| 6 | Publish dates, flexible precision | ✅ | `pub:{y,m,d}`, year / month / full |
| 7 | Reading calendar | ✅ | `renderCalendar` |
| 7a | — count read, with & without rereads | ✅ | distinct books vs. total reads |
| 7b | — "need to read" calendar | ✅ | `book.plan` planned dates |

## Adding & maintaining the library
| # | Requirement | Status | Notes |
|---|---|---|---|
| 8 | Barcode scanning to add | ✅ | EAN/UPC |
| 10 | Merge book info (like merging contacts) | ✅ | `findDuplicateGroups`/`mergeBooks` — one pair at a time |
| 11 | **Mass import / mass merge** | ⭐/◑ | **Mass import**: CSV (Goodreads/StoryGraph) ✅ + bulk ISBN/title add ⭐. **Mass merge**: resolve ALL detected duplicate groups in one bulk action ⭐ (prototype lists groups; needs a "merge all / review-and-merge" bulk flow). Run on import to auto-dedupe |

## Ratings & reviews
| # | Requirement | Status | Notes |
|---|---|---|---|
| R1 | **No overall/aggregate star rating** | ⭐ | Deliberately omit a Goodreads-style averaged number anywhere (cards, detail, lists). Keep the reader's **own** rating (per book + per reread) |
| R2 | **See others' ratings via individual reviews (opt-in)** | ⭐ | On book detail, an opt-in "Reviews" view lists **individual** reviews/ratings from others — never averaged into a headline number. Source v1: community (other Reverie users / club members); external sources optional later (see `DATA_SOURCES.md`) |

## Sharing, household & book clubs
| # | Requirement | Status | Notes |
|---|---|---|---|
| 9 | Shareable library for a household / sync | ◑ | capability-code sharing today; true accounts + multi-device library sync is the build-phase goal |
| 9a | — share lists; others see live edits | ✅ | `openSharedList`, ~4s polling → Realtime in rebuild |
| 9b | — book-club read-along, spoiler-gated comments | ✅ | `openClub`; comment hidden until `unit <= your progress`; group enters book + chapter/page count manually |
| 9c | — book-club TBR everyone can edit | ✅ | shared list, `kind:"clubtbr"` |

## Also built (beyond the original list)
Home dashboard (greeting, goal ring, reading-now progress, priority shelf, coming-soon);
Stats / "Your Reading, Wrapped"; Series view (owned-of-total, gap badges, set length);
two themes (Nocturne / Magnolia Dawn); JSON backup & restore; Mood Matchmaker.

## Net-new work for the rebuild (the ⭐ items)
1. **Per-format ownership toggles** (S1) + **separate owned smart-shelves per format** (S2).
2. **No aggregate rating** (R1) + **opt-in individual reviews from others** (R2).
3. **Mass import** (bulk add) + **mass merge** (bulk de-dupe) (11).
Plus finishing **household sync** (9) and the multi-user club backend (9a–9c).

## Decisions for the owner (defaults in `../CLAUDE.md`)
- Household model (shared library vs. per-account + shared lists/clubs).
- Spoiler gating: honor-based vs. server-enforced.
- "Others' reviews" source: community-only for v1, or wire an external review source.
- Physical ownership: single "physical" flag, or split paperback/hardcover.
