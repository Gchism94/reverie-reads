# Reverie

A personal library app for romance, romantasy, and dark-romance readers — built to
track a 1,000+ book collection the way the big trackers don't: spice levels, tropes,
series gaps, rereads, and a book-club layer, with a gothic New Orleans look.

This repository is the **consolidated project workspace**. It holds the current working
prototype, the finished datasets, the design direction, and the specs we'll build the
real front end and back end from next.

---

## Where things are

```
reverie/
├── README.md            ← you are here: overview + project map
├── ROADMAP.md           the path from prototype to shipped FE/BE product
├── CHANGELOG.md         what's been built so far
│
├── prototype/           THE CURRENT VERSION — a complete, single-file web app
│   ├── Reverie_Library.html   built & runnable (open in a browser)
│   ├── lib_template.html      source template (book data injected at build time)
│   └── build/build.mjs        seed-injection build script
│
├── data/                the book datasets + the scripts that produced them
│   ├── personal_seed.json     290 personal books (the live library seed)
│   ├── starter_books.json     389-book romance catalog
│   ├── curated_tropes.json    hand-curated trope/spice overlay
│   ├── extract_personal.py    rebuilds personal_seed.json from the spreadsheet
│   ├── extract_starter.py     rebuilds starter_books.json from the spreadsheet
│   └── raw/Chism_Books.xlsx   source spreadsheet
│
├── design/              the look & feel
│   ├── Reverie_Theme_Studio.html   live animated preview of the themes
│   ├── DESIGN_SYSTEM.md            finalized tokens: Nocturne (dark) + Magnolia Dawn (light)
│   └── CLAUDE_DESIGN_PROMPT.md     prompt for generating the refreshed UI
│
├── docs/                specs & research
│   ├── REQUIREMENTS.md      the feature checklist + where each lives
│   ├── FEATURES.md         everything the current prototype does
│   ├── ARCHITECTURE.md     current architecture + proposed FE/BE architecture
│   ├── DATA_MODEL.md       object shapes today + proposed relational schema
│   ├── DATA_SOURCES.md     covers / metadata / release-date source research
│   ├── SHARING.md          shared lists & book-club read-along design
│   └── TRADEMARK.md        name-clearance findings (not legal advice)
│
└── backend/             the coming back end
    ├── supabase_schema.sql     current capability-keyed shared-doc table
    └── README.md               notes for the backend build
```

## For the build phase (Claude Code)

Start with **`CLAUDE.md`** (Claude Code loads it automatically) and
`docs/CLAUDE_CODE_KICKOFF.md` (sequenced build plan).

## Run the current prototype

Open `prototype/Reverie_Library.html` in any modern browser — it's fully self-contained
(your library lives in the browser's local storage). To rebuild it after editing the
template:

```bash
cd prototype
node build/build.mjs        # injects data/personal_seed.json into lib_template.html
```

## Status

The prototype is feature-complete against the original requirements (see
`docs/REQUIREMENTS.md`). The next phase is a proper front end + back end so the library
can sync across devices and the household/book-club features become truly multi-user.
Start with `ROADMAP.md` and `docs/ARCHITECTURE.md`.

## Naming note

"Reverie" is the working name. There's an existing same-class (different-field) trademark
on the word, so a rename is on the table — see `docs/TRADEMARK.md` for the cleared
alternatives (Gloaming is currently the cleanest).
