// Enrichment aggregator (docs/ENRICHMENT_STRATEGY.md). SOURCE-PLUGGABLE: each adapter fetches one
// source and normalizes to a common SourceRecord (./merge.ts, mirrored from packages/core); the
// pure merge reconciles them FIELD BY FIELD by precedence, unions multi-value fields, takes the
// longest description, maps a genre, and lets user-authored fields win. The merged record is cached
// GLOBALLY in enrichment_cache keyed by ISBN-13 / work id, so the Nth user scanning a book makes
// zero external calls. Two passes: mode:'fast' (one source by ISBN → title/author/cover, instant
// "completing…") and mode:'full' (all enabled sources, the async completion). Deno Edge Function.
//
// Sources are enabled via env, like the buy-link attributionMode:
//   ENRICH_SOURCES   csv, default "openlibrary,google"
//   HARDCOVER_TOKEN  present → Hardcover on (backend-only beta, best-effort, low-volume)
//   ISBNDB_ENABLED   "true" AND ISBNDB_KEY present → ISBNdb on (PAID; OFF by default)

import {
  mergeRecords,
  normalizeGoogle,
  normalizeHardcover,
  normalizeIsbndb,
  normalizeOpenLibrary,
  type EnrichedRecord,
  type EnrichSource,
  type SourceRecord,
  type StampedSource,
} from './merge.ts'
import { selectBestMatch, selfIsbn13, type Confidence, type ResolveCandidate } from './resolve.ts'
import { envInt, rateLimit, tooMany } from '../_shared/ratelimit.ts'
import { captureEdgeError } from '../_shared/observe.ts'

/** A cover edition choice surfaced to the import review + Cover Studio (distilled E1 alternate). */
interface CoverAlternate {
  source: EnrichSource
  cover: string
  isbn13: string
  title: string
  author: string
}

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface EnrichInput {
  title?: string
  author?: string
  isbn?: string
  mode?: 'fast' | 'full'
  refresh?: boolean
}

const cleanIsbn = (s: string) => (s || '').replace(/[^0-9Xx]/g, '').toUpperCase()
const norm = (s: string) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '')
const UA = 'Reverie/1.0 (personal book library; enrichment aggregator)'

// One retry with backoff so a transient 429/5xx doesn't fail the whole source. Throws 'status 429'
// on rate-limit so the caller can mark the run rate-limited (pause + resume, never burn the window).
async function fetchJson(url: string, init?: RequestInit): Promise<unknown> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const r = await fetch(url, init)
    if (r.status === 429) throw new Error('status 429')
    if (r.status >= 500) {
      if (attempt === 1) throw new Error(`status ${r.status}`)
      await new Promise((res) => setTimeout(res, 400 * (attempt + 1)))
      continue
    }
    return await r.json()
  }
  return null
}

// ── Source adapters: fetch one source, return a normalized SourceRecord (or null). Pure parsing
//    lives in ./merge.ts normalizers; adapters only know how to query. ──

async function adapterGoogle(input: EnrichInput): Promise<SourceRecord | null> {
  const q = input.isbn
    ? `isbn:${cleanIsbn(input.isbn)}`
    : `intitle:${encodeURIComponent(`"${input.title}"`)}${input.author ? `+inauthor:${encodeURIComponent(`"${input.author}"`)}` : ''}`
  const j = (await fetchJson(`https://www.googleapis.com/books/v1/volumes?q=${q}&maxResults=1`)) as { items?: unknown[] }
  const item = j?.items?.[0]
  return item ? normalizeGoogle(item) : null
}

async function adapterOpenLibrary(input: EnrichInput): Promise<SourceRecord | null> {
  const fields = 'key,edition_key,title,author_name,first_publish_year,isbn,number_of_pages_median,subject,language,cover_i,series'
  const url = input.isbn
    ? `https://openlibrary.org/search.json?q=isbn:${cleanIsbn(input.isbn)}&fields=${fields}&limit=1`
    : `https://openlibrary.org/search.json?title=${encodeURIComponent(input.title ?? '')}&author=${encodeURIComponent(input.author ?? '')}&fields=${fields}&limit=1`
  const j = (await fetchJson(url, { headers: { 'User-Agent': UA } })) as { docs?: unknown[] }
  const doc = j?.docs?.[0]
  return doc ? normalizeOpenLibrary(doc) : null
}

