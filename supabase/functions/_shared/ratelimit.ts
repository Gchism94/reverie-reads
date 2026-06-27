// Shared rate limiter for the user-facing Edge Functions (Phase 7 H3). Buckets by user id (the JWT
// `sub`, used only as a key — no verification needed) or client IP, and counts hits via the atomic
// rate_limit_consume RPC. Fails OPEN on any limiter error so a limiter hiccup never blocks legit
// traffic. Kept free of function-specific imports so enrich + geo can both use it.

const DB_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

function jwtSub(token: string): string | null {
  try {
    const part = token.split('.')[1]
    if (!part) return null
    let b64 = part.replace(/-/g, '+').replace(/_/g, '/')
    while (b64.length % 4) b64 += '='
    const json = JSON.parse(atob(b64)) as { sub?: unknown }
    return typeof json.sub === 'string' ? json.sub : null
  } catch {
    return null
  }
}

/** Bucket key for the caller: the signed-in user if present, else their IP. */
export function callerBucket(req: Request, name: string): string {
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
  const sub = jwtSub(token)
  if (sub) return `${name}:user:${sub}`
  const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'unknown'
  return `${name}:ip:${ip}`
}

export interface RateResult {
  allowed: boolean
  retryAfter: number
  remaining: number
}

/** Count one hit for the caller in a fixed window; returns whether it's allowed (+ retry signal). */
export async function rateLimit(req: Request, name: string, max: number, windowSecs: number): Promise<RateResult> {
  if (!DB_URL || !SERVICE) return { allowed: true, retryAfter: 0, remaining: max }
  try {
    const r = await fetch(`${DB_URL}/rest/v1/rpc/rate_limit_consume`, {
      method: 'POST',
      headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_key: callerBucket(req, name), p_max: max, p_window_secs: windowSecs }),
    })
    if (!r.ok) return { allowed: true, retryAfter: 0, remaining: max } // fail open
    const j = (await r.json()) as { allowed?: boolean; retry_after?: number; remaining?: number }
    return { allowed: !!j.allowed, retryAfter: Number(j.retry_after ?? 0), remaining: Number(j.remaining ?? 0) }
  } catch {
    return { allowed: true, retryAfter: 0, remaining: max }
  }
}

/** A clean 429 with a Retry-After header + retry signal in the body. */
export function tooMany(retryAfter: number, cors: Record<string, string>): Response {
  return new Response(JSON.stringify({ error: 'rate_limited', retryAfter }), {
    status: 429,
    headers: { ...cors, 'Content-Type': 'application/json', 'Retry-After': String(retryAfter) },
  })
}

/** Read an integer env with a default (for per-function limit tuning). */
export const envInt = (name: string, dflt: number): number => {
  const v = Number(Deno.env.get(name))
  return Number.isFinite(v) && v > 0 ? v : dflt
}
