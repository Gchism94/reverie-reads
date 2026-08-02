// What to DO with an upstream HTTP status, and the error type that carries it.
//
// MIRROR OF packages/core/src/httpClassify.ts. Deno cannot import from that package, so this is a
// copy — and `httpClassify.test.ts` over there READS this file and fails if the two ever diverge.
//
// The rule this enforces: THE STATUS IS READ BEFORE THE BODY, ALWAYS. fetchJson used to recognise
// 429 and 5xx by number and then `return await r.json()` for everything else, so a 4xx reached the
// parser — and Open Library answers a 404 with 29KB of text/html. The parse threw, the caller
// classified the failure by string-matching the thrown message for '429', found none, and recorded
// "this source had nothing". A refusal and an empty result became indistinguishable, and the book
// was stamped as genuinely checked.

export type HttpDisposition = 'ok' | 'rate_limited' | 'retry' | 'failed'

export function classifyHttp(status: number): HttpDisposition {
  if (status === 429) return 'rate_limited'
  if (status >= 500) return 'retry'
  if (status >= 400) return 'failed'
  return 'ok'
}

export const isRetryable = (status: number): boolean => classifyHttp(status) === 'retry'

export const MAX_RETRY_AFTER_MS = 60_000

/** RFC 9110 Retry-After: delta-seconds or HTTP-date. null when absent/unparseable. */
export function retryAfterMs(header: string | null | undefined, now: number): number | null {
  if (!header) return null
  const raw = header.trim()
  if (!raw) return null
  if (/^\d+$/.test(raw)) return Math.min(Number(raw) * 1000, MAX_RETRY_AFTER_MS)
  const at = Date.parse(raw)
  if (Number.isNaN(at)) return null
  return Math.min(Math.max(0, at - now), MAX_RETRY_AFTER_MS)
}

/**
 * An upstream failure that still KNOWS its status. The previous code threw bare `Error('status
 * 429')` and callers recovered the meaning with `String(e).includes('429')` — which silently
 * reclassifies any error whose message happens to contain those digits, and loses the status
 * entirely for every error that doesn't.
 */
export class SourceHttpError extends Error {
  readonly status: number
  readonly disposition: HttpDisposition
  /** Milliseconds the upstream asked us to wait, when it said so. */
  readonly retryAfter: number | null

  constructor(status: number, url: string, retryAfter: number | null = null) {
    super(`upstream ${status} for ${url}`)
    this.name = 'SourceHttpError'
    this.status = status
    this.disposition = classifyHttp(status)
    this.retryAfter = retryAfter
  }
}

/** A body that could not be read as JSON on an otherwise-OK response. Distinct from an HTTP failure. */
export class SourceBodyError extends Error {
  readonly status: number
  readonly disposition: HttpDisposition = 'failed'
  constructor(status: number, url: string) {
    super(`unreadable body (status ${status}) for ${url}`)
    this.name = 'SourceBodyError'
    this.status = status
  }
}

/** The disposition of any thrown value, without string-matching a message. */
export function dispositionOf(e: unknown): HttpDisposition {
  if (e instanceof SourceHttpError || e instanceof SourceBodyError) return e.disposition
  return 'failed' // a network error / abort is a failure, not an empty result
}
