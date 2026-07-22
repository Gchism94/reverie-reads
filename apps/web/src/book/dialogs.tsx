import { useState, type ReactNode } from 'react'
import { authorOf, bookSubgenres, CORE_GENRES, fromFirstLast, mergeBooks, SERIES_STATUS_LABELS, SERIES_STATUS_VALUES, type Book, type Contributor, type SeriesStatus } from '@reverie/core'
import { Modal } from '../components/Modal'
import { Chip } from '../components/Chip'
import { Stars } from '../components/Stars'
import { FORMATS, OWNERSHIP_LABELS, subgenresForGenre } from '../library/constants'
import { useBooks, useUpdateBook } from '../data/books'
import { useSetContributors } from '../data/contributors'
import { useSyncBookSeries } from '../data/series'
import { useAddRead } from '../data/reads'
import { usePerformMerge } from '../data/mergeBooks'
import { maybeChainPrompt } from '../lib/chainPrompt'
import { ContributorEditor } from './ContributorEditor'
import { MoodPicker } from '../components/MoodPicker'

/** Distinct contributor names across the library, for autocomplete. */
function useAuthorSuggestions(): string[] {
  const { data: books } = useBooks()
  const names = new Set<string>()
  for (const b of books ?? []) for (const c of b.contributors) if (c.name) names.add(c.name)
  return [...names].sort((a, b) => a.localeCompare(b))
}

const fieldClass =
  'h-10 w-full rounded-xl border border-line px-3 text-[14px] text-ink outline-none'
const fieldStyle = { background: 'var(--field)' } as const

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] uppercase tracking-[0.15em] text-muted">{label}</span>
      {children}
    </label>
  )
}

export function LogReadForm({ book, onClose }: { book: Book; onClose: () => void }) {
  const addRead = useAddRead(book.id)
  const { data: books } = useBooks()
  const updateBook = useUpdateBook()
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [format, setFormat] = useState(book.format || 'Paperback')
  const [rating, setRating] = useState(0)
  const [notes, setNotes] = useState('')

  function save() {
    addRead.mutate({ date, format, rating, notes: notes.trim() })
    updateBook.mutate({ id: book.id, patch: rating ? { readStatus: 'Read', rating } : { readStatus: 'Read' } })
    void maybeChainPrompt(book, books ?? [])
    onClose()
  }

  return (
    <Modal title="Log a read" onClose={onClose}>
      <p className="-mt-2 mb-4 text-[13px] text-muted">{book.title} — add a reread anytime.</p>
      <div className="flex flex-col gap-3">
        <Field label="Date finished">
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={fieldClass} style={fieldStyle} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Format">
            <select value={format} onChange={(e) => setFormat(e.target.value)} className={fieldClass} style={fieldStyle}>
              {FORMATS.map((f) => (
                <option key={f}>{f}</option>
              ))}
            </select>
          </Field>
          <Field label="Rating">
            <div className="flex h-10 items-center">
              <Stars value={rating} onChange={setRating} />
            </div>
          </Field>
        </div>
        <Field label="Notes (optional)">
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            placeholder="Thoughts on this read…"
            className="w-full rounded-xl border border-line p-3 text-[14px] text-ink outline-none"
            style={fieldStyle}
          />
        </Field>
        <button
          type="button"
          onClick={save}
          className="mt-1 h-11 rounded-xl text-[14px] font-semibold"
          style={{ background: 'linear-gradient(135deg, var(--primary), var(--gold))', color: 'var(--on-primary)' }}
        >
          Save to read log
        </button>
      </div>
    </Modal>
  )
}