async function adapterHardcover(input: EnrichInput): Promise<SourceRecord | null> {
  const token = Deno.env.get('HARDCOVER_TOKEN')
  if (!token || !input.title) return null
  const j = (await fetchJson('https://api.hardcover.app/v1/graphql', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      query:
        'query($t:String!){ books(where:{title:{_ilike:$t}}, limit:1){ id title pages release_date description image{url} book_series{ position series{ name } } taggings{ tag{ tag } } } }',
      variables: { t: `%${input.title}%` },
    }),
  })) as { data?: { books?: unknown[] } }
  const book = j?.data?.books?.[0]
  return book ? normalizeHardcover(book) : null
}

async function adapterIsbndb(input: EnrichInput): Promise<SourceRecord | null> {
  const key = Deno.env.get('ISBNDB_KEY')
  const isbn = cleanIsbn(input.isbn ?? '')
  if (!key || !isbn) return null // ISBNdb is queried by ISBN (the completeness backstop)
  const j = (await fetchJson(`https://api2.isbndb.com/book/${isbn}`, { headers: { Authorization: key } })) as {
    book?: unknown
  }
  return j?.book ? normalizeIsbndb(j) : null
}

const ADAPTERS: Record<EnrichSource, (i: EnrichInput) => Promise<SourceRecord | null>> = {
  openlibrary: adapterOpenLibrary,
  google: adapterGoogle,
  hardcover: adapterHardcover,
  isbndb: adapterIsbndb,
  manual: async () => null,
}

// ── Search adapters: title+author → up to SEARCH_LIMIT candidates. The real catalog has NO ISBNs,
//    so resolution starts from a title+author SEARCH (not an ISBN lookup). Parsing stays in the
//    ./merge.ts normalizers; these only know how to query each source's search endpoint. ──
const SEARCH_LIMIT = 5

async function searchGoogle(input: EnrichInput): Promise<ResolveCandidate[]> {
  if (!input.title) return []
  const q = `intitle:${encodeURIComponent(`"${input.title}"`)}${input.author ? `+inauthor:${encodeURIComponent(`"${input.author}"`)}` : ''}`
  const j = (await fetchJson(`https://www.googleapis.com/books/v1/volumes?q=${q}&maxResults=${SEARCH_LIMIT}`)) as { items?: unknown[] }
  return (j?.items ?? [])
    .map((it): ResolveCandidate => ({ source: 'google', record: normalizeGoogle(it) }))
    .filter((c) => c.record.title)
}

async function searchOpenLibrary(input: EnrichInput): Promise<ResolveCandidate[]> {
  if (!input.title) return []
  const fields = 'key,edition_key,title,author_name,first_publish_year,isbn,number_of_pages_median,subject,language,cover_i,series'
  const url = `https://openlibrary.org/search.json?title=${encodeURIComponent(input.title)}&author=${encodeURIComponent(input.author ?? '')}&fields=${fields}&limit=${SEARCH_LIMIT}`
  const j = (await fetchJson(url, { headers: { 'User-Agent': UA } })) as { docs?: unknown[] }
  return (j?.docs ?? [])
    .map((d): ResolveCandidate => ({ source: 'openlibrary', record: normalizeOpenLibrary(d) }))
    .filter((c) => c.record.title)
}

async function searchHardcover(input: EnrichInput): Promise<ResolveCandidate[]> {
  const token = Deno.env.get('HARDCOVER_TOKEN')
  if (!token || !input.title) return []
  // contributions{author{name}} so the candidate carries authors → the match can be CONFIRMED.
  const j = (await fetchJson('https://api.hardcover.app/v1/graphql', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      query:
        'query($t:String!,$n:Int!){ books(where:{title:{_ilike:$t}}, limit:$n){ id title pages release_date description image{url} contributions{ author{ name } } book_series{ position series{ name } } taggings{ tag{ tag } } } }',
      variables: { t: `%${input.title}%`, n: SEARCH_LIMIT },
    }),
  })) as { data?: { books?: unknown[] } }
  return (j?.data?.books ?? [])
    .map((b): ResolveCandidate => ({ source: 'hardcover', record: normalizeHardcover(b) }))
    .filter((c) => c.record.title)
}

