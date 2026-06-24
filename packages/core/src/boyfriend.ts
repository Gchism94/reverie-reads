export type Boyfriend =
  | 'mafia'
  | 'villain'
  | 'fae'
  | 'dragon'
  | 'gray'
  | 'protector'
  | 'cinnamon'
  | 'rogue'
  | 'tortured'

/**
 * Derive the book-boyfriend archetype from tropes + subgenre. Pure port of the
 * prototype's deriveBoyfriend — the order of checks is significant (first match wins).
 */
export function deriveBoyfriend(b: { tropes?: string[]; subgenre?: string }): Boyfriend {
  const t = new Set((b.tropes ?? []).map((x) => x.toLowerCase()))
  const dark = b.subgenre === 'Dark Romance'
  const has = (...k: string[]) => k.some((x) => t.has(x.toLowerCase()))

  if (has('mafia')) return 'mafia'
  if (has('villain romance', 'morally black mmc', 'anti-hero', 'obsessive', 'stalker')) return 'villain'
  if (has('fae')) return 'fae'
  if (has('dragon riders', 'magic academy')) return 'dragon'
  if (has('morally gray mmc', 'court intrigue', 'touch her and die')) return 'gray'
  if (has('grumpy/sunshine', 'forced proximity')) return 'protector'
  if (has('he falls first', 'friends to lovers', 'found family') && !dark) return 'cinnamon'
  if (has('enemies to lovers', 'banter', 'fake dating')) return 'rogue'
  if (has('second chance', 'single parent')) return 'tortured'
  if (b.subgenre === 'Romantasy') return 'gray'
  if (dark) return 'villain'
  return 'cinnamon'
}
