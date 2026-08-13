// Cover system Edge Function (docs/archive/task-cover-system.md) — two actions, one durable pipeline:
//
//  · action:'editions' — alternates for the cover sheet's editions chooser. Hardcover editions
//    (backend token, GLOBAL 60 req/min budget via rate_limit_consume) + Google Books by ISBN falling
//    back to title+author (the referrer-restricted key). Cached per book in enrichment_cache under
//    an `editions:` key (7 days) so reopening the sheet costs zero external calls.
//
//  · action:'ingest' — EVERY chosen cover flows through here regardless of source (edition pick,
//    camera, upload, pasted URL): receive the bytes (multipart) or fetch the URL (server-side, no
//    client CORS), validate magic bytes + a sane size cap, normalize to webp (max ~1200px long edge)
//    plus a ~300px thumb, extract the dominant colour (spine tint), and store both in the caller's
//    user-scoped path in the public 'covers' bucket: u/{uid}/{bookId}/{rev}.webp (+ {rev}_t.webp).
//    The DB row is patched by the CLIENT via the normal RLS-checked mutation — this function never
//    writes books rows, so ownership enforcement stays in one place (RLS).
//
// Image work uses magick-wasm (the Supabase-documented wasm path): proper filtered resize, webp
// encode, and decode for jpeg/png/webp/gif/tiff inputs. No hotlinking survives ingest.

import {
  ImageMagick,
  initializeImageMagick,
  MagickFormat,
  MagickGeometry,
  QuantizeSettings,
} from 'npm:@imagemagick/magick-wasm@0.0.35'
import { envInt, rateLimit, tooMany } from '../_shared/ratelimit.ts'
import { captureEdgeError, logEvent } from '../_shared/observe.ts'
import { Trace, wantsTrace } from '../_shared/trace.ts'
import { isGoogleNoCoverArt, upgradeCoverUrl } from '../_shared/coverUrl.ts'
import { olHeaders } from '../_shared/olIdentity.ts'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const DB_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const dbHeaders = {
  apikey: SERVICE,
  Authorization: `Bearer ${SERVICE}`,
  'Content-Type': 'application/json',
}

const GOOGLE_KEY = Deno.env.get('GOOGLE_BOOKS_KEY') ?? ''
const googleKey = () => (GOOGLE_KEY ? `&key=${encodeURIComponent(GOOGLE_KEY)}` : '')
// The key is referrer-restricted — send the app's Referer with keyed calls (the releases pattern).
const GOOGLE_REFERER = Deno.env.get('BOOKS_KEY_REFERER') ?? 'https://reveriereads.app/'
const googleHeaders = (): HeadersInit => (GOOGLE_KEY ? { Referer: GOOGLE_REFERER } : {})

const MAX_INPUT_BYTES = envInt('COVER_MAX_INPUT_BYTES', 8 * 1024 * 1024) // camera photos; crop already shrank most
const FULL_EDGE = 1600 // long-edge cap for the stored cover — headroom for high-DPR (2–3×) detail/flip
const THUMB_EDGE = 300 // long-edge cap for the grid/spine thumb
const EDITIONS_TTL_DAYS = 7

const cleanIsbn = (s: string) => (s || '').replace(/[^0-9Xx]/g, '').toUpperCase()
const norm = (s: string) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '')

// ── magick-wasm init (once per isolate; the wasm ships inside the npm package) ──
let magickReady: Promise<void> | null = null
function ensureMagick(): Promise<void> {
  if (!magickReady) {
    magickReady = (async () => {
      const wasmUrl = new URL(
        'magick.wasm',
        import.meta.resolve('npm:@imagemagick/magick-wasm@0.0.35'),
      )
      await initializeImageMagick(await Deno.readFile(wasmUrl))
    })()
  }
  return magickReady
}

// ── shared helpers ──

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })

/** The caller's user id from the (gateway-verified) JWT — used only to build the storage path. */
function jwtSub(req: Request): string | null {
  try {
    const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
    const part = token.split('.')[1]
    if (!part) return null
    let b64 = part.replace(/-/g, '+').replace(/_/g, '/')
    while (b64.length % 4) b64 += '='
    const sub = (JSON.parse(atob(b64)) as { sub?: unknown }).sub
    return typeof sub === 'string' && sub ? sub : null
  } catch {
    return null
  }
}

