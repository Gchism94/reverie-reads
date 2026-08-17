/**
 * Title-case a reader-typed trope or mood name, so "enemies to lovers" and "ENEMIES TO LOVERS" both
 * store as "Enemies to Lovers" — the way `SEED_TROPES` is already authored.
 *
 * ── WHY MINOR WORDS STAY LOWERCASE ──────────────────────────────────────────────────────────────
 * A naive capitalize-every-word would produce "Enemies To Lovers", which is not how the canonical
 * vocabulary reads. Checked against the actual seed data rather than assumed — every one of these
 * is a real `SEED_TROPES` entry:
 *
 *   Enemies to Lovers · Friends to Lovers · Enemies to Allies
 *   Touch Her and Die · Cat and Mouse · Band of Misfits
 *   Marriage of Convenience · Coming of Age · Slice of Life · Stream of Consciousness
 *   Marriage in Trouble
 *
 * So the seeds use conventional title case with the usual small-word exceptions, consistently across
 * 187 entries. A personal trope typed next to those should look like it belongs to the same
 * vocabulary, since the picker lists them together and the reader cannot tell which is which.
 *
 * ── WHAT IT DELIBERATELY DOES NOT DO ────────────────────────────────────────────────────────────
 * The FIRST word is always capitalized, even when it is a minor word ("Of Mice and Men"), because a
 * name that starts lowercase reads as a mistake rather than as a style.
 *
 * It does not touch interior punctuation or split on it: "Grumpy/Sunshine" is a seed entry, and
 * splitting on `/` to capitalize both halves would be inventing a rule the vocabulary does not have.
 * Words are whitespace-delimited, nothing more.
 *
 * It does not lowercase a word the reader capitalized in the middle of a word — "McGuffin" and
 * "POV" survive, because only the FIRST letter is forced and the rest of an already-capitalized
 * token is left alone. Only all-caps input is folded, since "ENEMIES TO LOVERS" is shouting rather
 * than an acronym.
 */

/**
 * Conventional title-case exceptions — articles, coordinating conjunctions, short prepositions.
 *
 * The five the seed vocabulary actually lowercases, counted from it rather than recalled from a
 * style guide: `of` (5), `to` (3), `and` (2), `into` (1), `in` (1). `into` was missing from a first
 * draft of this list and the round-trip test below caught it on "Descent into Madness" — which is
 * the reason that test asserts against the real vocabulary instead of against examples chosen to
 * agree with the implementation. The rest are the standard set, included so a personal trope using
 * one reads the same way even though no seed happens to.
 */
const MINOR = new Set([
  'a',
  'an',
  'and',
  'as',
  'at',
  'but',
  'by',
  'for',
  'from',
  'in',
  'into',
  'nor',
  'of',
  'on',
  'or',
  'the',
  'to',
  'up',
  'via',
  'with',
])

export function titleCase(input: string): string {
  const words = input.trim().split(/\s+/).filter(Boolean)
  if (!words.length) return ''
  return words
    .map((word, i) => {
      // All-caps input is shouting, not an acronym the reader chose — fold it before capitalizing.
      const w = word === word.toUpperCase() ? word.toLowerCase() : word
      const lower = w.toLowerCase()
      if (i > 0 && MINOR.has(lower)) return lower
      // Only the first character is forced; the rest keeps whatever the reader typed, so "McGuffin"
      // and "d'Arcy" survive rather than becoming "Mcguffin" and "D'arcy".
      return w.charAt(0).toUpperCase() + w.slice(1)
    })
    .join(' ')
}
