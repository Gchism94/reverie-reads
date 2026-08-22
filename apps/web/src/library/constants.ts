import { coverGradient, genreKey, type LibrarySort, type PossessionState } from '@reverie/core'

/** Plain, legible possession words for the CONTROLS (docs/archive/task-ownership-legibility.md). The button
 *  label must say what tapping it does at a glance; the per-skin voice (SkinVoice ownIt/borrowedIt/
 *  wantIt/unsetIt) rides underneath as a flavor subtitle, never as the only signal.
 *
 *  Keyed by the DERIVED possession word, not by the stored `ownership` column — storage is five
 *  independent flags and a control that must show one answer reads possessionState(). */
export const OWNERSHIP_LABELS: Record<PossessionState, string> = {
  owned: 'Owned',
  borrowed: 'Borrowed',
  wishlist: 'Wishlist',
  unset: 'Not set',
}

// Vocabularies from the prototype (kept identical so behavior matches).
export const FORMATS = [
  'Paperback',
  'Hardcover',
  'eBook',
  'Kindle Unlimited',
  'Audiobook',
  'Special Edition',
] as const

/** The neutral catch-all subgenre — offered in every genre, so a non-romance library never has to
 *  file a book under a romance subgenre. */
export const NEUTRAL_SUBGENRE = 'Other'

/** Genre → its subgenres, keyed by the lowercased genre (matching how `book.genre` is stored). The
 *  add flow reads the ACTIVE skin's genre here, so a reader files books under their OWN genre's
 *  shelves instead of a hardcoded romance subgenre — the "genre → subgenre" layer the matcher can
 *  lean on. Romance keeps the original set; the other eight genres get a modest, real taxonomy.
 *  `subgenresForGenre()` appends NEUTRAL_SUBGENRE to every genre. */
// Broadened beyond romance so every genre has a credible, native set (docs/archive/task-taxonomy-neutral.md).
// Additive: every pre-existing value is preserved (existing books keep their subgenre); the
// additions per genre are all NEW single-genre values, each mirrored into core's
// SUBGENRE_PRIMARY_GENRE and the taxonomy_neutral migration's backfill (parity-tested).
export const GENRE_SUBGENRES: Record<string, readonly string[]> = {
  romance: [
    'Romantasy',
    'Dark Romance',
    // 'Romance' was here. A subgenre is exactly one layer BELOW its genre, so a core genre can
    // never be its own subgenre — and offering it here is what put it into the data: the audit
    // (docs/queries/subgenre-is-a-genre-audit.sql) finds books carrying subgenre='romance' with
    // genre='romance' already set, i.e. a purely redundant value. Guarded by
    // subgenreNeverGenre.test.ts, keyed off CORE_GENRES so it cannot come back under any spelling.
    'Contemporary',
    'Sports',
    'Cowboy Romance',
    'Historical Romance',
    'Paranormal Romance',
    'Romantic Comedy',
  ],
  fantasy: [
    'Epic Fantasy',
    'Romantasy',
    'Dark Fantasy',
    'Cozy Fantasy',
    'Portal Fantasy',
    'Sword & Sorcery',
    'Urban Fantasy',
    'Grimdark',
    'Fairytale Retelling',
  ],
  'science fiction': [
    'Space Opera',
    'Cyberpunk',
    'Dystopian',
    'Hard SF',
    'Time Travel',
    'First Contact',
    'Post-Apocalyptic',
    'Military SF',
    'Climate Fiction',
  ],
  horror: [
    'Gothic',
    'Supernatural',
    'Slasher',
    'Cosmic Horror',
    'Psychological',
    'Haunted House',
    'Folk Horror',
    'Body Horror',
    'Splatterpunk',
  ],
  mystery: [
    'Cozy Mystery',
    'Noir',
    'Thriller',
    'Detective',
    'Whodunit',
    'Locked Room',
    'Police Procedural',
    'Legal Thriller',
    'Historical Mystery',
  ],
  literary: [
    'Literary Fiction',
    'Historical',
    'Magical Realism',
    'Contemporary',
    'Short Stories',
    'Satire',
    'Speculative Fiction',
    'Autofiction',
    'Epistolary',
  ],
  cozy: [
    'Cozy Mystery',
    'Cozy Fantasy',
    'Small Town',
    'Slice of Life',
    'Culinary',
    'Cozy Crime',
    'Cottagecore',
    'Bookshop Cozy',
    'Cozy Paranormal',
  ],
  nonfiction: [
    'Memoir',
    'History',
    'Science',
    'Essays',
    'Biography',
    'Self-Help',
    'True Crime',
    'Travel',
    'Philosophy',
  ],
  'young adult': [
    'YA Fantasy',
    'YA Romance',
    'YA Dystopian',
    'Coming of Age',
    'YA Contemporary',
    'YA Horror',
    'YA Mystery',
    'YA Sci-Fi',
    'YA Thriller',
  ],
}

