/** Lowercase and strip to a–z0–9 — the prototype's match key for titles/authors. */
export const norm = (s: string | null | undefined): string =>
  String(s ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')

/** "First Last" from a book's split author fields. */
export const authorOf = (b: { first?: string; last?: string }): string =>
  [b.first, b.last].filter(Boolean).join(' ')