const SEARCHERS: Partial<Record<EnrichSource, (i: EnrichInput) => Promise<ResolveCandidate[]>>> = {
  hardcover: searchHardcover,
  google: searchGoogle,
  openlibrary: searchOpenLibrary,
}

/** Search the enabled sources (catalog priority: Hardcover → Google → Open Library) for candidates. */
async function gatherCandidates(input: EnrichInput): Promise<{ candidates: ResolveCandidate[]; rateLimited: boolean }> {
  const order: EnrichSource[] = ['hardcover', 'google', 'openlibrary']
  const enabled = new Set(enabledSources())
  const candidates: ResolveCandidate[] = []
  let rateLimited = false
  for (const s of order) {
    const fn = SEARCHERS[s]
    if (!enabled.has(s) || !fn) continue
    try {
      candidates.push(...(await fn(input)))
    } catch (e) {
      if (String(e).includes('429')) rateLimited = true
      // degrade gracefully — skip this source
    }
  }
  return { candidates, rateLimited }
}

/** Distill E1 alternate candidates into the cover-picker shape (only those that carry a cover). */
function distillAlternates(alts: ResolveCandidate[]): CoverAlternate[] {
  return alts
    .filter((a) => a.record.cover)
    .map((a) => ({
      source: a.source,
      cover: a.record.cover ?? '',
      isbn13: selfIsbn13(a.record),
      title: a.record.title ?? '',
      author: (a.record.authors ?? [])[0] ?? '',
    }))
}

/** The enabled source roster, resolved from env (sources are pluggable like the buy-link mode). */
function enabledSources(): EnrichSource[] {
  const csv = (Deno.env.get('ENRICH_SOURCES') ?? 'openlibrary,google')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean) as EnrichSource[]
  const set = new Set<EnrichSource>(csv.filter((s) => s in ADAPTERS && s !== 'manual'))
  if (Deno.env.get('HARDCOVER_TOKEN')) set.add('hardcover') // best-effort beta, backend-only
  if (Deno.env.get('ISBNDB_ENABLED') === 'true' && Deno.env.get('ISBNDB_KEY')) set.add('isbndb') // paid, flag-gated OFF
  return [...set]
}

