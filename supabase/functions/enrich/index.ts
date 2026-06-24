// Enrichment — a FULL normalized book record from Google Books → Open Library → Hardcover
// (docs/DATA_SOURCES.md). Returns title, author(s), series + position, publisher, publication
// date WITH precision (y/m/d), page count, ISBN-10/13, language, genres, description, and the
// best cover. Sources are merged "fill-only-missing" (Google's value wins when present), then
// the whole record is cached (cover_cache.data is a metadata cache keyed by ISBN/work).
// Deno / Supabase Edge Function.

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
  authors: string[]
  author: string
  series: string
  seriesPosition: number | null
  publisher: string
  pubY: number | null
  pubM: number | null
  pubD: number | null
  pageCount: number | null
  isbn10: string
  isbn13: string
  isbn: string
  language: string
  genres: string[]
  description: string
  cover: string
  source: string | null
}

const cleanIsbn = (s: string) => (s || '').replace(/[^0-9Xx]/g, '')
const tidy = (url: string) => url.replace('http:', 'https:').replace('&edge=curl', '')
const stripHtml = (s: string) => (s || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
const dedupe = (a: string[]) => [...new Set(a.map((x) => x.trim()).filter(Boolean))]
const norm = (s: string) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '')

function parsePubDate(s: string): { pubY: number | null; pubM: number | null; pubD: number | null } {
  const m = String(s || '').match(/^(\d{4})(?:-(\d{2}))?(?:-(\d{2}))?/)
  if (!m) return { pubY: null, pubM: null, pubD: null }
  return { pubY: Number(m[1]) || null, pubM: m[2] ? Number(m[2]) : null, pubD: m[3] ? Number(m[3]) : null }
}

// One retry with backoff so a transient 429/5xx doesn't fail the whole enrich.
async function fetchJson(url: string, init?: RequestInit): Promise<unknown> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const r = await fetch(url, init)
      if (r.status === 429 || r.status >= 500) throw new Error(`status ${r.status}`)
      return await r.json()
    } catch (e) {
      if (attempt === 1) throw e
      await new Promise((res) => setTimeout(res, 400 * (attempt + 1)))
    }
  }
  return null
}

function emptyResult(input: EnrichInput): EnrichResult {
  return {
    title: input.title ?? '',
    authors: input.author ? [input.author] : [],
    author: input.author ?? '',
    series: '',
    seriesPosition: null,
    publisher: '',
    pubY: null,
    pubM: null,
    pubD: null,
    pageCount: null,
    isbn10: '',
    isbn13: '',
    isbn: input.isbn ?? '',
    language: '',
    genres: [],
    description: '',
    cover: '',
    source: null,
  }
}

/* eslint-disable @typescript-eslint/no-explicit-any */
async function fromGoogle(input: EnrichInput): Promise<Partial<EnrichResult> | null> {
  const q = input.isbn
    ? `isbn:${cleanIsbn(input.isbn)}`
    : `intitle:${encodeURIComponent(`"${input.title}"`)}${input.author ? `+inauthor:${encodeURIComponent(`"${input.author}"`)}` : ''}`
  const j: any = await fetchJson(`https://www.googleapis.com/books/v1/volumes?q=${q}&maxResults=1`)
  const v = j?.items?.[0]?.volumeInfo
  if (!v) return null
  const ids: any[] = v.industryIdentifiers ?? []
  const cover = v.imageLinks?.thumbnail || v.imageLinks?.smallThumbnail || ''
  const genres = (v.categories ?? [])
    .flatMap((c: string) => String(c).split(/\s*\/\s*/))
    .filter((g: string) => g && !/^fiction$/i.test(g))
  return {
    title: v.title ?? '',
    authors: v.authors ?? [],
    publisher: v.publisher ?? '',
    ...parsePubDate(v.publishedDate ?? ''),
    pageCount: v.pageCount ?? null,
    isbn13: ids.find((x) => x.type === 'ISBN_13')?.identifier ?? '',
    isbn10: ids.find((x) => x.type === 'ISBN_10')?.identifier ?? '',
    language: v.language ?? '',
    genres: dedupe(genres),
    description: stripHtml(v.description ?? ''),
    cover: cover ? tidy(cover) : '',
    source: 'google',
  }
}

