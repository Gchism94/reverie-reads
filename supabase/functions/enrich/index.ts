// Cover & metadata enrichment — Google Books → Open Library → Hardcover (docs/DATA_SOURCES.md).
// Runs server-side so many clients share rate limits, avoid CORS issues, and can use a
// Hardcover token without shipping it to the browser. Deno / Supabase Edge Function.

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface EnrichInput {
  title?: string
  author?: string
  isbn?: string
}

interface EnrichResult {
  title: string
  author: string
  cover: string
  isbn: string
  pubYear: number | null
  source: string | null
}

const tidy = (url: string) => url.replace('http:', 'https:').replace('&edge=curl', '')

const norm = (s: string) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '')

function cacheKeyFor(input: EnrichInput): string {
  const isbn = (input.isbn ?? '').replace(/[^0-9Xx]/g, '')
  return isbn.length >= 10 ? `isbn:${isbn}` : `${norm(input.title ?? '')}|${norm(input.author ?? '')}`
}

// Cache reads/writes go straight to PostgREST with the service role — no extra deps.
const DB_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const dbHeaders = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json' }

async function readCache(key: string): Promise<EnrichResult | null> {
  if (!DB_URL) return null
  try {
    const r = await fetch(`${DB_URL}/rest/v1/cover_cache?key=eq.${encodeURIComponent(key)}&select=data`, { headers: dbHeaders })
    const rows = await r.json()
    return rows?.[0]?.data ?? null
  } catch {
    return null
  }
}

async function writeCache(key: string, data: EnrichResult): Promise<void> {
  if (!DB_URL) return
  try {
    await fetch(`${DB_URL}/rest/v1/cover_cache`, {
      method: 'POST',
      headers: { ...dbHeaders, Prefer: 'resolution=merge-duplicates' },
      body: JSON.stringify({ key, cover: data.cover, data }),
    })
  } catch {
    /* caching is best-effort */
  }
}

async function fromGoogle(input: EnrichInput): Promise<Partial<EnrichResult> | null> {
  const q = input.isbn
    ? `isbn:${input.isbn.replace(/[^0-9Xx]/g, '')}`
    : `intitle:${encodeURIComponent(`"${input.title}"`)}${input.author ? `+inauthor:${encodeURIComponent(`"${input.author}"`)}` : ''}`
  const r = await fetch(`https://www.googleapis.com/books/v1/volumes?q=${q}&maxResults=1`)
  const j = await r.json()
  const v = j?.items?.[0]?.volumeInfo
  if (!v) return null
  const ind = (v.industryIdentifiers ?? []).find((x: { type: string }) => x.type === 'ISBN_13') ?? (v.industryIdentifiers ?? [])[0]
  const cover = v.imageLinks?.thumbnail || v.imageLinks?.smallThumbnail || ''
  return {
    title: v.title ?? input.title ?? '',
    author: (v.authors ?? []).join(', ') || (input.author ?? ''),
    cover: cover ? tidy(cover) : '',
    isbn: ind?.identifier ?? input.isbn ?? '',
    pubYear: v.publishedDate ? Number(String(v.publishedDate).slice(0, 4)) || null : null,
    source: 'google',
  }
}

async function fromOpenLibrary(input: EnrichInput): Promise<Partial<EnrichResult> | null> {
  const r = await fetch(
    `https://openlibrary.org/search.json?title=${encodeURIComponent(input.title ?? '')}&author=${encodeURIComponent(input.author ?? '')}&limit=1`,
    { headers: { 'User-Agent': 'Reverie/1.0 (book library app)' } },
  )
  const j = await r.json()
  const d = j?.docs?.[0]
  if (!d) return null
  return {
    cover: d.cover_i ? `https://covers.openlibrary.org/b/id/${d.cover_i}-M.jpg` : '',
    isbn: d.isbn?.[0] ?? input.isbn ?? '',
    pubYear: d.first_publish_year ?? null,
    source: 'openlibrary',
  }
}

async function fromHardcover(input: EnrichInput): Promise<Partial<EnrichResult> | null> {
  const token = Deno.env.get('HARDCOVER_TOKEN')
  if (!token || !input.title) return null
  const r = await fetch('https://api.hardcover.app/v1/graphql', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      query: `query($t:String!){ books(where:{title:{_ilike:$t}}, limit:1){ title image{url} release_date } }`,
      variables: { t: `%${input.title}%` },
    }),
  })
  const j = await r.json()
  const b = j?.data?.books?.[0]
  if (!b) return null
  return {
    cover: b.image?.url ?? '',
    pubYear: b.release_date ? Number(String(b.release_date).slice(0, 4)) || null : null,
    source: 'hardcover',
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const input = (await req.json()) as EnrichInput
    const key = cacheKeyFor(input)
    const cached = await readCache(key)
    if (cached?.cover) {
      return new Response(JSON.stringify({ ...cached, source: 'cache' }), {
        headers: { ...cors, 'Content-Type': 'application/json' },
      })
    }
    const base: EnrichResult = {
      title: input.title ?? '',
      author: input.author ?? '',
      cover: '',
      isbn: input.isbn ?? '',
      pubYear: null,
      source: null,
    }
    for (const lookup of [fromGoogle, fromOpenLibrary, fromHardcover]) {
      try {
        const found = await lookup(input)
        if (found) {
          if (!base.cover && found.cover) Object.assign(base, found)
          else Object.assign(base, { ...found, cover: base.cover || found.cover || '' })
          if (base.cover) break
        }
      } catch {
        // try the next source
      }
    }
    if (base.cover) await writeCache(key, base)
    return new Response(JSON.stringify(base), { headers: { ...cors, 'Content-Type': 'application/json' } })
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 400,
      headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }
})
