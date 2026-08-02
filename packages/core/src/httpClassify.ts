/**
 * What to DO with an upstream HTTP status — the policy half, kept here because here is where it can
 * be tested. The runtime that enforces it lives in `supabase/functions/_shared/httpClassify.ts`,
 * which is Deno and cannot import from this package; `httpClassify.test.ts` READS that file and
 * fails if the two disagree (the `sourcePace.ts` arrangement, same constraint, same guard).
 *
 * ── Why this exists ─────────────────────────────────────────────────────────────────────────────
 * `enrich`'s fetchJson recognised exactly one status by number (429) and one range (5xx), then fell
 * through to `return await r.json()` for EVERYTHING else. A 4xx therefore reached the parser, and
 * Open Library answers a 404 with 29KB of `text/html` — so the parse threw a SyntaxError, the
 * adapter's catch classified it by string-matching the message for '429', found none, and recorded
 * the source as having simply had nothing to say. A quota refusal and an empty result set became
 * the same event, and the book was stamped `enriched_at` as genuinely checked.
 *
 * Three dispositions, because three different things must happen:
 *   rate_limited  the upstream told us to stop. Never retried on this timescale; the sweep pauses
 *                 and the book is NOT stamped, so it is retried next run rather than negative-cached.
 *   retry         transient server-side. One backoff, then give up as `failed`.
 *   failed        non-retryable (4xx that is not 429), or a body we could not read. Retrying cannot
 *                 fix a 400/401/403/404 — it just spends quota to be refused again.
 *   ok            2xx/3xx; the only disposition whose body is worth parsing.
 */

export type HttpDisposition = 'ok' | 'rate_limited' | 'retry' | 'failed'

/**
 * Decide from the STATUS ALONE, before the body is touched. That ordering is the whole point: a
 * body read cannot be allowed to destroy the status that decides what happens next.
 */
export function classifyHttp(status: number): HttpDisposition {
  if (status === 429) return 'rate_limited'
  if (status >= 500) return 'retry'
  if (status >= 400) return 'failed'
  return 'ok'
}

/** True when another attempt could plausibly succeed. 4xx is excluded on purpose — see above. */
export const isRetryable = (status: number): boolean => classifyHttp(status) === 'retry'

/** Upper bound on an honoured Retry-After, so a hostile or absurd value cannot wedge a function. */
export const MAX_RETRY_AFTER_MS = 60_000

/**
 * Parse a `Retry-After` header into milliseconds. Both documented forms are accepted (RFC 9110):
 * delta-seconds, and an HTTP-date. Returns null when absent or unparseable, so the caller can fall
 * back to its own backoff rather than treating "no header" as "retry immediately".
 *
 * `now` is injected rather than read, so the HTTP-date branch is testable without freezing a clock.
 */
export function retryAfterMs(header: string | null | undefined, now: number): number | null {
  if (!header) return null
  const raw = header.trim()
  if (!raw) return null

  // delta-seconds
  if (/^\d+$/.test(raw)) return Math.min(Number(raw) * 1000, MAX_RETRY_AFTER_MS)

  // HTTP-date
  const at = Date.parse(raw)
  if (Number.isNaN(at)) return null
  // A date already in the past means "now" — never a negative wait.
  return Math.min(Math.max(0, at - now), MAX_RETRY_AFTER_MS)
}
