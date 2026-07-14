// Cover-URL resolution upgrade — the Deno mirror of packages/core/src/covers.ts upgradeCoverUrl.
// External sources default to tiny images (Google `zoom=1` ≈ 128px, Open Library `-M`); this rewrites
// each source's size knob so a stored/hotlinked cover is large enough for high-DPR detail + flip
// surfaces. Kept dependency-free so every edge function can import it. Keep in sync with core.

const isStored = (url: string): boolean => url.includes('/storage/v1/object/public/covers/')

/** `size:'full'` = largest available (detail/flip); `'thumb'` = ~300px (light grid). Idempotent. */
export function upgradeCoverUrl(url: string, size: 'full' | 'thumb' = 'full'): string {
  if (!url || isStored(url)) return url

  if (/(?:books\.google\.[a-z.]+|googleusercontent\.com)\/books\/content/i.test(url)) {
    let u = url.replace(/([?&])edge=curl(&|$)/i, (_m, p1: string, p2: string) => (p2 === '&' ? p1 : '')).replace(/[?&]$/, '')
    const zoom = size === 'thumb' ? '2' : '0'
    u = /[?&]zoom=\d+/i.test(u) ? u.replace(/([?&]zoom=)\d+/i, `$1${zoom}`) : `${u}${u.includes('?') ? '&' : '?'}zoom=${zoom}`
    return u
  }

  const ol = /^(https?:\/\/covers\.openlibrary\.org\/b\/id\/\d+)-[SML](\.\w+)$/i.exec(url)
  if (ol) return `${ol[1]}-${size === 'thumb' ? 'M' : 'L'}${ol[2]}`

  return url
}
