// Tag canonicalization — the correctness floor under everything tag-driven (the matcher's rarity
// weighting, filter membership, trope chips). Users can type tags freely; without a canonical form,
// "E2L", "enemies-to-lovers" and "Enemies to Lovers" are three different tags and exact-match
// scoring quietly misses. Aliases collapse TRUE synonyms/formatting variants only — near-neighbours
// with their own meaning (e.g. "Rivals to Lovers") deliberately stay distinct.

/** lowercased alias → canonical tag name. Formatting variants + common shorthands only. */
export const TAG_ALIASES: Record<string, string> = {
  'e2l': 'Enemies to Lovers',
  'enemies-to-lovers': 'Enemies to Lovers',
  'enemies 2 lovers': 'Enemies to Lovers',
  'friends-to-lovers': 'Friends to Lovers',
  'f2l': 'Friends to Lovers',
  'grumpy sunshine': 'Grumpy/Sunshine',
  'grumpy x sunshine': 'Grumpy/Sunshine',
  'grumpy-sunshine': 'Grumpy/Sunshine',
  'fated mate': 'Fated Mates',
  'fake relationship': 'Fake Dating',
  'marriage of convenience (moc)': 'Marriage of Convenience',
  'moc': 'Marriage of Convenience',
  'forced prox': 'Forced Proximity',
  'one bed': 'Only One Bed',
  'there was only one bed': 'Only One Bed',
  'love-triangle': 'Love Triangle',
  'slow-burn': 'Slow Burn',
  'slowburn': 'Slow Burn',
  'second-chance': 'Second Chance',
  'morally grey mmc': 'Morally Gray MMC',
  'morally grey': 'Morally Gray',
  'anti hero': 'Anti-Hero',
  'antihero': 'Anti-Hero',
  'found-family': 'Found Family',
  'foundfamily': 'Found Family',
  'why-choose': 'Why Choose',
  'rh': 'Reverse Harem',
  'locked-room': 'Locked Room',
  'locked room mystery': 'Locked Room',
  'unreliable-narrator': 'Unreliable Narrator',
  'coming-of-age': 'Coming of Age',
  'time-travel': 'Time Travel',
  'post apocalyptic': 'Post-Apocalyptic',
  'postapocalyptic': 'Post-Apocalyptic',
}

/** Collapse whitespace + trim (the raw form we compare and store). */
const clean = (raw: string): string => raw.replace(/\s+/g, ' ').trim()

/**
 * Canonicalize a user-typed tag: alias hit → the canonical name; else a case-insensitive match
 * against `known` (the genre's trope vocabulary + the library's existing tags) → that exact
 * casing, so "enemies to lovers" converges on the chip everyone else uses; else the cleaned raw
 * (user vocabulary is welcome — we only normalize, never reject).
 */
export function canonicalTag(raw: string, known?: Iterable<string>): string {
  const cleaned = clean(raw)
  if (!cleaned) return ''
  const alias = TAG_ALIASES[cleaned.toLowerCase()]
  if (alias) return alias
  if (known) {
    const lower = cleaned.toLowerCase()
    for (const k of known) if (k.toLowerCase() === lower) return k
  }
  return cleaned
}
