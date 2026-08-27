/** Lowercase and strip to a–z0–9 — the prototype's match key for titles/authors. */
export const norm = (s: string | null | undefined): string =>
  String(s ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')

/**
 * Unicode-preserving identity fold for bibliographic title/author matching.
 *
 * NFKD keeps the useful compatibility behavior of the legacy key (full-width Latin characters
 * and accented Latin letters collapse to the form a reader is likely to type), while Unicode
 * letter/number classes preserve scripts such as Chinese, Arabic, Cyrillic, and Devanagari.
 * Punctuation, spacing, and combining marks are deliberately ignored.
 *
 * `norm` remains unchanged because it also shapes persisted merge-verdict keys. New corpus
 * identities and comparison-only matching use this helper instead.
 */
export const workIdentityPart = (s: string | null | undefined): string =>
  String(s ?? '')
    .normalize('NFKD')
    .toLowerCase()
    .replace(/\p{M}/gu, '')
    .replace(/[^\p{L}\p{N}]/gu, '')

/** "First Last" from a book's split author fields. */
export const authorOf = (b: { first?: string; last?: string }): string =>
  [b.first, b.last].filter(Boolean).join(' ')

/**
 * THE corpus identity — `works.work_key`: normalized title + normalized FULL author name.
 *
 * Lives in core, not in `scripts/`, because two callers must get the SAME answer: the corpus
 * importer (`scripts/corpus-import-lib.ts`, whose own header rule is "NORMALIZERS ARE IMPORTED,
 * NEVER REIMPLEMENTED") and the app's add-search triage, which asks whether a catalog hit is
 * already a corpus work. `apps/web` cannot import from `scripts/`, so a third copy there would
 * drift from both — and a corpus identity that disagrees with the importer's is a lookup that
 * silently never matches.
 *
 * NOT interchangeable with match.ts's `authorAuthorKey`, which is title + LAST name only. The two
 * disagree on real data ('ironflame|rebeccayarros' here vs 'ironflame|yarros' there), so a shared
 * key faked between them would match nothing. Library identity is matchBook's; corpus identity is
 * this one.
 */
export const workKeyOf = (b: { title: string; first?: string; last?: string }): string =>
  `${workIdentityPart(b.title)}|${workIdentityPart(authorOf(b))}`
