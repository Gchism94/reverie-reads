// The data model is generic (tags / intensity / genre); each skin chooses how to LABEL those
// fields in the UI. UI reads labels from here (via the active skin), never hardcoded.
//
// TWO AXES, NOT ONE (owner ruling, 2026-08-21): `intensity` is HEAT ("Spice" 🌶️) and `darkness`
// is how dark/heavy a book is ("Darkness" 🌑). They were one column until the split — the Match
// quiz asked a darkness question and scored it against the spice field — so a book that is bleak
// without heat, or explicit and gentle in tone, could not be described. Both are universal: every
// skin tracks both, glyphs included.
//
// SPICE IS UNIVERSAL (owner decision, 2026-07): the intensity field is "Spice" 🌶️ in EVERY skin —
// it's a named core feature of the product (a romance/romantasy spice tracker), so the reader keeps
// their spice level whatever costume the app wears. Only the softer vocabulary still varies: Tryst
// keeps its romance-native "Tropes / Romance / Subgenre"; the neutral skins say "Tags / Genre /
// Category". No skin is missing any FEATURE — this is wording, not capability.

export interface FieldLabels {
  /** label for the generic `tags` field */
  tags: string
  /** singular tag noun, e.g. "trope" / "tag" */
  tag: string
  /** label for the generic `intensity` field */
  intensity: string
  /** emoji/glyph used to render an intensity level (Tryst: 🌶️) */
  intensityGlyph: string
  /** label for the generic `darkness` field — the OTHER axis (see the header) */
  darkness: string
  /** glyph used to render a darkness level. Distinct from intensityGlyph on purpose: the two
   *  axes appear side by side and a shared glyph would make them one control to the eye. */
  darknessGlyph: string
  /** what each level 0..5 MEANS on this skin's intensity scale, indexed by level */
  intensityLevels: readonly string[]
  /** what each level 0..5 MEANS on this skin's darkness scale, indexed by level */
  darknessLevels: readonly string[]
  /** label for the primary `genre` field */
  genre: string
  /** label for the `subgenre` field */
  subgenre: string
}

/**
 * THE LEVEL GUIDES — what a reader is actually choosing between.
 *
 * Both pickers were bare glyph rows: five identical marks, `aria-label="Spice 3"`, and nothing
 * anywhere in the product saying what 3 meant. Two readers, or one reader six months apart, had no
 * way to rate consistently. These are the definitions, indexed by level so `LEVELS[n]` is the copy
 * for level n, 0 through 5.
 *
 * DARKNESS is not invented here: 1–5 are the Match quiz's own five options, verbatim
 * (`apps/web/src/library/quiz.ts`), which is the scale the quiz has always scored against. Keeping
 * the wording identical is deliberate — the quiz question and the book picker must be recognizably
 * the same axis, or a reader calibrates against one and filters with the other. Only level 0, which
 * a quiz answer has no way to express, is added.
 *
 * SPICE follows the conventional romance heat ladder (closed door → explicit), which is the
 * vocabulary this reader's shelves already use.
 *
 * Shared across skins by default, but declared PER SKIN in FieldLabels so a skin can reword the
 * scale without forking it — the same lever that lets Tryst say "Tropes" where the neutral skins
 * say "Tags". No skin currently overrides them.
 */
export const SPICE_LEVEL_GUIDE: readonly string[] = [
  'None on the page',
  'Kisses and longing',
  'Closed door — it happens, you don’t see it',
  'On the page, not dwelt on',
  'Explicit and recurring',
  'Explicit throughout',
]

export const DARKNESS_LEVEL_GUIDE: readonly string[] = [
  'Nothing heavy',
  'Gentle & comforting',
  'A little tension',
  'Properly gripping',
  'Dark & heavy',
  'As extreme as it gets',
]

export const TRYST_LABELS: FieldLabels = {
  tags: 'Tropes',
  tag: 'trope',
  intensity: 'Spice',
  intensityGlyph: '🌶️',
  darkness: 'Darkness',
  darknessGlyph: '🌑',
  intensityLevels: SPICE_LEVEL_GUIDE,
  darknessLevels: DARKNESS_LEVEL_GUIDE,
  genre: 'Romance',
  subgenre: 'Subgenre',
}

export const NEUTRAL_LABELS: FieldLabels = {
  tags: 'Tags',
  tag: 'tag',
  intensity: 'Spice', // spice is universal (see header) — every skin tracks it, glyph included
  intensityGlyph: '🌶️',
  darkness: 'Darkness',
  darknessGlyph: '🌑',
  intensityLevels: SPICE_LEVEL_GUIDE,
  darknessLevels: DARKNESS_LEVEL_GUIDE,
  genre: 'Genre',
  subgenre: 'Category',
}
