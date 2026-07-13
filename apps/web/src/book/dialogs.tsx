import { useState, type ReactNode } from 'react'
import { authorOf, bookSubgenres, canonicalTag, CORE_GENRES, deriveBoyfriend, fromFirstLast, SERIES_STATUS_LABELS, SERIES_STATUS_VALUES, type Book, type Contributor, type SeriesStatus } from '@reverie/core'
import { Modal } from '../components/Modal'
import { Chip } from '../components/Chip'
import { Stars } from '../components/Stars'
import { FORMATS, subgenresForGenre, tropeGroupsForGenre } from '../library/constants'
import { useBooks, useUpdateBook } from '../data/books'
import { useSetContributors } from '../data/contributors'
import { useAddRead } from '../data/reads'
import { usePerformMerge } from '../data/mergeBooks'
import { useLabels } from '../skin/labels'
import { ContributorEditor } from './ContributorEditor'

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

export function TropePicker({ book, onClose }: { book: Book; onClose: () => void }) {
  const updateBook = useUpdateBook()
  const { data: books } = useBooks()
  const labels = useLabels()
  const [draft, setDraft] = useState('')
  // The BOOK'S genre picks the baseline vocabulary (a mystery gets Locked Room, not Fated Mates);
  // the Universal group rides along, and the reader's own free tags always show as chips too.
  const groups = tropeGroupsForGenre(book.genre)
  const vocabulary = Object.values(groups).flat()
  const libraryTags = [...new Set((books ?? []).flatMap((b) => b.tags))]
  const inGroups = new Set(vocabulary.map((t) => t.toLowerCase()))
  const yourTags = [...new Set([...book.tags, ...libraryTags])]
    .filter((t) => !inGroups.has(t.toLowerCase()))
    .sort((a, b) => a.localeCompare(b))
  const toggle = (t: string) => {
    const tags = book.tags.includes(t) ? book.tags.filter((x) => x !== t) : [...book.tags, t]
    updateBook.mutate({
      id: book.id,
      patch: { tags, boyfriend: deriveBoyfriend({ tags, subgenre: book.subgenre }) },
    })
  }
  const addDraft = () => {
    // canonicalize against the genre vocabulary + the library's own tags, so "e2l" and
    // "locked room" converge on the chips everyone else uses
    const t = canonicalTag(draft, [...vocabulary, ...libraryTags])
    setDraft('')
    if (t && !book.tags.includes(t)) toggle(t)
  }
  return (
    <Modal title={`Tag ${labels.tags.toLowerCase()}`} onClose={onClose} wide>
      {Object.entries(groups).map(([group, list]) => (
        <div key={group} className="mb-4">
          <div className="mb-1.5 text-[11px] uppercase tracking-[0.2em] text-muted">{group}</div>
          <div className="flex flex-wrap gap-1.5">
            {list.map((t) => (
              <Chip key={t} active={book.tags.includes(t)} onClick={() => toggle(t)}>
                {t}
              </Chip>
            ))}
          </div>
        </div>
      ))}
      {yourTags.length > 0 && (
        <div className="mb-4">
          <div className="mb-1.5 text-[11px] uppercase tracking-[0.2em] text-muted">Your {labels.tags.toLowerCase()}</div>
          <div className="flex flex-wrap gap-1.5">
            {yourTags.map((t) => (
              <Chip key={t} active={book.tags.includes(t)} onClick={() => toggle(t)}>
                {t}
              </Chip>
            ))}
          </div>
        </div>
      )}
      <div className="flex gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              addDraft()
            }
          }}
          placeholder={`Add your own ${labels.tag}…`}
          aria-label={`Add a ${labels.tag}`}
          className={fieldClass}
          style={fieldStyle}
        />
        <button
          type="button"
          onClick={addDraft}
          disabled={!draft.trim()}
          className="h-10 flex-none rounded-xl border border-line px-4 text-[13px] font-semibold text-ink disabled:opacity-40"
          style={{ background: 'var(--card)' }}
        >
          Add
        </button>
      </div>
    </Modal>
  )
}

export function LogReadForm({ book, onClose }: { book: Book; onClose: () => void }) {
  const addRead = useAddRead(book.id)
  const updateBook = useUpdateBook()
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [format, setFormat] = useState(book.format || 'Paperback')
  const [rating, setRating] = useState(0)
  const [notes, setNotes] = useState('')

  function save() {
    addRead.mutate({ date, format, rating, notes: notes.trim() })
    updateBook.mutate({ id: book.id, patch: rating ? { readStatus: 'Read', rating } : { readStatus: 'Read' } })
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
    updateBook.mutate({
      id: book.id,
      patch: {
        series: f.series,
        position: f.position.trim() === '' ? '' : Number(f.position) || '',
        seriesCount: numOrNull(f.seriesCount),
        status: f.status as SeriesStatus,
        genre: f.genre,
        subgenres: subs,
        subgenre: subs[0] ?? '',
        format: f.format,
        pub: { y: numOrNull(f.pubY), m: numOrNull(f.pubM), d: numOrNull(f.pubD) },
      },
    })
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
  const candidates = allBooks
    .filter((b) => b.id !== book.id)
    .filter((b) => `${b.title} ${authorOf(b)}`.toLowerCase().includes(q.toLowerCase()))
    .slice(0, 25)

  function doMerge(loser: Book) {
    if (
      !window.confirm(
        `Merge “${loser.title}” into “${book.title}”? “${loser.title}” will be removed and its info folded in.`,
      )
    )
      return
    merge.mutate({ primary: book, loser }, { onSuccess: onClose })
  }

  return (
    <Modal title="Merge into this book" onClose={onClose}>
      <p className="-mt-2 mb-3 text-[13px] text-muted">
        Pick a duplicate to fold into “{book.title}”. Its reads, tropes, rating, cover, and list
        memberships are merged in, then it’s removed.
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
              onClick={() => doMerge(b)}
              disabled={merge.isPending}
              className="flex w-full items-center justify-between gap-3 rounded-xl border border-line px-3 py-2 text-left disabled:opacity-50"
              style={{ background: 'var(--field)' }}
            >
              <span>
                <span className="text-[14px] font-semibold text-ink">{b.title}</span>
                <span className="block text-[12px] text-muted">{authorOf(b) || 'Unknown author'}</span>
              </span>
              <span className="text-[12px] font-semibold text-primary">Merge →</span>
            </button>
          </li>
        ))}
      </ul>
    </Modal>
  )
}