/** Subgenres to offer for a genre — any spelling a book may carry resolves via `genreKey`
 *  ('Sci-Fi', 'science-fiction' and 'Science fiction' all reach the same shelf) — always with the
 *  neutral catch-all last. `keep` forces an existing value into the list (editing a book whose
 *  subgenre predates this map), so a picker never drops the book's own current subgenre. */
export function subgenresForGenre(genre: string, keep?: string): string[] {
  const list = [...(GENRE_SUBGENRES[genreKey(genre)] ?? []), NEUTRAL_SUBGENRE]
  return keep && !list.includes(keep) ? [keep, ...list] : list
}

/**
 * Every OTHER genre's subgenres — the "show the rest" disclosure behind both pickers.
 *
 * Storage never needed this opened up: `subgenres` is a flat, unscoped text[], and both forms
 * already preserve out-of-vocabulary picks across a genre switch. The constraint was the PICKER's
 * vocabulary alone, which meant a horror-romance could keep a cross-genre pair it already had but
 * could never be given one. De-duplicated and sorted, so the disclosure reads as a vocabulary
 * rather than as nine concatenated shelves.
 */
export function otherGenreSubgenres(genre: string): string[] {
  const own = new Set(subgenresForGenre(genre))
  const rest = new Set<string>()
  for (const [key, list] of Object.entries(GENRE_SUBGENRES)) {
    if (key === genreKey(genre)) continue
    for (const sub of list) if (!own.has(sub)) rest.add(sub)
  }
  return [...rest].sort((a, b) => a.localeCompare(b))
}

export const READ_STATUSES = ['Read', 'Reading', 'Unread', 'DNF'] as const
// Series statuses live in core now: SERIES_STATUS_VALUES + SERIES_STATUS_LABELS (5-value enum).

// Read-status CONTROLS (book detail + add form) lead with a real "Not set" — cataloguing a book must
// not force a read state (docs/archive/task-ownership-v2.md). 'unset' is the default for a new book. Filters
// keep the four concrete statuses (READ_STATUSES); no-selection isn't something you filter FOR.
export const READ_STATUS_OPTIONS = ['unset', 'Read', 'Reading', 'Unread', 'DNF'] as const
export const readStatusLabel = (s: string): string => (s === 'unset' ? 'Not set' : s)

export { MONTH_ABBR as MONTHS } from '@reverie/core'

