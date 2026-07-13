import { genreKey, type LibrarySort } from '@reverie/core'

// Vocabularies from the prototype (kept identical so behavior matches).
export const FORMATS = [
  'Paperback',
  'Hardcover',
  'eBook',
  'Kindle Unlimited',
  'Audiobook',
  'Special Edition',
] as const

export const SUBGENRES = [
  'Romantasy',
  'Dark Romance',
  'Romance',
  'Contemporary',
  'Fantasy',
  'Sports',
  'Cowboy Romance',
] as const

/** The neutral catch-all subgenre — offered in every genre, so a non-romance library never has to
 *  file a book under a romance subgenre. */
export const NEUTRAL_SUBGENRE = 'Other'

/** Genre → its subgenres, keyed by the lowercased genre (matching how `book.genre` is stored). The
 *  add flow reads the ACTIVE skin's genre here, so a reader files books under their OWN genre's
 *  shelves instead of a hardcoded romance subgenre — the "genre → subgenre" layer the matcher can
 *  lean on. Romance keeps the original set; the other eight genres get a modest, real taxonomy.
 *  `subgenresForGenre()` appends NEUTRAL_SUBGENRE to every genre. */
export const GENRE_SUBGENRES: Record<string, readonly string[]> = {
  romance: ['Romantasy', 'Dark Romance', 'Romance', 'Contemporary', 'Sports', 'Cowboy Romance'],
  fantasy: ['Epic Fantasy', 'Romantasy', 'Dark Fantasy', 'Cozy Fantasy', 'Portal Fantasy', 'Sword & Sorcery'],
  'science fiction': ['Space Opera', 'Cyberpunk', 'Dystopian', 'Hard SF', 'Time Travel', 'First Contact'],
  horror: ['Gothic', 'Supernatural', 'Slasher', 'Cosmic Horror', 'Psychological', 'Haunted House'],
  mystery: ['Cozy Mystery', 'Noir', 'Thriller', 'Detective', 'Whodunit', 'Locked Room'],
  literary: ['Literary Fiction', 'Historical', 'Magical Realism', 'Contemporary', 'Short Stories'],
  cozy: ['Cozy Mystery', 'Cozy Fantasy', 'Small Town', 'Slice of Life', 'Culinary'],
  nonfiction: ['Memoir', 'History', 'Science', 'Essays', 'Biography', 'Self-Help'],
  'young adult': ['YA Fantasy', 'YA Romance', 'YA Dystopian', 'Coming of Age', 'YA Contemporary'],
}

/** Subgenres to offer for a genre — any spelling a book may carry resolves via `genreKey`
 *  ('Sci-Fi', 'science-fiction' and 'Science fiction' all reach the same shelf) — always with the
 *  neutral catch-all last. `keep` forces an existing value into the list (editing a book whose
 *  subgenre predates this map), so a picker never drops the book's own current subgenre. */
export function subgenresForGenre(genre: string, keep?: string): string[] {
  const list = [...(GENRE_SUBGENRES[genreKey(genre)] ?? []), NEUTRAL_SUBGENRE]
  return keep && !list.includes(keep) ? [keep, ...list] : list
}

export const READ_STATUSES = ['Read', 'Reading', 'Unread', 'DNF'] as const
// Series statuses live in core now: SERIES_STATUS_VALUES + SERIES_STATUS_LABELS (5-value enum).

export const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
] as const

export const TROPE_GROUPS: Record<string, string[]> = {
  'Core Romance': [
    'Enemies to Lovers', 'Friends to Lovers', 'Second Chance', 'Fake Dating',
    'Marriage of Convenience', 'Forbidden Love', 'Slow Burn', 'Love Triangle',
    'He Falls First', 'Forced Proximity', 'Only One Bed', 'Grumpy/Sunshine',
    'Opposites Attract', 'Age Gap', 'Single Parent', 'Found Family',
  ],
  Romantasy: [
    'Fated Mates', 'Chosen One', 'Court Intrigue', 'Fae', 'Vampires', 'Dragon Riders',
    'Shifters', 'Magic Academy', 'Bonded Pair', 'Morally Gray MMC', 'Touch Her and Die',
    'Cursed', 'Hidden Powers', 'Rebellion',
  ],
  'Dark Romance': [
    'Captive/Captor', 'Stalker', 'Mafia', 'Bully Romance', 'Morally Black MMC', 'Obsessive',
    'Possessive', 'Touch-Starved', 'Forced Marriage', 'Revenge', 'Anti-Hero',
    'Villain Romance', 'Serial Killers',
  ],
  'Structure & Heat': [
    'Why Choose', 'Reverse Harem', 'Sports', 'Billionaire', 'Small Town', 'Holiday',
    'Gothic', 'Banter', 'Strong Female Lead', 'Spicy',
  ],
}

