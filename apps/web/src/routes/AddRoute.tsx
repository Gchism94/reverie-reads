import { useRef, useState } from 'react'
import { createRoute, useNavigate } from '@tanstack/react-router'
import { contributorsFromAuthors, deriveBoyfriend, formatAuthors, SKINS, toFirstLast, type Book, type Contributor, type Owned } from '@reverie/core'
import { useQueryClient } from '@tanstack/react-query'
import { rootRoute } from './RootRoute'
import { useIntake, type ReviewCandidate } from '../data/intake'
import { useBooks } from '../data/books'
import { resolveCandidate, type ReviewAction } from '../data/duplicates'
import { enrichBook } from '../lib/enrich'
import { volumesUrl } from '../lib/googleBooks'
import { useEffectiveSkin, useLabels, useVoice } from '../skin/labels'
import { Chip } from '../components/Chip'
import { ContributorEditor } from '../book/ContributorEditor'
import { FORMATS, READ_STATUSES, subgenreGradient, subgenresForGenre, tropeGroupsForGenre } from '../library/constants'

interface BarcodeDetectorLike {
  detect(source: CanvasImageSource): Promise<{ rawValue: string }[]>
}
declare global {
  interface Window {
    BarcodeDetector?: new (opts?: { formats: string[] }) => BarcodeDetectorLike
  }
}

interface SearchHit {
  title: string
  authors: string[]
  cover: string
  isbn: string
  pub: string
}

async function searchGoogleBooks(q: string): Promise<SearchHit[]> {
  const isISBN = /^[0-9Xx\- ]{10,17}$/.test(q) && q.replace(/[^0-9Xx]/g, '').length >= 10
  const query = isISBN ? `isbn:${q.replace(/[^0-9Xx]/g, '')}` : encodeURIComponent(q)
  const res = await fetch(volumesUrl(`q=${query}&maxResults=8`))
  const json = (await res.json()) as {
    items?: { volumeInfo?: { title?: string; authors?: string[]; imageLinks?: { thumbnail?: string }; publishedDate?: string; industryIdentifiers?: { type: string; identifier: string }[] } }[]
  }
  return (json.items ?? [])
    .map((it) => {
      const v = it.volumeInfo ?? {}
      const ind = (v.industryIdentifiers ?? []).find((x) => x.type === 'ISBN_13') ?? (v.industryIdentifiers ?? [])[0]
      return {
        title: v.title ?? '',
        authors: v.authors ?? [],
        cover: (v.imageLinks?.thumbnail ?? '').replace('http:', 'https:').replace('&edge=curl', ''),
        isbn: ind?.identifier ?? '',
        pub: v.publishedDate ?? '',
      }
    })
    .filter((x) => x.title)
}

function parsePub(s: string): Book['pub'] {
  const m = s.match(/^(\d{4})(?:-(\d{2}))?(?:-(\d{2}))?/)
  if (!m) return { y: null, m: null, d: null }
  return { y: +(m[1] ?? 0), m: m[2] ? +m[2] : null, d: m[3] ? +m[3] : null }
}