export const TROPE_GROUPS: Record<string, string[]> = {
  'Core Romance': [
    'Enemies to Lovers',
    'Friends to Lovers',
    'Second Chance',
    'Fake Dating',
    'Marriage of Convenience',
    'Forbidden Love',
    'Slow Burn',
    'Love Triangle',
    'He Falls First',
    'Forced Proximity',
    'Only One Bed',
    'Grumpy/Sunshine',
    'Opposites Attract',
    'Age Gap',
    'Single Parent',
    'Found Family',
  ],
  Romantasy: [
    'Fated Mates',
    'Chosen One',
    'Court Intrigue',
    'Fae',
    'Vampires',
    'Dragon Riders',
    'Shifters',
    'Magic Academy',
    'Bonded Pair',
    'Morally Gray MMC',
    'Touch Her and Die',
    'Cursed',
    'Hidden Powers',
    'Rebellion',
  ],
  'Dark Romance': [
    'Captive/Captor',
    'Stalker',
    'Mafia',
    'Bully Romance',
    'Morally Black MMC',
    'Obsessive',
    'Possessive',
    'Touch-Starved',
    'Forced Marriage',
    'Revenge',
    'Anti-Hero',
    'Villain Romance',
    'Serial Killers',
  ],
  'Structure & Heat': [
    'Why Choose',
    'Reverse Harem',
    'Sports',
    'Billionaire',
    'Small Town',
    'Holiday',
    'Gothic',
    'Banter',
    'Strong Female Lead',
    'Spicy',
  ],
}

/** Genuinely cross-genre tropes — offered in EVERY genre, deduped against the genre's own groups.
 *  Kept small on purpose: a trope earns "universal" by meaning the same thing in a mystery as in a
 *  romantasy, not by being popular. */
export const UNIVERSAL_TROPES: string[] = [
  'Found Family',
  'Slow Burn',
  'Enemies to Lovers',
  'Morally Gray',
  'Anti-Hero',
  'Redemption Arc',
  'Banter',
  'Strong Female Lead',
  'Unreliable Narrator',
  'Small Town',
]

/** Genre → trope groups (the tag-side twin of GENRE_SUBGENRES, same lowercased-genre keys).
 *  Each genre gets a curated 3-group baseline (~15–25 tropes), seeded from established
 *  reader-taxonomy vocabulary (StoryGraph-style content tags), rich enough to feel native without
 *  drowning the picker. Users extend freely — these are the baseline, not the ceiling. */
export const TROPE_GROUPS_BY_GENRE: Record<string, Record<string, string[]>> = {
  romance: TROPE_GROUPS,
  fantasy: {
    'Magic & Worlds': [
      'High Magic',
      'Magic Academy',
      'Fae',
      'Dragons',
      'Portal Fantasy',
      'Prophecy',
      'Gods & Pantheons',
      'Elemental Magic',
    ],
    'Quest & Structure': [
      'Chosen One',
      'Quest',
      'Heist',
      'Political Intrigue',
      'War Campaign',
      'Tournament Arc',
      'Rebellion',
    ],
    Dynamics: ['Mentor & Student', 'Rivals', 'Reluctant Hero', 'Band of Misfits', 'Court Intrigue'],
  },
  'science fiction': {
    'Worlds & Tech': [
      'Space Opera',
      'First Contact',
      'AI & Androids',
      'Time Travel',
      'Generation Ship',
      'Cyberpunk',
      'Terraforming',
    ],
    Stakes: [
      'Dystopia',
      'Post-Apocalyptic',
      'Rebellion',
      'Corporate Overlords',
      'Survival',
      'Pandemic',
    ],
    Dynamics: ['Found Crew', 'Sentient Ship', 'Enemies to Allies', 'Reluctant Hero'],
  },
  horror: {
    'The Threat': [
      'Haunted House',
      'Possession',
      'Cosmic Horror',
      'Slasher',
      'Body Horror',
      'Folk Horror',
      'Vampires',
      'Ghosts',
    ],
    'Dread & Structure': [
      'Isolation',
      'Descent into Madness',
      'Final Girl',
      'Cursed Object',
      'Small Town Secrets',
      'Ritual',
    ],
    Setting: ['Gothic', 'Deep Woods', 'At Sea', 'Asylum'],
  },
  mystery: {
    Investigation: [
      'Amateur Sleuth',
      'Hardboiled Detective',
      'Police Procedural',
      'Cold Case',
      'Locked Room',
      'Heist',
    ],
    'The Culprit': ['Serial Killers', 'Twist Ending', "Everyone's a Suspect", 'Cat and Mouse'],
    'Setting & Tone': [
      'Cozy Mystery',
      'Noir',
      'Small Town Secrets',
      'Courtroom',
      'Historical Mystery',
    ],
  },
  literary: {
    'Form & Voice': [
      'Multiple Timelines',
      'Epistolary',
      'Vignettes',
      'Stream of Consciousness',
      'Metafiction',
    ],
    Themes: [
      'Coming of Age',
      'Family Saga',
      'Grief & Memory',
      'Immigrant Story',
      'Class & Money',
      'Marriage in Trouble',
    ],
    Setting: ['Historical', 'Campus Novel', 'City Portrait'],
  },
  cozy: {
    Comforts: [
      'Culinary',
      'Bookshop & Library',
      'Seaside',
      'Holiday',
      'Garden & Farm',
      'Tea & Coffee',
    ],
    'Gentle Stakes': [
      'Low Stakes',
      'Slice of Life',
      'Community Project',
      'Fresh Start',
      'Second Act',
    ],
    Charm: ['Talking Animals', 'Magical Realism', 'Grumpy/Sunshine', 'Matchmaking'],
  },
  nonfiction: {
    Approach: ['Memoir', 'Narrative Nonfiction', 'Investigative', 'Essays', 'Biography'],
    Subjects: ['Science', 'History', 'True Crime', 'Nature', 'Psychology', 'Food'],
    Tone: ['Funny', 'Moving', 'Practical'],
  },
  'young adult': {
    'Coming of Age': ['First Love', 'Friendship', 'Identity', 'Family Secrets', 'School Story'],
    Adventure: [
      'Chosen One',
      'Magic Academy',
      'Dystopian Rebellion',
      'Tournament Arc',
      'Road Trip',
    ],
    Dynamics: ['Love Triangle', 'Rivals', 'Secret Identity'],
  },
}

