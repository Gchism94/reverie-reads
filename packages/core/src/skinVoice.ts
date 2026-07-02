import type { SkinId } from './skins'

// The VOICE lever of the Skin Character System: each skin writes its empty states, loading lines, and
// signature ornament in its own genre register. UI reads this via the active skin (never hardcoded),
// the same pattern as FieldLabels. Tryst is sultry-warm; Aphelion is spacefarer-spare; Grimoire is
// archaic-manuscript; Marrow is gothic-dread (the two designed + the two Stage-2 code-first skins).

export interface SkinVoice {
  /** generic empty-state copy */
  empty: { heading: string; body: string; cta: string }
  /** loading line */
  loading: string
  /** signature ornament glyph (section breaks, accents, empty-state icon) */
  motif: string
  /** truncated-ISBN notice — the predicate after the count + noun ("3 ISBNs {isbnNotice}"). Honest +
   *  non-alarming: matching, not failure, with a way forward. Neutral default for all skins for now. */
  isbnNotice: string
}

// Neutral, non-alarming default. Reads after "{count} ISBN(s)": e.g. "3 ISBNs may be missing…".
const ISBN_NOTICE =
  'may be missing a leading digit and might not match — your books imported fine. Re-export with ISBNs as text to fix this.'

export const NEUTRAL_VOICE: SkinVoice = {
  empty: { heading: 'Nothing here yet', body: 'Add your first book to begin your library.', cta: 'Add a book' },
  loading: 'Loading…',
  motif: '✦',
  isbnNotice: ISBN_NOTICE,
}

export const TRYST_VOICE: SkinVoice = {
  empty: {
    heading: 'Your shelves wait in the dark.',
    body: 'Light a lamp — add the first story you can’t bear to put down.',
    cta: 'Add a story',
  },
  loading: 'Turning the page…',
  motif: '❦',
  isbnNotice: ISBN_NOTICE,
}

export const APHELION_VOICE: SkinVoice = {
  empty: {
    heading: 'No signal',
    body: 'The shelf returns empty. Log a volume to begin the survey.',
    cta: 'Add volume',
  },
  loading: 'Scanning…',
  motif: '◇',
  isbnNotice: ISBN_NOTICE,
}

// Stage 2 — Grimoire (fantasy · illuminated manuscript) + Marrow (horror · gothic dread), code-first.
export const GRIMOIRE_VOICE: SkinVoice = {
  empty: {
    heading: 'The codex lies unwritten.',
    body: 'Inscribe your first volume to wake these pages.',
    cta: 'Inscribe a volume',
  },
  loading: 'Turning the vellum…',
  motif: '☉',
  isbnNotice: ISBN_NOTICE,
}

export const MARROW_VOICE: SkinVoice = {
  empty: {
    heading: 'Nothing stirs on the shelf.',
    body: 'Add the first book before the dark settles in.',
    cta: 'Add a book',
  },
  loading: 'Something listens…',
  motif: '†',
  isbnNotice: ISBN_NOTICE,
}

// Stage 3 — the five remaining genres, code-first voices.
export const UMBRA_VOICE: SkinVoice = {
  empty: { heading: 'The case is cold.', body: 'Shelve the first file to open the investigation.', cta: 'File a book' },
  loading: 'Following the trail…',
  motif: '◆',
  isbnNotice: ISBN_NOTICE,
}

export const FOLIO_VOICE: SkinVoice = {
  empty: { heading: 'The page is blank.', body: 'Add the first work to begin the collection.', cta: 'Add a work' },
  loading: 'Setting the type…',
  motif: '❡',
  isbnNotice: ISBN_NOTICE,
}

export const HEARTH_VOICE: SkinVoice = {
  empty: { heading: 'The reading nook is empty.', body: 'Add a book, put the kettle on, and settle in.', cta: 'Add a book' },
  loading: 'Steeping…',
  motif: '❀',
  isbnNotice: ISBN_NOTICE,
}

export const ALMANAC_VOICE: SkinVoice = {
  empty: { heading: 'The index is empty.', body: 'Add the first entry to begin the catalogue.', cta: 'Add an entry' },
  loading: 'Cataloguing…',
  motif: '‡',
  isbnNotice: ISBN_NOTICE,
}

export const BLOOM_VOICE: SkinVoice = {
  empty: { heading: 'Your shelf is waiting!', body: "Add your first book and let's build your stack.", cta: 'Add a book' },
  loading: 'Loading the good stuff…',
  motif: '✺',
  isbnNotice: ISBN_NOTICE,
}

export const SKIN_VOICE: Record<SkinId, SkinVoice> = {
  tryst: TRYST_VOICE,
  grimoire: GRIMOIRE_VOICE,
  aphelion: APHELION_VOICE,
  marrow: MARROW_VOICE,
  umbra: UMBRA_VOICE,
  folio: FOLIO_VOICE,
  hearth: HEARTH_VOICE,
  almanac: ALMANAC_VOICE,
  bloom: BLOOM_VOICE,
}
