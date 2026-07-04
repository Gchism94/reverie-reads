// The data model is generic (tags / intensity / genre); each skin chooses how to LABEL those
// fields in the UI. UI reads labels from here (via the active skin), never hardcoded.
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
  /** label for the primary `genre` field */
  genre: string
  /** label for the `subgenre` field */
  subgenre: string
}

export const TRYST_LABELS: FieldLabels = {
  tags: 'Tropes',
  tag: 'trope',
  intensity: 'Spice',
  intensityGlyph: '🌶️',
  genre: 'Romance',
  subgenre: 'Subgenre',
}

export const NEUTRAL_LABELS: FieldLabels = {
  tags: 'Tags',
  tag: 'tag',
  intensity: 'Spice', // spice is universal (see header) — every skin tracks it, glyph included
  intensityGlyph: '🌶️',
  genre: 'Genre',
  subgenre: 'Category',
}