/** Consume one unit of a GLOBAL upstream budget (e.g. Hardcover's 60 req/min) — not per-caller. */
async function globalBudget(name: string, max: number, windowSecs: number): Promise<boolean> {
  if (!DB_URL || !SERVICE) return true
  try {
    const r = await fetch(`${DB_URL}/rest/v1/rpc/rate_limit_consume`, {
      method: 'POST',
      headers: dbHeaders,
      body: JSON.stringify({ p_key: `${name}:global`, p_max: max, p_window_secs: windowSecs }),
    })
    if (!r.ok) return true // fail open, like the shared limiter
    return !!((await r.json()) as { allowed?: boolean }).allowed
  } catch {
    return true
  }
}

// ── image sniffing (magic bytes — never trust the extension or the reported content-type) ──

type Sniffed = { mime: string; ext: string }
function sniffImage(b: Uint8Array): Sniffed | null {
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff)
    return { mime: 'image/jpeg', ext: 'jpg' }
  if (b.length > 7 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47)
    return { mime: 'image/png', ext: 'png' }
  if (b.length > 11 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50)
    return { mime: 'image/webp', ext: 'webp' }
  if (b.length > 3 && b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38)
    return { mime: 'image/gif', ext: 'gif' }
  if (
    b.length > 3 &&
    ((b[0] === 0x49 && b[1] === 0x49 && b[2] === 0x2a) ||
      (b[0] === 0x4d && b[1] === 0x4d && b[2] === 0x00))
  )
    return { mime: 'image/tiff', ext: 'tif' }
  return null
}

// ── normalization: bytes → { full webp, thumb webp, dominant colour, dimensions } ──

interface Normalized {
  full: Uint8Array
  thumb: Uint8Array
  color: string | null
  width: number
  height: number
}

/** Resize (long edge cap), re-encode as webp, and read a dominant colour from a quantized copy. */
async function normalizeImage(bytes: Uint8Array, tr?: Trace): Promise<Normalized> {
  // magick-wasm init is ONCE PER ISOLATE. Timed separately because a cold isolate pays seconds here
  // and a warm one pays ~0 — and if Supabase's per-request CPU limit is killing isolates, this span
  // is non-zero on most requests instead of the first.
  await (tr ? tr.time('normalize.magickInit', () => ensureMagick()) : ensureMagick())

  const encode = (edge: number, quality: number): Uint8Array =>
    ImageMagick.read(bytes, (img) => {
      img.autoOrient() // camera EXIF rotation
      if (Math.max(img.width, img.height) > edge) {
        const g = new MagickGeometry(edge, edge) // fits within edge×edge, aspect preserved
        img.resize(g)
      }
      img.quality = quality
      img.strip() // EXIF/GPS never reaches the public bucket
      return img.write(MagickFormat.WebP, (d) => d.slice())
    })

  // FOUR FULL DECODES OF THE SAME BYTES, timed one by one. Each ImageMagick.read re-decodes from
  // scratch: full encode, thumb encode, a read whose only purpose is width/height, and the colour
  // pass. Three of the four are avoidable — this instrumentation is what will say whether that is
  // worth acting on or is noise against the network legs.
  const full = tr
    ? tr.sync('normalize.decode.full', () => encode(FULL_EDGE, 82))
    : encode(FULL_EDGE, 82)
  const thumb = tr
    ? tr.sync('normalize.decode.thumb', () => encode(THUMB_EDGE, 78))
    : encode(THUMB_EDGE, 78)

  const readDims = () =>
    ImageMagick.read(bytes, (img) => ({ width: img.width, height: img.height }))
  const { width, height } = tr ? tr.sync('normalize.decode.dims', readDims) : readDims()

  // Dominant colour: quantize a small copy to a handful of colours and score the histogram by
  // count × saturation, skipping near-white/near-black — the jacket's hue, not its margins.
  let color: string | null = null
  try {
    const readColor = () =>
      ImageMagick.read(bytes, (img) => {
        img.resize(new MagickGeometry(64, 64))
        const q = new QuantizeSettings()
        q.colors = 8
        img.quantize(q)
        let best: { score: number; hex: string } | null = null
        for (const [key, rawCount] of img.histogram()) {
          const count = Number(rawCount) // magick-wasm counts arrive as BigInt
          // histogram keys are colour strings (#RRGGBB or #RRGGBBAA at 8-bit depth)
          const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i.exec(key.trim())
          if (!m) continue
          const [r, g, b] = [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)]
          const mx = Math.max(r, g, b) / 255
          const mn = Math.min(r, g, b) / 255
          const sat = mx === 0 ? 0 : (mx - mn) / mx
          const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
          if (lum > 0.94 || lum < 0.05) continue // margins/shadows
          const score = count * (0.35 + sat)
          if (!best || score > best.score)
            best = { score, hex: `#${m[1]}${m[2]}${m[3]}`.toLowerCase() }
        }
        return best?.hex ?? null
      })
    color = tr ? tr.sync('normalize.decode.color', readColor) : readColor()
  } catch (e) {
    logEvent('warn', 'covers', 'color_extract_failed', { err: String(e) })
    color = null // tint is a nicety — never fail ingest over it
  }

  return { full, thumb, color, width, height }
}

