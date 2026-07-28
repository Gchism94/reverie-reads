// Account deletion (Phase 7 H1). Irreversible: deletes the CALLING user's auth record, which
// cascades to every owned row (profiles → books/reads/lists/list_items/reviews/clubs/club_members/
// club_comments/merge_verdicts, plus authors/book_authors/reading_orders/reading_order_items — all
// reference auth.users or profiles ON DELETE CASCADE). Capability-keyed shared_docs are not
// owner-scoped, so we clean up the ones this user created (via their shared_refs codes) first.
//
// The user is identified ONLY from their own access token (never a body-supplied id), so a caller
// can delete only themselves. The service role performs the actual deletion. Deno Edge Function.

import { captureEdgeError } from '../_shared/observe.ts'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const DB_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const ANON = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
const svc = {
  apikey: SERVICE,
  Authorization: `Bearer ${SERVICE}`,
  'Content-Type': 'application/json',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405)
  if (!DB_URL || !SERVICE || !ANON) return json({ error: 'missing service env' }, 500)

  // 1. Identify the caller from THEIR token only (never trust a client-supplied id).
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
  if (!token) return json({ error: 'not authenticated' }, 401)
  const ures = await fetch(`${DB_URL}/auth/v1/user`, {
    headers: { apikey: ANON, Authorization: `Bearer ${token}` },
  })
  if (!ures.ok) return json({ error: 'not authenticated' }, 401)
  const user = (await ures.json()) as { id?: string }
  const uid = user?.id
  if (!uid) return json({ error: 'not authenticated' }, 401)

  try {
    // 2. Clean up capability-keyed shared docs this user created (not owner-scoped → no cascade).
    const refs = await fetch(`${DB_URL}/rest/v1/shared_refs?owner_id=eq.${uid}&select=code`, {
      headers: svc,
    })
    const codes = ((await refs.json()) as { code: string }[]).map((r) => r.code).filter(Boolean)
    if (codes.length) {
      const list = codes.map((c) => `"${c}"`).join(',')
      await fetch(`${DB_URL}/rest/v1/shared_docs?key=in.(${list})`, {
        method: 'DELETE',
        headers: svc,
      })
    }

    // 3. Delete the auth user → cascades every owned row. (should_soft_delete=false → hard delete.)
    const del = await fetch(`${DB_URL}/auth/v1/admin/users/${uid}`, {
      method: 'DELETE',
      headers: svc,
    })
    if (!del.ok && del.status !== 404) {
      return json({ error: `delete failed: ${del.status} ${await del.text()}` }, 500)
    }
    return json({ deleted: true })
  } catch (e) {
    captureEdgeError('delete-account', e, { uid })
    return json({ error: String(e) }, 500)
  }
})
