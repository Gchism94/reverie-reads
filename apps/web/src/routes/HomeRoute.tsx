import { useEffect, useState } from 'react'
import { createRoute, useNavigate } from '@tanstack/react-router'
import { authorOf, isPossessed, type Book } from '@reverie/core'
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
import {
  Frame,
  ProgressMeter,
  SectionHeader,
  SignatureRing,
  StatusTag,
} from '../components/Structure'
import { hasOnboarded } from './OnboardingRoute'
import { useVoice } from '../skin/labels'
import { BookmarkGlyph } from '../components/BookmarkGlyph'
import { Surface } from '../components/Surface'
import { PageHeader } from '../components/PageHeader'

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
    const input = window.prompt(
      `How many books do you want to read in ${YEAR}?`,
      String(goalTarget || ''),
    )
    if (input == null) return
    updateProfile.mutate({ goalYear: YEAR, goalTarget: Math.max(0, parseInt(input) || 0) })
  }

  const nudge = (b: Book, delta: number) =>
    updateBook.mutate({
      id: b.id,
      patch: { progress: Math.max(0, Math.min(100, b.progress + delta)) },
    })

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
    updateBook.mutate({
      id: b.id,
      patch: { readStatus: 'Reading', readingNowHidden: false, readingPosition: maxPos + 1000 },
    })
  }

  const firstName = profile?.displayName ? profile.displayName.split(' ')[0] : ''
  const todayLabel = new Intl.DateTimeFormat(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  }).format(new Date())

  return (
    <section className="mx-auto w-full max-w-[1240px] px-4 py-6 sm:px-6 lg:py-8">
      <PageHeader
        eyebrow={todayLabel}
        title={`${greeting()}${firstName ? `, ${firstName}` : ''}.`}
        description="Pick up where you left off, then decide what deserves your attention next."
        actions={
          <button
            type="button"
            onClick={() => void navigate({ to: '/add' })}
            className="skin-control skin-btn-primary h-10 px-4 text-[13px]"
          >
            ＋ Add a book
          </button>
        }
      />

      {/* hero — framed per skin (Aphelion corner-bracket callsign plate · Tryst gilt plate), with the
          signature goal-ring (radar cycle-ring vs gilt fleuron ring) and structural status tags. */}
      <Frame
        className="mt-6 flex flex-wrap items-center gap-6 p-5 backdrop-blur sm:p-7"
        style={{ boxShadow: 'var(--shadow)' }}
      >
        <button type="button" onClick={setGoal} aria-label={`Set your ${YEAR} reading goal`}>
          <SignatureRing value={uniqueThisYear} max={goalTarget} size={112} />
        </button>
        <div className="min-w-[230px] flex-1">
          <span className="skin-label text-[10px]" style={{ color: 'var(--accent-ink)' }}>
            Your reading year
          </span>
          <h2
            className="mt-2 max-w-[24ch] text-balance text-[24px] font-semibold leading-[1.08] text-ink sm:text-[30px]"
            style={{ fontFamily: 'var(--font-display)', fontWeight: 600 }}
          >
            {reading.length
              ? 'Another chapter is waiting.'
              : unread.length
                ? 'Your next great read is already here.'
                : 'Build a reading life that feels like yours.'}
          </h2>
          <p className="mt-2 max-w-[62ch] text-[13px] leading-relaxed text-muted">
            {yearReads.length} read{yearReads.length !== 1 ? 's' : ''} logged in {YEAR}
            {yearReads.length !== uniqueThisYear ? ` across ${uniqueThisYear} books` : ''}.{' '}
            {unread.length} unread waiting.
          </p>
          {goalTarget > 0 && uniqueThisYear >= goalTarget && (
            /* the milestone line, spoken in the skin's voice (Fable 5 voice-pack quartet) */
            <div
              className="mt-1 text-[13px] italic"
              style={{ color: 'var(--accent-ink)', fontFamily: 'var(--font-display)' }}
            >
              {voice.milestone}
            </div>
          )}
          {goalTarget > 0 && uniqueThisYear > 0 && uniqueThisYear < goalTarget && (
            /* the SEASON strip (chunk-4, verdict-approved, minimal scope): the live count + the
               skin's mid-progress tail — "Thirty-five books this year. A tidy ledger." */
            <div
              className="mt-1 text-[13px] italic"
              style={{ color: 'var(--accent-ink)', fontFamily: 'var(--font-display)' }}
            >
              <span className="skin-numeral not-italic">{uniqueThisYear}</span> of{' '}
              <span className="skin-numeral not-italic">{goalTarget}</span> this year ·{' '}
              {voice.season}
            </div>
          )}
          <div className="mt-4 flex flex-wrap gap-1.5">
            <StatusTag tone="muted">{all.filter(isPossessed).length} books</StatusTag>
            <StatusTag glyph="♥">{all.filter((b) => b.fave).length} faves</StatusTag>
            {priorityLists.length > 0 && (
              <StatusTag glyph={<BookmarkGlyph />}>{priorityTotal} priority</StatusTag>
            )}
          </div>
        </div>
        <div className="flex w-full gap-2 sm:w-auto sm:flex-col">
          <button
            type="button"
            onClick={() => void navigate({ to: '/match' })}
            className="skin-control skin-btn-primary h-10 flex-1 px-4 text-[12px] sm:flex-none"
          >
            Find my next read
          </button>
          <button
            type="button"
            onClick={() => {
              if (!unread.length) return
              const pick = unread[Math.floor(Math.random() * unread.length)]
              if (pick) openBook(pick.id)
            }}
            className="skin-control skin-btn-secondary h-10 flex-1 px-4 text-[12px] sm:flex-none"
          >
            Surprise me
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
              className="skin-control mb-0.5 flex-none border border-line px-3 py-1.5 text-[12.5px] font-semibold text-ink"
              style={{ background: 'var(--card)' }}
            >
              ＋ Add
            </button>
          </div>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            {reading.map((b, i) => (
              <Surface
                key={b.id}
                tone="card"
                radius="card"
                pad={2}
                raised={i === 0}
                className={`flex gap-3 ${i === 0 ? 'sm:col-span-2 sm:grid sm:grid-cols-[112px_minmax(0,1fr)] sm:p-5' : ''}`}
              >
                <button
                  type="button"
                  onClick={() => openBook(b.id)}
                  className={`flex-none overflow-hidden rounded-md border border-line ${i === 0 ? 'h-24 w-16 sm:h-auto sm:w-[112px] sm:self-stretch' : 'h-20 w-14'}`}
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
                          <button
                            type="button"
                            onClick={() => moveReading(i, -1)}
                            aria-label={`Move ${b.title} earlier`}
                            className="px-1 text-[12px] leading-none text-muted"
                          >
                            ▲
                          </button>
                          <button
                            type="button"
                            onClick={() => moveReading(i, 1)}
                            aria-label={`Move ${b.title} later`}
                            className="px-1 text-[12px] leading-none text-muted"
                          >
                            ▼
                          </button>
                        </>
                      )}
                      <button
                        type="button"
                        onClick={() => setRemoving(b)}
                        aria-label={`Remove ${b.title} from Reading now`}
                        className="px-1 text-[13px] leading-none text-muted hover:text-primary"
                      >
                        ✕
                      </button>
                    </span>
                  </div>
                  <ProgressMeter value={b.progress} max={100} className="mt-2" />
                  <div className="mt-1.5 flex items-center gap-2">
                    <span className="text-[12px] font-semibold text-muted">{b.progress}%</span>
                    <div className="ml-auto flex gap-1.5">
                      <button
                        type="button"
                        onClick={() => nudge(b, -5)}
                        aria-label="Less progress"
                        className="h-7 w-7 rounded-full border border-line text-ink"
                      >
                        −
                      </button>
                      <button
                        type="button"
                        onClick={() => nudge(b, 5)}
                        aria-label="More progress"
                        className="h-7 w-7 rounded-full border border-line text-ink"
                      >
                        ＋
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={() => setFinishing(b)}
                      className="skin-control px-3 py-1 text-[12px] font-semibold"
                      style={{ background: 'var(--chip)', color: 'var(--ink)' }}
                    >
                      Finish ✓
                    </button>
                  </div>
                </div>
              </Surface>
            ))}
          </div>
        </div>
      )}

      {/* priority shelves — every flagged shelf/TBR, in the reader's manual order */}
      {priorityLists.map((l) => {
        const shelfBooks = booksFor(l.id)
        return (
          <div key={l.id} className="mt-8">
            <button
              type="button"
              onClick={() => void navigate({ to: '/shelf/$listId', params: { listId: l.id } })}
              className="block w-full text-left"
            >
              <SectionHeader
                label={
                  <>
                    <BookmarkGlyph size={13} /> {l.name} <span aria-hidden>›</span>
                  </>
                }
                readout={shelfBooks.length}
              />
            </button>
            {shelfBooks.length > 0 && (
              <p className="mb-3 mt-1 text-[12px] text-muted">
                Your hand-picked next reads. Swipe the shelf and open one when it feels right.
              </p>
            )}
            <SpineShelf
              books={shelfBooks}
              onOpen={openBook}
              onAdd={() => setRailPickerFor(l)}
              addLabel={`Add a book to ${l.name}`}
            />
          </div>
        )
      })}

      {/* coming soon */}
      {soon.length > 0 && (
        <div className="mt-8">
          <SectionHeader label="Coming soon" readout={soon.length} />
          <p className="mb-3 mt-1 text-[12px] text-muted">
            Releases you’re tracking over the next four months.
          </p>
          <div
            className="flex snap-x gap-4 overflow-x-auto pb-2"
            style={{ scrollbarWidth: 'none' }}
          >
            {soon.map(({ b }) => (
              <button
                key={b.id}
                type="button"
                onClick={() => openBook(b.id)}
                className="w-28 flex-none snap-start text-left"
                aria-label={`Open ${b.title}`}
              >
                <div
                  className="skin-card aspect-[2/3] overflow-hidden border border-line"
                  style={{ background: 'var(--field)', boxShadow: 'var(--shadow)' }}
                >
                  <CoverImage book={b} />
                </div>
                <div className="mt-2 truncate text-[12px] font-semibold text-ink">{b.title}</div>
                <div className="mt-0.5 text-[11px] text-primary">
                  {b.pub.m ? `${MONTHS[b.pub.m - 1]} ` : ''}
                  {b.pub.y}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {reading.length === 0 && priorityTotal === 0 && (
        <Surface tone="card" radius="panel" pad={5} raised className="mt-9 text-center">
          <h2
            className="text-[23px] font-semibold text-ink"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            Give Home something to remember.
          </h2>
          <p className="mx-auto mt-2 max-w-[46ch] text-[14px] leading-relaxed text-muted">
            Mark a book as Reading or make a TBR your priority shelf. Your next chapter will live
            here.
          </p>
          <button
            type="button"
            onClick={() => void navigate({ to: '/library' })}
            className="skin-control skin-btn-primary mt-5 h-10 px-5 text-[12px]"
          >
            Browse your library
          </button>
        </Surface>
      )}

      {finishing && <LogReadForm book={finishing} onClose={() => setFinishing(null)} />}

      {readingPickerOpen && (
        <LibraryPicker
          title="Add to Reading now"
          books={all}
          excludeIds={
            new Set(
              all.filter((b) => b.readStatus === 'Reading' && !b.readingNowHidden).map((b) => b.id),
            )
          }
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
            const positions = (items ?? [])
              .filter((it) => it.list_id === railPickerFor.id)
              .map((it) => it.position ?? 0)
            addItem.mutate({
              listId: railPickerFor.id,
              bookId: b.id,
              afterPosition: Math.max(0, ...positions),
            })
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
            Your {removing.progress}% progress is kept either way — this only changes where it
            shows.
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
            <button
              type="button"
              onClick={() => setRemoving(null)}
              className="px-4 py-1.5 text-[13px] text-muted"
            >
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
