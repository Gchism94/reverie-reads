// Tier 2 of the matching roadmap (owner-approved): semantic embeddings. A book becomes one short,
// deterministic line of text — title, author, world, tropes, heat — and the embed edge function
// turns that line into a 384-dim gte-small vector stored beside the book (book_embeddings).
// Everything downstream ("more like this", vibe search, later taste-ranked Discover) is nearest-
// neighbour math over those vectors.
//
// This module is the PURE part and the source of truth for WHAT gets embedded; the edge function
// carries a hand-mirrored copy (supabase/functions/embed/signature.ts) kept honest by a parity
// test, exactly like the enrich merge mirror. Change the composition → the sig changes → the
// sweep re-embeds; nothing else has to know.

export const EMBED_DIM = 384

/** The neutral input shape — both the app's Book and the DB row map onto this. */
export interface EmbedSource {
  title: string
  /** primary author, "First Last" */
  author?: string
  series?: string
  genre?: string
  subgenre?: string
  /** tropes/tags — order-insensitive (sorted before composing) */
  tags?: readonly string[]
  /** heat 0–5 (0/null = unsaid) */
  spice?: number | null
  /** derived lead archetype (boyfriend) */
  archetype?: string
}

/** The one line the model reads. Stable field order; tags deduped case-insensitively and sorted,
 *  so reordering chips in the UI never re-embeds a book. */
export function embeddingText(s: EmbedSource): string {
  // lowercase + dedupe + sort: neither chip case nor chip order can move the signature
  const tags = [...new Set((s.tags ?? []).map((t) => t.trim().toLowerCase()).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b),
  )

  const world = [s.genre, s.subgenre].map((x) => (x ?? '').trim()).filter(Boolean).join(' / ')
  const bits = [
    `${s.title.trim()}${s.author?.trim() ? ` by ${s.author.trim()}` : ''}.`,
    s.series?.trim() ? `Series: ${s.series.trim()}.` : '',
    world ? `World: ${world}.` : '',
    tags.length ? `Tropes: ${tags.join(', ')}.` : '',
    s.archetype?.trim() ? `Lead: ${s.archetype.trim()}.` : '',
    s.spice != null && s.spice > 0 ? `Heat ${s.spice} of 5.` : '',
  ]
  return bits.filter(Boolean).join(' ')
}

/** FNV-1a 32-bit hex of the embedding text — the staleness signature stored beside the vector. */
export function embeddingSig(s: EmbedSource): string {
  const text = embeddingText(s)
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(16).padStart(8, '0')
}
