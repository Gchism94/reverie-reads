# Reverie — implementation (Code): XLSX import (2026-06-29)

> Builds directly on the in-flow import (PR #11) + the shared `importDetectedExport` engine.
> Greg's reasoning for prioritizing this: the people most likely to keep a library in a spreadsheet are
> exactly the ones who don't know what a CSV is — so "export to CSV first" is a wall, not a step.

## What this is (and isn't)
XLSX support is a **thin parse adapter that converts a spreadsheet to the same rows the CSV path already
produces**, then hands them to the existing engine. It is **NOT** a second import pipeline.

```
.xlsx file ──► [NEW: xlsx parse adapter] ──► rows (identical shape to CSV output)
                                              │
CSV file ────► [existing CSV parse] ─────────┤
                                              ▼
                              importDetectedExport (auto-detect, unchanged)
                                              ▼
                     add / merge / reading-orders + DuplicateReview (unchanged)
                                              ▼
                  in-flow screens: Building… → Here's what we found → dedupe → Ready (unchanged)
```

**The one rule: reuse, don't fork.** Everything downstream of "rows" — detection, add/merge, DuplicateReview,
the in-flow onboarding screens, the Settings import screen, the skin-numeral counts — stays untouched. If you
find yourself editing `importDetectedExport` or DuplicateReview, stop: the adapter's output shape is wrong, fix
that instead. The win Code already banked on #11 (one import/merge path, not two) must not regress here.

## Branching (don't assume merged)
XLSX depends on the in-flow import in #11, which is stacked on onboarding #10.
- Preferred: branch off **main once #10 and #11 are both merged**.
- If not yet merged when you start: **stack on `#11`'s head**, base the new PR on #11. Merge order
  **#10 → #11 → (xlsx)**. Keep the diff XLSX-only.

---

## THE CRUX — make XLSX rows indistinguishable from CSV rows
`importDetectedExport` auto-detects column shape from CSV-style string rows. The adapter's only real job is to
hand it cells that look exactly like what CSV parsing yields, so detection can't tell the source apart. The
failure modes that break detection — handle each:
- **Dates**: Excel stores dates as serial numbers. Emit the **same string format the CSV path expects** (e.g.
  the ISO/`YYYY-MM-DD` or human date a Goodreads/StoryGraph CSV would carry), NOT `45000`. This is the most
  likely silent breakage — verify against a real export's date columns.
- **Numbers**: coerce to string (ratings, page counts, years) so they match CSV text cells.
- **Formula cells**: emit the **cached/computed value**, never the formula text.
- **Whitespace / empties**: trim; empty cells → empty string, consistent with CSV.

## EDGE / MESSY INPUT — graceful, especially at first run
This carries the first-run concern from the import-depth review: a misread at onboarding, with zero user
investment, is the worst possible first impression. The adapter must not dead-end.
- **Sheet selection**: default to the **first non-empty sheet**. (Multi-sheet picker is out of scope for v1 —
  a default keeps the no-Map-step simplicity.)
- **Header row**: handle a leading blank/title row before the header where cheap; if the header can't be found,
  fall through to the failure path rather than importing garbage.
- **Unreadable / not tabular / empty**: surface a legible **"we couldn't read this spreadsheet"** with a way
  forward (try a CSV export, or whatever manual path exists) — same graceful fallback the messy-CSV case needs.
  No silent stall on "Building your library…".

## DEPENDENCY — lazy-load it
- Use a maintained spreadsheet parser (SheetJS / `xlsx` is the usual choice). **Pin a current, maintained
  version and verify it's current** — don't inherit a stale pin.
- **Dynamic-import the parser** so it's only fetched when a user actually picks an `.xlsx` file. Most imports
  are CSV; the XLSX parser must not sit in the main bundle and tax every page load. Confirm it lands in a
  lazy chunk, not the entry bundle.

## WIRING — both entry points
The CSV `accept` is in two places that share the engine: **Settings import** and the **in-flow onboarding
import**. Add `.xlsx` to both file pickers and route both through the one adapter. One adapter, two call sites.

## SCOPE
- `.xlsx` only. `.xls` (old binary format) is a separate, messier beast — **out of scope**, note as optional follow-up.
- No new visual surface: XLSX reuses CSV's exact in-flow screens, so the counts render in skin numerals with
  zero new character work. Nothing for Design here.

---

## GUARDRAILS / GATE
- **Tests**: add XLSX fixtures and assert the adapter produces rows **identical to the CSV equivalent** for the
  same data (clean case) — that's the core guarantee. Add at least one **messy fixture**: serial dates, a
  formula cell, a numeric rating, a leading blank row. Test the unreadable-file fallback path.
- No regression to the existing CSV import, DuplicateReview, or the in-flow screens.
- **GATE**: core tests + typecheck + lint + build + the axe e2e sweep all green. (Live import-done/review still
  needs auth+DB and won't be in the headless set — same honest caveat as #11; the shared components + the
  identical-rows test carry it. Greg verifies a real `.xlsx` through Building → found → dedupe → Ready during
  the live look he's already doing on the CSV path.)

## STAGING
One reviewable PR, **branch, not merged**. After it lands, both export realities a book reader actually has —
CSV from Goodreads/StoryGraph, and the spreadsheet people keep by hand — import through the same proven flow.

DELIVERABLE: an `.xlsx` parse adapter emitting CSV-identical rows into `importDetectedExport`; lazy-loaded
parser; `.xlsx` accepted in both Settings + in-flow pickers; graceful failure on unreadable/empty sheets;
fixtures proving row-identity + messy-input + fallback; CSV path and downstream components untouched; gate
green. Branch, not merged.
