// The trope system's vocabulary + pure logic (docs/task-trope-system.md). Tropes stop being a
// flat tag list: every canonical trope carries a FACET (what kind of thing it names), a
// GENRE AFFINITY (a picker-ordering hint, never a gate), and ALIASES (true synonyms only —
// formatting shorthands live in TAG_ALIASES and compose with these at resolve time).
//
// SEED_TROPES is the single source of truth: the trope_system migration's INSERT block is
// generated from it (a web parity test pins the two together), and the picker/pages read the
// same rows back from the tropes table. Canonicalized from the existing TROPE_GROUPS_BY_GENRE /
// UNIVERSAL_TROPES vocabulary — nothing invented beyond conservative aliases.

import { TAG_ALIASES } from './tags'
import type { Book } from './types'

export type TropeFacet = 'dynamics' | 'plot' | 'characters' | 'setting_world' | 'vibe'

export const TROPE_FACETS: readonly TropeFacet[] = ['dynamics', 'plot', 'characters', 'setting_world', 'vibe']

export const FACET_LABELS: Record<TropeFacet, string> = {
  dynamics: 'Dynamics',
  plot: 'Plot',
  characters: 'Characters',
  setting_world: 'Setting & world',
  vibe: 'Vibe',
}

export interface SeedTrope {
  name: string
  facet: TropeFacet
  /** lowercased primary-genre keys this trope leans toward; [] = at home everywhere */
  affinity: string[]
  aliases: string[]
}

const t = (name: string, facet: TropeFacet, affinity: string[] = [], aliases: string[] = []): SeedTrope => ({
  name,
  facet,
  affinity,
  aliases,
})

const r = 'romance'
const f = 'fantasy'
const s = 'science fiction'
const h = 'horror'
const m = 'mystery'
const l = 'literary'
const c = 'cozy'
const n = 'nonfiction'
const y = 'young adult'