export function EditDetails({
  book,
  onClose,
  onChangeCover,
}: {
  book: Book
  onClose: () => void
  /** modest "change cover" affordance — swaps this dialog for the cover sheet */
  onChangeCover?: () => void
}) {
  const updateBook = useUpdateBook()
  const setContributors = useSetContributors()
  const syncBookSeries = useSyncBookSeries()
  const suggestions = useAuthorSuggestions()
  const [contribs, setContribs] = useState<Contributor[]>(
    book.contributors.length ? book.contributors : fromFirstLast(book.first, book.last),
  )
  const [f, setF] = useState({
    series: book.series,
    position: book.position === '' ? '' : String(book.position),
    seriesCount: book.seriesCount == null ? '' : String(book.seriesCount),
    status: book.status as string,
    genre: book.genre,
    format: book.format,
    pubY: book.pub.y == null ? '' : String(book.pub.y),
    pubM: book.pub.m == null ? '' : String(book.pub.m),
    pubD: book.pub.d == null ? '' : String(book.pub.d),
  })
  // Subgenres are a multi-pick; the first selection leads (it colors the gradient). Picks made
  // under one genre survive a genre switch — nothing is silently dropped.
  const [subs, setSubs] = useState<string[]>(() => bookSubgenres(book))
  const toggleSub = (s: string) =>
    setSubs((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]))
  const subVocab = subgenresForGenre(f.genre)
  const subOptions = [...subs.filter((s) => !subVocab.includes(s)), ...subVocab]
  const set = (k: keyof typeof f, v: string) => setF((prev) => ({ ...prev, [k]: v }))
  const numOrNull = (v: string) => (v.trim() === '' ? null : Number(v) || null)

  function save() {
    if (!f.genre) return
    const position = f.position.trim() === '' ? '' : Number(f.position) || ''
    updateBook.mutate({
      id: book.id,
      patch: {
        series: f.series,
        position,
        seriesCount: numOrNull(f.seriesCount),
        status: f.status as SeriesStatus,
        genre: f.genre,
        subgenres: subs,
        subgenre: subs[0] ?? '',
        format: f.format,
        pub: { y: numOrNull(f.pubY), m: numOrNull(f.pubM), d: numOrNull(f.pubD) },
      },
    })
    // Reconcile the SERIES side so the series page agrees: a position edit writes through to the
    // linked entry, and clearing/changing the series detaches the book (keeping the slot as a ghost).
    syncBookSeries.mutate({ book, newSeries: f.series, newPosition: typeof position === 'number' ? position : null })
    // Contributors persist through the RPC (it also refreshes the primary first/last + byline).
    setContributors.mutate({ bookId: book.id, contributors: contribs })
    onClose()
  }

  return (
    <Modal title="Edit details" onClose={onClose} wide>
      {onChangeCover && (
        <div className="mb-3">
          <button type="button" onClick={onChangeCover} className="text-[12.5px] font-semibold text-primary">
            Change cover…
          </button>
        </div>
      )}
      <div className="mb-3">
        <span className="mb-1 block text-[11px] uppercase tracking-[0.15em] text-muted">Contributors</span>
        <ContributorEditor value={contribs} onChange={setContribs} suggestions={suggestions} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Series">
          <input value={f.series} onChange={(e) => set('series', e.target.value)} className={fieldClass} style={fieldStyle} />
        </Field>
        <Field label="Position">
          <input value={f.position} onChange={(e) => set('position', e.target.value)} className={fieldClass} style={fieldStyle} />
        </Field>
        <Field label="Series length">
          <input value={f.seriesCount} onChange={(e) => set('seriesCount', e.target.value)} placeholder="None set" className={fieldClass} style={fieldStyle} />
        </Field>
        <Field label="Series status">
          {/* the SERIES' publication status — the reader's own progress lives in reads */}
          <select value={f.status} onChange={(e) => set('status', e.target.value)} className={fieldClass} style={fieldStyle}>
            {SERIES_STATUS_VALUES.map((s) => (
              <option key={s} value={s}>
                {SERIES_STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Genre">
          <select value={f.genre} onChange={(e) => set('genre', e.target.value)} className={fieldClass} style={fieldStyle}>
            {!f.genre && <option value="">Choose a genre…</option>}
            {f.genre && !CORE_GENRES.some((g) => g.toLowerCase() === f.genre) && (
              <option value={f.genre}>{f.genre}</option>
            )}
            {CORE_GENRES.map((g) => (
              <option key={g} value={g.toLowerCase()}>
                {g}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Format">
          <select value={f.format} onChange={(e) => set('format', e.target.value)} className={fieldClass} style={fieldStyle}>
            {FORMATS.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </Field>
      </div>
      <div className="mt-3">
        <span className="mb-1 block text-[11px] uppercase tracking-[0.15em] text-muted">Subgenres</span>
        {f.genre ? (
          <div className="flex flex-wrap gap-1.5">
            {subOptions.map((s) => (
              <Chip key={s} active={subs.includes(s)} onClick={() => toggleSub(s)}>
                {s}
              </Chip>
            ))}
          </div>
        ) : (
          <p className="text-[13px] text-muted">
            This book hasn’t chosen its genre yet — pick one above and its subgenre shelf appears.
          </p>
        )}
        {subs.length > 1 && (
          <p className="mt-1.5 text-[11px] text-muted">First pick leads — it sets the book’s gradient.</p>
        )}
      </div>
      {/* Mood — the reader's own impression (how it landed). Reader-assigned, never derived; assigns
          persist immediately (book_moods), independent of this form's Save. */}
      <div className="mt-3">
        <span className="mb-1 block text-[11px] uppercase tracking-[0.15em] text-muted">Mood</span>
        <p className="mb-1.5 text-[12px] text-muted">How did it land on you? Optional, and yours alone.</p>
        <MoodPicker book={book} />
      </div>
      <div className="mt-3 grid grid-cols-3 gap-3">
        <Field label="Pub year">
          <input value={f.pubY} onChange={(e) => set('pubY', e.target.value)} className={fieldClass} style={fieldStyle} />
        </Field>
        <Field label="Month">
          <input value={f.pubM} onChange={(e) => set('pubM', e.target.value)} className={fieldClass} style={fieldStyle} />
        </Field>
        <Field label="Day">
          <input value={f.pubD} onChange={(e) => set('pubD', e.target.value)} className={fieldClass} style={fieldStyle} />
        </Field>
      </div>
      <button
        type="button"
        onClick={save}
        disabled={!f.genre}
        className="mt-4 h-11 w-full rounded-xl text-[14px] font-semibold disabled:opacity-40"
        style={{ background: 'linear-gradient(135deg, var(--primary), var(--gold))', color: 'var(--on-primary)' }}
      >
        {f.genre ? 'Save details' : 'Pick a genre to save'}
      </button>
    </Modal>
  )
}

/** Union two books' inline refs (moods/tropes) by id, preserving order primary-first. */
function unionRefs<T extends { id: string; name: string }>(a: readonly T[], b: readonly T[]): T[] {
  const byId = new Map<string, T>()
  for (const x of [...a, ...b]) if (!byId.has(x.id)) byId.set(x.id, x)
  return [...byId.values()]
}

/** The list of formats a merged copy is marked as owning, for the diff. */
function ownedFormatList(owned: Book['owned']): string[] {
  const out: string[] = []
  if (owned.physical === 'hardcover') out.push('Hardcover')
  else if (owned.physical === 'paperback') out.push('Paperback')
  else if (owned.physical === true) out.push('Physical')
  if (owned.ebook) out.push('eBook')
  if (owned.audiobook) out.push('Audiobook')
  return out
}

function DiffRow({ label, children, changed }: { label: string; children: ReactNode; changed?: boolean }) {
  return (
    <div className="flex items-start gap-3 py-1.5">
      <span className="w-24 flex-none text-[11px] uppercase tracking-[0.12em] text-muted">{label}</span>
      <span className="flex-1 text-[13px] text-ink">{children}</span>
      {changed && <span className="flex-none text-[10px] font-semibold uppercase tracking-wide" style={{ color: 'var(--accent-ink)' }}>updated</span>}
    </div>
  )
}

/**
 * The pre-merge diff (docs/task-manual-merge.md §2). Merging is destructive and there is no undo, so
 * the reader sees the exact outcome first: which record survives, the four-state ownership union, the
 * format flags, and every mood/trope + read that carries over. The union comes from the SAME core
 * merge engine the RPC applies — no second merge path.
 */
function MergePreview({
  primary,
  loser,
  pending,
  onBack,
  onConfirm,
  onClose,
}: {
  primary: Book
  loser: Book
  pending: boolean
  onBack: () => void
  onConfirm: () => void
  onClose: () => void
}) {
  const merged = mergeBooks({ books: [primary, loser], tbrs: [], collections: [] }, primary.id, [loser.id]).books[0] ?? primary
  const moods = unionRefs(primary.moods, loser.moods)
  const tropes = unionRefs(primary.tropes, loser.tropes)
  const formats = ownedFormatList(merged.owned)
  const ownershipChanged = merged.ownership !== primary.ownership
  const titleDropped = loser.title.trim() !== primary.title.trim()

  return (
    <Modal title="Review the merge" onClose={onClose}>
      <p className="-mt-2 mb-3 text-[13px] text-muted">
        <span className="font-semibold text-ink">{loser.title}</span> folds into{' '}
        <span className="font-semibold text-ink">{primary.title}</span>, then it’s removed. This can’t
        be undone — check what survives.
      </p>

      <div className="rounded-xl border border-line p-3" style={{ background: 'var(--field)' }}>
        <DiffRow label="Survivor">
          <span className="font-semibold">{merged.title}</span>
          <span className="block text-[12px] text-muted">{authorOf(merged) || authorOf(primary) || 'Unknown author'}</span>
        </DiffRow>
        <DiffRow label="Ownership" changed={ownershipChanged}>
          {OWNERSHIP_LABELS[merged.ownership]}
          {ownershipChanged && <span className="text-[12px] text-muted"> — was {OWNERSHIP_LABELS[primary.ownership]}, took the stronger</span>}
        </DiffRow>
        <DiffRow label="Formats">{formats.length ? formats.join(' · ') : <span className="text-muted">none marked</span>}</DiffRow>
        <DiffRow label="Series">
          {merged.series ? `${merged.series}${merged.position !== '' ? ` #${merged.position}` : ''}` : <span className="text-muted">none</span>}
        </DiffRow>
        <DiffRow label="Cover">
          {merged.cover ? (merged.cover === primary.cover ? 'kept this one’s' : 'taken from the other') : <span className="text-muted">none</span>}
        </DiffRow>
        <DiffRow label="Rating">{merged.rating ? `${merged.rating}★` : <span className="text-muted">unrated</span>}</DiffRow>
        <DiffRow label="Reads">{merged.reads.length ? `${merged.reads.length} kept (from both)` : <span className="text-muted">none</span>}</DiffRow>
        <DiffRow label="Moods">
          {moods.length ? moods.map((m) => m.name).join(', ') : <span className="text-muted">none</span>}
        </DiffRow>
        <DiffRow label="Tropes">
          {tropes.length ? tropes.map((t) => t.name).join(', ') : <span className="text-muted">none</span>}
        </DiffRow>
      </div>

      <p className="mt-3 text-[12px] text-muted">
        {titleDropped ? `“${loser.title}” (the other title) is dropped. ` : ''}
        List memberships from both move to the survivor.
      </p>

      <div className="mt-4 flex gap-2">
        <button type="button" onClick={onBack} disabled={pending} className="h-11 flex-1 rounded-xl border border-line text-[13.5px] font-semibold text-ink disabled:opacity-50" style={{ background: 'var(--card)' }}>
          Back
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={pending}
          className="h-11 flex-1 rounded-xl text-[14px] font-semibold disabled:opacity-50"
          style={{ background: 'linear-gradient(135deg, var(--primary), var(--gold))', color: 'var(--on-primary)' }}
        >
          {pending ? 'Merging…' : 'Merge — no undo'}
        </button>
      </div>
    </Modal>
  )
}

export function MergeDialog({
  book,
  allBooks,
  onClose,
}: {
  book: Book
  allBooks: Book[]
  onClose: () => void
}) {
  const merge = usePerformMerge()
  const [q, setQ] = useState('')
  const [loser, setLoser] = useState<Book | null>(null)
  const candidates = allBooks
    .filter((b) => b.id !== book.id)
    .filter((b) => `${b.title} ${authorOf(b)}`.toLowerCase().includes(q.toLowerCase()))
    .slice(0, 25)

  if (loser)
    return (
      <MergePreview
        primary={book}
        loser={loser}
        pending={merge.isPending}
        onBack={() => setLoser(null)}
        onClose={onClose}
        onConfirm={() => merge.mutate({ primary: book, loser }, { onSuccess: onClose })}
      />
    )

  return (
    <Modal title="Merge into this book" onClose={onClose}>
      <p className="-mt-2 mb-3 text-[13px] text-muted">
        Pick the duplicate to fold into “{book.title}”. You’ll see exactly what survives before
        anything changes — its reads, moods, tropes, rating, cover, and list memberships merge in.
      </p>
      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search your library…"
        aria-label="Search for a book to merge"
        className={fieldClass}
        style={fieldStyle}
      />
      <ul className="mt-3 flex max-h-[50dvh] flex-col gap-1.5 overflow-y-auto">
        {candidates.map((b) => (
          <li key={b.id}>
            <button
              type="button"
              onClick={() => setLoser(b)}
              className="flex w-full items-center justify-between gap-3 rounded-xl border border-line px-3 py-2 text-left"
              style={{ background: 'var(--field)' }}
            >
              <span>
                <span className="text-[14px] font-semibold text-ink">{b.title}</span>
                <span className="block text-[12px] text-muted">{authorOf(b) || 'Unknown author'}</span>
              </span>
              <span className="text-[12px] font-semibold text-primary">Compare →</span>
            </button>
          </li>
        ))}
      </ul>
    </Modal>
  )
}
