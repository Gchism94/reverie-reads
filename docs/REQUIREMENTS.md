# Requirements

The original feature list, with where each lives in the current prototype. All items
are implemented; the next phase re-implements them on the FE/BE stack (see
`ARCHITECTURE.md`).

| # | Requirement | Status | Where (prototype) |
|---|---|---|---|
| 1 | Create multiple TBRs | ✅ | `tbrs[]`, `renderTBR`, `newTbr` |
| 1a | — priority TBR | ✅ | `priority` flag, spine shelf, reorder |
| 2 | Filterable library | ✅ | `renderFilterPanel`, `libPass` |
| 2a | — by tropes | ✅ | multi-select trope filter |
| 2b | — by completed / series status | ✅ | Standalone / Series / Complete |
| 2c | — by number of books in series | ✅ | series-length buckets |
| 2d | — **"none" option** (what needs completing) | ✅ | `seriesCount === null` → "None set" |
| 3 | Create collections | ✅ | `collections[]`, spine shelves |
| 4 | Date read / reread log | ✅ | `book.reads[]`, `logReadForm` |
| 4a | — log format read | ✅ | per-read `format` |
| 4b | — rating + notes per reread | ✅ | per-read `rating`, `notes` |
| 5 | New-release books | ✅ | `renderReleases` |
| 6 | Publish dates, flexible precision | ✅ | `pub:{y,m,d}`, year/month/full |
| 7 | Reading calendar | ✅ | `renderCalendar`, `allReads` |
| 7a | — count read with & without rereads | ✅ | distinct-book vs. total reads |
| 7b | — "need to read" calendar | ✅ | `book.plan` planned dates |
| 8 | Barcode scanning to add | ✅ | html5-qrcode (EAN/UPC) |
| 9 | Shareable library / household sync | ◑ | shared docs; full multi-user sync is the FE/BE goal |
| 9a | — share lists, others see live edits | ✅ | `openSharedList`, ~4s polling |
| 9b | — book-club read-along, spoiler-gated comments | ✅ | `openClub`, `unit <= myProgress` |
| 9c | — book-club TBR everyone can edit | ✅ | shared list, `kind:"clubtbr"` |
| 10 | Merge book info (like merging contacts) | ✅ | `findDuplicateGroups`, `mergeBooks` |

Legend: ✅ done · ◑ partial (works via capability codes; true accounts/sync pending)

## Beyond the original list (also built)
Home dashboard (greeting, goal ring, reading-now progress, priority shelf, coming-soon);
Stats / "Your Reading, Wrapped"; Series view (owned-of-total, gap badges, set length);
After Dark / theme toggle; JSON backup & restore; Goodreads/StoryGraph CSV import; Mood
Matchmaker. See `FEATURES.md`.

## Carried into the rebuild
Everything above. The two items to actively decide on during the build:
- **#9** household model + whether sharing keeps capability codes alongside accounts.
- **#9b** spoiler gating: keep honor-based (client) or make it server-enforced.
