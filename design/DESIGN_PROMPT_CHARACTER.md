# design tool brief: Skin Character exploration — Tryst + Aphelion kit-of-parts (2026-06-28)

GOAL: prove that a per-skin CHARACTER vocabulary (beyond color+font) makes each skin feel like a distinct PLACE,
not a recolor. Design the full UI "kit of parts" in TWO skins at opposite ends so we can see the SAME component
feel like two different worlds -- while both stay obviously usable + AA-accessible. Output locks the vocabulary we
then tokenize and apply across all 9 skins.

NORTH STAR: warm, tactile, gorgeous, unmistakably its genre -- a PERSONAL LIBRARY you'd spend an evening in, not a
dashboard/SaaS app. GUARDRAIL: distinctive SURFACE, conventional INTERACTION -- buttons read + behave as buttons;
AA contrast holds (text legible over any texture; opaque scrims where needed); motion implies a reduced-motion
calm. No external images (CSS/SVG texture + ornament only).

DELIVER: two artboards (one per skin), each showing the SAME kit of parts in that skin's world, ideally arranged
so the two can be compared side by side:

- Controls: primary button, secondary, ghost/icon button; text input + search field; a chip/tag + a select; a toggle.
- Library objects: a book card (cover + the small "marks": read/owned/spice/fave); the book-detail rail header
  (title/author/series as a "nameplate"); a shelf-section header/label; a stat block (lean into NUMERALS); the
  reading goal ring.
- States + voice: an empty state (copy in the skin's VOICE), a toast/notification, a loading state.
  Express, in each: TYPE pushed into labels + numerals + empties; SHAPE (radius/border/silhouette/rule-style);
  MATERIAL (a whisper of surface texture); ORNAMENT (the genre's signature mark at a seam or two); implied MOTION.

SKIN 1 — TRYST (flagship; Romance): gaslit New Orleans after dark. WARM. Fraunces (display) pushed into labels +
oldstyle numerals; Hanken Grotesk body. Palette: deep magenta #e83a78 + gold #f0b14e + violet on near-black plum
(#0b0612->#15091f), ink #f6e9f1. Character: wrought-iron filigree dividers/ornament, gas-lamp glow, soft-gilded
corners, a velvet/haze surface, slow flickering motion. Voice: sultry, intimate, warm-gothic. (Tryst PINK stays
inside Tryst -- this is its world.)

SKIN 2 — APHELION (Sci-fi): deep space at the orbit's cold far point. COLD + PRECISE. Space Grotesk (display) +
Space Mono for numerals/labels. Palette: instrument cyan + indigo on near-black blue (#151e3e family), pale ink.
Character: sharp/precise silhouette, hairline instrument rules, thin radius, a starfield/grid surface, orbit-ring

- tick-mark ornament, precise instrument-panel motion. Voice: spare, exact, spacefarer-calm.

The test for success: a Tryst primary button and an Aphelion primary button should feel like objects from two
different worlds -- one gilded and warm, one machined and cold -- yet both instantly read as "press me." If they
just look recolored, push the non-color levers (type, shape, material, ornament) harder.
