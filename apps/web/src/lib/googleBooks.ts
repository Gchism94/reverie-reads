// The one place Google Books volume URLs are built. Keyless access rides shared per-IP quota
// pools — fine on many residential networks, durably 429'd on others (VPN/CGNAT/cloud). With a
// key (owner decision: free, referrer-restricted, client-safe for this read-only API) the quota
// is the project's own and requests are deterministic. Keyless remains the fallback so a missing
// env never breaks dev.

const KEY = (import.meta.env.VITE_GOOGLE_BOOKS_KEY as string | undefined)?.trim()

/** Full volumes-endpoint URL for the given query params, with the API key appended when set. */
export function volumesUrl(params: string): string {
  return `https://www.googleapis.com/books/v1/volumes?${params}${KEY ? `&key=${KEY}` : ''}`
}
