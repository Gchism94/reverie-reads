# design tool prompt — ownership by format + reviews/rating model

Paste into design tool. Standalone, but matches the existing Reverie identity. Covers
two net-new pieces: per-format ownership → separate owned shelves, and the deliberate
no-aggregate-rating / opt-in individual-reviews model. Tokens are in `DESIGN_SYSTEM.md`.

---

```
Update the design of "Reverie" — a personal library app for a romance / romantasy /
dark-romance reader with a gothic New Orleans look (gaslit night sky, wrought-iron
filigree, Fraunces display + Hanken Grotesk body, spine-shelf bookcases). Design the
affected screens in BOTH existing themes.

── THEMES (the only two; lead with magenta + gold in both) ──
NOCTURNE (dark, default): bg #0b0612→#15091f, ink #f6e9f1, muted #b08fae,
  primary magenta #e83a78, violet #7b3fa0, midnight blue #16266a, gaslamp gold #f0b14e.
MAGNOLIA DAWN (light): bg #fbeee9→#f5e0e4, ink #2a1320, muted #9a6b86,
  primary magenta #d4396f, plum #7b3fa0, indigo #2e3a73, antique gilt #c9842f.
Subtle animated night-sky background; respect prefers-reduced-motion. Mobile-first.
Use theme tokens, not hardcoded colors.

── FEATURE A: which formats you OWN ──
A reader can own a book in more than one format.
1) BOOK DETAIL — a "Your copies" block with three independent toggle switches:
   • 📖 Physical   • 📱 Ebook   • 🎧 Audiobook   (any number can be ON)
   - In-theme switches: track fills magenta→gold when ON, quiet outline when OFF.
   - The Physical toggle can expand to Paperback / Hardcover.
   - Live caption: "Owned in 2 formats — ebook & audiobook" / "Not in your library yet."
2) COVER CARDS (grid + spine shelves) — a delicate owned-format icon row (📖 📱 🎧),
   gold/lit for owned formats, dimmed/absent otherwise. Must not fight the cover art.
3) SHELVES — SEPARATE auto-updating owned shelves, one per format, pinned above the
   manual TBRs/Collections:
   • "Owned · Physical"   • "Owned · Ebook"   • "Owned · Audiobook"
   - Each is the signature spine shelf with its own live count (e.g. "📖 Physical · 230").
   - Clearly automatic: a small "Updates as you mark the copies you own", no add/remove.
   - Empty state (in voice): "Flip a copy switch on a book and it lands here."

── FEATURE B: ratings & reviews (deliberately different from Goodreads) ──
There is NO overall/aggregate star rating anywhere — no averaged number on cards,
detail, or lists.
- BOOK DETAIL shows the READER'S OWN rating only (their stars), editable, and the
  per-reread ratings inside the reread log.
- Others' opinions live behind an opt-in: a quiet "Read reviews" link/affordance that
  opens a panel listing INDIVIDUAL reviews from others (avatar, their stars, their text,
  date) — a scrollable list of distinct voices, never collapsed into one number or an
  average. Make the absence of an aggregate feel intentional and calm, not missing.

── STATES TO SHOW (both themes) ──
- Book detail: a book owned in some formats (ebook + audiobook ON, physical OFF) showing
  the reader's own rating and the "Read reviews" entry point; and a not-yet-owned book
  (all toggles OFF) with the wishlist caption.
- The reviews panel open: 3–4 individual reviews with differing star counts, clearly NOT
  averaged.
- Toggle component: ON and OFF, with hover + visible keyboard focus.
- Shelves: the three separate Owned·format shelves with counts; plus one empty state.
- Cover card with the owned-format icon row.

── CONSTRAINTS ──
Accessible: real switch semantics, visible focus, contrast in both themes, reduced
motion. Sentence case, plain verbs.

── DELIVERABLES ──
Updated Book detail (with Your copies + own-rating + reviews panel) and Shelves (three
Owned·format smart shelves) in both themes, plus the format-toggle, owned-format icon
row, and individual-review list components with their states.
```
