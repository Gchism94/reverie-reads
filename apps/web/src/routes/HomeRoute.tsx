import { useEffect, useState } from 'react'
import { createRoute, useNavigate } from '@tanstack/react-router'
import { authorOf, isOwnedBook, type Book } from '@reverie/core'
import { rootRoute } from './RootRoute'
import { CoverImage } from '../components/CoverImage'
import { useBooks, useUpdateBook } from '../data/books'
import { useAllReads } from '../data/reads'
import { useLists, type UiList } from '../data/lists'
import { useAddListItem, useAllListItems } from '../data/listItems'
import { LibraryPicker } from '../components/LibraryPicker'
import { ExternalSearchSheet } from '../components/ExternalSearchSheet'
import { Modal } from '../components/Modal'
import { useProfile, useUpdateProfile } from '../data/profile'
import { SpineShelf } from '../components/SpineShelf'
import { LogReadForm } from '../book/dialogs'
import { MONTHS } from '../library/constants'
import { Frame, ProgressMeter, SectionHeader, SignatureRing, StatusTag } from '../components/Structure'
import { hasOnboarded } from './OnboardingRoute'
import { useVoice } from '../skin/labels'
import { BookmarkGlyph } from '../components/BookmarkGlyph'

const YEAR = new Date().getFullYear()

function greeting(): string {
  const h = new Date().getHours()
  if (h < 5) return 'Up late reading?'
  if (h < 12) return 'Good morning'
  if (h < 18) return 'Good afternoon'
  return 'Good evening'
}

