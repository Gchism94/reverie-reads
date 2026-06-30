import { useEffect, useState } from 'react'
import { createRoute, useNavigate } from '@tanstack/react-router'
import { authorOf, type Book } from '@reverie/core'
import { rootRoute } from './RootRoute'
import { CoverImage } from '../components/CoverImage'
import { useBooks, useUpdateBook } from '../data/books'
import { useAllReads } from '../data/reads'
import { useLists } from '../data/lists'
import { useAllListItems } from '../data/listItems'
import { useProfile, useUpdateProfile } from '../data/profile'
import { SpineShelf } from '../components/SpineShelf'
import { LogReadForm } from '../book/dialogs'
import { MONTHS } from '../library/constants'
import { useEffectiveSkin } from '../skin/labels'
import { hasOnboarded } from './OnboardingRoute'

const YEAR = new Date().getFullYear()

function greeting(): string {
  const h = new Date().getHours()
  if (h < 5) return 'Up late reading?'
  if (h < 12) return 'Good morning'
  if (h < 18) return 'Good afternoon'
  return 'Good evening'
}

function GoalRing({ done, target }: { done: number; target: number }) {
  const C = 2 * Math.PI * 42
  const off = C * (1 - (target ? Math.min(1, done / target) : 0))
  // Skin character: Aphelion reads as a segmented instrument gauge (ticked track + square cap +
  // tabular numerals); the warm skins keep a smooth round ring with old-style figures.
  const aph = useEffectiveSkin() === 'aphelion'
  return (
    <div className="relative h-24 w-24 flex-none">
      <svg width="96" height="96" className="-rotate-90">
        <circle
          cx="48"
          cy="48"
          r="42"
          fill="none"
          stroke="var(--chip-border)"
          strokeWidth="9"
          strokeDasharray={aph ? '1.6 7' : undefined}
        />
        <circle
          cx="48"
          cy="48"
          r="42"
          fill="none"
          stroke="var(--primary)"
          strokeWidth="9"
          strokeLinecap={aph ? 'butt' : 'round'}
          strokeDasharray={C}
          strokeDashoffset={off}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="skin-numeral text-[22px] font-bold text-ink">{done}</span>
        <span className="skin-label text-[10px] text-muted">{target ? `of ${target}` : 'set goal'}</span>
      </div>
    </div>
  )
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
  const [finishing, setFinishing] = useState<Book | null>(null)

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

  const reading = all.filter((b) => b.readStatus === 'Reading')
  const unread = all.filter((b) => b.readStatus === 'Unread')
  const priority = (lists ?? []).find((l) => l.kind === 'tbr' && l.priority)
  const priorityBooks = priority
    ? (items ?? [])
        .filter((it) => it.list_id === priority.id)
        .map((it) => all.find((b) => b.id === it.book_id))
        .filter((b): b is Book => !!b)
    : []

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

  const firstName = profile?.displayName ? profile.displayName.split(' ')[0] : ''

  return (
    <section className="px-4 py-6 sm:px-6">
      {/* hero */}
      <div
        className="flex flex-wrap items-center gap-5 rounded-3xl border border-line p-5 backdrop-blur"
        style={{ background: 'var(--card)', boxShadow: 'var(--shadow)' }}
      >
        <button type="button" onClick={setGoal} aria-label={`Set your ${YEAR} reading goal`}>
          <GoalRing done={uniqueThisYear} target={goalTarget} />
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
          <div className="mt-2 flex flex-wrap gap-2 text-[12px] text-muted">
            <span>{all.length} books</span>
            <span>♥ {all.filter((b) => b.fave).length} faves</span>
            {priority && <span>★ {priorityBooks.length} on priority</span>}
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={() => void navigate({ to: '/match' })}
            className="skin-control px-4 py-2 text-[13px]"
            style={{ background: 'linear-gradient(135deg, var(--primary), var(--gold))', color: 'var(--on-primary)' }}
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
            className="skin-control border border-line px-4 py-2 text-[13px] text-ink"
          >
            🎲 Surprise me
          </button>
        </div>
      </div>

      {/* reading now */}
      {reading.length > 0 && (
        <div className="mt-8">
          <h2 className="text-[18px] italic text-ink" style={{ fontFamily: 'var(--font-display)', fontWeight: 600 }}>
            Reading now
          </h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {reading.map((b) => (
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
                  <div className="truncate text-[14px] font-semibold text-ink">{b.title}</div>
                  <div className="truncate text-[12px] text-muted">{authorOf(b)}</div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full" style={{ background: 'var(--chip)' }}>
                    <div className="h-full rounded-full" style={{ width: `${b.progress}%`, background: 'var(--primary)' }} />
                  </div>
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

      {/* priority shelf */}
      {priority && priorityBooks.length > 0 && (
        <div className="mt-8">
          <h2 className="text-[18px] italic text-ink" style={{ fontFamily: 'var(--font-display)', fontWeight: 600 }}>
            ★ {priority.name}
          </h2>
          <p className="mb-1 text-[12.5px] text-muted">Scroll the shelf — covers flip as you go</p>
          <SpineShelf books={priorityBooks} onOpen={openBook} />
        </div>
      )}

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
                <div className="mt-1 truncate text-[11.5px] font-semibold text-ink">{b.title}</div>
                <div className="text-[10.5px] text-primary">
                  📅 {b.pub.m ? `${MONTHS[b.pub.m - 1]} ` : ''}
                  {b.pub.y}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {reading.length === 0 && priorityBooks.length === 0 && (
        <p className="mt-10 rounded-2xl border border-line p-6 text-center text-[14px] text-muted">
          Mark a book “Reading” or star a Priority TBR and your home will come alive.
        </p>
      )}

      {finishing && <LogReadForm book={finishing} onClose={() => setFinishing(null)} />}
    </section>
  )
}

export const homeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: HomeScreen,
})