// ── storage ──

async function putObject(path: string, bytes: Uint8Array, contentType: string): Promise<boolean> {
  const r = await fetch(`${DB_URL}/storage/v1/object/covers/${path}`, {
    method: 'POST',
    headers: {
      apikey: SERVICE,
      Authorization: `Bearer ${SERVICE}`,
      'Content-Type': contentType,
      'x-upsert': 'true',
    },
    body: bytes as BodyInit,
  })
  return r.ok
}

const publicUrl = (path: string): string => {
  const base = Deno.env.get('COVER_PUBLIC_URL') ?? DB_URL
  return `${base}/storage/v1/object/public/covers/${path}`
}

// ── action: ingest ──

interface IngestFields {
  bookId: string
  source: string
  sourceUrl?: string
  url?: string
}

/** Smallest edge a real cover can have. A 1x1 tracking/placeholder pixel is the artifact this
 *  excludes; the smallest genuine thumbnail any source serves is an order of magnitude above it. */
const MIN_COVER_EDGE_PX = 50

const SOURCES = new Set(['hardcover', 'google', 'openlibrary', 'upload', 'camera', 'url'])

// Sources whose bytes may be STORED (docs/reference/reverie-metadata-sourcing.md §Covers). Google Books is
// display-time only: its terms prohibit permanent copies and caching beyond the cache header, so a
// Google image may be hotlinked at display size but never ingested. This is the authoritative gate —
// the client refuses too, but the client is not the security boundary.
const INGESTIBLE_SOURCES = new Set(['hardcover', 'openlibrary', 'upload', 'camera', 'url'])

/** Host check, because the declared source is not sufficient: a Google URL wearing the label 'url'
 *  (the lazy backfill's label for pre-existing covers) is still a Google image. */
const isGoogleHostedCover = (url: string): boolean =>
  /(?:books\.google\.[a-z.]+|googleusercontent\.com)\/books\/content/i.test(url || '')

