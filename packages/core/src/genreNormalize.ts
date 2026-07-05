// Genre/tag normalization for real library-export ingest (Import I1). Real exports use messy,
// inconsistent vocab — mixed case, typos, ";"/","/":"-joined, non-genre tokens mixed in. This maps
// them to the canonical CORE genre set (= the 9 skins) for the primary genre + genres[] signal, and
// routes everything else to tags. Pure + unit-tested against the real export vocab.

// The canonical genres — one per skin, spelled exactly as skins.ts spells them (keep in sync).
// Lowercased, these are the keys the genre-scoped subgenre/trope taxonomies look up, so every
// pipe that writes a genre (import here, enrichment's mapGenre, the add flow's skin genre) must
// land on this vocabulary or the book misses its genre's shelves.
export const CORE_GENRES = [
  'Romance',
  'Fantasy',
  'Science fiction',
  'Horror',
  'Mystery',
  'Literary',
  'Cozy',
  'Nonfiction',
  'Young adult',
] as const
export type CoreGenre = (typeof CORE_GENRES)[number]

// token (lowercased, trimmed) -> CoreGenre. Includes the confirmed typos/aliases from the exports.
const GENRE_ALIASES: Record<string, CoreGenre> = {
  romance: 'Romance',
  romace: 'Romance', // typo in the real export
  fantasy: 'Fantasy',
  fantays: 'Fantasy', // typo
  fantast: 'Fantasy', // typo
  'sci-fi': 'Science fiction',
  scifi: 'Science fiction',
  'sci fi': 'Science fiction',
  'science fiction': 'Science fiction',
  'science-fiction': 'Science fiction',
  horror: 'Horror',
  mystery: 'Mystery',
  thriller: 'Mystery', // collapsed into Mystery (no Thriller skin)
  crime: 'Mystery',
  cozy: 'Cozy',
  cosy: 'Cozy',
  nonfiction: 'Nonfiction',
  'non-fiction': 'Nonfiction',
  'non fiction': 'Nonfiction',
  ya: 'Young adult',
  'young adult': 'Young adult',
  'young-adult': 'Young adult',
  literary: 'Literary',
}

// tokens that map to Literary but ALSO leave a descriptive tag (so the nuance isn't lost).
const LITERARY_DESCRIPTIVE: Record<string, string> = {
  fiction: 'fiction',
  poetry: 'poetry',
  historical: 'historical',
  'historical fiction': 'historical fiction',
  'short stories': 'short stories',
}

// non-genre tokens that appear in the genre column and should simply be dropped.
const DROP_TOKENS = new Set(['standalone', 'standalones', 'complete', 'completed', 'tbr', 'n/a', 'none'])

// spice-ish tokens → the intensity signal (kept as a tag too). Binary in the exports, so a single
// representative level.
const SPICE_TOKENS = new Set(['spicy', 'spice', 'steamy', 'smut'])
export const SPICE_INTENSITY = 3

export interface NormalizedGenres {
  /** primary genre = first CORE token in the genre field (null when none) — the skin/adaptive signal */
  genre: string | null
  /** all CORE genres found, first-seen order, deduped */
  genres: string[]
  /** lowercased descriptive tags: non-core genre tokens + the tags field + spice + literary nuance */
  tags: string[]
  /** intensity from a spice token, else null */
  intensity: number | null
  /** the raw genre field when it was non-empty but mapped to NO core genre (e.g. a leaked "standalone"
   *  or an unrecognized label) — the import-review "odd/unmapped genre" signal (E3). null otherwise. */
  unmappedGenre: string | null
}

/** Split a messy field on ; / , and the stray ":" separator; trim; drop empties. */
function splitTokens(field: string): string[] {
  return (field ?? '')
    .split(/[;/,:]/)
    .map((t) => t.trim())
    .filter(Boolean)
}

/**
 * Normalize an export's genre + tags fields into the app's shapes. The genre field drives the
 * primary genre + genres[] (CORE only); non-core genre tokens, the whole tags field, spice, and
 * literary nuance all become lowercased deduped tags; a spice token sets the intensity signal.
 * Blank inputs yield genre null / empty arrays / intensity null.
 */
export function normalizeImportGenres(genreField: string, tagsField = ''): NormalizedGenres {
  const cores: CoreGenre[] = []
  const tags: string[] = []
  let intensity: number | null = null

  const addTag = (t: string) => {
    const v = t.trim().toLowerCase()
    if (v) tags.push(v)
  }

  // 1) The genre column → CORE genres (+ descriptive/non-core spillover to tags).
  for (const raw of splitTokens(genreField)) {
    const key = raw.toLowerCase()
    if (DROP_TOKENS.has(key)) continue
    if (SPICE_TOKENS.has(key)) {
      intensity = SPICE_INTENSITY
      addTag(key)
      continue
    }
    const core = GENRE_ALIASES[key]
    if (core) {
      if (!cores.includes(core)) cores.push(core)
      continue
    }
    const litTag = LITERARY_DESCRIPTIVE[key]
    if (litTag) {
      if (!cores.includes('Literary')) cores.push('Literary')
      addTag(litTag)
      continue
    }
    addTag(raw) // a genuine non-core token → a descriptive tag
  }

  // 2) The tags column → descriptive tags (never promoted to a genre); spice → intensity.
  for (const raw of splitTokens(tagsField)) {
    const key = raw.toLowerCase()
    if (SPICE_TOKENS.has(key)) intensity = SPICE_INTENSITY
    addTag(key)
  }

  const uniqueTags = [...new Set(tags)]
  // A non-empty genre column that yielded no core genre is worth a look in the import review (the
  // canonical case is the real file's leaked "standalone"; also catches genuinely unrecognized labels).
  const unmappedGenre = genreField.trim() !== '' && cores.length === 0 ? genreField.trim() : null
  return {
    genre: cores[0] ?? null,
    genres: cores,
    tags: uniqueTags,
    intensity,
    unmappedGenre,
  }
}

/**
 * Resolve any genre spelling a stored book may carry — import canon ('Sci-Fi', 'YA' from older
 * imports), legacy enrichment tokens ('science-fiction', 'thriller'), skin genres ('Science
 * fiction'), hand-typed variants — onto the canonical lowercased key the genre-scoped taxonomies
 * use. Unrecognized input just lowercases, so a reader's own genre vocabulary passes through.
 */
export function genreKey(raw: string): string {
  const t = (raw ?? '').trim().toLowerCase()
  const core = GENRE_ALIASES[t] ?? (LITERARY_DESCRIPTIVE[t] != null ? 'Literary' : undefined)
  return core ? core.toLowerCase() : t
}
