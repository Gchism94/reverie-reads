# Task: Import Quality — Goodreads Mapping Fidelity & Honest Placeholders

> **Status: shipped in #54.** This is the brief the work was built against, not a description of
> how the app behaves today. Borrowed-copy CSV import landed in #75. For current behavior, read
> the code and `docs/DATA_MODEL.md`.

**Branch:** `fix/import-quality`
**Dependencies:** `feat/ownership-model` merged (for the to-read → unowned mapping). Benefits from `feat/series-experience` for series linking but can gate that piece if it hasn't landed.
**Golden rule applies:** eyeball on the real authenticated app before merge — with a real Goodreads export, not a synthetic fixture only.

## Context

Launch feedback: importing from the Goodreads spreadsheet "does not add the data very great," and missing data gets a placeholder "that does not fit." Two separate defects: mapping fidelity, and placeholder policy. The fix covers both readings of "does not fit": fabricated data values, and a visually wrong no-cover placeholder.

## 1. Mapping audit — evidence first

Before changing anything, run a real Goodreads CSV export through the current importer and produce a **field-by-field mapping table**: source column → destination field → transform applied → observed result → verdict (correct / lossy / garbled / dropped). Include at minimum: Title, Author, Additional Authors, ISBN/ISBN13 (remember the text-ISBN zero-padding lesson from the XLSX adapter — apply the same discipline here), My Rating, Average Rating (should we even import this? Reverie's thesis is anti-consensus — recommend dropping it, flag for Greg), Publisher, Number of Pages, Year Published / Original Publication Year, Date Read, Date Added, Bookshelves, Exclusive Shelf, My Review, Private Notes, Read Count.

Put this table in the completion report — it's the checkpoint artifact. Then fix everything lossy/garbled/dropped.

## 2. Known specific fixes

- **Series parsing:** Goodreads encodes series in the title — `"Title (Series Name, #2)"` and variants (`#2.5`, `#1-3`, multiple series). Parse it out: clean title, series name, position. Link to an existing series or create one (or, if series-experience hasn't merged, stash parsed values in whatever series fields exist today and note the gate). Never leave the parenthetical junk in the display title.
- **Exclusive Shelf → ownership + status:** `read` → owned + read (with Date Read); `currently-reading` → owned + reading; `to-read` → unowned + placed on a default "Imported TBR" (create if absent, name it warmly).
- **Bookshelves column:** map Goodreads custom shelves to Reverie shelves — create on first sight, membership appended. Skip the exclusive-shelf values that also appear here.
- **Dates:** Date Read must land on the calendar/read log (it drives Wrapped/stats); verify timezone-safe parsing of Goodreads' date format.
- **Ratings:** Goodreads `0` means unrated, not zero stars. Import as null.

## 3. Placeholder policy — never fabricate

- **Data:** absent source data imports as absent. No default page counts, dates, ratings, or genres. UI renders absence as a quiet blank/em-dash state, never a fake value. Audit both importers (Goodreads CSV and Reverie XLSX) and the add flows for any defaulting-to-fake behavior.
- **No-cover placeholder:** must be skin-tokened (per-skin character, not one generic gray card), correct 2:3 cover aspect so grids and spines don't distort, show title/author legibly, and pass the registry-keyed contrast test in all nine skins (this exact path produced the 10 contrast violations before — treat it as the highest-risk surface).
- Post-import enrichment (cover fetch via the Google Books/Open Library chain) may fill covers, but enrichment failures degrade to the honest placeholder, never a wrong cover guess.

## 4. Import summary

- After an import, show a summary: N imported, N updated/merged, N skipped (with reasons), fields that came in empty in bulk ("142 books had no cover — we'll fetch what we can"). Modest scope — a screen or rich toast, not a report engine.

## Out of scope

StoryGraph import (audit only if the code path already exists; don't build it). Re-import/dedupe strategy changes beyond what fidelity fixes require. Placeholder redesign beyond the policy above.

## Acceptance / eyeball checklist

- [ ] Real Goodreads export imports with the mapping table verified row-by-row on ≥10 spot-checked books
- [ ] A `(Series, #2)` title imports with clean title and correct series/position
- [ ] A `to-read` book lands unowned on the Imported TBR
- [ ] A book with no page count shows no page count anywhere — not a fake value
- [ ] No-cover placeholder eyeballed in all nine skins; contrast test green
- [ ] Import summary reflects reality for a deliberately messy fixture
- [ ] Full suite + axe green

## Completion report

Report: the full mapping table (before/after), series-parse regex/strategy and its test cases, every fabrication instance found and removed, placeholder implementation, summary-screen scope, skins eyeballed, test results. Flag the Average Rating question for Greg explicitly.
