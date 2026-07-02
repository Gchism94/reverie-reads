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
  /** search / filter miss — the "nothing matches" line (reported in-register, never apologized) */
  miss: string
  /** reading-goal milestone line (shown when the yearly goal completes) */
  milestone: string
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
  miss: 'No books match.',
  milestone: 'Goal complete — every book accounted for.',
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
  miss: 'No affair by that name in the register. Perhaps it goes by another?',
  milestone: 'The season’s promise — kept.',
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
  miss: 'QUERY RETURNED 0 OBJECTS. Adjust parameters and rescan.',
  milestone: 'CYCLE COMPLETE · ALL VOLUMES ACCOUNTED FOR.',
  motif: '◇',
  isbnNotice: ISBN_NOTICE,
}

// Stage 2 — Grimoire (fantasy · illuminated manuscript) + Marrow (horror · gothic dread), code-first.
export const GRIMOIRE_VOICE: SkinVoice = {
  // Fable 5 chunk 2 — the book speaks like a patient tutor; italic Cormorant is the speaking voice.
  empty: {
    heading: 'The book lies open at its first blank leaf.',
    body: 'Set down the story you carry.',
    cta: 'Add a story',
  },
  loading: 'Grinding the ink…',
  miss: 'No such title is inscribed in this volume. Try its truer name.',
  milestone: 'The leaves are gilded — the quire is bound.',
  motif: '❖',
  isbnNotice: ISBN_NOTICE,
}

export const MARROW_VOICE: SkinVoice = {
  // Fable 5 chunk 2 — the house speaks: flat, close, faintly proprietary; it never apologizes.
  empty: {
    heading: 'The shelf is bare.',
    body: 'The house prefers it occupied. Bring it a book.',
    cta: 'Add a specimen',
  },
  loading: 'The floorboards settle…',
  miss: 'Nothing here answers to that name.',
  milestone: 'Every specimen catalogued. The house is pleased.',
  motif: '†',
  isbnNotice: ISBN_NOTICE,
}

// Stage 3 — the five remaining genres, code-first voices.
export const UMBRA_VOICE: SkinVoice = {
  // Fable 5 chunk 2 — "Gaslight": typed case notes, clipped and dry; states reported like evidence.
  empty: {
    heading: 'Nothing on file.',
    body: 'Open the first case — bring me a book worth suspecting.',
    cta: 'Open a case',
  },
  loading: 'Developing the photographs…',
  miss: 'NO RECORD UNDER THAT NAME. Try the alias.',
  milestone: 'CASE CLOSED. The window stays lit anyway.',
  motif: '▣',
  isbnNotice: ISBN_NOTICE,
}

export const FOLIO_VOICE: SkinVoice = {
  empty: { heading: 'The page is blank.', body: 'Add the first work to begin the collection.', cta: 'Add a work' },
  loading: 'Setting the type…',
  miss: 'Nothing in the collection under that name.',
  milestone: 'The edition is complete.',
  motif: '❡',
  isbnNotice: ISBN_NOTICE,
}

export const HEARTH_VOICE: SkinVoice = {
  empty: { heading: 'The reading nook is empty.', body: 'Add a book, put the kettle on, and settle in.', cta: 'Add a book' },
  loading: 'Steeping…',
  miss: 'Nothing on the shelf by that name.',
  milestone: 'Every last one read. Put the kettle on.',
  motif: '❀',
  isbnNotice: ISBN_NOTICE,
}

export const ALMANAC_VOICE: SkinVoice = {
  empty: { heading: 'The index is empty.', body: 'Add the first entry to begin the catalogue.', cta: 'Add an entry' },
  loading: 'Cataloguing…',
  miss: 'No entry under that heading.',
  milestone: 'Index complete — all entries logged.',
  motif: '‡',
  isbnNotice: ISBN_NOTICE,
}

export const BLOOM_VOICE: SkinVoice = {
  empty: { heading: 'Your shelf is waiting!', body: "Add your first book and let's build your stack.", cta: 'Add a book' },
  loading: 'Loading the good stuff…',
  miss: 'Nothing by that name — yet!',
  milestone: 'Goal smashed! Every single one read.',
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
