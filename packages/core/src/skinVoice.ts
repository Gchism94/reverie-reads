import type { SkinId } from './skins'

// The VOICE lever of the Skin Character System: each skin writes its empty states, loading lines, and
// signature ornament in its own genre register. UI reads this via the active skin (never hardcoded),
// the same pattern as FieldLabels. Tryst is sultry-warm; Aphelion is spacefarer-spare. Grimoire +
// Marrow use the neutral pack until their stage.

export interface SkinVoice {
  /** generic empty-state copy */
  empty: { heading: string; body: string; cta: string }
  /** loading line */
  loading: string
  /** signature ornament glyph (section breaks, accents, empty-state icon) */
  motif: string
}

export const NEUTRAL_VOICE: SkinVoice = {
  empty: { heading: 'Nothing here yet', body: 'Add your first book to begin your library.', cta: 'Add a book' },
  loading: 'Loading…',
  motif: '✦',
}

export const TRYST_VOICE: SkinVoice = {
  empty: {
    heading: 'Your shelves wait in the dark.',
    body: 'Light a lamp — add the first story you can’t bear to put down.',
    cta: 'Add a story',
  },
  loading: 'Turning the page…',
  motif: '❦',
}

export const APHELION_VOICE: SkinVoice = {
  empty: {
    heading: 'No signal',
    body: 'The shelf returns empty. Log a volume to begin the survey.',
    cta: 'Add volume',
  },
  loading: 'Scanning…',
  motif: '◇',
}

export const SKIN_VOICE: Record<SkinId, SkinVoice> = {
  tryst: TRYST_VOICE,
  grimoire: NEUTRAL_VOICE,
  aphelion: APHELION_VOICE,
  marrow: NEUTRAL_VOICE,
}
