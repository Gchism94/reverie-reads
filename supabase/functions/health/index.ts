// Uptime/health probe (Phase 7 H4). A cheap public endpoint an external uptime monitor can poll;
// also checks the database is reachable. Returns 200 {ok:true} when healthy, 503 otherwise.

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' }
const DB_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  let db = false
  try {
    // A tiny HEAD against a global cache table confirms PostgREST + the DB respond.
    const r = await fetch(`${DB_URL}/rest/v1/geo_cache?select=key&limit=1`, {
      method: 'HEAD',
      headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` },
    })
    db = r.ok
  } catch {
    db = false
  }
  const body = { ok: db, db, ts: new Date().toISOString() }
  return new Response(JSON.stringify(body), {
    status: db ? 200 : 503,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })
})