// High-value fields present → "complete" (longer cache window; client recheck logic mirrors this).
const isComplete = (r: EnrichedRecord): boolean => !!r.cover && !!r.isbn13

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  // Per-user/IP rate limit. Generous by default (the bulk "complete missing" job legitimately runs
  // a few per second); the limit catches abusive bursts. Tune via ENRICH_RATE_MAX.
  const rl = await rateLimit(req, 'enrich', envInt('ENRICH_RATE_MAX', 600), 60)
  if (!rl.allowed) return tooMany(rl.retryAfter, cors)
  try {
    const input = (await req.json()) as EnrichInput
    const mode = input.mode ?? 'full'
    const key = cacheKeyFor(input)

    // 1) Cache: a fresh hit returns immediately — ZERO external calls (the main cost lever).
    if (!input.refresh) {
      const cached = await readCache(key)
      if (cached && isFresh(cached)) {
        return json({
          ...toResponse(cached.record),
          source: 'cache',
          confidence: cached.confidence ?? undefined,
          query: cached.match_query ?? undefined,
          alternates: cached.alternates ?? [],
        })
      }
    }

    // 2) Fast pass: one source by ISBN/title for an instant "completing…" record.
    if (mode === 'fast') {
      const order = enabledSources()
      let rec: SourceRecord | null = null
      let used: EnrichSource | null = null
      for (const s of order.includes('openlibrary') ? ['openlibrary', 'google'] as EnrichSource[] : order) {
        try {
          rec = await ADAPTERS[s](input)
        } catch {
          rec = null
        }
        if (rec) {
          used = s
          break
        }
      }
      if (!rec || !used) return json(toResponse(emptyMerged(input)))
      const merged = mergeRecords([{ source: used, at: new Date().toISOString(), record: rec }])
      return json({ ...toResponse(merged), source: used, completing: true })
    }

    // 3) Full pass: resolve identity, then merge field-by-field across sources, cache, return complete.
    const stamped: StampedSource[] = []
    let rateLimited = false
    let confidence: Confidence = cleanIsbn(input.isbn ?? '') ? 'high' : 'none' // a real ISBN is exact
    let matchQuery = ''
    let alternates: CoverAlternate[] = []
    let fetchInput = input

    // 3a) No ISBN (the real catalog case): a title+author SEARCH → best match + confidence →
    //     SELF-RESOLVE an ISBN-13 → fetch the canonical edition + best cover by that ISBN below.
    const title = input.title
    if (!cleanIsbn(input.isbn ?? '') && title) {
      const { candidates, rateLimited: searchRL } = await gatherCandidates(input)
      if (searchRL) rateLimited = true
      const r = selectBestMatch({ title, author: input.author }, candidates)
      confidence = r.confidence
      matchQuery = r.query
      alternates = distillAlternates(r.alternates)
      if (r.best) {
        // Keep the confirmed match (title/author/series/cover) in the merge regardless of the ISBN fetch.
        stamped.push({ source: r.best.source, at: new Date().toISOString(), record: r.best.record })
        if (r.isbn13) fetchInput = { ...input, isbn: r.isbn13 }
      }
    }

    // 3b) Query enabled sources (by the self-resolved ISBN when we have one) to complete + best cover.
    for (const s of enabledSources()) {
      try {
        const rec = await ADAPTERS[s](fetchInput)
        if (rec) stamped.push({ source: s, at: new Date().toISOString(), record: rec })
      } catch (e) {
        if (String(e).includes('429')) rateLimited = true
        // degrade gracefully — skip this source, keep going
      }
    }
    const merged = mergeRecords(stamped)
    const sourceList = stamped.map((s) => s.source).join('+') || null

    // Cache the cover image in Storage (shared, keyed by work/edition) and swap in the CDN URL, so
    // we stop hotlinking the source. On any failure the source URL is kept (→ client placeholder).
    if (merged.cover) merged.cover = await cacheCover(merged.cover, coverKeyFor(merged))

    if (sourceList) await writeCache(key, merged, { confidence, query: matchQuery, alternates })
    // Flag rate-limited only when nothing resolved, so a bulk run pauses/resumes instead of
    // stamping the book checked. A partial record is still useful → not flagged.
    const body = { ...toResponse(merged), source: sourceList, confidence, query: matchQuery || undefined, alternates }
    return json(rateLimited && !sourceList ? { ...body, rateLimited: true } : body)
  } catch (e) {
    captureEdgeError('enrich', e)
    return new Response(JSON.stringify({ error: String(e) }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } })
  }
})

const json = (body: unknown) => new Response(JSON.stringify(body), { headers: { ...cors, 'Content-Type': 'application/json' } })

function emptyMerged(input: EnrichInput): EnrichedRecord {
  return mergeRecords(
    [],
    { title: input.title, author: input.author, isbn: cleanIsbn(input.isbn ?? '') } as unknown as Partial<EnrichedRecord>,
  )
}

// Response shape is a SUPERSET of the legacy EnrichResult (so existing callers keep working) plus
// genre, isbns, workId/editionId, and provenance.
function toResponse(r: EnrichedRecord) {
  return {
    title: r.title,
    authors: r.authors,
    author: r.author,
    series: r.series,
    seriesPosition: r.seriesPosition,
    publisher: r.publisher,
    pubY: r.pubY,
    pubM: r.pubM,
    pubD: r.pubD,
    pageCount: r.pageCount,
    binding: r.binding,
    isbn10: r.isbn10,
    isbn13: r.isbn13,
    isbn: r.isbn,
    isbns: r.isbns,
    language: r.language,
    genre: r.genre,
    genres: r.genres,
    description: r.description,
    cover: r.cover,
    workId: r.workId,
    editionId: r.editionId,
    provenance: r.provenance,
  }
}

// ── enrichment_cache (global, service-role only) ──
function cacheKeyFor(input: EnrichInput): string {
  const isbn = cleanIsbn(input.isbn ?? '')
  return isbn.length >= 10 ? `isbn:${isbn}` : `ta:${norm(input.title ?? '')}|${norm(input.author ?? '')}`
}

