# Skin Character System — make each skin a PLACE, not a palette (2026-06-28)

## North star (Greg)

Each theme must STICK OUT; the library must feel UNIQUE, GORGEOUS, WARM + INVITING -- a PERSONAL LIBRARY you'd
spend an evening in, NOT just another app. Today genre lives only in the skins (color/font/night sky) wrapped
around generic SaaS chrome -> reads as "a themeable book tracker." Genre must reach everything a person touches.

## Hard guardrail

DISTINCTIVE SURFACE, CONVENTIONAL INTERACTION. A button may look like an object of its world but must obviously
read + behave as a button. AA contrast NON-NEGOTIABLE (we earned the contrast lesson -- don't trade it back):
texture never buries text (opaque scrims where needed); motion always calms under prefers-reduced-motion.
Character is ADDITIVE to a usable, accessible base -- never a substitute.

## The levers (strongest "reads differently" first) -> all expressed as PER-SKIN TOKENS

1. TYPOGRAPHY: display face past headings into labels, numerals, stat blocks, empty states; expressive type
   scale; label small-caps/tracking; numeral style (oldstyle/lining, tabular); shelf-label / nameplate / drop-cap
   treatments. Tokens: --font-display/--font-body (exist) + --label-transform, --label-tracking, --numeral-style,
   --type-scale.
2. SHAPE/LINE: per-skin radius scale, border weight + style, control silhouette (pill vs cut-corner vs rect),
   divider/rule style (iron filigree vs hairline instrument rule). Tokens: --radius-\*, --border-width, --rule-style.
3. MATERIAL/TEXTURE: a whisper of surface material so a card feels like a surface not a div -- vellum (Grimoire),
   granite (Marrow), starfield/grid (Aphelion), velvet/haze (Tryst), warm paper (Calliope/Compendium). CHEAP CSS
   (gradients/noise), AA-safe (opaque card behind text -- the placeholder lesson), no external images. Tokens:
   --surface-texture, --surface-overlay.
4. ORNAMENT/MOTIF: each genre's signature mark at the seams (section breaks, empty states, loading, goal ring).
   Per-skin motif set (inline SVG/CSS). Sparing.
5. MOTION: per-skin personality + easing/duration (Tryst slow gaslit flicker, Aphelion precise instrument
   transitions). Tokens: --ease, --duration. Reduced-motion fallback always.
6. VOICE: empty states, toasts, loading, the goal-ring greeting written in each genre's register (Tryst sultry-
   warm, Aphelion spare/spacefarer, Marrow ominous-playful, Mull cozy). A per-skin microcopy pack; genre-
   vernacular-aware (ties to the sentiment lexicon).

## Warmth / "a place, not a dashboard"

Tactile texture; generous type; personal touches (a nameplate, "Good evening, reader"); lean into the spatial
library metaphor the 3-column master-detail already implies (detail rail = the book in your hands). Avoid flat-
gray SaaS cards + generic toasts.

## Mechanics

Skins already set tokens via data-skin/data-mode on <html>. This EXPANDS the per-skin token set to cover all the
above. Components CONSUME tokens (never hardcode). The @reverie/core contrast test extends to the new token combos
(text on textured surfaces, marks, bands) across the full skin x mode matrix.

## Sequencing (deliberate re-order, ahead of Onboarding)

1. EXPLORE + LOCK the vocabulary now: design tool brief renders the full kit-of-parts in TRYST + APHELION
   (opposite ends: warm-ornate vs cold-precise) -> proves "same button, two worlds" -> lock the token vocabulary.
   BOUNDED (exploration + token spec, not an endless polish pass).
2. Code implements the token EXPANSION + retrofits core components -> chrome stops reading as SaaS. 4 built skins
   set their values.
3. The 5 UNBUILT skins (Calliope/Mull/Compendium/Clew/Fledge) are designed WITH the full vocabulary from birth
   (the key timing win -- no retrofit).
4. Onboarding, Cover Studio, and the landing showcase INHERIT it (built right, not retrofitted). The landing
   showcase deepening = part of THIS work, not a separate landing follow-up.

WHY now: building screens + skins in generic chrome then retrofitting pays twice and lets skins drift. Locking the
vocabulary first means everything remaining is born speaking it. Pushes Onboarding back slightly -- right trade.
