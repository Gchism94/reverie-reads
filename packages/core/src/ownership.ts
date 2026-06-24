import type { Owned } from './types'

export type OwnedFormat = 'physical' | 'ebook' | 'audiobook'

export const emptyOwned = (): Owned => ({ physical: false, ebook: false, audiobook: false })

/** Owned in any format? (all-false = wishlist / not in the library yet) */
export const isOwned = (o: Owned): boolean => o.physical !== false || o.ebook || o.audiobook

/** The list of owned formats, for the icon row and smart shelves. */
export function ownedFormats(o: Owned): OwnedFormat[] {
  const out: OwnedFormat[] = []
  if (o.physical !== false) out.push('physical')
  if (o.ebook) out.push('ebook')
  if (o.audiobook) out.push('audiobook')
  return out
}

/** Human caption for the "Your copies" block. */
export function ownedCaption(o: Owned): string {
  const formats = ownedFormats(o)
  if (!formats.length) return 'Not in your library yet.'
  const labels: Record<OwnedFormat, string> = {
    physical: typeof o.physical === 'string' ? o.physical : 'physical',
    ebook: 'ebook',
    audiobook: 'audiobook',
  }
  const named = formats.map((f) => labels[f])
  if (named.length === 1) return `Owned — ${named[0]}.`
  return `Owned in ${named.length} formats — ${named.slice(0, -1).join(', ')} & ${named[named.length - 1]}.`
}