// ── cover image caching (Storage bucket 'covers', global + CDN-served) ──
// Keyed by work/edition like enrichment_cache, so the Nth scanner reuses one stored image.
function coverKeyFor(r: EnrichedRecord): string {
  const raw = r.isbn13 || r.isbn10 || r.workId || r.editionId || ''
  return raw.replace(/[^a-z0-9]/gi, '_').slice(0, 80)
}

/**
 * Ensure the cover is stored in the 'covers' bucket and return its public CDN URL. Idempotent: if
 * the object already exists it's reused (no re-fetch). On a missing key or any fetch/upload error,
 * the original source URL is returned unchanged (the client then falls back to a placeholder).
 */
async function cacheCover(sourceUrl: string, key: string): Promise<string> {
  if (!DB_URL || !key || sourceUrl.includes('/storage/v1/object/public/covers/')) return sourceUrl
  const path = `${key}.jpg`
  // The browser-facing base. In production SUPABASE_URL is the public project URL; COVER_PUBLIC_URL
  // can point at a CDN/custom domain instead.
  const publicBase = Deno.env.get('COVER_PUBLIC_URL') ?? DB_URL
  const publicUrl = `${publicBase}/storage/v1/object/public/covers/${path}`
  try {
    // Already cached? Reuse it.
    const head = await fetch(publicUrl, { method: 'HEAD' })
    if (head.ok) return publicUrl

    const img = await fetch(sourceUrl)
    if (!img.ok) return sourceUrl
    const bytes = new Uint8Array(await img.arrayBuffer())
    if (!bytes.length) return sourceUrl
    const contentType = img.headers.get('content-type') ?? 'image/jpeg'
    const up = await fetch(`${DB_URL}/storage/v1/object/covers/${path}`, {
      method: 'POST',
      headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': contentType, 'x-upsert': 'true' },
      body: bytes,
    })
    return up.ok ? publicUrl : sourceUrl
  } catch {
    return sourceUrl
  }
}

const DAY = 86_400_000
const COMPLETE_DAYS = 30
const PARTIAL_DAYS = 3

interface CacheRow {
  record: EnrichedRecord
  complete: boolean
  fetched_at: string
  confidence?: Confidence | null
  match_query?: string | null
  alternates?: CoverAlternate[] | null
}

/** Resolution metadata stored alongside the cached record (E1) — confidence + query + cover choices. */
interface ResolveMeta {
  confidence: Confidence
  query: string
  alternates: CoverAlternate[]
}

function isFresh(row: CacheRow): boolean {
  const age = Date.now() - Date.parse(row.fetched_at)
  return age < (row.complete ? COMPLETE_DAYS : PARTIAL_DAYS) * DAY
}

const DB_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const dbHeaders = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json' }

async function readCache(key: string): Promise<CacheRow | null> {
  if (!DB_URL) return null
  try {
    const r = await fetch(
      `${DB_URL}/rest/v1/enrichment_cache?key=eq.${encodeURIComponent(key)}&select=record,complete,fetched_at,confidence,match_query,alternates`,
      { headers: dbHeaders },
    )
    const rows = (await r.json()) as CacheRow[]
    return rows?.[0]?.record ? rows[0] : null
  } catch {
    return null
  }
}

async function writeCache(key: string, record: EnrichedRecord, meta?: ResolveMeta): Promise<void> {
  if (!DB_URL) return
  try {
    await fetch(`${DB_URL}/rest/v1/enrichment_cache`, {
      method: 'POST',
      headers: { ...dbHeaders, Prefer: 'resolution=merge-duplicates' },
      body: JSON.stringify({
        key,
        isbn13: record.isbn13 || null,
        work_id: record.workId || null,
        edition_id: record.editionId || null,
        record,
        provenance: record.provenance,
        complete: isComplete(record),
        confidence: meta?.confidence ?? null,
        match_query: meta?.query || null,
        alternates: meta?.alternates ?? null,
        fetched_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }),
    })
  } catch {
    /* caching is best-effort */
  }
}