async function handleIngest(req: Request, uid: string, tr: Trace): Promise<Response> {
  let file: Uint8Array | null = null
  let fields: IngestFields
  // Multipart (camera/upload) never traces: it is a reader action, not the sweep.
  let tracing = false

  const contentType = req.headers.get('content-type') ?? ''
  if (contentType.includes('multipart/form-data')) {
    const form = await req.formData()
    const f = form.get('file')
    if (f instanceof File) {
      if (f.size > MAX_INPUT_BYTES)
        return json({ error: 'too_large', maxBytes: MAX_INPUT_BYTES }, 413)
      file = new Uint8Array(await f.arrayBuffer())
    }
    fields = {
      bookId: String(form.get('bookId') ?? ''),
      source: String(form.get('source') ?? ''),
      sourceUrl: form.get('sourceUrl') ? String(form.get('sourceUrl')) : undefined,
    }
  } else {
    const body = (await req.json()) as IngestFields & { action?: string }
    fields = body
    tracing = wantsTrace(body)
  }

  if (!fields.bookId || !/^[0-9a-f-]{16,64}$/i.test(fields.bookId))
    return json({ error: 'bad_book_id' }, 400)
  if (!SOURCES.has(fields.source)) return json({ error: 'bad_source' }, 400)
  // Refuse to persist a display-only source, by label OR by host.
  if (!INGESTIBLE_SOURCES.has(fields.source)) {
    logEvent('info', 'covers', 'ingest_refused_display_only', { uid, source: fields.source })
    return json({ error: 'display_only_source' }, 422)
  }
  for (const candidate of [fields.url, fields.sourceUrl]) {
    if (candidate && isGoogleHostedCover(candidate)) {
      logEvent('info', 'covers', 'ingest_refused_display_only', {
        uid,
        source: fields.source,
        host: 'google',
      })
      return json({ error: 'display_only_source' }, 422)
    }
  }

  // URL path: fetch server-side (direct image URLs only — a product page yields non-image bytes
  // and fails validation below; we deliberately do NOT scrape HTML for og:image).
  let sourceUrl = fields.sourceUrl
  let fetchedUrl: string | null = null // the server-fetched image URL (guards against a "no image" plate)
  if (!file) {
    const raw = (fields.url ?? '').trim()
    if (!/^https?:\/\//i.test(raw)) return json({ error: 'bad_url' }, 400)
    // Fetch the LARGEST the source offers (Google zoom=0, OL -L) so the stored asset isn't a 128px
    // thumbnail; record the upgraded URL as provenance so a re-sharpen never re-fetches the small one.
    const url = upgradeCoverUrl(raw, 'full')
    fetchedUrl = url
    sourceUrl = sourceUrl ? upgradeCoverUrl(sourceUrl, 'full') : url
    let r: Response
    try {
      // olHeaders on EVERY source fetch, not just OL hosts: this URL is reader-supplied and can be
      // covers.openlibrary.org, and identifying our traffic to the other hosts costs nothing. One
      // anonymous OL request from this call site would re-classify the whole IP's tier.
      r = await tr.time('covers.fetchSource', () =>
        fetch(url, { headers: olHeaders({ Accept: 'image/*' }), redirect: 'follow' }),
      )
    } catch {
      return json({ error: 'fetch_failed' }, 422)
    }
    if (!r.ok) return json({ error: 'fetch_failed', status: r.status }, 422)
    const len = Number(r.headers.get('content-length') ?? 0)
    if (len > MAX_INPUT_BYTES) return json({ error: 'too_large', maxBytes: MAX_INPUT_BYTES }, 413)
    const buf = new Uint8Array(await tr.time('covers.readBody', () => r.arrayBuffer()))
    if (buf.byteLength > MAX_INPUT_BYTES)
      return json({ error: 'too_large', maxBytes: MAX_INPUT_BYTES }, 413)
    file = buf
  }

  if (!file?.byteLength) return json({ error: 'empty' }, 400)
  const sniffed = sniffImage(file)
  if (!sniffed) return json({ error: 'not_an_image' }, 415)

  const rev = Date.now().toString(36)
  const base = `u/${uid}/${fields.bookId}`

  try {
    const n = await normalizeImage(file, tr)
    // A server-fetched Google URL that resolves to the source's fixed-size "image not available" plate
    // is NOT a cover — refuse to store it (a stored plate has no display fallback). Never applies to a
    // user upload/camera (multipart → file set, no fetchedUrl) or a real cover of any other size.
    // HOST-AGNOSTIC DIMENSION FLOOR. `isGoogleNoCoverArt` below only fires for Google hosts and only
    // at two exact sizes, so it cannot see any other source's "no cover" artifact. Open Library's is
    // a 43-byte 1x1 GIF89a served at HTTP 200 with no content-type — `sniffImage` accepts GIF, and
    // nothing here checked size, so it would normalize and store as a durable cover with no display
    // fallback. `?default=false` is the primary defence and turns that into a clean 404; this is the
    // backstop for when it is missing, and being host-agnostic it also covers whatever the next
    // source's placeholder turns out to be. No real cover is under 50px on either edge.
    if (n.width < MIN_COVER_EDGE_PX || n.height < MIN_COVER_EDGE_PX) {
      logEvent('info', 'covers', 'ingest_rejected_too_small', {
        uid,
        source: fields.source,
        w: n.width,
        h: n.height,
      })
      return json({ error: 'no_cover_available', reason: 'below_min_dimensions' }, 422)
    }
    if (fetchedUrl && isGoogleNoCoverArt(fetchedUrl, n.width, n.height)) {
      logEvent('info', 'covers', 'ingest_rejected_no_image', {
        uid,
        source: fields.source,
        w: n.width,
        h: n.height,
      })
      return json({ error: 'no_cover_available' }, 422)
    }
    const fullPath = `${base}/${rev}.webp`
    const thumbPath = `${base}/${rev}_t.webp`
    const okFull = await tr.time('covers.putFull', () => putObject(fullPath, n.full, 'image/webp'))
    const okThumb =
      okFull &&
      (await tr.time('covers.putThumb', () => putObject(thumbPath, n.thumb, 'image/webp')))
    if (!okFull) return json({ error: 'storage_failed' }, 502)
    logEvent('info', 'covers', 'ingest', {
      uid,
      source: fields.source,
      bytesIn: file.byteLength,
      bytesOut: n.full.byteLength,
      w: n.width,
      h: n.height,
    })
    return json({
      cover: publicUrl(fullPath),
      thumb: okThumb ? publicUrl(thumbPath) : publicUrl(fullPath),
      color: n.color,
      sourceUrl: sourceUrl ?? null,
      width: n.width,
      height: n.height,
      ...(tracing ? { _trace: { spans: tr.spans, totalMs: tr.totalMs() } } : {}),
    })
  } catch (e) {
    // Normalization failed (exotic/corrupt encoding) but the bytes ARE a sniffed image within the
    // cap — store the original as-is so the pick still lands durably; no thumb, no colour.
    captureEdgeError('covers', e, { stage: 'normalize', mime: sniffed.mime })
    const rawPath = `${base}/${rev}.${sniffed.ext}`
    const ok = await putObject(rawPath, file, sniffed.mime)
    if (!ok) return json({ error: 'storage_failed' }, 502)
    const url = publicUrl(rawPath)
    return json({
      cover: url,
      thumb: url,
      color: null,
      sourceUrl: sourceUrl ?? null,
      degraded: true,
    })
  }
}

// ── action: editions ──

interface EditionOption {
  source: 'hardcover' | 'google'
  cover: string
  isbn13?: string
  isbn10?: string
  format?: string
  year?: number
  publisher?: string
  pages?: number
  title?: string
}

interface EditionsInput {
  action: 'editions'
  isbn?: string
  title?: string
  author?: string
  refresh?: boolean
}

const hardcoverAuth = (): string | null => {
  const raw = (Deno.env.get('HARDCOVER_TOKEN') ?? '').trim()
  if (!raw) return null
  const t = raw.replace(/^Bearer\s+/i, '').trim()
  return t ? `Bearer ${t}` : null
}

async function hardcoverGql(query: string, variables: Record<string, unknown>): Promise<unknown> {
  const auth = hardcoverAuth()
  if (!auth) return null
  // Global Hardcover budget: 60 req/min across ALL users (their documented cap).
  if (!(await globalBudget('hardcover', envInt('HARDCOVER_RATE_MAX', 60), 60))) return null
  const r = await fetch('https://api.hardcover.app/v1/graphql', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: auth },
    body: JSON.stringify({ query, variables }),
  })
  if (!r.ok) return null
  return ((await r.json()) as { data?: unknown }).data ?? null
}