function HomeScreen() {
  const navigate = useNavigate()
  const { data: books } = useBooks()
  const { data: reads } = useAllReads()
  const { data: lists } = useLists()
  const { data: items } = useAllListItems()
  const { data: profile } = useProfile()
  const updateBook = useUpdateBook()
  const updateProfile = useUpdateProfile()
  const voice = useVoice()
  const addItem = useAddListItem()
  const [finishing, setFinishing] = useState<Book | null>(null)
  const [readingPickerOpen, setReadingPickerOpen] = useState(false)
  const [removing, setRemoving] = useState<Book | null>(null)
  const [railPickerFor, setRailPickerFor] = useState<UiList | null>(null)
  const [railExternalFor, setRailExternalFor] = useState<UiList | null>(null)

  const all = books ?? []
  const openBook = (id: string) => void navigate({ to: '/book/$bookId', params: { bookId: id } })

  // First-run: a brand-new reader (no books, hasn't been through onboarding) is sent to the
  // character-vocabulary first-run flow once. Existing libraries and anyone who finished/skipped
  // are left alone (honor-based flag in OnboardingRoute).
  useEffect(() => {
    if (books && books.length === 0 && !hasOnboarded()) {
      void navigate({ to: '/onboarding', replace: true })
    }
  }, [books, navigate])

  const yearReads = (reads ?? []).filter((r) => r.read_on?.slice(0, 4) === String(YEAR))
  const uniqueThisYear = new Set(yearReads.map((r) => r.book_id)).size
  const goalTarget = profile?.goalYear === YEAR ? (profile?.goalTarget ?? 0) : 0

  // Reading Now: mid-read books minus the display-only hidden ones, in the reader's manual order.
  const reading = all
    .filter((b) => b.readStatus === 'Reading' && !b.readingNowHidden)
    .sort((a, b) => (a.readingPosition ?? 1e15) - (b.readingPosition ?? 1e15))
  const unread = all.filter((b) => b.readStatus === 'Unread')
  // ALL priority-flagged shelves + TBRs, in the user's manual order (useLists sorts by sort_order).
  const priorityLists = (lists ?? []).filter((l) => l.priority)
  const booksFor = (listId: string): Book[] =>
    (items ?? [])
      .filter((it) => it.list_id === listId)
      .sort((a, b) => (a.position ?? 1e15) - (b.position ?? 1e15))
      .map((it) => all.find((b) => b.id === it.book_id))
      .filter((b): b is Book => !!b)
  const priorityTotal = priorityLists.reduce((n, l) => n + booksFor(l.id).length, 0)

  const today = new Date()
  const soon = all
    .filter((b) => b.pub.y)
    .map((b) => ({ b, d: new Date(b.pub.y ?? 0, (b.pub.m ?? 1) - 1, b.pub.d ?? 1) }))
    .filter(({ d }) => {
      const days = (d.getTime() - today.getTime()) / 864e5
      return days >= -7 && days <= 120
    })
    .sort((a, c) => a.d.getTime() - c.d.getTime())
    .slice(0, 12)

  const setGoal = () => {
    const input = window.prompt(`How many books do you want to read in ${YEAR}?`, String(goalTarget || ''))
    if (input == null) return
    updateProfile.mutate({ goalYear: YEAR, goalTarget: Math.max(0, parseInt(input) || 0) })
  }

  const nudge = (b: Book, delta: number) =>
    updateBook.mutate({ id: b.id, patch: { progress: Math.max(0, Math.min(100, b.progress + delta)) } })

  const moveReading = (i: number, dir: -1 | 1) => {
    const j = i + dir
    if (j < 0 || j >= reading.length) return
    const ids = reading.map((b) => b.id)
    const a = ids[i]!
    ids[i] = ids[j]!
    ids[j] = a
    // renumber-on-write, same spaced scheme as shelves
    ids.forEach((id, k) => updateBook.mutate({ id, patch: { readingPosition: (k + 1) * 1000 } }))
  }

  const startReading = (b: Book) => {
    const maxPos = Math.max(0, ...reading.map((x) => x.readingPosition ?? 0))
    updateBook.mutate({ id: b.id, patch: { readStatus: 'Reading', readingNowHidden: false, readingPosition: maxPos + 1000 } })
  }

  const firstName = profile?.displayName ? profile.displayName.split(' ')[0] : ''

  return (
    <section className="px-4 py-6 sm:px-6">
      {/* hero — framed per skin (Aphelion corner-bracket callsign plate · Tryst gilt plate), with the
          signature goal-ring (radar cycle-ring vs gilt fleuron ring) and structural status tags. */}
      <Frame className="flex flex-wrap items-center gap-5 p-5 backdrop-blur" style={{ boxShadow: 'var(--shadow)' }}>
        <button type="button" onClick={setGoal} aria-label={`Set your ${YEAR} reading goal`}>
          <SignatureRing value={uniqueThisYear} max={goalTarget} />
        </button>
        <div className="min-w-[230px] flex-1">
          <div className="text-[22px] italic text-ink" style={{ fontFamily: 'var(--font-display)', fontWeight: 600 }}>
            {greeting()}
            {firstName ? `, ${firstName}` : ''}.
          </div>
          <div className="mt-1 text-[14px] text-muted">
            {yearReads.length} read{yearReads.length !== 1 ? 's' : ''} logged in {YEAR}
            {yearReads.length !== uniqueThisYear ? ` (${uniqueThisYear} books)` : ''} · {unread.length} unread
            waiting
          </div>
          {goalTarget > 0 && uniqueThisYear >= goalTarget && (
            /* the milestone line, spoken in the skin's voice (Fable 5 voice-pack quartet) */
            <div className="mt-1 text-[13px] italic" style={{ color: 'var(--accent-ink)', fontFamily: 'var(--font-display)' }}>
              {voice.milestone}
            </div>
          )}
          {goalTarget > 0 && uniqueThisYear > 0 && uniqueThisYear < goalTarget && (
            /* the SEASON strip (chunk-4, verdict-approved, minimal scope): the live count + the
               skin's mid-progress tail — "Thirty-five books this year. A tidy ledger." */
            <div className="mt-1 text-[13px] italic" style={{ color: 'var(--accent-ink)', fontFamily: 'var(--font-display)' }}>
              <span className="skin-numeral not-italic">{uniqueThisYear}</span> of{' '}
              <span className="skin-numeral not-italic">{goalTarget}</span> this year · {voice.season}
            </div>
          )}
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            <StatusTag tone="muted">{all.filter(isOwnedBook).length} books</StatusTag>
            <StatusTag glyph="♥">{all.filter((b) => b.fave).length} faves</StatusTag>
            {priorityLists.length > 0 && <StatusTag glyph={<BookmarkGlyph />}>{priorityTotal} priority</StatusTag>}
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={() => void navigate({ to: '/match' })}
            className="skin-control skin-btn-primary px-4 py-2 text-[13px]"
          >
            💘 Find my next read
          </button>
          <button
            type="button"
            onClick={() => {
              if (!unread.length) return
              const pick = unread[Math.floor(Math.random() * unread.length)]
              if (pick) openBook(pick.id)
            }}
            className="skin-control skin-btn-secondary px-4 py-2 text-[13px]"
          >
            🎲 Surprise me
          </button>
        </div>
      </Frame>

      {/* reading now — editable in place: add a current read, set one aside, reorder */}
      {reading.length > 0 && (
        <div className="mt-8">
          <div className="flex items-end justify-between gap-3">
            <SectionHeader className="flex-1" label="Reading now" readout={reading.length} />
            <button
              type="button"
              onClick={() => setReadingPickerOpen(true)}
              className="mb-0.5 flex-none rounded-full border border-line px-3 py-1.5 text-[12.5px] font-semibold text-ink"
              style={{ background: 'var(--card)' }}
            >
              ＋ Add
            </button>
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {reading.map((b, i) => (
              <div key={b.id} className="flex gap-3 rounded-2xl border border-line p-3" style={{ background: 'var(--card)' }}>
                <button
                  type="button"
                  onClick={() => openBook(b.id)}
                  className="h-20 w-14 flex-none overflow-hidden rounded-md border border-line"
                  style={{ background: 'var(--field)' }}
                  aria-label={`Open ${b.title}`}
                >
                  <CoverImage book={b} />
                </button>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate text-[14px] font-semibold text-ink">{b.title}</div>
                      <div className="truncate text-[12px] text-muted">{authorOf(b)}</div>
                    </div>
                    <span className="flex flex-none items-center gap-0.5">
                      {reading.length > 1 && (
                        <>
                          <button type="button" onClick={() => moveReading(i, -1)} aria-label={`Move ${b.title} earlier`} className="px-1 text-[12px] leading-none text-muted">
                            ▲
                          </button>
                          <button type="button" onClick={() => moveReading(i, 1)} aria-label={`Move ${b.title} later`} className="px-1 text-[12px] leading-none text-muted">
                            ▼
                          </button>
                        </>
                      )}
                      <button type="button" onClick={() => setRemoving(b)} aria-label={`Remove ${b.title} from Reading now`} className="px-1 text-[13px] leading-none text-muted hover:text-primary">
                        ✕
                      </button>
                    </span>
                  </div>
                  <ProgressMeter value={b.progress} max={100} className="mt-2" />
                  <div className="mt-1.5 flex items-center gap-2">
                    <span className="text-[12px] font-semibold text-muted">{b.progress}%</span>
                    <div className="ml-auto flex gap-1.5">
                      <button type="button" onClick={() => nudge(b, -5)} aria-label="Less progress" className="h-7 w-7 rounded-full border border-line text-ink">
                        −
                      </button>
                      <button type="button" onClick={() => nudge(b, 5)} aria-label="More progress" className="h-7 w-7 rounded-full border border-line text-ink">
                        ＋
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={() => setFinishing(b)}
                      className="rounded-full px-3 py-1 text-[12px] font-semibold"
                      style={{ background: 'var(--chip)', color: 'var(--ink)' }}
                    >
                      Finish ✓
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* priority shelves — every flagged shelf/TBR, in the reader's manual order */}
      {priorityLists.map((l) => {
        const shelfBooks = booksFor(l.id)
        return (
          <div key={l.id} className="mt-8">
            <button type="button" onClick={() => void navigate({ to: '/shelf/$listId', params: { listId: l.id } })} className="block text-left">
              <h2 className="text-[18px] italic text-ink underline-offset-4 hover:underline" style={{ fontFamily: 'var(--font-display)', fontWeight: 600 }}>
                <span style={{ color: 'var(--accent-ink)' }}>
                  <BookmarkGlyph size={13} />
                </span>{' '}
                {l.name} <span aria-hidden className="text-[13px] text-muted">›</span>
              </h2>
            </button>
            {shelfBooks.length > 0 && <p className="mb-1 text-[12.5px] text-muted">Scroll the shelf — covers flip as you go</p>}
            <SpineShelf books={shelfBooks} onOpen={openBook} onAdd={() => setRailPickerFor(l)} addLabel={`Add a book to ${l.name}`} />
          </div>
        )
      })}

      {/* coming soon */}
      {soon.length > 0 && (
        <div className="mt-8">
          <h2 className="text-[18px] italic text-ink" style={{ fontFamily: 'var(--font-display)', fontWeight: 600 }}>
            Coming soon
          </h2>
          <p className="mb-2 text-[12.5px] text-muted">Releases you’re tracking, next 4 months</p>
          <div className="flex gap-3 overflow-x-auto pb-2" style={{ scrollbarWidth: 'none' }}>
            {soon.map(({ b }) => (
              <button
                key={b.id}
                type="button"
                onClick={() => openBook(b.id)}
                className="w-24 flex-none text-left"
                aria-label={`Open ${b.title}`}
              >
                <div className="aspect-[2/3] overflow-hidden rounded-lg border border-line" style={{ background: 'var(--field)' }}>
                  <CoverImage book={b} />
                </div>
                <div className="mt-1 truncate text-[12px] font-semibold text-ink">{b.title}</div>
                <div className="text-[11px] text-primary">
                  📅 {b.pub.m ? `${MONTHS[b.pub.m - 1]} ` : ''}
                  {b.pub.y}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {reading.length === 0 && priorityTotal === 0 && (
        <p className="mt-10 rounded-2xl border border-line p-6 text-center text-[14px] text-muted">
          Mark a book “Reading” or star a Priority TBR and your home will come alive.
        </p>
      )}

      {finishing && <LogReadForm book={finishing} onClose={() => setFinishing(null)} />}

      {readingPickerOpen && (
        <LibraryPicker
          title="Add to Reading now"
          books={all}
          excludeIds={new Set(all.filter((b) => b.readStatus === 'Reading' && !b.readingNowHidden).map((b) => b.id))}
          onPick={startReading}
          onClose={() => setReadingPickerOpen(false)}
        />
      )}

      {railPickerFor && (
        <LibraryPicker
          title={`Add to ${railPickerFor.name}`}
          books={all}
          excludeIds={new Set(booksFor(railPickerFor.id).map((b) => b.id))}
          onPick={(b) => {
            const positions = (items ?? []).filter((it) => it.list_id === railPickerFor.id).map((it) => it.position ?? 0)
            addItem.mutate({ listId: railPickerFor.id, bookId: b.id, afterPosition: Math.max(0, ...positions) })
          }}
          onClose={() => setRailPickerFor(null)}
          // Same shelf-add seam as /shelves and the shelf detail page — without it a book you don't
          // own can't be added to a priority shelf from Home. (Follow-up to #64.)
          onExternalSearch={() => {
            const l = railPickerFor
            setRailPickerFor(null)
            setRailExternalFor(l)
          }}
        />
      )}

      {railExternalFor && (
        <ExternalSearchSheet
          listId={railExternalFor.id}
          listName={railExternalFor.name}
          books={all}
          onClose={() => setRailExternalFor(null)}
        />
      )}

      {/* Removing from Reading Now ≠ un-marking as reading. Two explicit outcomes, progress kept
          either way: set it aside (status → Unread, resume anytime) or hide it here only. */}
      {removing && (
        <Modal title={`Remove “${removing.title}”?`} onClose={() => setRemoving(null)}>
          <p className="text-[13.5px] text-muted">
            Your {removing.progress}% progress is kept either way — this only changes where it shows.
          </p>
          <div className="mt-4 flex flex-col gap-2">
            <button
              type="button"
              onClick={() => {
                updateBook.mutate({ id: removing.id, patch: { readStatus: 'Unread' } })
                setRemoving(null)
              }}
              className="skin-control skin-btn-primary px-4 py-2.5 text-[13.5px]"
            >
              Set it aside — back to Unread, resume anytime
            </button>
            <button
              type="button"
              onClick={() => {
                updateBook.mutate({ id: removing.id, patch: { readingNowHidden: true } })
                setRemoving(null)
              }}
              className="skin-control border border-line px-4 py-2.5 text-[13.5px] text-ink"
              style={{ background: 'var(--field)' }}
            >
              Keep reading — just hide it from Home
            </button>
            <button type="button" onClick={() => setRemoving(null)} className="px-4 py-1.5 text-[13px] text-muted">
              Cancel
            </button>
          </div>
        </Modal>
      )}
    </section>
  )
}

export const homeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: HomeScreen,
})
