import { NEUTRAL_LABELS, TRYST_LABELS, type FieldLabels } from './labels'

// The skin registry. A skin is a complete swappable identity: a token bundle (light + dark,
// authored in CSS so switching is a no-rebuild attribute flip), a display/body font, an ambient
// signature (star density + divider motif), and the field labels it features. Skin and light/dark
// are INDEPENDENT axes. Adding a genre later = one entry here + a token block in tokens.css.

// Note: 'tryst' is the romance skin's id. "Reverie" is the umbrella app name (APP_NAME); the
// romance skin took the other cleared finalist, Tryst. Same gothic-NOLA palettes/fonts/divider.
export type SkinId =
  | 'tryst'
  | 'grimoire'
  | 'aphelion'
  | 'marrow'
  | 'umbra'
  | 'folio'
  | 'hearth'
  | 'almanac'
  | 'bloom'
/** The active-skin value the user can select: a Tier-1 skin or their generated adaptive skin. */
export type ActiveSkin = SkinId | 'adaptive'
/** User mode preference; 'system' follows prefers-color-scheme. */
export type Mode = 'light' | 'dark' | 'system'
export type ResolvedMode = 'light' | 'dark'

export interface Skin {
  id: SkinId
  label: string
  genre: string
  tagline: string
  /** twinkling-star count for the ambient signature (denser = busier sky) */
  starDensity: number
  /** divider motif key (matches a `.d-<id>` SVG) */
  divider: SkinId
  /** which field labels this skin features (Tryst → Tropes/Spice; others → Tags/Intensity) */
  labels: FieldLabels
  /** display font family, for preview chrome (the live value comes from the CSS token) */
  displayFont: string
}

export const SKINS: Record<SkinId, Skin> = {
  tryst: {
    id: 'tryst',
    label: 'Tryst',
    genre: 'Romance',
    tagline: 'A gothic hush over the night shelf.',
    starDensity: 60,
    divider: 'tryst',
    labels: TRYST_LABELS,
    displayFont: "'Fraunces', Georgia, serif",
  },
  grimoire: {
    id: 'grimoire',
    label: 'Grimoire',
    genre: 'Fantasy',
    tagline: 'Vellum, oak-gall ink, a little gold leaf.',
    starDensity: 46,
    divider: 'grimoire',
    labels: NEUTRAL_LABELS,
    displayFont: "'Cormorant Garamond', Georgia, serif",
  },
  aphelion: {
    id: 'aphelion',
    label: 'Aphelion',
    genre: 'Science fiction',
    tagline: 'The cold far point of the orbit.',
    starDensity: 95,
    divider: 'aphelion',
    labels: NEUTRAL_LABELS,
    displayFont: "'Space Grotesk', system-ui, sans-serif",
  },
  marrow: {
    id: 'marrow',
    label: 'Marrow',
    genre: 'Horror',
    tagline: 'Bone, ash, and a creeping fog.',
    starDensity: 18,
    divider: 'marrow',
    labels: NEUTRAL_LABELS,
    displayFont: "'Playfair Display', Georgia, serif",
  },
  // Stage 3 — the five remaining genres, code-first (palette + font + character derived from the
  // genre direction in docs/SKINS.md, eyeball-gated).
  umbra: {
    id: 'umbra',
    label: 'Umbra',
    genre: 'Mystery',
    tagline: 'Fog, shadow, and one amber lamp.',
    starDensity: 24,
    divider: 'umbra',
    labels: NEUTRAL_LABELS,
    displayFont: "'Bodoni Moda', Georgia, serif",
  },
  folio: {
    id: 'folio',
    label: 'Folio',
    genre: 'Literary',
    tagline: 'Cream paper, set in a quiet hand.',
    starDensity: 30,
    divider: 'folio',
    labels: NEUTRAL_LABELS,
    displayFont: "'Libre Baskerville', Georgia, serif",
  },
  hearth: {
    id: 'hearth',
    label: 'Hearth',
    genre: 'Cozy',
    tagline: 'Wool, tea, and soft afternoon light.',
    starDensity: 20,
    divider: 'hearth',
    labels: NEUTRAL_LABELS,
    displayFont: "'Bitter', Georgia, serif",
  },
  almanac: {
    id: 'almanac',
    label: 'Almanac',
    genre: 'Nonfiction',
    tagline: 'Paper, structured and calmly indexed.',
    starDensity: 26,
    divider: 'almanac',
    labels: NEUTRAL_LABELS,
    displayFont: "'IBM Plex Serif', Georgia, serif",
  },
  bloom: {
    id: 'bloom',
    label: 'Bloom',
    genre: 'Young adult',
    tagline: 'Bright, saturated, wide awake.',
    starDensity: 70,
    divider: 'bloom',
    labels: NEUTRAL_LABELS,
    displayFont: "'Poppins', system-ui, sans-serif",
  },
}

export const DEFAULT_SKIN: SkinId = 'tryst'
export const SKIN_LIST: Skin[] = Object.values(SKINS)
export const isSkinId = (s: string | null | undefined): s is SkinId => !!s && s in SKINS
export const isActiveSkin = (s: string | null | undefined): s is ActiveSkin =>
  s === 'adaptive' || isSkinId(s)
export const isMode = (s: string | null | undefined): s is Mode =>
  s === 'light' || s === 'dark' || s === 'system'

/** Adaptive falls back to its dominant Tier-1 skin for labels/ambiance/divider. */
export interface AdaptiveBundle {
  light: Record<string, string>
  dark: Record<string, string>
  dominant: SkinId
  weights: Record<SkinId, number>
  insight: string
}

/** A pending evolution the monthly cron detected: just the taste signal — the client materializes
 *  the palette from the live tokens when the reader opens the reveal. */
export interface AdaptivePending {
  weights: Record<SkinId, number>
  dominant: SkinId
  insight: string
  /** ISO timestamp the cron computed it (set server-side). */
  at: string
}