/** Reading a cover URL out of Hardcover's cached_image json (shape: { url, ... }) or image relation. */
function hcImageUrl(e: Record<string, unknown>): string {
  const cached = e.cached_image as { url?: unknown } | null | undefined
  if (cached && typeof cached.url === 'string') return cached.url
  const img = e.image as { url?: unknown } | null | undefined
  if (img && typeof img.url === 'string') return img.url
  return ''
}

const HC_EDITION_FIELDS = `
  id title isbn_13 isbn_10 pages release_year release_date edition_format physical_format
  cached_image image { url } publisher { name } reading_format { format } users_count`

/** Hardcover: resolve a book id (by ISBN, else by title search), then list its editions. ≤2 calls. */
async function hardcoverEditions(input: EditionsInput): Promise<EditionOption[]> {
  if (!hardcoverAuth()) return []
  let bookId: number | null = null

  const isbn = cleanIsbn(input.isbn ?? '')
  if (isbn.length >= 10) {
    const d = (await hardcoverGql(
      `query($i:String!){ editions(where:{_or:[{isbn_13:{_eq:$i}},{isbn_10:{_eq:$i}}]}, limit:1){ book_id } }`,
      { i: isbn },
    )) as { editions?: { book_id?: number }[] } | null
    bookId = d?.editions?.[0]?.book_id ?? null
  }
  if (bookId == null && input.title) {
    const d = (await hardcoverGql(
      `query($q:String!){ search(query:$q, query_type:"Book", per_page:1){ results } }`,
      { q: [input.title, input.author].filter(Boolean).join(' ') },
    )) as { search?: { results?: { hits?: { document?: { id?: unknown } }[] } } } | null
    const id = d?.search?.results?.hits?.[0]?.document?.id
    bookId = typeof id === 'string' ? Number(id) : typeof id === 'number' ? id : null
    if (bookId != null && !Number.isFinite(bookId)) bookId = null
  }
  if (bookId == null) return []

  const d = (await hardcoverGql(
    `query($b:Int!){ editions(where:{book_id:{_eq:$b}}, order_by:{users_count:desc_nulls_last}, limit:32){ ${HC_EDITION_FIELDS} } }`,
    { b: bookId },
  )) as { editions?: Record<string, unknown>[] } | null

  return (d?.editions ?? [])
    .map((e): EditionOption | null => {
      const cover = hcImageUrl(e)
      if (!cover) return null
      const rf = (e.reading_format as { format?: unknown } | null)?.format
      const format =
        (typeof e.edition_format === 'string' && e.edition_format) ||
        (typeof e.physical_format === 'string' && e.physical_format) ||
        (typeof rf === 'string' ? rf : undefined) ||
        undefined
      const year =
        typeof e.release_year === 'number'
          ? e.release_year
          : typeof e.release_date === 'string'
            ? Number(e.release_date.slice(0, 4)) || undefined
            : undefined
      return {
        source: 'hardcover',
        cover: cover.replace(/^http:/, 'https:'),
        isbn13: typeof e.isbn_13 === 'string' ? e.isbn_13 : undefined,
        isbn10: typeof e.isbn_10 === 'string' ? e.isbn_10 : undefined,
        format,
        year,
        publisher: (e.publisher as { name?: string } | null)?.name,
        pages: typeof e.pages === 'number' ? e.pages : undefined,
        title: typeof e.title === 'string' ? e.title : undefined,
      }
    })
    .filter((x): x is EditionOption => x !== null)
}

