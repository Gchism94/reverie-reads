import { useRef, useState } from 'react'
import { createRoute, useNavigate } from '@tanstack/react-router'
import { deriveBoyfriend, type Book } from '@reverie/core'
import { rootRoute } from './RootRoute'
import { useAddBook } from '../data/books'
import { Chip } from '../components/Chip'
import { ALL_TROPES, FORMATS, READ_STATUSES, SUBGENRES, subgenreGradient } from '../library/constants'

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
  const res = await fetch(`https://www.googleapis.com/books/v1/volumes?q=${query}&maxResults=8`)
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
  const addBook = useAddBook()
  const nameParts = (hit.authors?.[0] ?? '').trim().split(/\s+/)
  const [form, setForm] = useState({
    title: hit.title ?? '',
    first: nameParts.length > 1 ? (nameParts[0] ?? '') : '',
    last: nameParts.length > 1 ? nameParts.slice(1).join(' ') : (nameParts[0] ?? ''),
    series: '',
    position: '',
    subgenre: 'Romantasy' as string,
    format: 'Paperback' as string,
    readStatus: 'Unread' as Book['readStatus'],
  })
  const [tropes, setTropes] = useState<string[]>([])
  const [spice, setSpice] = useState(0)
  const set = (k: keyof typeof form, v: string) => setForm((p) => ({ ...p, [k]: v }))
  const [g0, g1] = subgenreGradient(form.subgenre)
  const inputClass = 'h-10 w-full rounded-xl border border-line px-3 text-[14px] text-ink outline-none'
  const inputStyle = { background: 'var(--field)' } as const

  function save() {
    if (!form.title.trim()) return
    const book: Partial<Book> & { title: string } = {
      title: form.title.trim(),
      first: form.first.trim(),
      last: form.last.trim(),
      series: form.series.trim(),
      position: form.position.trim() === '' ? '' : Number(form.position) || '',
      seriesCount: null,
      status: form.series.trim() ? 'Series' : 'Standalone',
      subgenre: form.subgenre,
      genres: [form.subgenre],
      tropes,
      spice,
      cover: hit.cover ?? '',
      isbn: hit.isbn ?? '',
      format: form.format,
      readStatus: form.readStatus,
      source: 'Owned',
      pub: parsePub(hit.pub ?? ''),
    }
    book.boyfriend = deriveBoyfriend({ tropes, subgenre: form.subgenre })
    addBook.mutate(book, { onSuccess: onAdded })
  }

  return (
    <div className="mt-4 rounded-2xl border border-line p-4" style={{ background: 'var(--card)' }}>
      <div className="flex gap-4">
        <div className="aspect-[2/3] w-20 flex-none overflow-hidden rounded-lg border border-line" style={{ background: `linear-gradient(150deg, ${g0}, ${g1})` }}>
          {hit.cover && <img src={hit.cover} alt="" className="h-full w-full object-cover" />}
        </div>
        <div className="flex-1 space-y-2">
          <input value={form.title} onChange={(e) => set('title', e.target.value)} placeholder="Title" className={inputClass} style={inputStyle} />
          <div className="grid grid-cols-2 gap-2">
            <input value={form.first} onChange={(e) => set('first', e.target.value)} placeholder="Author first" className={inputClass} style={inputStyle} />
            <input value={form.last} onChange={(e) => set('last', e.target.value)} placeholder="Author last" className={inputClass} style={inputStyle} />
          </div>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
        <input value={form.series} onChange={(e) => set('series', e.target.value)} placeholder="Series" className={inputClass} style={inputStyle} />
        <input value={form.position} onChange={(e) => set('position', e.target.value)} placeholder="Book #" className={inputClass} style={inputStyle} />
        <select value={form.subgenre} onChange={(e) => set('subgenre', e.target.value)} className={inputClass} style={inputStyle}>
          {SUBGENRES.map((s) => (
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
        <div className="mb-1.5 text-[11px] uppercase tracking-[0.15em] text-muted">Tropes</div>
        <div className="flex max-h-32 flex-wrap gap-1.5 overflow-y-auto">
          {ALL_TROPES.slice(0, 22).map((t) => (
            <Chip key={t} active={tropes.includes(t)} onClick={() => setTropes((p) => (p.includes(t) ? p.filter((x) => x !== t) : [...p, t]))}>
              {t}
            </Chip>
          ))}
        </div>
      </div>

      <div className="mt-3 flex items-center gap-2">
        <span className="text-[11px] uppercase tracking-[0.15em] text-muted">Spice</span>
        {[1, 2, 3, 4, 5].map((i) => (
          <button key={i} type="button" onClick={() => setSpice(spice === i ? 0 : i)} aria-label={`Spice ${i}`} aria-pressed={i <= spice} style={{ opacity: i <= spice ? 1 : 0.3 }}>
            🌶️
          </button>
        ))}
      </div>

      <button
        type="button"
        onClick={save}
        className="mt-4 h-11 w-full rounded-xl text-[14px] font-semibold"
        style={{ background: 'linear-gradient(135deg, var(--primary), var(--gold))', color: 'var(--on-primary)' }}
      >
        Add to my library
      </button>
    </div>
  )
}

function AddScreen() {
  const navigate = useNavigate()
  const [q, setQ] = useState('')
  const [results, setResults] = useState<SearchHit[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [picked, setPicked] = useState<Partial<SearchHit> | null>(null)
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
        <div className="mt-3 rounded-xl border border-line p-3 text-[13px] text-muted" style={{ background: 'var(--card)' }}>
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
                className="flex items-center gap-3 rounded-xl border border-line p-2 text-left"
                style={{ background: 'var(--field)' }}
              >
                <div className="h-16 w-11 flex-none overflow-hidden rounded border border-line" style={{ background: 'var(--chip)' }}>
                  {it.cover && <img src={it.cover} alt="" className="h-full w-full object-cover" />}
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
              No results —{' '}
              <button type="button" onClick={() => setPicked({ title: q })} className="font-semibold text-primary">
                add manually
              </button>
              .
            </p>
          )}
        </div>
      )}

      {picked && <AddForm hit={picked} onAdded={() => void navigate({ to: '/library' })} />}
    </section>
  )
}

export const addRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'add',
  component: AddScreen,
})
