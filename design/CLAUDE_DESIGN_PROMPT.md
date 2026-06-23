# Claude Design prompt

Paste this into Claude Design to generate the refreshed UI. It's written to stand alone
(no project history needed). Themes are finalized: **Nocturne** (dark, no crimson) +
**Magnolia Dawn** (light). See `DESIGN_SYSTEM.md` for the token reference.

---

```
Refresh the visual design of an existing app called "Reverie" — a personal library
app for an avid romance / romantasy / dark-romance reader tracking a 1,000+ book
collection. Keep the information architecture and features intact; elevate the look
into a cohesive, distinctive identity and ship a design system plus mockups of the
core screens in two themes.

── BRAND & MOOD ──────────────────────────────────────────────
The aesthetic is gothic New Orleans — the Vieux Carré (French Quarter) after dark:
gaslight on wet cobblestone, wrought-iron balconies, magnolias, candlelight, a warm
night sky that never quite holds still. Romantic and a little witchy, but refined and
legible — not cluttered or kitschy. Cozy, not cold.

── TWO THEMES (this is the whole theme system — exactly two modes) ──
DARK = "Nocturne" (default). Deep gaslit midnight. NO red/crimson anywhere.
  bg base #0b0612 → #15091f, ink #f6e9f1, muted #b08fae
  accents: magenta #e83a78 (primary), violet #7b3fa0, midnight blue #16266a,
  gaslamp gold #f0b14e (the only warm accent)
LIGHT = "Magnolia Dawn". Warm parchment daylight, morning light through lace.
  bg base #fbeee9 → #f5e0e4, ink #2a1320, muted #9a6b86
  accents: bougainvillea magenta #d4396f (primary), plum #7b3fa0, indigo #2e3a73,
  antique gilt #c9842f
Both modes share one accent family — magenta, plum/violet, indigo/midnight-blue,
and gold — so they read as one product. Lead with magenta + gold in both.

── TYPOGRAPHY ────────────────────────────────────────────────
Display: Fraunces (high-contrast, opsz; use its italic for romance softness on
titles, palette names, section headers). Body/UI: Hanken Grotesk. Make type a
memorable part of the design — large tight display headings, generous spacing.

── MOTION & TEXTURE (the signature) ──────────────────────────
A living, gentle night sky behind the content: large soft radial-gradient color
"glows" that slowly drift and breathe (20–45s loops), faint twinkling stars, a slow
drifting fog layer, plus subtle film grain and a vignette. In Nocturne it's a magenta/
violet/blue nebula on near-black; in Magnolia Dawn it's soft rose/lavender/peach
dawn clouds on parchment. Keep motion subtle and tasteful, and disable it under
prefers-reduced-motion. Signature ornament: a thin wrought-iron filigree divider in
gaslamp gold under the wordmark and as section breaks. Hairline rules in gold.

── SIGNATURE COMPONENTS ──────────────────────────────────────
- Spine-shelf bookcases: lists shown as a horizontal row of book *spines* (vertical
  titles) that "flip" to reveal the cover when centered/scrolled. Used for TBRs,
  collections, and the priority shelf.
- Book cover cards with small spice (🌶️) and favorite (♥) indicators.
- A circular yearly reading-goal ring.

── SCREENS TO DESIGN (show each in both Nocturne and Magnolia Dawn) ──
1. Home dashboard — time-aware greeting, reading-goal ring, "Reading now" cards with
   a progress bar, Priority TBR spine shelf, "Coming soon" releases row, "Find my
   next read" / "Surprise me" buttons.
2. Library — grid of covers; a filter panel (tropes, subgenre, series status, series
   length incl. a "None set" option, reading status, format, favorites, search, sort);
   a Grid ⇄ Series toggle. Series view: owned-of-total cover strips with "X to get"
   gap badges and read ticks.
3. Book detail — cover, author/series, tropes, spice, rating, reading status with a
   progress slider, a reread log (each read: date, format, rating, notes), inline
   "add to shelf" chips, and Merge / Edit actions.
4. Shelves — TBRs (one starred as Priority) and Collections, both as spine shelves.
5. Planner — a reading Calendar (reads logged by date, planned "need to read" dots,
   counts with and without rereads) and a Releases list (publication dates with
   flexible precision: year / month / full; "Coming soon" / "Just released").
6. Stats — "Your Reading, Wrapped": books per month and per year, subgenre / format /
   spice breakdowns, top tropes and authors, fun facts.
7. Match — a short mood quiz, then a reveal showing a reading-mood profile and top
   unread picks with "Add to Priority TBR".
8. Clubs & Sharing — shared lists and a book-club TBR everyone can edit; book-club
   read-alongs where each reader tracks their chapter and comments stay spoiler-locked
   until you reach that point ("🔒 N comments unlock at Chapter 12"); join-by-code.
9. Add a book — barcode scan, ISBN/title search, manual entry.
10. Settings — display name, theme toggle (Nocturne / Magnolia Dawn), reading goal,
   JSON backup & restore, CSV import, merge duplicates.

── COMPONENTS & STATES ───────────────────────────────────────
Buttons (primary gradient magenta→gold, soft/ghost), chips/filters (on/off),
segmented toggles, search bar, modals/sheets, cards, empty states, and the spine
shelf. Show hover/focus and an empty state for at least Library and Clubs. Empty
states should invite action in the app's voice (e.g. "Mark a book 'Reading' and your
home comes alive").

── CONSTRAINTS ───────────────────────────────────────────────
Mobile-first, with responsive desktop layouts. Visible keyboard focus, adequate
contrast in both themes, reduced-motion respected. Sentence case, plain verbs,
no filler copy. Spend the boldness on the living sky + filigree + spine shelves;
keep everything else quiet and disciplined.

── DELIVERABLES ──────────────────────────────────────────────
1) A design-system board: color tokens (both themes), type scale, the filigree
   ornament, and the component set. 2) High-fidelity mockups of the screens above in
   both Nocturne and Magnolia Dawn, with the animated night-sky treatment shown.
```