/** Genuinely cross-genre tropes — offered in EVERY genre, deduped against the genre's own groups.
 *  Kept small on purpose: a trope earns "universal" by meaning the same thing in a mystery as in a
 *  romantasy, not by being popular. */
export const UNIVERSAL_TROPES: string[] = [
  'Found Family', 'Slow Burn', 'Enemies to Lovers', 'Morally Gray', 'Anti-Hero',
  'Redemption Arc', 'Banter', 'Strong Female Lead', 'Unreliable Narrator', 'Small Town',
]

/** Genre → trope groups (the tag-side twin of GENRE_SUBGENRES, same lowercased-genre keys).
 *  Romance keeps the original four groups VERBATIM — `deriveBoyfriend` keys off those exact names.
 *  Each other genre gets a curated 3-group baseline (~15–25 tropes), seeded from established
 *  reader-taxonomy vocabulary (StoryGraph-style content tags), rich enough to feel native without
 *  drowning the picker. Users extend freely — these are the baseline, not the ceiling. */
export const TROPE_GROUPS_BY_GENRE: Record<string, Record<string, string[]>> = {
  romance: TROPE_GROUPS,
  fantasy: {
    'Magic & Worlds': ['High Magic', 'Magic Academy', 'Fae', 'Dragons', 'Portal Fantasy', 'Prophecy', 'Gods & Pantheons', 'Elemental Magic'],
    'Quest & Structure': ['Chosen One', 'Quest', 'Heist', 'Political Intrigue', 'War Campaign', 'Tournament Arc', 'Rebellion'],
    Dynamics: ['Mentor & Student', 'Rivals', 'Reluctant Hero', 'Band of Misfits', 'Court Intrigue'],
  },
  'science fiction': {
    'Worlds & Tech': ['Space Opera', 'First Contact', 'AI & Androids', 'Time Travel', 'Generation Ship', 'Cyberpunk', 'Terraforming'],
    Stakes: ['Dystopia', 'Post-Apocalyptic', 'Rebellion', 'Corporate Overlords', 'Survival', 'Pandemic'],
    Dynamics: ['Found Crew', 'Sentient Ship', 'Enemies to Allies', 'Reluctant Hero'],
  },
  horror: {
    'The Threat': ['Haunted House', 'Possession', 'Cosmic Horror', 'Slasher', 'Body Horror', 'Folk Horror', 'Vampires', 'Ghosts'],
    'Dread & Structure': ['Isolation', 'Descent into Madness', 'Final Girl', 'Cursed Object', 'Small Town Secrets', 'Ritual'],
    Setting: ['Gothic', 'Deep Woods', 'At Sea', 'Asylum'],
  },
  mystery: {
    Investigation: ['Amateur Sleuth', 'Hardboiled Detective', 'Police Procedural', 'Cold Case', 'Locked Room', 'Heist'],
    'The Culprit': ['Serial Killers', 'Twist Ending', "Everyone's a Suspect", 'Cat and Mouse'],
    'Setting & Tone': ['Cozy Mystery', 'Noir', 'Small Town Secrets', 'Courtroom', 'Historical Mystery'],
  },
  literary: {
    'Form & Voice': ['Multiple Timelines', 'Epistolary', 'Vignettes', 'Stream of Consciousness', 'Metafiction'],
    Themes: ['Coming of Age', 'Family Saga', 'Grief & Memory', 'Immigrant Story', 'Class & Money', 'Marriage in Trouble'],
    Setting: ['Historical', 'Campus Novel', 'City Portrait'],
  },
  cozy: {
    Comforts: ['Culinary', 'Bookshop & Library', 'Seaside', 'Holiday', 'Garden & Farm', 'Tea & Coffee'],
    'Gentle Stakes': ['Low Stakes', 'Slice of Life', 'Community Project', 'Fresh Start', 'Second Act'],
    Charm: ['Talking Animals', 'Magical Realism', 'Grumpy/Sunshine', 'Matchmaking'],
  },
  nonfiction: {
    Approach: ['Memoir', 'Narrative Nonfiction', 'Investigative', 'Essays', 'Biography'],
    Subjects: ['Science', 'History', 'True Crime', 'Nature', 'Psychology', 'Food'],
    Tone: ['Funny', 'Moving', 'Practical'],
  },
  'young adult': {
    'Coming of Age': ['First Love', 'Friendship', 'Identity', 'Family Secrets', 'School Story'],
    Adventure: ['Chosen One', 'Magic Academy', 'Dystopian Rebellion', 'Tournament Arc', 'Road Trip'],
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
  const inOwn = new Set(Object.values(own).flat().map((t) => t.toLowerCase()))
  const universal = UNIVERSAL_TROPES.filter((t) => !inOwn.has(t.toLowerCase()))
  return universal.length ? { ...own, Universal: universal } : { ...own }
}

export const ALL_TROPES: string[] = Object.values(TROPE_GROUPS).flat()

export interface Archetype {
  name: string
  tag: string
  emoji: string
  grad: [string, string]
  desc: string
}

export const ARCH: Record<string, Archetype> = {
  cinnamon: { name: 'The Cinnamon Roll', tag: 'Soft, devoted, falls first', emoji: '🧁', grad: ['#ffb37e', '#ff7e9d'], desc: 'Sweet to the core — open adoration, gentle hands, zero games.' },
  rogue: { name: 'The Charming Rogue', tag: 'Witty, flirtatious, all banter', emoji: '🃏', grad: ['#ff9a6c', '#f25c8a'], desc: 'Quick with a comeback, slow to admit he’s fallen.' },
  protector: { name: 'The Brooding Protector', tag: 'Grumpy, fierce, touch-starved', emoji: '🛡️', grad: ['#8e6cff', '#5c3a9e'], desc: 'A wall of grump to the world and a fool for exactly one person.' },
  gray: { name: 'The Morally Gray Mastermind', tag: 'Powerful, calculating, yours', emoji: '🖤', grad: ['#6a4e9e', '#2e1a3a'], desc: 'Plays a longer game than the room — and it became about you.' },
  fae: { name: 'The Fae Prince', tag: 'Ethereal, ancient, dangerous', emoji: '🌙', grad: ['#7fd3c6', '#4a6fa5'], desc: 'Centuries old, devastating, bound to you by something older than choice.' },
  dragon: { name: 'The Dragon Rider', tag: 'Battle-forged, loyal, intense', emoji: '🐉', grad: ['#ff7e5f', '#b23a48'], desc: 'Forged in war, scarred, undone by the one person he never expected to need.' },
  mafia: { name: 'The Mafia King', tag: 'Lethal, possessive, devoted', emoji: '🥀', grad: ['#c0455f', '#3a0e1a'], desc: 'Runs an empire on fear and runs soft only for you.' },
  villain: { name: 'The Villain', tag: 'Dark, obsessive, irresistible', emoji: '🔥', grad: ['#b23a6e', '#2a0e22'], desc: 'The bad decision you’d make twice. He’s decided you’re his.' },
  tortured: { name: 'The Tortured Soul', tag: 'Haunted, aching, worth it', emoji: '🌧️', grad: ['#5a6e8e', '#2a2e3a'], desc: 'Carrying more than he’ll say. The angst is the point.' },
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
export function subgenreGradient(subgenre: string): [string, string] {
  const map: Record<string, [string, string]> = {
    Romantasy: ['#6a4e9e', '#c0455f'],
    'Dark Romance': ['#3a0e1a', '#9e2a4e'],
    Romance: ['#ff7e9d', '#ffb37e'],
    Contemporary: ['#ff9a6c', '#f25c8a'],
    Sports: ['#ff7e5f', '#e8345f'],
    'Cowboy Romance': ['#c98a4b', '#9e3a2a'],
    Fantasy: ['#4a6fa5', '#6a3d7a'],
  }
  return map[subgenre] ?? ['#c0455f', '#6a4e9e']
}
