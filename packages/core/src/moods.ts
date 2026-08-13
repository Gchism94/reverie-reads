// Mood — a READER-ASSIGNED dimension (docs/archive/task-mood.md). Mood is how a book LANDED on the reader:
// subjective, personal, theirs alone. It is the inverse of the old model-derived "vibe" chip (removed
// in #69): the reader attaches a mood because they felt it. The model may, at most, suggest — it must
// never auto-apply, never derive, never stamp a default.
//
// THE GOVERNING RULE, IN CODE: there is deliberately NO function here (or anywhere in the mood path)
// that computes a mood from tags, subgenre, tropes, embeddings, or anything else. A book with no
// reader-assigned mood simply has none — absence is a valid, quiet state, never backfilled with a
// guess. If you are tempted to add a `deriveMood`/`inferMood`, STOP: that is the one thing this
// feature exists to refuse.
//
// SEED_MOODS is the single source of truth for the canonical starter vocabulary: the mood_system
// migration's INSERT block is generated from it (a web parity test pins the two together), and the
// picker/pages read the same rows back from the moods table. Personal moods are first-class — a
// reader coins their own (owner-scoped, optional canonical alias), same pattern as personal tropes.

export interface SeedMood {
  name: string
}

/**
 * The canonical mood starter set — small and evocative, spanning the emotional registers a book can
 * leave behind (warm↔cold, calm↔intense, light↔dark), genre-neutral so it fits horror, literary,
 * romance, cozy alike. PROVISIONAL: proposed for the owner's review (docs/archive/task-mood.md §1); the
 * reader extends it freely with personal moods regardless.
 */
export const SEED_MOODS: readonly SeedMood[] = [
  { name: 'Cozy' }, // warm, safe, low-stakes comfort
  { name: 'Tender' }, // soft, emotionally gentle
  { name: 'Hopeful' }, // uplifting, forward-looking
  { name: 'Whimsical' }, // playful, light, fanciful
  { name: 'Atmospheric' }, // mood-drenched, immersive
  { name: 'Dreamy' }, // hazy, lyrical, unreal
  { name: 'Melancholy' }, // wistful, gently sad
  { name: 'Bittersweet' }, // joy and ache together
  { name: 'Haunting' }, // lingers, an eerie afterglow
  { name: 'Unsettling' }, // uneasy, something-is-wrong
  { name: 'Tense' }, // taut, anxious, gripping
  { name: 'Bleak' }, // cold, grim, hopeless
  { name: 'Propulsive' }, // fast, can't-put-it-down
  { name: 'Thought-provoking' }, // reflective, stays with you
]

/** The canonical names, for convenience (seed generation, tests). */
export const CANONICAL_MOOD_NAMES: readonly string[] = SEED_MOODS.map((m) => m.name)

/** The minimum a mood row needs for resolution/search. */
export interface MoodLike {
  id: string
  name: string
}

/** What a Book carries inline: reader-assigned moods (no emphasis — mood is felt, not weighted). */
export interface BookMoodRef {
  id: string
  name: string
}

const norm = (v: string): string => v.replace(/\s+/g, ' ').trim().toLowerCase()

/**
 * Resolve raw text (a reader-typed mood name) to a known mood by normalized name. Personal-mood
 * creation resolves against canon FIRST so "cozy" doesn't duplicate the canonical "Cozy". Null =
 * genuinely new (the caller may coin a personal mood). Never invents canon, never derives.
 */
export function resolveMood<T extends MoodLike>(raw: string, moods: readonly T[]): T | null {
  const target = norm(raw)
  if (!target) return null
  return moods.find((m) => norm(m.name) === target) ?? null
}

/** Type-ahead match for the picker's optional search. */
export function moodMatches(query: string, mood: Pick<MoodLike, 'name'>): boolean {
  const q = norm(query)
  return q ? norm(mood.name).includes(q) : true
}

/** A book's moods for display — stable alphabetical (no pins/weight; every mood is equal). */
export const sortBookMoods = (refs: readonly BookMoodRef[]): BookMoodRef[] =>
  [...refs].sort((a, b) => a.name.localeCompare(b.name))

/** Mood names a book answers to (search/filters). Reader-assigned only — never a fallback guess. */
export function bookMoodNames(b: { moods: readonly BookMoodRef[] }): string[] {
  return b.moods.map((m) => m.name)
}