function AddForm({ hit, onAdded }: { hit: Partial<SearchHit>; onAdded: () => void }) {
  const intake = useIntake()
  const qc = useQueryClient()
  const { data: books } = useBooks()
  // genre is a required metadata field, not a romance-only tag — default it to the ROOM the reader
  // is in (add in Grimoire → fantasy, in Marrow → horror), never a hardcoded 'romance'.
  const skinGenre = SKINS[useEffectiveSkin()].genre.toLowerCase()
  const [dup, setDup] = useState<ReviewCandidate | null>(null)
  const [contribs, setContribs] = useState<Contributor[]>(contributorsFromAuthors(hit.authors ?? []))
  const [form, setForm] = useState({
    title: hit.title ?? '',
    series: '',
    position: '',
    genre: skinGenre,
    subgenre: subgenresForGenre(skinGenre)[0] as string,
    format: 'Paperback' as string,
    readStatus: 'Unread' as Book['readStatus'],
  })
  const [tags, setTags] = useState<string[]>([])
  const [intensity, setIntensity] = useState(0)
  // Track whether the user edited genre, so enrichment fills it but never overrides their choice.
  const genreEdited = useRef(false)
  // Distinct contributor names across the library, for the editor's autocomplete.
  const authorSuggestions = [...new Set((books ?? []).flatMap((b) => b.contributors.map((c) => c.name)).filter(Boolean))].sort()
  const labels = useLabels()
  const [cover, setCover] = useState(hit.cover ?? '')
  const [enriching, setEnriching] = useState(false)
  const set = (k: keyof typeof form, v: string) => setForm((p) => ({ ...p, [k]: v }))
  const [g0, g1] = subgenreGradient(form.subgenre)

  async function fetchDetails() {
    setEnriching(true)
    const res = await enrichBook({
      title: form.title,
      author: formatAuthors(contribs),
      isbn: hit.isbn,
    })
    setEnriching(false)
    if (!res) return
    if (res.cover && !cover) setCover(res.cover)
    // Seed contributors from enrichment only if the user hasn't entered any names yet.
    if (res.authors?.length && !contribs.some((c) => c.name.trim())) setContribs(contributorsFromAuthors(res.authors))
    // Fill only blanks — never overwrite what the user typed. genre is the mapped primary genre
    // (C1 fill); only applied if the user hasn't edited the genre field themselves.
    setForm((p) => ({
      ...p,
      series: p.series || res.series,
      position: p.position || (res.seriesPosition != null ? String(res.seriesPosition) : ''),
      genre: genreEdited.current ? p.genre : res.genre || p.genre,
    }))
  }
  const inputClass = 'h-10 w-full skin-card border border-line px-3 text-[14px] text-ink outline-none'
  const inputStyle = { background: 'var(--field)' } as const

  async function save() {
    if (!form.title.trim()) return
    const f = form.format.toLowerCase()
    const isEbook = f.includes('ebook') || f.includes('kindle')
    const isAudio = f.includes('audio')
    const owned: Owned = {
      physical: f.includes('hardcover') ? 'hardcover' : isEbook || isAudio ? false : 'paperback',
      ebook: isEbook,
      audiobook: isAudio,
    }
    const { first, last } = toFirstLast(contribs)
    const book: Partial<Book> & { title: string } = {
      title: form.title.trim(),
      first,
      last,
      contributors: contribs.filter((c) => c.name.trim()),
      series: form.series.trim(),
      position: form.position.trim() === '' ? '' : Number(form.position) || '',
      seriesCount: null,
      status: form.series.trim() ? 'Series' : 'Standalone',
      genre: form.genre.trim() || skinGenre,
      subgenre: form.subgenre,
      genres: [form.subgenre],
      tags,
      intensity,
      owned,
      cover,
      isbn: hit.isbn ?? '',
      format: form.format,
      readStatus: form.readStatus,
      source: 'Owned',
      pub: parsePub(hit.pub ?? ''),
    }
    book.boyfriend = deriveBoyfriend({ tags, subgenre: form.subgenre })
    // Dedup on intake: a strong match folds into the existing record instead of duplicating.
    // With auto-merge off, a match comes back for an inline decision instead.
    const res = await intake(book, 'add')
    if (res.outcome === 'review' && res.review) {
      setDup(res.review)
      return
    }
    onAdded()
  }

  async function resolveDup(action: ReviewAction) {
    if (!dup) return
    const existing = (books ?? []).find((b) => b.id === dup.existingId)
    if (existing) await resolveCandidate(dup, existing, action)
    await qc.invalidateQueries({ queryKey: ['books'] })
    await qc.invalidateQueries({ queryKey: ['reads', 'all'] })
    setDup(null)
    onAdded()
  }

  return (
    <div className="mt-4 skin-panel border border-line p-4" style={{ background: 'var(--card)' }}>
      <div className="flex gap-4">
        <div className="flex-none">
          <div className="aspect-[2/3] w-20 overflow-hidden rounded-lg border border-line" style={{ background: `linear-gradient(150deg, ${g0}, ${g1})` }}>
            {cover && <img src={cover} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />}
          </div>
          <button
            type="button"
            onClick={() => void fetchDetails()}
            disabled={enriching}
            className="mt-1.5 w-20 rounded-full border border-line px-2 py-1 text-[10px] font-semibold text-ink disabled:opacity-50"
            style={{ background: 'var(--field)' }}
          >
            {enriching ? '…' : '🔎 Fetch details'}
          </button>
        </div>
        <div className="flex-1 space-y-2">
          <input value={form.title} onChange={(e) => set('title', e.target.value)} placeholder="Title" className={inputClass} style={inputStyle} />
          <ContributorEditor value={contribs} onChange={setContribs} suggestions={authorSuggestions} />
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
        <input value={form.series} onChange={(e) => set('series', e.target.value)} placeholder="Series" className={inputClass} style={inputStyle} />
        <input value={form.position} onChange={(e) => set('position', e.target.value)} placeholder="Book #" className={inputClass} style={inputStyle} />
        <input
          value={form.genre}
          onChange={(e) => {
            genreEdited.current = true
            set('genre', e.target.value)
          }}
          placeholder={labels.genre}
          aria-label={labels.genre}
          className={inputClass}
          style={inputStyle}
        />
        <select value={form.subgenre} onChange={(e) => set('subgenre', e.target.value)} className={inputClass} style={inputStyle}>
          {subgenresForGenre(skinGenre, form.subgenre).map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        <select value={form.format} onChange={(e) => set('format', e.target.value)} className={inputClass} style={inputStyle}>
          {FORMATS.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        <select value={form.readStatus} onChange={(e) => set('readStatus', e.target.value as Book['readStatus'])} className={inputClass} style={inputStyle}>
          {READ_STATUSES.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
      </div>

      <div className="mt-3">
        <div className="mb-1.5 text-[11px] uppercase tracking-[0.15em] text-muted">{labels.tags}</div>
        <div className="flex max-h-32 flex-wrap gap-1.5 overflow-y-auto">
          {Object.values(tropeGroupsForGenre(skinGenre)).flat().slice(0, 22).map((t) => (
            <Chip key={t} active={tags.includes(t)} onClick={() => setTags((p) => (p.includes(t) ? p.filter((x) => x !== t) : [...p, t]))}>
              {t}
            </Chip>
          ))}
        </div>
      </div>

      <div className="mt-3 flex items-center gap-2">
        <span className="text-[11px] uppercase tracking-[0.15em] text-muted">{labels.intensity}</span>
        {[1, 2, 3, 4, 5].map((i) => (
          <button key={i} type="button" onClick={() => setIntensity(intensity === i ? 0 : i)} aria-label={`${labels.intensity} ${i}`} aria-pressed={i <= intensity} style={{ opacity: i <= intensity ? 1 : 0.3 }}>
            {labels.intensityGlyph}
          </button>
        ))}
      </div>

      {dup && (
        <div className="mt-4 skin-card border border-line p-3 text-[13px]" style={{ background: 'var(--field)' }}>
          <p className="text-ink">
            You may already have <span className="font-semibold">{dup.existingTitle}</span>
            {dup.existingAuthor ? ` · ${dup.existingAuthor}` : ''}.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button type="button" onClick={() => void resolveDup('merge')} className="rounded-full px-3 py-1.5 text-[12.5px] font-semibold text-on-primary" style={{ background: 'var(--accent-fill)' }}>
              Merge into it
            </button>
            <button type="button" onClick={() => void resolveDup('keep_both')} className="rounded-full border border-line px-3 py-1.5 text-[12.5px] font-semibold text-ink" style={{ background: 'var(--card)' }}>
              Keep both
            </button>
            <button type="button" onClick={() => setDup(null)} className="rounded-full px-3 py-1.5 text-[12.5px] font-semibold text-muted">
              Cancel
            </button>
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={() => void save()}
        className="mt-4 h-11 w-full rounded-xl text-[14px] font-semibold"
        style={{ background: 'linear-gradient(135deg, var(--primary), var(--gold))', color: 'var(--on-primary)' }}
      >
        Add to my library
      </button>
    </div>
  )
}

function BulkAdd() {
  const intake = useIntake()
  const skinGenre = SKINS[useEffectiveSkin()].genre.toLowerCase()
  const bulkSub = subgenresForGenre(skinGenre)[0] ?? 'Other' // genre's primary subgenre (always defined)
  const [text, setText] = useState('')
  const [status, setStatus] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function run() {
    const lines = text
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean)
    if (!lines.length) return
    setBusy(true)
    let added = 0
    let merged = 0
    for (const [i, line] of lines.entries()) {
      setStatus(`Looking up ${i + 1}/${lines.length}…`)
      try {
        const hit = (await searchGoogleBooks(line))[0]
        if (!hit) continue
        const np = (hit.authors[0] ?? '').trim().split(/\s+/)
        const res = await intake({
          title: hit.title,
          first: np.length > 1 ? (np[0] ?? '') : '',
          last: np.length > 1 ? np.slice(1).join(' ') : (np[0] ?? ''),
          status: 'Standalone',
          genre: skinGenre,
          subgenre: bulkSub,
          genres: [bulkSub],
          tags: [],
          intensity: null,
          owned: { physical: 'paperback', ebook: false, audiobook: false },
          cover: hit.cover,
          isbn: hit.isbn,
          readStatus: 'Unread',
          source: 'Owned',
          pub: parsePub(hit.pub),
        }, 'add')
        if (res.outcome === 'merged') merged++
        else added++
      } catch {
        /* skip lines that fail */
      }
    }
    setBusy(false)
    setStatus(`Added ${added}${merged ? ` · merged ${merged} into existing` : ''} of ${lines.length}.`)
    setText('')
  }

  return (
    <details className="mt-4 skin-panel border border-line p-4" style={{ background: 'var(--card)' }}>
      <summary className="cursor-pointer text-[14px] font-semibold text-ink">Bulk add — paste a list</summary>
      <p className="mb-2 mt-2 text-[12.5px] text-muted">One title or ISBN per line. Each is looked up and added.</p>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={5}
        placeholder={'Iron Flame\n9781649374172\nThe Love Hypothesis'}
        className="w-full skin-card border border-line p-3 text-[13px] text-ink outline-none"
        style={{ background: 'var(--field)' }}
      />
      <div className="mt-2 flex items-center gap-3">
        <button
          type="button"
          onClick={() => void run()}
          disabled={busy || !text.trim()}
          className="rounded-full px-4 py-2 text-[13px] font-semibold disabled:opacity-50"
          style={{ background: 'linear-gradient(135deg, var(--primary), var(--gold))', color: 'var(--on-primary)' }}
        >
          Add all
        </button>
        {status && <span className="text-[12.5px] text-muted">{status}</span>}
      </div>
    </details>
  )
}

function AddScreen() {
  const voice = useVoice()
  const navigate = useNavigate()
  // Deep-link prefill (?title=…&author=…): Discover — and anything else that finds a book
  // elsewhere in the app — lands here with the form already filled, one tap from saved.
  const prefill = addRoute.useSearch()
  const [q, setQ] = useState('')
  const [results, setResults] = useState<SearchHit[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [picked, setPicked] = useState<Partial<SearchHit> | null>(() =>
    prefill.title
      ? {
          title: prefill.title,
          authors: prefill.author ? [prefill.author] : [],
          cover: prefill.cover ?? '',
          isbn: prefill.isbn ?? '',
          pub: prefill.pub ?? '',
        }
      : null,
  )
  const [scanStatus, setScanStatus] = useState<string | null>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)

  async function runSearch(term = q) {
    const query = term.trim()
    if (!query) return
    setBusy(true)
    setPicked(null)
    try {
      setResults(await searchGoogleBooks(query))
    } catch {
      setResults([])
    } finally {
      setBusy(false)
    }
  }

  function stopScan() {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    setScanStatus(null)
  }

  async function startScan() {
    if (!window.BarcodeDetector || !navigator.mediaDevices) {
      setScanStatus('Barcode scanning isn’t supported in this browser — search by title or ISBN below.')
      return
    }
    try {
      setScanStatus('Requesting camera…')
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
      streamRef.current = stream
      const video = videoRef.current
      if (!video) return
      video.srcObject = stream
      await video.play()
      setScanStatus('Point at the barcode on the back cover…')
      const detector = new window.BarcodeDetector({ formats: ['ean_13', 'ean_8', 'upc_a'] })
      const tick = async () => {
        if (!streamRef.current) return
        try {
          const codes = await detector.detect(video)
          const isbn = codes[0]?.rawValue?.replace(/[^0-9Xx]/g, '')
          if (isbn && isbn.length >= 10) {
            stopScan()
            setQ(isbn)
            void runSearch(isbn)
            return
          }
        } catch {
          /* keep scanning */
        }
        setTimeout(() => void tick(), 350)
      }
      void tick()
    } catch (e) {
      stopScan()
      setScanStatus(`Camera unavailable (${(e as Error).name || 'blocked'}). Search by title or ISBN below.`)
    }
  }

  return (
    <section className="mx-auto max-w-2xl px-4 py-6 sm:px-6">
      <h1 className="text-[22px] italic text-ink" style={{ fontFamily: 'var(--font-display)', fontWeight: 600 }}>
        Add a book
      </h1>
      <p className="mb-4 text-[13px] text-muted">Scan a barcode, search by title or ISBN, or add manually.</p>

      <div className="flex flex-wrap gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void runSearch()
          }}
          placeholder="Title, author, or ISBN"
          aria-label="Search for a book"
          className="h-11 min-w-[200px] flex-1 rounded-full border border-line px-4 text-[14px] text-ink outline-none"
          style={{ background: 'var(--field)' }}
        />
        <button
          type="button"
          onClick={() => void runSearch()}
          className="h-11 rounded-full px-5 text-[14px] font-semibold"
          style={{ background: 'linear-gradient(135deg, var(--primary), var(--gold))', color: 'var(--on-primary)' }}
        >
          Search
        </button>
        <button
          type="button"
          onClick={streamRef.current ? stopScan : startScan}
          className="h-11 rounded-full border border-line px-5 text-[14px] font-semibold text-ink"
          style={{ background: 'var(--card)' }}
        >
          {streamRef.current ? 'Stop' : '📷 Scan'}
        </button>
      </div>

      {scanStatus && (
        <div className="mt-3 skin-card border border-line p-3 text-[13px] text-muted" style={{ background: 'var(--card)' }}>
          {scanStatus}
        </div>
      )}
      <video ref={videoRef} className={`mt-3 w-full rounded-xl ${streamRef.current ? '' : 'hidden'}`} muted playsInline />

      {busy && <p className="mt-4 text-center text-[13px] text-muted">Searching…</p>}

      {results && !picked && (
        <div className="mt-4 flex flex-col gap-2">
          {results.length ? (
            results.map((it, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setPicked(it)}
                className="flex items-center gap-3 skin-card border border-line p-2 text-left"
                style={{ background: 'var(--field)' }}
              >
                <div className="h-16 w-11 flex-none overflow-hidden rounded border border-line" style={{ background: 'var(--chip)' }}>
                  {it.cover && <img src={it.cover} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />}
                </div>
                <div className="min-w-0">
                  <div className="truncate text-[14px] font-semibold text-ink">{it.title}</div>
                  <div className="truncate text-[12px] text-muted">
                    {it.authors.join(', ')}
                    {it.pub ? ` · ${it.pub.slice(0, 4)}` : ''}
                  </div>
                </div>
              </button>
            ))
          ) : (
            <p className="text-[13px] text-muted">
              {voice.miss}{' '}
              <button type="button" onClick={() => setPicked({ title: q })} className="font-semibold text-primary">
                Add it manually
              </button>
              .
            </p>
          )}
        </div>
      )}

      {picked && <AddForm hit={picked} onAdded={() => void navigate({ to: '/library' })} />}

      {!picked && <BulkAdd />}
    </section>
  )
}

const str = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v : undefined)

/** All-optional prefill params — the explicit optional-key type keeps plain `to="/add"` links
 *  valid everywhere (no required `search` prop). */
interface AddPrefill {
  title?: string
  author?: string
  isbn?: string
  cover?: string
  pub?: string
}

export const addRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'add',
  component: AddScreen,
  validateSearch: (s: Record<string, unknown>): AddPrefill => {
    const out: AddPrefill = {}
    if (str(s.title)) out.title = str(s.title)
    if (str(s.author)) out.author = str(s.author)
    if (str(s.isbn)) out.isbn = str(s.isbn)
    if (str(s.cover)) out.cover = str(s.cover)
    if (str(s.pub)) out.pub = str(s.pub)
    return out
  },
})
