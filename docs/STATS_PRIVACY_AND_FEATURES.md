# Personal stats — privacy rule + feature set (2026-06-28)

## HARD RULE (Greg): personal reading stats are ONLY ever personal
All reading-based / personal STAT + analytics data is owner-only, FOREVER. No public option, no
app-provided share/export, no public-read DB path. When the social/public layer ships, stats are a
hard CARVE-OUT -- public policies never touch these tables.
- Honest limit: a web app can't block OS screenshots of one's own screen. What IS in scope: the app
  never EXPOSES stats publicly and never offers a share/export surface for them.
- BOUNDARY vs the social/public model: your SHELF + per-book RATINGS (catalog) can be public; your
  reading BEHAVIOR + ANALYTICS never can.
- COVERS this: Stats/Wrapped, reading goals/challenges, bingo, calendar, pace/streaks, rereads
  analytics, ratings AGGREGATES (your average etc.), and every derived reading analytic.

## CONFLICT RESOLVED: Wrapped is NOT shareable
Earlier copy ("a shareable Wrapped", landing) is RETRACTED. Wrapped = a private year-in-review; no
share card, no export. Landing copy fixed; the Wrapped DESIGN must not include sharing.

## Current stats (from FEATURES.md)
Stats / "Your Reading, Wrapped": books per month + per year (year selector); subgenre / format / spice
breakdowns; top tropes; top authors; rereads; fun facts. Around it: Home goal ring (reading goal);
Calendar (reads by date, +/- rereads); Series view (owned-of-total, gap badges, set length).

## Suggested additions (lean into series / tropes / intensity / authorship / rereads)
- SERIES: completion (finished/in-progress/abandoned); "one book from done"; longest series; cliffhangers
  waiting (in-progress series whose next book is out).
- TBR HEALTH: size + oldest unread; ADDED-vs-READ this year; acquisition-vs-consumption.
- AUTHOR DEPTH: auto-buy authors (read everything); author completion %; new authors discovered this year.
- READING RHYTHM (intimate -> private): pace trend; longest streak; reading-season heatmap (months/days).
- TROPES & SPICE: comfort tropes; trope of the year; spiciest month; spice-vs-rating tendency.
- YOUR RATINGS (private aggregate): average; distribution; 5-star reads; generous/harsh streaks.
- COMFORT: most-reread books.
- FUN VOLUME: total pages -> playful equivalents; longest/shortest; backlist-vs-new-release.

## DECISION: reading challenges + bingo -- BOTH, both PRIVATE
- CHALLENGES: formalize the existing goal ring into private goals (count + themed: finish N in-progress
  series, try N new subgenres, N new authors). Progress tracked; NO leaderboard/sharing.
- BINGO (the standout): trope-powered reading bingo. Squares (enemies-to-lovers, morally-grey MMC, fake
  dating, one bed, found family) AUTO-FILL from tropes already detected on reads; or assign by hand.
  Private, seasonal cards. Uniquely leverages the trope taxonomy. Post-launch delight, not a v1 blocker.
