/** Lowercase and strip to a–z0–9 — the prototype's match key for titles/authors. */
export const norm = (s: string | null | undefined): string =>
  String(s ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')

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
  `${norm(b.title)}|${norm(authorOf(b))}`
