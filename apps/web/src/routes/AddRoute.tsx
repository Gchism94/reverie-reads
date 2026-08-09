import { useRef, useState } from 'react'
import { createRoute, useNavigate } from '@tanstack/react-router'
import {
  contributorsFromAuthors,
  formatAuthors,
  parseNumericField,
  possessionPatch,
  SERIES_POSITION,
  SKINS,
  toFirstLast,
  type Book,
  type Contributor,
  type Owned,
  type PossessionState,
} from '@reverie/core'
import { useQueryClient } from '@tanstack/react-query'
import { rootRoute } from './RootRoute'
import { useIntake, type ReviewCandidate } from '../data/intake'
import { useBooks } from '../data/books'
import { resolveCandidate, type ReviewAction } from '../data/duplicates'
import { enrichBook, type CoverAlternate } from '../lib/enrich'
import { volumesUrl } from '../lib/googleBooks'
import { useEffectiveSkin, useLabels, useVoice } from '../skin/labels'
import { Chip } from '../components/Chip'
import { CoverImage } from '../components/CoverImage'
import { CoverSheet } from '../components/CoverSheet'
import { TropePicker } from '../components/TropePicker'
import { ContributorEditor } from '../book/ContributorEditor'
import {
  FORMATS,
  OWNERSHIP_LABELS,
  READ_STATUS_OPTIONS,
  readStatusLabel,
  otherGenreSubgenres,
  subgenreGradient,
  subgenresForGenre,
} from '../library/constants'
import { CORE_GENRES } from '@reverie/core'

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
    items?: {
      volumeInfo?: {
        title?: string
        authors?: string[]
        imageLinks?: { thumbnail?: string }
        publishedDate?: string
        industryIdentifiers?: { type: string; identifier: string }[]
      }
    }[]
  }
  return (json.items ?? [])
    .map((it) => {
      const v = it.volumeInfo ?? {}
      const ind =
        (v.industryIdentifiers ?? []).find((x) => x.type === 'ISBN_13') ??
        (v.industryIdentifiers ?? [])[0]
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

/**
 * Step two of the add flow — the record now exists, so the SAME cover sheet and trope picker the
 * book screen uses run here against the real book, before the reader leaves. Both components persist
 * immediately and are keyed to a real book id (cover ingest scopes Storage by book; every trope
 * gesture writes book_tropes; suggestions query by id), so they can only bind to a saved book — this
 * refine step is how Add reaches full parity with Edit without a parallel implementation.
 */
function RefineAdded({ bookId, onDone }: { bookId: string; onDone: () => void }) {
  const labels = useLabels()
  const { data: books } = useBooks()
  const book = books?.find((b) => b.id === bookId)
  const [dialog, setDialog] = useState<'cover' | 'trope' | null>(null)

  if (!book) {
    return (
      <div
        className="mt-4 skin-panel border border-line p-4 text-[13px] text-muted"
        style={{ background: 'var(--card)' }}
        role="status"
      >
        Saving…
      </div>
    )
  }

  const [g0, g1] = subgenreGradient(book.subgenre, book.genre)
  const tropeCount = book.tropes.length

  return (
    <div className="mt-4 skin-panel border border-line p-4" style={{ background: 'var(--card)' }}>
      <h2
        className="text-[16px] italic text-ink"
        style={{ fontFamily: 'var(--font-display)', fontWeight: 600 }}
      >
        Added — finish the details
      </h2>
      <p className="mb-3 mt-1 text-[13px] text-muted">
        {book.title} is in your library. Fix the cover or tag its {labels.tags.toLowerCase()} now —
        or leave it and edit later.
      </p>
      <div className="flex gap-4">
        <div
          className="aspect-[2/3] w-20 flex-none overflow-hidden rounded-lg border border-line"
          style={{ background: `linear-gradient(150deg, ${g0}, ${g1})` }}
        >
          <CoverImage book={book} thumb />
        </div>
        <div className="flex flex-1 flex-col gap-2">
          <button
            type="button"
            onClick={() => setDialog('cover')}
            className="h-10 rounded-xl border border-line text-[13.5px] font-semibold text-ink"
            style={{ background: 'var(--field)' }}
          >
            Change cover
          </button>
          <button
            type="button"
            onClick={() => setDialog('trope')}
            className="h-10 rounded-xl border border-line text-[13.5px] font-semibold text-ink"
            style={{ background: 'var(--field)' }}
          >
            Tag {labels.tags.toLowerCase()}
            {tropeCount ? ` · ${tropeCount}` : ''}
          </button>
        </div>
      </div>
      <button
        type="button"
        onClick={onDone}
        className="mt-4 h-11 w-full rounded-xl text-[14px] font-semibold"
        style={{
          background: 'linear-gradient(135deg, var(--primary), var(--gold))',
          color: 'var(--on-primary)',
        }}
      >
        Done
      </button>
      {dialog === 'cover' && <CoverSheet book={book} onClose={() => setDialog(null)} />}
      {dialog === 'trope' && <TropePicker book={book} onClose={() => setDialog(null)} />}
    </div>
  )
}

function AddForm({
  hit,
  defaultUnowned = false,
  onAdded,
}: {
  hit: Partial<SearchHit>
  defaultUnowned?: boolean
  onAdded: () => void
}) {
  const intake = useIntake()
  const voice = useVoice()
  // Context-sensitive default: arriving from a wanting context (Discover) assumes wishlist; a plain
  // catalog add leaves possession UNSET rather than forcing "owned" (docs/archive/task-ownership-v2.md).
  // Form-session state only — never persisted as a preference. One exclusive WORD; possessionPatch
  // expands it to the model's flags at submit (docs/archive/task-shelf-model.md).
  const [possession, setPossession] = useState<PossessionState>(
    defaultUnowned ? 'wishlist' : 'unset',
  )
  const qc = useQueryClient()
  const { data: books } = useBooks()
  // genre is a required metadata field, not a romance-only tag — default it to the ROOM the reader
  // is in (add in Grimoire → fantasy, in Marrow → horror), never a hardcoded 'romance'.
  const skinGenre = SKINS[useEffectiveSkin()].genre.toLowerCase()
  const [dup, setDup] = useState<ReviewCandidate | null>(null)
  // Once the record is created we hand off to the refine step (cover + tropes) instead of leaving.
  const [addedId, setAddedId] = useState<string | null>(null)
  const [contribs, setContribs] = useState<Contributor[]>(
    contributorsFromAuthors(hit.authors ?? []),
  )
  const [form, setForm] = useState({
    title: hit.title ?? '',
    series: '',
    position: '',
    genre: skinGenre,
    format: 'Paperback' as string,
    readStatus: 'unset' as Book['readStatus'],
  })
  // Subgenres are a multi-pick; the first selection leads (drives the cover gradient).
  const [subs, setSubs] = useState<string[]>([subgenresForGenre(skinGenre)[0] as string])
  const toggleSub = (s: string) =>
    setSubs((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]))
  const [intensity, setIntensity] = useState(0)
  const [showOtherSubs, setShowOtherSubs] = useState(false)
  // Position gets the same treatment Edit got in #78: one explicit parser, errors shown rather than
  // silently coerced. `Number(v) || ''` turned 0 into "unset" and quietly ate "1.5 (novella)".
  const [positionError, setPositionError] = useState<string | null>(null)
  // Track whether the user edited genre, so enrichment fills it but never overrides their choice.
  const genreEdited = useRef(false)
  // Distinct contributor names across the library, for the editor's autocomplete.
  const authorSuggestions = [
    ...new Set((books ?? []).flatMap((b) => b.contributors.map((c) => c.name)).filter(Boolean)),
  ].sort()
  const labels = useLabels()
  const [cover, setCover] = useState(hit.cover ?? '')
  // Enrichment's alternate editions (real cover URLs) — a pre-save chooser so a wrong fetched cover
  // is fixable before the record even exists; upload/camera/more editions live in the refine step.
  const [alternates, setAlternates] = useState<CoverAlternate[]>([])
  const [coverNote, setCoverNote] = useState<string | null>(null)
  const [enriching, setEnriching] = useState(false)
  const set = (k: keyof typeof form, v: string) => {
    setForm((p) => ({ ...p, [k]: v }))
    if (k === 'position') setPositionError(null)
  }
  const ownSubOptions = [
    ...subs.filter((x) => !subgenresForGenre(form.genre || skinGenre).includes(x)),
    ...subgenresForGenre(form.genre || skinGenre),
  ]
  const [g0, g1] = subgenreGradient(subs[0] ?? '', form.genre || skinGenre)
  // For the preview plate — the placeholder sets the author line from these, so a coverless book
  // in progress reads as itself rather than as "Untitled".
  const { first: previewFirst, last: previewLast } = toFirstLast(contribs)

  async function fetchDetails() {
    setEnriching(true)
    setCoverNote(null)
    const res = await enrichBook({
      title: form.title,
      author: formatAuthors(contribs),
      isbn: hit.isbn,
    })
    setEnriching(false)
    if (!res) {
      setCoverNote('Couldn’t reach the catalog just now — add details by hand, or try again.')
      return
    }
    // Seed contributors from enrichment only if the user hasn't entered any names yet.
    if (res.authors?.length && !contribs.some((c) => c.name.trim()))
      setContribs(contributorsFromAuthors(res.authors))
    // Fill only blanks — never overwrite what the user typed. genre is the mapped primary genre
    // (C1 fill); only applied if the user hasn't edited the genre field themselves.
    setForm((p) => ({
      ...p,
      series: p.series || res.series,
      position: p.position || (res.seriesPosition != null ? String(res.seriesPosition) : ''),
      genre: genreEdited.current ? p.genre : res.genre || p.genre,
    }))
    // Cover — honor the match confidence the backend already scores (ISBN, exact title, author
    // conflict, ambiguity). A HIGH match (or an ISBN scan) auto-fills; anything softer shows the
    // choice rather than silently committing a guess. Alternates are always offered for override.
    const alts = res.alternates ?? []
    setAlternates(alts)
    const strong = res.confidence === 'high' || !!hit.isbn
    if (res.cover && !cover) setCover(res.cover) // tentative preview either way — never overwrites a user pick
    if (!strong && res.cover) {
      setCoverNote(
        alts.length
          ? 'Not a certain match — check the cover and pick the right edition below.'
          : 'Not a certain match — double-check the cover, or change it after adding.',
      )
    }
  }
  const inputClass =
    'h-10 w-full skin-card border border-line px-3 text-[14px] text-ink outline-none'
  const inputStyle = { background: 'var(--field)' } as const

  async function save() {
    if (!form.title.trim()) return
    const parsedPosition = parseNumericField(form.position, SERIES_POSITION)
    if (!parsedPosition.ok) {
      setPositionError(parsedPosition.error)
      return
    }
    const f = form.format.toLowerCase()
    const isEbook = f.includes('ebook') || f.includes('kindle')
    const isAudio = f.includes('audio')
    // Format flags always record the edition in hand OR the edition you're eyeing — on a
    // wishlist add they sit latent (bookOwnedFormats suppresses them until the book is in hand),
    // so flipping to Owned later lands with the right copy already marked.
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
      position: parsedPosition.value ?? '',
      seriesCount: null,
      status: form.series.trim() ? 'ongoing' : 'standalone',
      genre: form.genre.trim() || skinGenre,
      subgenre: subs[0] ?? '',
      subgenres: subs,
      genres: subs.slice(0, 1),
      // tropes are tagged in the refine step via the full picker (book_tropes needs a saved id);
      // no lightweight freeform tags here — the structured trope system is the one source of truth.
      intensity,
      ...possessionPatch(possession),
      owned,
      cover,
      isbn: hit.isbn ?? '',
      format: form.format,
      readStatus: form.readStatus,
      source: 'Owned',
      pub: parsePub(hit.pub ?? ''),
    }
    // Dedup on intake: a strong match folds into the existing record instead of duplicating.
    // With auto-merge off, a match comes back for an inline decision instead.
    const res = await intake(book, 'add')
    if (res.outcome === 'review' && res.review) {
      setDup(res.review)
      return
    }
    // Added or merged — hand off to the refine step against the real book (cover + tropes).
    if (res.bookId) {
      setAddedId(res.bookId)
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

  if (addedId) return <RefineAdded bookId={addedId} onDone={onAdded} />

  return (
    <div className="mt-4 skin-panel border border-line p-4" style={{ background: 'var(--card)' }}>
      <div className="flex gap-4">
        <div className="flex-none">
          <div
            className="aspect-[2/3] w-20 overflow-hidden rounded-lg border border-line"
            style={{ background: `linear-gradient(150deg, ${g0}, ${g1})` }}
          >
            {/* Through CoverImage so a Google "no image" plate is rejected on load, same as the grid —
                and UNCONDITIONALLY, so a coverless book gets the skin's designed plate here exactly as
                it does everywhere else. Rendering this conditionally left the gradient bare on the one
                screen and made the genre tint visible in Add and nowhere after it
                (docs/decisions/0003-cover-gradient-latent-not-default.md). */}
            <CoverImage
              book={{ title: form.title, first: previewFirst, last: previewLast, cover }}
              thumb
            />
          </div>
          <button
            type="button"
            onClick={() => void fetchDetails()}
            disabled={enriching}
            className="mt-1.5 rounded-full border border-line px-2.5 py-1 text-[11px] font-semibold text-ink disabled:opacity-50"
            style={{ background: 'var(--field)' }}
          >
            {enriching ? '…' : '🔎 Fetch details'}
          </button>
        </div>
        <div className="flex-1 space-y-2">
          <input
            value={form.title}
            onChange={(e) => set('title', e.target.value)}
            placeholder="Title"
            className={inputClass}
            style={inputStyle}
          />
          <ContributorEditor
            value={contribs}
            onChange={setContribs}
            suggestions={authorSuggestions}
          />
        </div>
      </div>

      {/* Pick a cover — enrichment's alternate editions, before saving (upload/camera come after add). */}
      {alternates.length > 0 && (
        <div className="mt-3">
          <div className="mb-1.5 text-[11px] uppercase tracking-[0.15em] text-muted">
            Pick a cover
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {alternates.map((a, i) => (
              <button
                key={a.isbn13 || a.cover || i}
                type="button"
                onClick={() => setCover(a.cover)}
                aria-label={`Use the ${a.source} cover`}
                aria-pressed={cover === a.cover}
                className="h-[4.5rem] w-12 flex-none overflow-hidden rounded"
                style={{
                  border: cover === a.cover ? '2px solid var(--primary)' : '1px solid var(--line)',
                }}
              >
                {/* through CoverImage so a "no image" plate never poses as a pickable cover */}
                <CoverImage book={{ title: form.title, cover: a.cover }} thumb />
              </button>
            ))}
          </div>
        </div>
      )}
      {coverNote && <p className="mt-1.5 text-[12px] text-muted">{coverNote}</p>}

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
        <input
          value={form.series}
          onChange={(e) => set('series', e.target.value)}
          placeholder="Series"
          className={inputClass}
          style={inputStyle}
        />
        <input
          value={form.position}
          onChange={(e) => set('position', e.target.value)}
          placeholder="Book #"
          inputMode="decimal"
          aria-invalid={!!positionError}
          className={inputClass}
          style={inputStyle}
        />
        <select
          value={form.genre}
          onChange={(e) => {
            genreEdited.current = true
            set('genre', e.target.value)
          }}
          aria-label={labels.genre}
          className={inputClass}
          style={inputStyle}
        >
          {form.genre && !CORE_GENRES.some((g) => g.toLowerCase() === form.genre) && (
            <option value={form.genre}>{form.genre}</option>
          )}
          {CORE_GENRES.map((g) => (
            <option key={g} value={g.toLowerCase()}>
              {g}
            </option>
          ))}
        </select>
        <select
          value={form.format}
          onChange={(e) => set('format', e.target.value)}
          className={inputClass}
          style={inputStyle}
        >
          {FORMATS.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        <select
          value={form.readStatus}
          onChange={(e) => set('readStatus', e.target.value as Book['readStatus'])}
          className={inputClass}
          style={inputStyle}
        >
          {READ_STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {readStatusLabel(s)}
            </option>
          ))}
        </select>
      </div>
      {positionError && (
        <p role="alert" className="mt-1.5 text-[12px]" style={{ color: 'var(--accent-ink)' }}>
          {positionError}
        </p>
      )}

      {/* Subgenres — multi-pick from the CHOSEN genre's shelf (selections survive a genre switch),
          with every other genre's shelf a disclosure away: a horror-romance is a real shape, and
          storage (flat text[]) always allowed it — only this vocabulary didn't. */}
      <div className="mt-3">
        <div className="mb-1.5 text-[11px] uppercase tracking-[0.15em] text-muted">Subgenres</div>
        <div className="flex flex-wrap gap-1.5">
          {ownSubOptions.map((s) => (
            <Chip key={s} active={subs.includes(s)} onClick={() => toggleSub(s)}>
              {s}
            </Chip>
          ))}
        </div>
        <div className="mt-2">
          <button
            type="button"
            onClick={() => setShowOtherSubs((v) => !v)}
            aria-expanded={showOtherSubs}
            className="text-[12px] font-semibold text-primary"
          >
            {showOtherSubs ? 'Hide other genres’ subgenres' : 'Other genres’ subgenres…'}
          </button>
          {showOtherSubs && (
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {otherGenreSubgenres(form.genre || skinGenre)
                .filter((x) => !ownSubOptions.includes(x))
                .map((s) => (
                  <Chip key={s} active={subs.includes(s)} onClick={() => toggleSub(s)}>
                    {s}
                  </Chip>
                ))}
            </div>
          )}
        </div>
        {subs.length > 1 && (
          <p className="mt-1.5 text-[11px] text-muted">
            First pick leads — it sets the book’s gradient.
          </p>
        )}
      </div>

      {/* Ownership — a record no longer implies possession; most of a TBR is books you don't own. */}
      <div className="mt-3">
        <div className="mb-1.5 text-[11px] uppercase tracking-[0.15em] text-muted">Ownership</div>
        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Ownership">
          {(
            [
              ['owned', voice.ownIt],
              ['borrowed', voice.borrowedIt],
              ['wishlist', voice.wantIt],
              ['unset', voice.unsetIt],
            ] as const
          ).map(([value, sub]) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={possession === value}
              aria-label={OWNERSHIP_LABELS[value]}
              onClick={() => setPossession(value)}
              className="skin-control border px-3 py-1.5 text-center leading-tight"
              style={
                possession === value
                  ? {
                      background: 'var(--accent-fill)',
                      color: 'var(--on-primary)',
                      borderColor: 'transparent',
                    }
                  : {
                      background: 'var(--field)',
                      color: 'var(--muted)',
                      borderColor: 'var(--line)',
                    }
              }
            >
              {/* plain word tells you what it sets; the skin voice is the flavor subtitle */}
              <span className="block text-[12.5px] font-semibold">{OWNERSHIP_LABELS[value]}</span>
              <span className="block text-[10px] font-normal italic">{sub}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="mt-3 flex items-center gap-2">
        <span className="text-[11px] uppercase tracking-[0.15em] text-muted">
          {labels.intensity}
        </span>
        {[1, 2, 3, 4, 5].map((i) => (
          <button
            key={i}
            type="button"
            onClick={() => setIntensity(intensity === i ? 0 : i)}
            aria-label={`${labels.intensity} ${i}`}
            aria-pressed={i <= intensity}
            style={{ opacity: i <= intensity ? 1 : 0.3 }}
          >
            {labels.intensityGlyph}
          </button>
        ))}
      </div>

      {dup && (
        <div
          className="mt-4 skin-card border border-line p-3 text-[13px]"
          style={{ background: 'var(--field)' }}
        >
          <p className="text-ink">
            You may already have <span className="font-semibold">{dup.existingTitle}</span>
            {dup.existingAuthor ? ` · ${dup.existingAuthor}` : ''}.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void resolveDup('merge')}
              className="rounded-full px-3 py-1.5 text-[12.5px] font-semibold text-on-primary"
              style={{ background: 'var(--accent-fill)' }}
            >
              Merge into it
            </button>
            <button
              type="button"
              onClick={() => void resolveDup('keep_both')}
              className="rounded-full border border-line px-3 py-1.5 text-[12.5px] font-semibold text-ink"
              style={{ background: 'var(--card)' }}
            >
              Keep both
            </button>
            <button
              type="button"
              onClick={() => setDup(null)}
              className="rounded-full px-3 py-1.5 text-[12.5px] font-semibold text-muted"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={() => void save()}
        className="mt-4 h-11 w-full rounded-xl text-[14px] font-semibold"
        style={{
          background: 'linear-gradient(135deg, var(--primary), var(--gold))',
          color: 'var(--on-primary)',
        }}
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
        const res = await intake(
          {
            title: hit.title,
            first: np.length > 1 ? (np[0] ?? '') : '',
            last: np.length > 1 ? np.slice(1).join(' ') : (np[0] ?? ''),
            status: 'standalone',
            genre: skinGenre,
            subgenre: bulkSub,
            subgenres: [bulkSub],
            genres: [bulkSub],
            tags: [],
            intensity: null,
            owned: { physical: 'paperback', ebook: false, audiobook: false },
            cover: hit.cover,
            isbn: hit.isbn,
            readStatus: 'Unread',
            source: 'Owned',
            pub: parsePub(hit.pub),
          },
          'add',
        )
        if (res.outcome === 'merged') merged++
        else added++
      } catch {
        /* skip lines that fail */
      }
    }
    setBusy(false)
    setStatus(
      `Added ${added}${merged ? ` · merged ${merged} into existing` : ''} of ${lines.length}.`,
    )
    setText('')
  }

  return (
    <details
      className="mt-4 skin-panel border border-line p-4"
      style={{ background: 'var(--card)' }}
    >
      <summary className="cursor-pointer text-[14px] font-semibold text-ink">
        Bulk add — paste a list
      </summary>
      <p className="mb-2 mt-2 text-[12.5px] text-muted">
        One title or ISBN per line. Each is looked up and added.
      </p>
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
          style={{
            background: 'linear-gradient(135deg, var(--primary), var(--gold))',
            color: 'var(--on-primary)',
          }}
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
      setScanStatus(
        'Barcode scanning isn’t supported in this browser — search by title or ISBN below.',
      )
      return
    }
    try {
      setScanStatus('Requesting camera…')
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
      })
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
      setScanStatus(
        `Camera unavailable (${(e as Error).name || 'blocked'}). Search by title or ISBN below.`,
      )
    }
  }

  return (
    <section className="mx-auto w-full max-w-2xl px-4 py-6 sm:px-6">
      <h1
        className="text-[22px] italic text-ink"
        style={{ fontFamily: 'var(--font-display)', fontWeight: 600 }}
      >
        Add a book
      </h1>
      <p className="mb-4 text-[13px] text-muted">
        Scan a barcode, search by title or ISBN, or add manually.
      </p>

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
          style={{
            background: 'linear-gradient(135deg, var(--primary), var(--gold))',
            color: 'var(--on-primary)',
          }}
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
        {/* A peer of Search and Scan, as the intro copy has always promised. It used to appear ONLY
            in the results-empty branch — so a search that returned the WRONG books (rather than
            none) left no way in, and the reader had to adopt a wrong hit or search gibberish to
            force the empty state. The form already accepts a bare { title }. */}
        <button
          type="button"
          onClick={() => setPicked({ title: q.trim() })}
          className="h-11 rounded-full border border-line px-5 text-[14px] font-semibold text-ink"
          style={{ background: 'var(--card)' }}
        >
          Add manually
        </button>
      </div>

      {scanStatus && (
        <div
          className="mt-3 skin-card border border-line p-3 text-[13px] text-muted"
          style={{ background: 'var(--card)' }}
        >
          {scanStatus}
        </div>
      )}
      <video
        ref={videoRef}
        className={`mt-3 w-full rounded-xl ${streamRef.current ? '' : 'hidden'}`}
        muted
        playsInline
      />

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
                <div
                  className="h-16 w-11 flex-none overflow-hidden rounded border border-line"
                  style={{ background: 'var(--chip)' }}
                >
                  {/* through CoverImage so a Google "no image" plate never renders as a result cover */}
                  {it.cover && <CoverImage book={{ title: it.title, cover: it.cover }} thumb />}
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
              <button
                type="button"
                onClick={() => setPicked({ title: q })}
                className="font-semibold text-primary"
              >
                Add it manually
              </button>
              .
            </p>
          )}
        </div>
      )}

      {picked && (
        <AddForm
          hit={picked}
          defaultUnowned={!!prefill.want}
          onAdded={() => void navigate({ to: '/library' })}
        />
      )}

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
  /** arrival from a wanting context (Discover, a shelf/TBR) — the ownership toggle defaults to
   *  "I want to read this" instead of "I own this" */
  want?: boolean
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
    if (s.want === true || s.want === 'true') out.want = true
    return out
  },
})