/** The trope groups to offer for a genre: the genre's own groups + the Universal group (deduped
 *  against them). Genre spellings resolve via `genreKey`, so legacy/aliased values still land in
 *  their genre's vocabulary; a genuinely unknown genre gets the Universal group ALONE — a book
 *  outside the nine rooms shouldn't be handed romance vocabulary by default. The UI appends the
 *  reader's own free tags as a "Your tags" group. */
export function tropeGroupsForGenre(genre: string): Record<string, string[]> {
  const own = TROPE_GROUPS_BY_GENRE[genreKey(genre)]
  if (!own) return { Universal: [...UNIVERSAL_TROPES] }
  const inOwn = new Set(
    Object.values(own)
      .flat()
      .map((t) => t.toLowerCase()),
  )
  const universal = UNIVERSAL_TROPES.filter((t) => !inOwn.has(t.toLowerCase()))
  return universal.length ? { ...own, Universal: universal } : { ...own }
}

export const SORTS: { value: LibrarySort; label: string }[] = [
  { value: 'az', label: 'Title A–Z' },
  { value: 'author', label: 'Author' },
  { value: 'series', label: 'Series order' },
  { value: 'rating', label: 'Top rated' },
  { value: 'intensity', label: 'Spiciest' }, // Tryst-skin label; the field is generic `intensity`
  { value: 'recent', label: 'Recently added' },
]

/** Subgenre → two-stop gradient for cover fallbacks (from the prototype's SUBGRAD). */
/**
 * The cover gradient for a book. Delegates to core's `coverGradient`: PRIMARY GENRE picks the hue
 * family, the first subgenre only modulates lightness/saturation within it.
 *
 * Kept under its old name and shape as the single seam every surface already calls — CoverCard,
 * SeriesView, BookDetailRail, the book page, Add's preview and RefineAdded. The signature gained
 * `genre` rather than sprouting a second function, so there is one tint rule, not two.
 */
export function subgenreGradient(subgenre: string, genre = ''): [string, string] {
  return coverGradient(genre, subgenre)
}
