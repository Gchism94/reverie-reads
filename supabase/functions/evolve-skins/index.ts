// Monthly "your profile is evolving" cron (Phase 6 G4 / C4b). For every reader who uses an
// adaptive skin and hasn't locked it, recompute their taste weights from their library; if the
// taste has MATERIALLY shifted vs the weights baked into their current adaptive skin, write a
// pending suggestion (weights + dominant + insight) the client surfaces as a reveal. Idempotent:
// re-running with the same data leaves the same pending value (it only writes when the result
// differs), and locked skins are skipped. The client materializes the palette from the live
// tokens on keep, so no colour values live here.
//
// Schedule (owner action): deploy then add a monthly job, e.g. via pg_cron:
//   select cron.schedule('evolve-skins','0 7 1 * *',
//     $$ select net.http_post('<project>/functions/v1/evolve-skins',
//          headers:=jsonb_build_object('Authorization','Bearer <service_role>')) $$);
//
// The weight + shift math lives in ./taste.ts — a hand-kept mirror of packages/core/src/adaptive.ts
// (Deno can't import the workspace package). A Vitest contract test imports that same taste.ts and
// asserts it matches core on golden fixtures, so any drift fails CI. Deno / Supabase Edge Function.

import {
  type BookRow,
  type Weights,
  computeWeights,
  dominantSkin,
  isMaterialShift,
  tasteInsight,
} from './taste.ts'
import { captureEdgeError, logEvent } from '../_shared/observe.ts'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const DB_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const dbHeaders = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json' }

interface ProfileRow {
  id: string
  adaptive_skin: { weights?: Weights } | null
  adaptive_pending: { weights?: Weights } | null
  adaptive_dismissed: { weights?: Weights } | null
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (!DB_URL || !SERVICE) {
    return new Response(JSON.stringify({ error: 'missing service env' }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } })
  }
  const at = new Date().toISOString()
  let scanned = 0
  let updated = 0
  try {
    // Only readers on an adaptive skin who haven't locked it.
    const pr = await fetch(
      `${DB_URL}/rest/v1/profiles?select=id,adaptive_skin,adaptive_pending,adaptive_dismissed&adaptive_skin=not.is.null&adaptive_locked=eq.false`,
      { headers: dbHeaders },
    )
    const profiles = (await pr.json()) as ProfileRow[]

    for (const p of profiles ?? []) {
      scanned++
      const current = p.adaptive_skin?.weights
      if (!current) continue
      const br = await fetch(`${DB_URL}/rest/v1/books?select=subgenre,tags,rating,fave,read_status&owner_id=eq.${p.id}`, { headers: dbHeaders })
      const books = (await br.json()) as BookRow[]
      const next = computeWeights(books ?? [])

      const pending = p.adaptive_pending?.weights
      const dismissed = p.adaptive_dismissed?.weights
      const shifted = isMaterialShift(current, next)
      // Write only when materially shifted AND (a) not already pending ≈ this result (idempotent),
      // AND (b) the reader didn't already dismiss ≈ this shift ("Not now" memory — resurfaces only
      // once taste drifts materially past what they declined).
      const writeNeeded =
        shifted &&
        (!pending || isMaterialShift(pending, next)) &&
        (!dismissed || isMaterialShift(dismissed, next))
      if (!writeNeeded) continue

      const body = { adaptive_pending: { weights: next, dominant: dominantSkin(next), insight: tasteInsight(next), at } }
      await fetch(`${DB_URL}/rest/v1/profiles?id=eq.${p.id}`, { method: 'PATCH', headers: dbHeaders, body: JSON.stringify(body) })
      updated++
    }

    logEvent('info', 'evolve-skins', 'run_complete', { scanned, updated })
    return new Response(JSON.stringify({ scanned, updated }), { headers: { ...cors, 'Content-Type': 'application/json' } })
  } catch (e) {
    captureEdgeError('evolve-skins', e, { scanned, updated })
    return new Response(JSON.stringify({ error: String(e), scanned, updated }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } })
  }
})