/** Google Books: by ISBN (the exact edition) UNIONED with title+author (the other editions —
 *  a by-ISBN query alone returns a single volume, which would leave the chooser one row deep
 *  whenever Hardcover is unavailable). ≤2 calls, cached per book with the rest. */
async function googleEditions(input: EditionsInput): Promise<EditionOption[]> {
  const isbn = cleanIsbn(input.isbn ?? '')
  const queries: string[] = []
  if (isbn.length >= 10) queries.push(`isbn:${isbn}`)
  if (input.title)
    queries.push(
      `intitle:${encodeURIComponent(`"${input.title}"`)}${input.author ? `+inauthor:${encodeURIComponent(`"${input.author}"`)}` : ''}`,
    )
  const items: { volumeInfo?: Record<string, unknown> }[] = []
  for (const q of queries) {
    const r = await fetch(
      `https://www.googleapis.com/books/v1/volumes?q=${q}&maxResults=20&printType=books${googleKey()}`,
      {
        headers: googleHeaders(),
      },
    )
    if (!r.ok) continue
    const j = (await r.json()) as { items?: { volumeInfo?: Record<string, unknown> }[] }
    items.push(...(j.items ?? []))
  }
  const out: EditionOption[] = []
  for (const it of items) {
    const v = it.volumeInfo ?? {}
    const links = v.imageLinks as { thumbnail?: string; smallThumbnail?: string } | undefined
    const cover = (links?.thumbnail ?? links?.smallThumbnail ?? '')
      .replace('http:', 'https:')
      .replace('&edge=curl', '')
    if (!cover) continue
    const ids =
      (v.industryIdentifiers as { type?: string; identifier?: string }[] | undefined) ?? []
    const isbn13 = ids.find((i) => i.type === 'ISBN_13')?.identifier
    const isbn10 = ids.find((i) => i.type === 'ISBN_10')?.identifier
    const year =
      typeof v.publishedDate === 'string'
        ? Number(v.publishedDate.slice(0, 4)) || undefined
        : undefined
    out.push({
      source: 'google',
      cover,
      isbn13,
      isbn10,
      year,
      publisher: typeof v.publisher === 'string' ? v.publisher : undefined,
      pages: typeof v.pageCount === 'number' ? v.pageCount : undefined,
      title: typeof v.title === 'string' ? v.title : undefined,
    })
  }
  return out
}

