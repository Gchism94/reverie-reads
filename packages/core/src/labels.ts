// The data model is generic (tags / intensity / genre); each skin chooses how to LABEL those
// fields in the UI. The Tryst (romance) skin still says "Tropes" and "Spice"; a neutral skin
// says "Tags" and "Intensity". UI reads labels from here (via the active skin), never hardcoded.

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
  intensity: 'Intensity',
  intensityGlyph: '●',
  genre: 'Genre',
  subgenre: 'Category',
}
