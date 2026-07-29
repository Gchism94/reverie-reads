import { useMemo, useState } from 'react'
import { createRoute, useNavigate } from '@tanstack/react-router'
import { isBookRead, stateSuffix, type Book } from '@reverie/core'
import { rootRoute } from './RootRoute'
import { BackLink } from '../components/BackLink'
import { CoverImage } from '../components/CoverImage'
import { useBooks } from '../data/books'
import { useAllBookMoods, useAssignMood, useMoods, useUnassignMood } from '../data/moods'

/**
 * A mood's own page (docs/task-mood.md §4): the payoff for assigning — the reader's other books that
 * landed the same way. Same shape as a trope page, lighter: no kin, no facet. Flip to sweep to tag
 * in bulk. Private and personal — never how OTHERS felt, only how this reader did.
 */
function MoodScreen() {
  const { moodId } = moodRoute.useParams()
  const navigate = useNavigate()
  const { data: books } = useBooks()
  const { data: moods } = useMoods()
  const { data: assignments } = useAllBookMoods()
  const assign = useAssignMood()
  const unassign = useUnassignMood()
  const [sweep, setSweep] = useState(false)

  const mood = (moods ?? []).find((m) => m.id === moodId)
  const carrierIds = useMemo(
    () => new Set((assignments ?? []).filter((a) => a.mood_id === moodId).map((a) => a.book_id)),
    [assignments, moodId],
  )
  const carriers = useMemo(
    () => (books ?? []).filter((b) => carrierIds.has(b.id)),
    [books, carrierIds],
  )

  if (!mood)
    return (
      <div className="px-6 py-16 text-center text-muted">
        <p>That mood isn’t on your shelves.</p>
        <BackLink fallback="/library" className="mt-3 inline-block text-primary">
          ← Back
        </BackLink>
      </div>
    )

  const read = carriers.filter(isBookRead).length
  const gridBooks = sweep ? (books ?? []) : carriers

  const toggle = (b: Book) => {
    if (!sweep) {
      void navigate({ to: '/book/$bookId', params: { bookId: b.id } })
      return
    }
    if (carrierIds.has(b.id)) unassign.mutate({ bookId: b.id, moodId })
    else assign.mutate({ bookId: b.id, moodId })
  }

  return (
    <section className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
      <BackLink fallback="/library" className="text-[13px] text-muted hover:text-ink">
        ← Back
      </BackLink>

      <header className="mt-3 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1
            className="text-[26px] italic leading-tight text-ink"
            style={{ fontFamily: 'var(--font-display)', fontWeight: 600 }}
          >
            {mood.name}
          </h1>
          <p className="mt-0.5 text-[13px] text-muted">
            How it landed on you{mood.personal ? ' · yours' : ''}
          </p>
          <p className="mt-1.5 text-[14px] text-ink">
            {carriers.length} felt this way{read !== carriers.length ? ` · ${read} read` : ''}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setSweep((s) => !s)}
          aria-pressed={sweep}
          className="rounded-full border px-3.5 py-1.5 text-[12.5px] font-semibold"
          style={
            sweep
              ? {
                  background: 'var(--accent-fill)',
                  color: 'var(--on-primary)',
                  borderColor: 'transparent',
                }
              : { background: 'var(--card)', color: 'var(--ink)', borderColor: 'var(--line)' }
          }
        >
          {sweep ? 'Done' : '⟲ Sweep your library'}
        </button>
      </header>
      {sweep && (
        <p className="mt-2 text-[12.5px] text-muted">
          Tap covers to add or remove {mood.name} — highlighted books felt this way.
        </p>
      )}

      {gridBooks.length ? (
        <div className="mt-5 grid grid-cols-3 gap-3 sm:grid-cols-5 lg:grid-cols-7">
          {gridBooks.map((b) => {
            const carrying = carrierIds.has(b.id)
            return (
              <button
                key={b.id}
                type="button"
                onClick={() => toggle(b)}
                aria-pressed={sweep ? carrying : undefined}
                // Thumb-class: state reaches the screen reader but NOT the eye — a text pill at this
                // size obliterates the cover (docs/BACKLOG.md records the follow-up).
                aria-label={
                  sweep
                    ? `${carrying ? 'Remove' : 'Add'} ${mood.name} — ${b.title}${stateSuffix(b)}`
                    : `Open ${b.title}${stateSuffix(b)}`
                }
                className="relative overflow-hidden rounded-xl border text-left"
                style={{
                  borderColor: sweep && carrying ? 'var(--accent-ink)' : 'var(--line)',
                  boxShadow: sweep && carrying ? '0 0 0 2px var(--accent-ink)' : undefined,
                  opacity: sweep && !carrying ? 0.6 : 1,
                }}
              >
                <div className="aspect-[2/3] w-full">
                  <CoverImage book={b} thumb />
                </div>
                {sweep && carrying && (
                  <span
                    aria-hidden
                    className="absolute right-1 top-1 rounded-full px-1.5 text-[11px] font-bold"
                    style={{ background: 'var(--accent-fill)', color: 'var(--on-primary)' }}
                  >
                    ✓
                  </span>
                )}
              </button>
            )
          })}
        </div>
      ) : (
        <p className="mt-6 rounded-2xl border border-dashed border-line p-6 text-center text-[13.5px] text-muted">
          Nothing felt {mood.name} yet — sweep your library and tap the ones that did.
        </p>
      )}
    </section>
  )
}

export const moodRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'moods/$moodId',
  component: MoodScreen,
})
