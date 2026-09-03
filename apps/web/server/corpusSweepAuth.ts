import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { createError } from 'nitro/h3'

function env(name: string): string {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`${name} is required for corpus-sweep API routes`)
  return value
}

/** Validate the browser's bearer token and corpus-admin grant. API routes never receive cookies,
 * so cross-site requests cannot borrow a reader's authority. */
export async function authenticatedCorpusAdmin(req: Request): Promise<SupabaseClient> {
  const authorization = req.headers.get('authorization') ?? ''
  const token = authorization.replace(/^Bearer\s+/i, '').trim()
  if (!token) throw createError({ statusCode: 401, statusMessage: 'Authentication required' })

  const client = createClient(env('VITE_SUPABASE_URL'), env('VITE_SUPABASE_ANON_KEY'), {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data: userData, error: userError } = await client.auth.getUser(token)
  if (userError || !userData.user) {
    throw createError({ statusCode: 401, statusMessage: 'Authentication required' })
  }
  const { data: isAdmin, error: adminError } = await client.rpc('is_corpus_admin')
  if (adminError || isAdmin !== true) {
    throw createError({ statusCode: 403, statusMessage: 'Corpus administrator required' })
  }
  return client
}