/** The canonical seed — every trope the app's genre vocabularies offered, deduped, faceted. */
export const SEED_TROPES: readonly SeedTrope[] = [
  // ── dynamics — how people relate ──
  t('Enemies to Lovers', 'dynamics'),
  t('Friends to Lovers', 'dynamics', [r]),
  t('Grumpy/Sunshine', 'dynamics', [r, c]),
  t('Opposites Attract', 'dynamics', [r]),
  t('Age Gap', 'dynamics', [r]),
  t('Love Triangle', 'dynamics', [r, y]),
  t('He Falls First', 'dynamics', [r]),
  t('Forced Proximity', 'dynamics', [r]),
  t('Only One Bed', 'dynamics', [r]),
  t('Forbidden Love', 'dynamics', [r]),
  t('Fated Mates', 'dynamics', [r, f], ['mates']),
  t('Bonded Pair', 'dynamics', [r, f]),
  t('Touch Her and Die', 'dynamics', [r], ['touch her and you die']),
  t('Captive/Captor', 'dynamics', [r], ['captive captor']),
  t('Bully Romance', 'dynamics', [r]),
  t('Obsessive', 'dynamics', [r]),
  t('Possessive', 'dynamics', [r]),
  t('Why Choose', 'dynamics', [r]),
  t('Reverse Harem', 'dynamics', [r], ['harem']),
  t('Banter', 'dynamics'),
  t('Mentor & Student', 'dynamics', [f], ['mentor and student']),
  t('Rivals', 'dynamics', [f, y], ['rivals to lovers']),
  t('Enemies to Allies', 'dynamics', [s]),
  t('Found Family', 'dynamics'),
  t('Found Crew', 'dynamics', [s]),
  t('Band of Misfits', 'dynamics', [f]),
  t('Matchmaking', 'dynamics', [c, r]),
  t('First Love', 'dynamics', [y, r]),
  t('Friendship', 'dynamics', [y]),
  t('Cat and Mouse', 'dynamics', [m]),
  t('Marriage in Trouble', 'dynamics', [l]),
  t('Villain Romance', 'dynamics', [r]),

  // ── plot — premise, structure, events ──
  t('Second Chance', 'plot', [r], ['second chance romance']),
  t('Fake Dating', 'plot', [r]),
  t('Marriage of Convenience', 'plot', [r]),
  t('Forced Marriage', 'plot', [r]),
  t('Revenge', 'plot', [r]),
  t('Rebellion', 'plot', [r, f, s]),
  t('Quest', 'plot', [f]),
  t('Heist', 'plot', [f, m]),
  t('Political Intrigue', 'plot', [f]),
  t('Court Intrigue', 'plot', [r, f]),
  t('War Campaign', 'plot', [f]),
  t('Tournament Arc', 'plot', [f, y]),
  t('Prophecy', 'plot', [f]),
  t('Time Travel', 'plot', [s]),
  t('First Contact', 'plot', [s]),
  t('Twist Ending', 'plot', [m]),
  t("Everyone's a Suspect", 'plot', [m]),
  t('Cold Case', 'plot', [m]),
  t('Locked Room', 'plot', [m]),
  t('Police Procedural', 'plot', [m]),
  t('Coming of Age', 'plot', [l, y]),
  t('Family Saga', 'plot', [l]),
  t('Immigrant Story', 'plot', [l]),
  t('Family Secrets', 'plot', [y, l]),
  t('Community Project', 'plot', [c]),
  t('Fresh Start', 'plot', [c]),
  t('Second Act', 'plot', [c]),
  t('Road Trip', 'plot', [y]),
  t('Dystopian Rebellion', 'plot', [y, s]),
  t('Survival', 'plot', [s, h]),
  t('Pandemic', 'plot', [s, h]),
  t('Ritual', 'plot', [h]),
  t('Cursed', 'plot', [r, f]),
  t('Cursed Object', 'plot', [h]),
  t('Possession', 'plot', [h]),
  t('Slasher', 'plot', [h]),
  t('Redemption Arc', 'plot'),
  t('Secret Identity', 'plot', [y]),
  t('Identity', 'plot', [y]),
  t('Multiple Timelines', 'plot', [l], ['dual timeline']),
  t('Epistolary', 'plot', [l]),
  t('Vignettes', 'plot', [l]),
  t('Metafiction', 'plot', [l]),
  t('Memoir', 'plot', [n]),
  t('Narrative Nonfiction', 'plot', [n]),
  t('Investigative', 'plot', [n]),
  t('Essays', 'plot', [n]),
  t('Biography', 'plot', [n]),

  // ── characters — an archetype in the room ──
  t('Morally Gray MMC', 'characters', [r]),
  t('Morally Black MMC', 'characters', [r]),
  t('Morally Gray', 'characters'),
  t('Anti-Hero', 'characters'),
  t('Serial Killers', 'characters', [r, m], ['serial killer']),
  t('Stalker', 'characters', [r]),
  t('Billionaire', 'characters', [r], ['billionaire romance']),
  t('Single Parent', 'characters', [r]),
  t('Strong Female Lead', 'characters'),
  t('Final Girl', 'characters', [h]),
  t('Reluctant Hero', 'characters', [f, s]),
  t('Chosen One', 'characters', [r, f, y], ['the chosen one']),
  t('Vampires', 'characters', [r, h], ['vampire']),
  t('Ghosts', 'characters', [h], ['ghost']),
  t('Shifters', 'characters', [r], ['shifter', 'werewolves', 'werewolf']),
  t('Dragon Riders', 'characters', [r, f]),
  t('Dragons', 'characters', [f], ['dragon']),
  t('Sentient Ship', 'characters', [s]),
  t('Talking Animals', 'characters', [c]),
  t('AI & Androids', 'characters', [s], ['ai', 'androids', 'artificial intelligence']),
  t('Amateur Sleuth', 'characters', [m, c]),
  t('Hardboiled Detective', 'characters', [m]),
  t('Unreliable Narrator', 'characters'),
  t('Hidden Powers', 'characters', [r, f]),

  // ── setting & world — where the story lives ──
  t('Magic Academy', 'setting_world', [r, f, y]),
  t('Small Town', 'setting_world', [], ['small-town']),
  t('Small Town Secrets', 'setting_world', [h, m]),
  t('Holiday', 'setting_world', [r, c]),
  t('Gothic', 'setting_world', [r, h]),
  t('Haunted House', 'setting_world', [h], ['haunted']),
  t('Deep Woods', 'setting_world', [h]),
  t('At Sea', 'setting_world', [h]),
  t('Asylum', 'setting_world', [h]),
  t('Space Opera', 'setting_world', [s]),
  t('Cyberpunk', 'setting_world', [s]),
  t('Generation Ship', 'setting_world', [s]),
  t('Terraforming', 'setting_world', [s]),
  t('Corporate Overlords', 'setting_world', [s]),
  t('Dystopia', 'setting_world', [s], ['dystopian']),
  t('Post-Apocalyptic', 'setting_world', [s]),
  t('Portal Fantasy', 'setting_world', [f]),
  t('High Magic', 'setting_world', [f]),
  t('Elemental Magic', 'setting_world', [f]),
  t('Gods & Pantheons', 'setting_world', [f], ['gods and pantheons']),
  t('Fae', 'setting_world', [r, f], ['faerie', 'fey']),
  t('Mafia', 'setting_world', [r]),
  t('Historical', 'setting_world', [l]),
  t('Historical Mystery', 'setting_world', [m]),
  t('Courtroom', 'setting_world', [m]),
  t('Campus Novel', 'setting_world', [l]),
  t('School Story', 'setting_world', [y]),
  t('City Portrait', 'setting_world', [l]),
  t('Sports', 'setting_world', [r], ['sports romance']),
  t('Culinary', 'setting_world', [c]),
  t('Bookshop & Library', 'setting_world', [c], ['bookshop', 'library']),
  t('Seaside', 'setting_world', [c]),
  t('Garden & Farm', 'setting_world', [c], ['cottagecore']),
  t('Tea & Coffee', 'setting_world', [c]),
  t('Science', 'setting_world', [n]),
  t('History', 'setting_world', [n]),
  t('True Crime', 'setting_world', [n, m], ['true-crime']),
  t('Nature', 'setting_world', [n]),
  t('Psychology', 'setting_world', [n]),
  t('Food', 'setting_world', [n]),

  // ── vibe — the feel of the thing ──
  t('Slow Burn', 'vibe'),
  t('Spicy', 'vibe', [r], ['spice']),
  t('Touch-Starved', 'vibe', [r], ['touch starved']),
  t('Isolation', 'vibe', [h]),
  t('Descent into Madness', 'vibe', [h]),
  t('Cosmic Horror', 'vibe', [h]),
  t('Body Horror', 'vibe', [h]),
  t('Folk Horror', 'vibe', [h]),
  t('Noir', 'vibe', [m]),
  t('Cozy Mystery', 'vibe', [m, c], ['cosy mystery']),
  t('Magical Realism', 'vibe', [c, l]),
  t('Low Stakes', 'vibe', [c]),
  t('Slice of Life', 'vibe', [c]),
  t('Stream of Consciousness', 'vibe', [l]),
  t('Grief & Memory', 'vibe', [l], ['grief and memory']),
  t('Class & Money', 'vibe', [l], ['class and money']),
  t('Funny', 'vibe', [n], ['humor', 'humour']),
  t('Moving', 'vibe', [n]),
  t('Practical', 'vibe', [n]),
]

