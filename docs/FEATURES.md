# Features (current prototype)

What `prototype/Reverie_Library.html` does today.

## Navigation

Home · Library · Shelves (TBRs / Collections) · Planner (Calendar / Releases) · Stats ·
Match · Clubs · Add · plus a theme toggle and Settings.

## Home dashboard

Time-aware greeting; circular yearly **reading-goal ring** (tap to set); **Reading now**
cards with a progress bar you can nudge or finish into the read log; Priority TBR as a
spine shelf; Coming-soon releases row; "Find my next read" / "Surprise me".

## Library

Cover grid with deep filtering: tropes (multi), subgenre, series status, series length
(including **"None set"**), reading status, format, favorites, search, and sort. A
**Grid ⇄ Series** toggle; Series view shows owned-of-total cover strips with read ticks,
**"X to get"** gap badges, and a one-tap "set series length".

## Book detail

Cover, author/series, tropes, spice, rating, reading status with a **progress slider**,
a **reread log** (each read: date, format, rating, notes), inline "add to shelf" chips,
and **Merge…** / edit / remove actions.

## Shelves

Multiple **TBRs** (one starred as Priority) and **Collections**, both rendered as
horizontal **spine shelves** that flip spines to covers as you scroll.

## Planner

**Calendar** — reads logged by date, planned "need to read" dots, and counts both with
and without rereads. **Releases** — publication dates with flexible precision (year /
month / full) and "Coming soon" / "Just released" states.

## Stats — "Your Reading, Wrapped"

Books per month and per year, subgenre / format / spice breakdowns, top tropes and
authors, rereads, and fun facts. Year selector.

## Match (Mood Matchmaker)

A short mood quiz → a reading-mood profile and top **unread** picks, with "Add to
Priority TBR". (The old "book boyfriend" archetype survives only as a small muted tag.)

## Clubs & Sharing

Shared lists and a **book-club TBR everyone can edit**; **read-alongs** where each reader
tracks their chapter/page and comments stay **spoiler-locked** until you reach that point
("🔒 N comments unlock at Chapter 12"); join-by-code; sync setup. See `SHARING.md`.

## Add a book

Barcode scan (EAN/UPC), ISBN/title search (Google Books), and manual entry.

## Settings & data

Display name; theme (Nocturne / Magnolia Dawn); reading goal; **JSON backup & restore**;
**Goodreads / StoryGraph CSV import** (merges by title+author, brings real read dates);
**merge duplicates** (contact-style).

## Under the hood

Lazy-loaded, cached covers (Google Books → Open Library) with broken-link refetch; the
`Store` storage abstraction; the capability-keyed `Shared` sync layer.
