// Geo proxy (Phase 7 H2). Routes the policy-bound OpenStreetMap calls — Overpass (nearby indie
// bookstores) and Nominatim (geocode / reverse-geocode) — through the server with a contact
// User-Agent (their usage policies REQUIRE identifying traffic) and a shared cache keyed by rounded
// area / normalized query, so repeat searches make zero upstream calls. Browsers never hit these
// services directly at scale. Raw upstream JSON is returned; the client parses it (packages/core
// indie.ts) and degrades gracefully on failure. Deno Edge Function.

import { envInt, rateLimit, tooMany } from '../_shared/ratelimit.ts'
import { captureEdgeError } from '../_shared/observe.ts'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// A contact User-Agent is mandatory under the OSM/Nominatim usage policy. Owner: set a real
// contact via the GEO_CONTACT env (e.g. an email or site) before public launch.
const CONTACT = Deno.env.get('GEO_CONTACT') ?? 'https://reverie.app'
const UA = `Reverie/1.0 (indie bookstore finder; ${CONTACT})`
const OVERPASS = 'https://overpass-api.de/api/interpreter'
const NOMINATIM = 'https://nominatim.openstreetmap.org'

const DAY = 86_400_000
const TTL: Record<string, number> = { stores: 7 * DAY, geocode: 30 * DAY, reverse: 30 * DAY }

const DB_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const dbHeaders = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json' }

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

interface GeoInput {
  op: 'stores' | 'geocode' | 'reverse'
  lat?: number
  lng?: number
  q?: string
  radius?: number
}

// One backoff retry so a transient 429/5xx doesn't fail the call.
async function fetchUpstream(url: string, init?: RequestInit): Promise<unknown> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const r = await fetch(url, { ...init, headers: { 'User-Agent': UA, Accept: 'application/json', ...(init?.headers ?? {}) } })
    if ((r.status === 429 || r.status >= 500) && attempt === 0) {
      await new Promise((res) => setTimeout(res, 600))
      continue
    }
    if (!r.ok) throw new Error(`upstream ${r.status}`)
    return await r.json()
  }
  return null
}

function cacheKeyFor(input: GeoInput): string {
  if (input.op === 'geocode') return `geocode:${(input.q ?? '').trim().toLowerCase()}`
  if (input.op === 'reverse') return `reverse:${(input.lat ?? 0).toFixed(3)},${(input.lng ?? 0).toFixed(3)}`
  return `stores:${(input.lat ?? 0).toFixed(2)},${(input.lng ?? 0).toFixed(2)}:${input.radius ?? 25000}`
}

async function readCache(key: string, op: string): Promise<unknown | null> {
  if (!DB_URL) return null
  try {
    const r = await fetch(`${DB_URL}/rest/v1/geo_cache?key=eq.${encodeURIComponent(key)}&select=payload,fetched_at`, { headers: dbHeaders })
    const rows = (await r.json()) as { payload: unknown; fetched_at: string }[]
    const row = rows?.[0]
    if (!row) return null
    if (Date.now() - Date.parse(row.fetched_at) > (TTL[op] ?? 7 * DAY)) return null
    return row.payload
  } catch {
    return null
  }
}

async function writeCache(key: string, payload: unknown): Promise<void> {
  if (!DB_URL) return
  try {
    await fetch(`${DB_URL}/rest/v1/geo_cache`, {
      method: 'POST',
      headers: { ...dbHeaders, Prefer: 'resolution=merge-duplicates' },
      body: JSON.stringify({ key, payload, fetched_at: new Date().toISOString() }),
    })
  } catch {
    /* caching is best-effort */
  }
}

async function fetchLive(input: GeoInput): Promise<unknown> {
  if (input.op === 'stores') {
    const around = `(around:${input.radius ?? 25000},${input.lat},${input.lng})`
    const query = `[out:json][timeout:25];(node["shop"="books"]${around};way["shop"="books"]${around};relation["shop"="books"]${around};);out center;`
    return await fetchUpstream(OVERPASS, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'data=' + encodeURIComponent(query),
    })
  }
  if (input.op === 'geocode') {
    return await fetchUpstream(`${NOMINATIM}/search?format=jsonv2&limit=1&q=${encodeURIComponent((input.q ?? '').trim())}`)
  }
  // reverse
  return await fetchUpstream(`${NOMINATIM}/reverse?format=jsonv2&lat=${input.lat}&lon=${input.lng}`)
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  // Per-user/IP rate limit (interactive geocode/nearby — abusive bursts burn the OSM quota).
  const rl = await rateLimit(req, 'geo', envInt('GEO_RATE_MAX', 60), 60)
  if (!rl.allowed) return tooMany(rl.retryAfter, cors)
  try {
    const input = (await req.json()) as GeoInput
    if (!['stores', 'geocode', 'reverse'].includes(input.op)) return json({ error: 'bad op' }, 400)

    const key = cacheKeyFor(input)
    const cached = await readCache(key, input.op)
    if (cached != null) return json({ payload: cached, source: 'cache' })

    const payload = await fetchLive(input)
    if (payload != null) await writeCache(key, payload)
    return json({ payload: payload ?? null, source: 'live' })
  } catch (e) {
    // Surface a clean failure; the client falls back to its degraded state (B4).
    captureEdgeError('geo', e)
    return json({ error: String(e), payload: null }, 502)
  }
})