// ── resolution: raw text → canonical trope (aliases + formatting shorthands compose) ──

export interface TropeLike {
  id: string
  name: string
  aliases: string[]
}

const norm = (v: string): string => v.replace(/\s+/g, ' ').trim().toLowerCase()

/**
 * Resolve raw text (a user-typed name, an imported tag, a Hardcover community descriptor) to a
 * known trope: TAG_ALIASES shorthands first, then name/alias matching. Null = genuinely new
 * (the caller may offer a personal-trope create; never silently invents canon).
 */
export function resolveTrope<T extends TropeLike>(raw: string, tropes: readonly T[]): T | null {
  const cleaned = norm(raw)
  if (!cleaned) return null
  const viaShorthand = TAG_ALIASES[cleaned]
  const target = viaShorthand ? norm(viaShorthand) : cleaned
  for (const trope of tropes) {
    if (norm(trope.name) === target) return trope
    if (trope.aliases.some((a) => norm(a) === target)) return trope
  }
  return null
}

/** True when raw text names a canonical seed trope (by name or alias). Lets callers without trope
 *  ROWS (e.g. the importer noting trope-like Goodreads shelves) check against SEED_TROPES, whose
 *  entries carry no id. Never mutates or converts — a pure "does this look like a known trope?". */
export function isKnownTrope(raw: string): boolean {
  const cleaned = norm(raw)
  if (!cleaned) return false
  const target = norm(TAG_ALIASES[cleaned] ?? cleaned)
  return SEED_TROPES.some((t) => norm(t.name) === target || t.aliases.some((a) => norm(a) === target))
}