const editionsCacheKey = (input: EditionsInput): string => {
  const isbn = cleanIsbn(input.isbn ?? '')
  return isbn.length >= 10
    ? `editions:isbn:${isbn}`
    : `editions:ta:${norm(input.title ?? '')}|${norm(input.author ?? '')}`
}

async function readEditionsCache(key: string): Promise<EditionOption[] | null> {
  if (!DB_URL) return null
  try {
    const r = await fetch(
      `${DB_URL}/rest/v1/enrichment_cache?key=eq.${encodeURIComponent(key)}&select=record,fetched_at`,
      { headers: dbHeaders },
    )
    const rows = (await r.json()) as {
      record?: { editions?: EditionOption[] }
      fetched_at?: string
    }[]
    const row = rows?.[0]
    if (!row?.record?.editions || !row.fetched_at) return null
    if (Date.now() - Date.parse(row.fetched_at) > EDITIONS_TTL_DAYS * 86_400_000) return null
    return row.record.editions
  } catch {
    return null
  }
}

async function writeEditionsCache(key: string, editions: EditionOption[]): Promise<void> {
  if (!DB_URL) return
  try {
    await fetch(`${DB_URL}/rest/v1/enrichment_cache`, {
      method: 'POST',
      headers: { ...dbHeaders, Prefer: 'resolution=merge-duplicates' },
      body: JSON.stringify({
        key,
        record: { editions },
        complete: true,
        fetched_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }),
    })
  } catch {
    /* best-effort */
  }
}

async function handleEditions(input: EditionsInput): Promise<Response> {
  const key = editionsCacheKey(input)
  if (!input.refresh) {
    const cached = await readEditionsCache(key)
    if (cached) return json({ editions: cached, source: 'cache' })
  }

  const [hc, gb] = await Promise.all([
    hardcoverEditions(input).catch(() => [] as EditionOption[]),
    googleEditions(input).catch(() => [] as EditionOption[]),
  ])

  // Dedupe: Hardcover leads (richer edition context); Google fills in what Hardcover didn't carry.
  const seen = new Set<string>()
  const editions: EditionOption[] = []
  for (const e of [...hc, ...gb]) {
    const k = e.isbn13 || e.isbn10 || e.cover
    if (!k || seen.has(k)) continue
    seen.add(k)
    editions.push(e)
  }

  if (editions.length) await writeEditionsCache(key, editions)
  return json({ editions })
}

// ── entry ──

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const tr = new Trace()
  // Timed like enrich's: a DB round trip paid before any image work, on every ingest.
  const rl = await tr.time('covers.ratelimit', () =>
    rateLimit(req, 'covers', envInt('COVERS_RATE_MAX', 60), 60),
  )
  if (!rl.allowed) return tooMany(rl.retryAfter, cors)

  const uid = jwtSub(req)
  if (!uid) return json({ error: 'unauthorized' }, 401) // gateway verifies; this derives the path scope

  try {
    const contentType = req.headers.get('content-type') ?? ''
    if (contentType.includes('multipart/form-data')) return await handleIngest(req, uid, tr)

    const body = (await req.clone().json()) as { action?: string }
    if (body.action === 'editions') return await handleEditions((await req.json()) as EditionsInput)
    if (body.action === 'ingest') return await handleIngest(req, uid, tr)
    return json({ error: 'bad_action' }, 400)
  } catch (e) {
    captureEdgeError('covers', e)
    return json({ error: String(e) }, 400)
  }
})