async function fromOpenLibrary(input: EnrichInput): Promise<Partial<EnrichResult> | null> {
  const url = input.isbn
    ? `https://openlibrary.org/search.json?q=isbn:${cleanIsbn(input.isbn)}&fields=title,author_name,first_publish_year,isbn,number_of_pages_median,subject,language,cover_i,series&limit=1`
    : `https://openlibrary.org/search.json?title=${encodeURIComponent(input.title ?? '')}&author=${encodeURIComponent(input.author ?? '')}&fields=title,author_name,first_publish_year,isbn,number_of_pages_median,subject,language,cover_i,series&limit=1`
  const j: any = await fetchJson(url, { headers: { 'User-Agent': 'Reverie/1.0 (personal book library)' } })
  const d = j?.docs?.[0]
  if (!d) return null
  const isbns: string[] = d.isbn ?? []
  const subjects: string[] = d.subject ?? []
  let series = Array.isArray(d.series) ? (d.series[0] ?? '') : (d.series ?? '')
  if (!series) {
    const s = subjects.find((x) => /^series?:/i.test(x))
    if (s) series = s.replace(/^series?:/i, '').replace(/_/g, ' ').trim()
  }
  // Drop OL's coded/non-genre subjects (e.g. "nyt:...=...", awards, overly long strings).
  const genres = dedupe(subjects.filter((x) => !/[:=]/.test(x) && x.length < 40)).slice(0, 8)
  return {
    title: d.title ?? '',
    authors: d.author_name ?? [],
    pubY: d.first_publish_year ?? null,
    pageCount: d.number_of_pages_median ?? null,
    isbn13: isbns.find((i) => i.length === 13) ?? '',
    isbn10: isbns.find((i) => i.length === 10) ?? '',
    language: (d.language ?? [])[0] ?? '',
    genres,
    series,
    cover: d.cover_i ? `https://covers.openlibrary.org/b/id/${d.cover_i}-M.jpg` : '',
    source: 'openlibrary',
  }
}

async function fromHardcover(input: EnrichInput): Promise<Partial<EnrichResult> | null> {
  const token = Deno.env.get('HARDCOVER_TOKEN')
  if (!token || !input.title) return null
  const j: any = await fetchJson('https://api.hardcover.app/v1/graphql', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      query: `query($t:String!){ books(where:{title:{_ilike:$t}}, limit:1){ title pages release_date description image{url} book_series{ position series{ name } } } }`,
      variables: { t: `%${input.title}%` },
    }),
  })
  const b = j?.data?.books?.[0]
  if (!b) return null
  const bs = b.book_series?.[0]
  return {
    pageCount: b.pages ?? null,
    ...parsePubDate(b.release_date ?? ''),
    description: stripHtml(b.description ?? ''),
    series: bs?.series?.name ?? '',
    seriesPosition: bs?.position ?? null,
    cover: b.image?.url ?? '',
    source: 'hardcover',
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

const STR_FIELDS = ['title', 'series', 'publisher', 'isbn10', 'isbn13', 'language', 'description', 'cover'] as const
const NUM_FIELDS = ['seriesPosition', 'pubY', 'pubM', 'pubD', 'pageCount'] as const

// Fill only fields the base is still missing (Google wins because it runs first).
function fillMissing(base: EnrichResult, add: Partial<EnrichResult> | null) {
  if (!add) return
  for (const f of STR_FIELDS) if (!base[f] && add[f]) (base[f] as string) = add[f] as string
  for (const f of NUM_FIELDS) if (base[f] == null && add[f] != null) (base[f] as number) = add[f] as number
  if (!base.authors.length && add.authors?.length) base.authors = add.authors
  if (add.genres?.length) base.genres = dedupe([...base.genres, ...add.genres]).slice(0, 10)
  if (add.source) base.source = base.source ? `${base.source}+${add.source}` : add.source
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const input = (await req.json()) as EnrichInput
    const key = cacheKeyFor(input)
    const cached = await readCache(key)
    if (cached?.title) {
      return new Response(JSON.stringify({ ...cached, source: 'cache' }), {
        headers: { ...cors, 'Content-Type': 'application/json' },
      })
    }

    const result = emptyResult(input)
    for (const lookup of [fromGoogle, fromOpenLibrary, fromHardcover]) {
      try {
        fillMissing(result, await lookup(input))
      } catch {
        // try the next source
      }
    }
    result.author = result.authors.join(', ') || (input.author ?? '')
    result.isbn = result.isbn13 || result.isbn10 || cleanIsbn(input.isbn ?? '')

    // Cache any record we actually resolved (cover may legitimately be '' — don't fail).
    if (result.source) await writeCache(key, result)
    return new Response(JSON.stringify(result), { headers: { ...cors, 'Content-Type': 'application/json' } })
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 400,
      headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }
})

// ── cache (cover_cache.data = the full record), via PostgREST with the service role ──
function cacheKeyFor(input: EnrichInput): string {
  const isbn = cleanIsbn(input.isbn ?? '')
  return isbn.length >= 10 ? `isbn:${isbn}` : `${norm(input.title ?? '')}|${norm(input.author ?? '')}`
}
const DB_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const dbHeaders = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json' }

async function readCache(key: string): Promise<EnrichResult | null> {
  if (!DB_URL) return null
  try {
    const r = await fetch(`${DB_URL}/rest/v1/cover_cache?key=eq.${encodeURIComponent(key)}&select=data`, { headers: dbHeaders })
    const rows = (await r.json()) as { data?: EnrichResult }[]
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
