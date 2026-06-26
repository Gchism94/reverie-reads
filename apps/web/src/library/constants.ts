import type { LibrarySort } from '@reverie/core'

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

export const READ_STATUSES = ['Read', 'Reading', 'Unread', 'DNF'] as const
export const SERIES_STATUSES = ['Standalone', 'Series', 'Complete'] as const

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
