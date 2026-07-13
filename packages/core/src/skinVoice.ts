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
  /** the rail's resume line (a book in progress) — chunk-4 composed screens, trimmed data-agnostic */
  resume: string
  /** the season strip's tail (mid-progress, after the live count) — same trim rule */
  season: string
  /** signature ornament glyph (section breaks, accents, empty-state icon) */
  motif: string
  /** truncated-ISBN notice — the predicate after the count + noun ("3 ISBNs {isbnNotice}"). Honest +
   *  non-alarming: matching, not failure, with a way forward. Neutral default for all skins for now. */
  isbnNotice: string
  /** add-form ownership options — semantically "I own this" / "I want to read this" (wishlist),
   *  in the skin's register. Shown under a neutral Ownership label so the meaning never blurs. */
  ownIt: string
  wantIt: string
}

// Neutral, non-alarming default. Reads after "{count} ISBN(s)": e.g. "3 ISBNs may be missing…".
const ISBN_NOTICE =
  'may be missing a leading digit and might not match — your books imported fine. Re-export with ISBNs as text to fix this.'

export const NEUTRAL_VOICE: SkinVoice = {
  empty: { heading: 'Nothing here yet', body: 'Add your first book to begin your library.', cta: 'Add a book' },
  loading: 'Loading…',
  miss: 'No books match.',
  milestone: 'Goal complete — every book accounted for.',
  resume: 'Pick up where you left off.',
  season: 'The year is under way.',
  motif: '✦',
  isbnNotice: ISBN_NOTICE,
  ownIt: 'I own this',
  wantIt: 'I want to read this',
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
  resume: 'You left off — the lamps are still lit.',
  season: 'The house notices such devotion.',
  motif: '❦',
  isbnNotice: ISBN_NOTICE,
  ownIt: 'Mine already',
  wantIt: 'On my wishlist',
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
  resume: 'DRIFT NOMINAL. NO NEW SIGNALS.',
  season: 'CYCLE IN PROGRESS. HOLDING COURSE.',
  motif: '◇',
  isbnNotice: ISBN_NOTICE,
  ownIt: 'In the hold',
  wantIt: 'Not yet aboard',
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
  resume: 'Thus far hast thou copied — the leaf is marked.',
  season: 'The quire grows, leaf by leaf.',
  motif: '❖',
  isbnNotice: ISBN_NOTICE,
  ownIt: 'In my keeping',
  wantIt: 'I seek it still',
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
  resume: 'The house has kept your page. It always does.',
  season: 'The house keeps count.',
  motif: '†',
  isbnNotice: ISBN_NOTICE,
  ownIt: 'The house has it',
  wantIt: 'The house wants it',
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
  resume: 'THE TRAIL IS STILL WARM.',
  season: 'THE FILE THICKENS.',
  motif: '▣',
  isbnNotice: ISBN_NOTICE,
  ownIt: 'In evidence',
  wantIt: 'Still at large',
}

// Fable 5 chunk 3 — an editor's marginalia: dry, exact, quietly fond. Italic Garamond speaks.
// ("Marginalia" in the registry; the live id stays `folio`.) Milestone trimmed of its baked-in
// count ("Sixty books read, all noted…"), same rule as chunk 2.
export const FOLIO_VOICE: SkinVoice = {
  empty: { heading: 'A clean page.', body: 'Nothing marked yet — bring the first book and I’ll begin the notes.', cta: 'Add a book' },
  loading: 'Reading it over once more…',
  miss: 'No entry under that name. Check the spelling, or the pseudonym.',
  milestone: 'All noted. A good and careful year.',
  resume: 'The notes are waiting.',
  season: 'A good and careful pace.',
  motif: '‸',
  isbnNotice: ISBN_NOTICE,
  ownIt: 'On my shelf',
  wantIt: 'On the list',
}

// Fable 5 chunk 3 — the kitchen voice: someone who saves you the last slice. Warm, plain, a little
// teasing. Milestone trimmed of "Sixty books this year."
export const HEARTH_VOICE: SkinVoice = {
  empty: { heading: 'The table’s wiped clean.', body: 'Bring the first book and I’ll put the kettle on.', cta: 'Add a book' },
  loading: 'Steeping…',
  miss: 'Nothing by that name in the pantry. Try another spelling?',
  milestone: 'That calls for the good jam.',
  resume: 'You left off — it’ll keep.',
  season: 'The kettle’s been busy.',
  motif: '✕',
  isbnNotice: ISBN_NOTICE,
  ownIt: 'In the pantry',
  wantIt: 'On the shopping list',
}

// Fable 5 chunk 3 — the surveyor's log: terse, exact, quietly proud of a full record. Milestone
// trimmed of "Sixty titles logged, sixty shelved."
export const ALMANAC_VOICE: SkinVoice = {
  empty: { heading: 'The index is empty.', body: 'No entries logged. Enter the first title and the record begins.', cta: 'Log a book' },
  loading: 'Taking measurements…',
  miss: 'No match in the index. Check the reference number.',
  milestone: 'A full survey — logged and shelved.',
  resume: 'The record holds.',
  season: 'A tidy ledger.',
  motif: '✱',
  isbnNotice: ISBN_NOTICE,
  ownIt: 'In the collection',
  wantIt: 'On the want list',
}

// Fable 5 chunk 3 — a note passed at 2 a.m.: hushed, a little giddy, always on your side.
// ("Firstlight" in the registry; the live id stays `bloom`.) Milestone trimmed of "Sixty books."
export const BLOOM_VOICE: SkinVoice = {
  empty: { heading: 'Nothing on your sky yet.', body: 'Add the first book and we’ll stay up late.', cta: 'Add your first book' },
  loading: 'Almost light…',
  miss: 'Can’t find that one — double-check the title?',
  milestone: 'You watched the sunrises this year.',
  resume: 'Keep going — the sky is almost light.',
  season: 'A sunrise for every book.',
  motif: '✦',
  isbnNotice: ISBN_NOTICE,
  ownIt: 'Got it already',
  wantIt: 'Want it so badly',
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