/** Type-ahead match across names AND aliases (picker search). */
export function tropeMatches(query: string, trope: Pick<TropeLike, 'name' | 'aliases'>): boolean {
  const q = norm(query)
  if (!q) return true
  return norm(trope.name).includes(q) || trope.aliases.some((a) => norm(a).includes(q))
}

/** Picker ordering within a facet: the book's genre leans first (affinity is a hint, not a
 *  gate), then everything else, alphabetical inside each band. */
export function orderByAffinity<T extends { name: string; affinity: string[] }>(tropes: readonly T[], genre: string): T[] {
  const g = norm(genre)
  const band = (x: T) => (x.affinity.length === 0 ? 1 : x.affinity.includes(g) ? 0 : 2)
  return [...tropes].sort((a, b) => band(a) - band(b) || a.name.localeCompare(b.name))
}

// ── assignments ──

export type TropeEmphasis = 'pinned' | 'present'

/** A chip's visual state in pickers/sheets — assignments plus the unselected 'off'. */
export type ChipEmphasis = TropeEmphasis | 'off'

/** The one tagging gesture, everywhere: tap adds, a second tap pins (cap-aware at the caller),
 *  a third removes. */
export const cycleEmphasis = (cur: ChipEmphasis): ChipEmphasis =>
  cur === 'off' ? 'present' : cur === 'present' ? 'pinned' : 'off'

/** What a Book carries inline: enough for filters, chips, and derivations. */
export interface BookTropeRef {
  id: string
  name: string
  emphasis: TropeEmphasis
}

/** Pins lead everywhere; soft-capped at PIN_CAP per book (warm copy in the UI, never a hard error). */
export const PIN_CAP = 3

export const PIN_CAP_COPY = 'Three pins is the shape of a heart — swap one out to pin this.'

/** A book's tropes for display: pinned first, then present, stable alphabetical inside. */
export const sortBookTropes = (refs: readonly BookTropeRef[]): BookTropeRef[] =>
  [...refs].sort((a, b) => (a.emphasis === b.emphasis ? a.name.localeCompare(b.name) : a.emphasis === 'pinned' ? -1 : 1))

/** Trope names a book answers to (filters, boyfriend derivation, search) — join first, legacy
 *  tags as a fallback so pre-migration caches keep matching. */
export function bookTropeNames(b: Pick<Book, 'tropes' | 'tags'>): string[] {
  const names = b.tropes.map((t) => t.name)
  return names.length ? names : b.tags
}

/** "Your frequent tropes" — the reader's most-used, for the picker's top shelf. */
export function frequentTropes(all: readonly { tropeId: string }[], topN = 8): string[] {
  const counts = new Map<string, number>()
  for (const a of all) counts.set(a.tropeId, (counts.get(a.tropeId) ?? 0) + 1)
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN)
    .map(([id]) => id)
}

/** KIN — the tropes this one most co-occurs with, computed from YOUR library only. */
export function tropeKin(
  tropeId: string,
  assignments: readonly { bookId: string; tropeId: string }[],
  topN = 5,
): { tropeId: string; count: number }[] {
  const carriers = new Set(assignments.filter((a) => a.tropeId === tropeId).map((a) => a.bookId))
  const counts = new Map<string, number>()
  for (const a of assignments) {
    if (a.tropeId === tropeId || !carriers.has(a.bookId)) continue
    counts.set(a.tropeId, (counts.get(a.tropeId) ?? 0) + 1)
  }
  return [...counts.entries()]
    .map(([id, count]) => ({ tropeId: id, count }))
    .sort((a, b) => b.count - a.count || a.tropeId.localeCompare(b.tropeId))
    .slice(0, topN)
}
