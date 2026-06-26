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
// The weight + shift math mirrors packages/core/src/adaptive.ts (kept in sync by hand; Deno can't
// import the workspace package). Deno / Supabase Edge Function.

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

type SkinId = 'reverie' | 'grimoire' | 'aphelion' | 'marrow'
const SKIN_ORDER: SkinId[] = ['reverie', 'grimoire', 'aphelion', 'marrow']
type Weights = Record<SkinId, number>

// Mirrors SKIN_AFFINITY in packages/core/src/adaptive.ts.
const AFFINITY: Record<SkinId, { subgenres: string[]; tags: string[] }> = {
  reverie: {
    subgenres: ['Romance', 'Contemporary', 'Sports', 'Cowboy Romance'],
    tags: ['Slow Burn', 'Friends to Lovers', 'Grumpy/Sunshine', 'Small Town', 'Second Chance', 'He Falls First', 'Fake Dating', 'Found Family'],
  },
  grimoire: {
    subgenres: ['Romantasy', 'Fantasy'],
    tags: ['Fae', 'Dragon Riders', 'Magic Academy', 'Court Intrigue', 'Chosen One', 'Shifters', 'Cursed', 'Fated Mates', 'Hidden Powers', 'Rebellion', 'Bonded Pair'],
  },
  aphelion: {
    subgenres: ['Science Fiction', 'Sci-Fi', 'Dystopian'],
    tags: ['Space', 'AI', 'Cyberpunk', 'Time Travel', 'Aliens', 'Dystopian'],
  },
  marrow: {
    subgenres: ['Dark Romance', 'Horror', 'Thriller'],
    tags: ['Mafia', 'Stalker', 'Villain Romance', 'Serial Killers', 'Captive/Captor', 'Morally Black MMC', 'Obsessive', 'Anti-Hero', 'Bully Romance', 'Possessive', 'Revenge'],
  },
}

interface BookRow {
  subgenre: string | null
  tags: string[] | null
  rating: number | null
  fave: boolean | null
  read_status: string | null
}

// Mirrors engagement() in core; approximates "read" by read_status only (no reads join in the cron).
function engagement(b: BookRow): number {
  const read = b.read_status === 'Read'
  let w = 1
  if (b.fave) w *= 2
  const rating = b.rating ?? 0
  if (rating >= 4) w *= 1.5
  else if (rating > 0 && rating < 3) w *= 0.6
  if (b.read_status === 'DNF') w *= 0.3
  else if (!read) w *= 0.8
  return w
}

function computeWeights(books: BookRow[]): Weights {
  const raw: Weights = { reverie: 0, grimoire: 0, aphelion: 0, marrow: 0 }
  for (const b of books) {
    const w = engagement(b)
    const tags = new Set(b.tags ?? [])
    for (const id of SKIN_ORDER) {
      const aff = AFFINITY[id]
      let score = 0
      if (b.subgenre && aff.subgenres.includes(b.subgenre)) score += 2
      for (const t of aff.tags) if (tags.has(t)) score += 1
      raw[id] += score * w
    }
  }
  const floor: Weights = { reverie: 1.2, grimoire: 0.4, aphelion: 0.4, marrow: 0.4 }
  const withFloor = SKIN_ORDER.map((id) => raw[id] + floor[id])
  const total = withFloor.reduce((s, v) => s + v, 0) || 1
  return {
    reverie: withFloor[0] / total,
    grimoire: withFloor[1] / total,
    aphelion: withFloor[2] / total,
    marrow: withFloor[3] / total,
  }
}

const dominantSkin = (w: Weights): SkinId => SKIN_ORDER.reduce((best, id) => (w[id] > w[best] ? id : best), 'reverie')
const weightDistance = (a: Weights, b: Weights): number => SKIN_ORDER.reduce((s, id) => s + Math.abs((a[id] ?? 0) - (b[id] ?? 0)), 0)
function isMaterialShift(current: Weights, next: Weights, threshold = 0.25): boolean {
  if (dominantSkin(current) !== dominantSkin(next)) return true
  return weightDistance(current, next) >= threshold
}

function tasteInsight(w: Weights): string {
  const flavour: Record<SkinId, string> = { reverie: 'romance', grimoire: 'fantasy', aphelion: 'sci-fi', marrow: 'dark & eerie' }
  const ranked = SKIN_ORDER.filter((id) => w[id] > 0.05).sort((a, b) => w[b] - w[a])
  const top = ranked[0] ?? 'reverie'
  const second = ranked[1]
  if (second && w[second] > w[top] * 0.6) return `leaning ${flavour[top]}, with a ${flavour[second]} streak`
  return `leaning ${flavour[top]}`
}

const DB_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const dbHeaders = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json' }

interface ProfileRow {
  id: string
  adaptive_skin: { weights?: Weights } | null
  adaptive_pending: { weights?: Weights } | null
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
      `${DB_URL}/rest/v1/profiles?select=id,adaptive_skin,adaptive_pending&adaptive_skin=not.is.null&adaptive_locked=eq.false`,
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
      const shifted = isMaterialShift(current, next)
      // Idempotent: only write when materially shifted AND the pending isn't already ≈ this result.
      const writeNeeded = shifted && (!pending || isMaterialShift(pending, next))
      if (!writeNeeded) continue

      const body = { adaptive_pending: { weights: next, dominant: dominantSkin(next), insight: tasteInsight(next), at } }
      await fetch(`${DB_URL}/rest/v1/profiles?id=eq.${p.id}`, { method: 'PATCH', headers: dbHeaders, body: JSON.stringify(body) })
      updated++
    }

    return new Response(JSON.stringify({ scanned, updated }), { headers: { ...cors, 'Content-Type': 'application/json' } })
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e), scanned, updated }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } })
  }
})
