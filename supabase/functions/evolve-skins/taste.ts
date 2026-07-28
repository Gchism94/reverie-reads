// Taste math for the evolve-skins cron. This is a hand-kept mirror of the pure logic in
// packages/core/src/adaptive.ts (Deno can't import the workspace package). Pulling it into its
// own module means the cron and a Vitest contract test (packages/core/src/cronParity.test.ts)
// import THE SAME file: the test runs golden fixtures through both this and core and asserts
// identical output, so CI fails the moment the two drift. Keep this free of Deno globals so it
// stays importable from Node.

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
export const SKIN_ORDER: SkinId[] = [
  'tryst',
  'grimoire',
  'aphelion',
  'marrow',
  'umbra',
  'folio',
  'hearth',
  'almanac',
  'bloom',
]
export type Weights = Record<SkinId, number>

// Mirrors SKIN_AFFINITY in packages/core/src/adaptive.ts.
export const AFFINITY: Record<SkinId, { subgenres: string[]; tags: string[] }> = {
  tryst: {
    subgenres: ['Romance', 'Contemporary', 'Sports', 'Cowboy Romance'],
    tags: [
      'Slow Burn',
      'Friends to Lovers',
      'Grumpy/Sunshine',
      'Small Town',
      'Second Chance',
      'He Falls First',
      'Fake Dating',
      'Found Family',
    ],
  },
  grimoire: {
    subgenres: ['Romantasy', 'Fantasy'],
    tags: [
      'Fae',
      'Dragon Riders',
      'Magic Academy',
      'Court Intrigue',
      'Chosen One',
      'Shifters',
      'Cursed',
      'Fated Mates',
      'Hidden Powers',
      'Rebellion',
      'Bonded Pair',
    ],
  },
  aphelion: {
    subgenres: ['Science Fiction', 'Sci-Fi', 'Dystopian'],
    tags: ['Space', 'AI', 'Cyberpunk', 'Time Travel', 'Aliens', 'Dystopian'],
  },
  marrow: {
    subgenres: ['Dark Romance', 'Horror', 'Thriller'],
    tags: [
      'Mafia',
      'Stalker',
      'Villain Romance',
      'Serial Killers',
      'Captive/Captor',
      'Morally Black MMC',
      'Obsessive',
      'Anti-Hero',
      'Bully Romance',
      'Possessive',
      'Revenge',
    ],
  },
  umbra: {
    subgenres: ['Mystery', 'Thriller', 'Crime', 'Detective', 'Suspense'],
    tags: [
      'Whodunit',
      'Noir',
      'Heist',
      'Spy',
      'Cozy Mystery',
      'Locked Room',
      'Cold Case',
      'Conspiracy',
    ],
  },
  folio: {
    subgenres: ['Literary', 'Literary Fiction', 'Classics', 'Fiction', 'Poetry'],
    tags: ['Coming of Age', 'Family Saga', 'Translation', 'Award Winner', 'Essays', 'Modernist'],
  },
  hearth: {
    subgenres: ['Cozy', 'Cottagecore', 'Slice of Life', 'Womens Fiction'],
    tags: ['Comfort Read', 'Small Town', 'Baking', 'Found Family', 'Low Stakes', 'Feel Good'],
  },
  almanac: {
    subgenres: ['Nonfiction', 'Memoir', 'History', 'Science', 'Biography', 'Self Help'],
    tags: ['Reference', 'Essay', 'Field Guide', 'How To', 'Investigative', 'Popular Science'],
  },
  bloom: {
    subgenres: ['YA', 'Young Adult', 'New Adult', 'Contemporary'],
    tags: [
      'Coming of Age',
      'First Love',
      'Enemies to Lovers',
      'Road Trip',
      'Summer',
      'High School',
      'Friendship',
    ],
  },
}

export interface BookRow {
  subgenre: string | null
  tags: string[] | null
  rating: number | null
  fave: boolean | null
  read_status: string | null
}

// Mirrors engagement() in core; approximates "read" by read_status only (no reads join in the cron).
export function engagement(b: BookRow): number {
  const read = b.read_status === 'Read'
  let w = 1
  if (b.fave) w *= 2
  const rating = b.rating ?? 0
  if (rating >= 4) w *= 1.5
  else if (rating > 0 && rating < 3) w *= 0.6
  if (b.read_status === 'DNF') w *= 0.3
  else if (!read) w *= 0.8
  return w
}

const skinFloor = (id: SkinId): number => (id === 'tryst' ? 1.2 : 0.4)

export function computeWeights(books: BookRow[]): Weights {
  const raw = Object.fromEntries(SKIN_ORDER.map((id) => [id, 0])) as Weights
  for (const b of books) {
    const w = engagement(b)
    const tags = new Set(b.tags ?? [])
    for (const id of SKIN_ORDER) {
      const aff = AFFINITY[id]
      let score = 0
      if (b.subgenre && aff.subgenres.includes(b.subgenre)) score += 2
      for (const t of aff.tags) if (tags.has(t)) score += 1
      raw[id] += score * w
    }
  }
  const total = SKIN_ORDER.reduce((s, id) => s + raw[id] + skinFloor(id), 0) || 1
  return Object.fromEntries(
    SKIN_ORDER.map((id) => [id, (raw[id] + skinFloor(id)) / total]),
  ) as Weights
}

export const dominantSkin = (w: Weights): SkinId =>
  SKIN_ORDER.reduce((best, id) => (w[id] > w[best] ? id : best), 'tryst')

export const weightDistance = (a: Weights, b: Weights): number =>
  SKIN_ORDER.reduce((s, id) => s + Math.abs((a[id] ?? 0) - (b[id] ?? 0)), 0)

export function isMaterialShift(current: Weights, next: Weights, threshold = 0.25): boolean {
  if (dominantSkin(current) !== dominantSkin(next)) return true
  return weightDistance(current, next) >= threshold
}

export function tasteInsight(w: Weights): string {
  const flavour: Record<SkinId, string> = {
    tryst: 'romance',
    grimoire: 'fantasy',
    aphelion: 'sci-fi',
    marrow: 'dark & eerie',
    umbra: 'mystery',
    folio: 'literary',
    hearth: 'cozy',
    almanac: 'nonfiction',
    bloom: 'YA & contemporary',
  }
  const ranked = SKIN_ORDER.filter((id) => w[id] > 0.05).sort((a, b) => w[b] - w[a])
  const top = ranked[0] ?? 'tryst'
  const second = ranked[1]
  if (second && w[second] > w[top] * 0.6)
    return `leaning ${flavour[top]}, with a ${flavour[second]} streak`
  return `leaning ${flavour[top]}`
}
