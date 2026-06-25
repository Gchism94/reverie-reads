import { NEUTRAL_LABELS, REVERIE_LABELS, type FieldLabels } from './labels'

// The skin registry. A skin is a complete swappable identity: a token bundle (light + dark,
// authored in CSS so switching is a no-rebuild attribute flip), a display/body font, an ambient
// signature (star density + divider motif), and the field labels it features. Skin and light/dark
// are INDEPENDENT axes. Adding a genre later = one entry here + a token block in tokens.css.

export type SkinId = 'reverie' | 'grimoire' | 'aphelion' | 'marrow'
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
  /** which field labels this skin features (Reverie → Tropes/Spice; others → Tags/Intensity) */
  labels: FieldLabels
  /** display font family, for preview chrome (the live value comes from the CSS token) */
  displayFont: string
}

export const SKINS: Record<SkinId, Skin> = {
  reverie: {
    id: 'reverie',
    label: 'Reverie',
    genre: 'Romance',
    tagline: 'A gothic hush over the night shelf.',
    starDensity: 60,
    divider: 'reverie',
    labels: REVERIE_LABELS,
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
}

export const DEFAULT_SKIN: SkinId = 'reverie'
export const SKIN_LIST: Skin[] = Object.values(SKINS)
export const isSkinId = (s: string | null | undefined): s is SkinId => !!s && s in SKINS
export const isMode = (s: string | null | undefined): s is Mode =>
  s === 'light' || s === 'dark' || s === 'system'
