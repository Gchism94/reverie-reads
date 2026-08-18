import { useState } from 'react'
import { createRoute, useNavigate } from '@tanstack/react-router'
import { authorOf, formatPartialDate, hasDate, type Book } from '@reverie/core'
import { rootRoute } from './RootRoute'
import { CoverImage } from '../components/CoverImage'
import { FromYourAuthors } from '../planner/FromYourAuthors'
import { useBooks } from '../data/books'
import { useAllReads } from '../data/reads'
import { Modal } from '../components/Modal'
import { MONTHS } from '../library/constants'
import { Surface } from '../components/Surface'

type Tab = 'calendar' | 'releases'
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function Stat({ n, label }: { n: number; label: string }) {
  return (
    <Surface radius="panel" tone="card" pad={2} className="text-center">
      <div className="text-[22px] font-bold text-ink">{n}</div>
      <div className="text-[11px] text-muted">{label}</div>
    </Surface>
  )
}

function Calendar({ books, openBook }: { books: Book[]; openBook: (id: string) => void }) {
  const reads = useAllReads().data ?? []
  const now = new Date()
  const [cal, setCal] = useState({ y: now.getFullYear(), m: now.getMonth() })
  const [day, setDay] = useState<number | null>(null)

  const byId = new Map(books.map((b) => [b.id, b]))
  const dated = reads.filter((r) => r.read_on)

  const map = new Map<number, { read: Book[]; plan: Book[] }>()
  const slot = (d: number) => {
    const cur = map.get(d) ?? { read: [], plan: [] }
    map.set(d, cur)
    return cur
  }
  for (const r of dated) {
    const date = r.read_on as string
    if (+date.slice(0, 4) === cal.y && +date.slice(5, 7) === cal.m + 1) {
      const b = byId.get(r.book_id)
      if (b) slot(+date.slice(8, 10)).read.push(b)
    }
  }
  for (const b of books) {
    // A day cell needs a day. A month-only plan ("sometime in March") has none and is deliberately
    // not placed here — it still appears in "Planned reads" below. Placing it on the 1st would
    // fabricate the exact day this trio exists to stop fabricating. The calendar branch decides
    // whether month-level plans get their own band; this is the minimum that is not a lie.
    if (b.plan.y === cal.y && b.plan.m === cal.m + 1 && b.plan.d != null) {
      slot(b.plan.d).plan.push(b)
    }
  }

  const first = new Date(cal.y, cal.m, 1).getDay()
  const days = new Date(cal.y, cal.m + 1, 0).getDate()
  const isThisMonth = now.getFullYear() === cal.y && now.getMonth() === cal.m

  const yearReads = dated.filter((r) => +(r.read_on as string).slice(0, 4) === cal.y)
  const uniqueYear = new Set(yearReads.map((r) => r.book_id)).size
  const readAllTime = books.filter((b) => b.readStatus === 'Read').length
  const planned = books.filter((b) => hasDate(b.plan)).length
  // Sort key, not a formatter: a missing month or day sorts before a stated one within the same
  // year, which is where a vaguer plan belongs. Local and throwaway — the calendar branch owns this.
  const planOrder = (b: Book) => (b.plan.y ?? 0) * 10000 + (b.plan.m ?? 0) * 100 + (b.plan.d ?? 0)
  const upcoming = books.filter((b) => hasDate(b.plan)).sort((a, b) => planOrder(a) - planOrder(b))

  const prev = () => setCal((c) => (c.m === 0 ? { y: c.y - 1, m: 11 } : { y: c.y, m: c.m - 1 }))
  const next = () => setCal((c) => (c.m === 11 ? { y: c.y + 1, m: 0 } : { y: c.y, m: c.m + 1 }))
  const detail = day != null ? map.get(day) : null

  return (
    <div>
      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat n={uniqueYear} label={`Books in ${cal.y}`} />
        <Stat n={yearReads.length} label="Reads incl. rereads" />
        <Stat n={readAllTime} label="Read all-time" />
        <Stat n={planned} label="Planned" />
      </div>

      <div className="mb-3 flex items-center justify-center gap-4">
        <button
          type="button"
          onClick={prev}
          aria-label="Previous month"
          className="h-8 w-8 rounded-full border border-line text-ink"
        >
          ‹
        </button>
        <span className="text-[16px] font-semibold text-ink">
          {MONTHS[cal.m]} {cal.y}
        </span>
        <button
          type="button"
          onClick={next}
          aria-label="Next month"
          className="h-8 w-8 rounded-full border border-line text-ink"
        >
          ›
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1.5">
        {DOW.map((d) => (
          <div key={d} className="pb-1 text-center text-[11px] text-muted">
            {d}
          </div>
        ))}
        {Array.from({ length: first }).map((_, i) => (
          <div key={`e${i}`} />
        ))}
        {Array.from({ length: days }).map((_, i) => {
          const d = i + 1
          const m = map.get(d)
          const has = m && (m.read.length || m.plan.length)
          const today = isThisMonth && now.getDate() === d
          return (
            <button
              key={d}
              type="button"
              disabled={!has}
              onClick={() => setDay(d)}
              className="aspect-square skin-tile border p-1 text-left disabled:cursor-default"
              style={{
                borderColor: today ? 'var(--gold)' : 'var(--line)',
                background: has ? 'var(--card)' : 'transparent',
              }}
            >
              <div className="text-[11px] text-muted">{d}</div>
              <div className="mt-0.5 flex flex-wrap gap-0.5">
                {m?.read.map((_, k) => (
                  <span
                    key={`r${k}`}
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ background: 'var(--primary)' }}
                  />
                ))}
                {m?.plan.map((_, k) => (
                  <span
                    key={`p${k}`}
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ background: 'var(--violet)' }}
                  />
                ))}
              </div>
            </button>
          )
        })}
      </div>

      {upcoming.length > 0 && (
        <div className="mt-6">
          <h3 className="text-[16px] font-semibold text-ink">Planned reads</h3>
          <div className="mt-2 flex flex-col gap-1.5">
            {upcoming.map((b) => (
              <button
                key={b.id}
                type="button"
                onClick={() => openBook(b.id)}
                className="flex items-center justify-between skin-card border border-line px-3 py-2 text-left"
                style={{ background: 'var(--field)' }}
              >
                <span className="text-[14px] font-semibold text-ink">{b.title}</span>
                <span className="text-[12px] text-violet">📅 {formatPartialDate(b.plan)}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {detail && day != null && (
        <Modal title={`${MONTHS[cal.m]} ${day}, ${cal.y}`} onClose={() => setDay(null)}>
          {detail.read.length > 0 && (
            <>
              <div className="mb-1 text-[11px] uppercase tracking-[0.2em] text-muted">Read</div>
              {detail.read.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => openBook(b.id)}
                  className="mb-1.5 block w-full text-left"
                >
                  <span className="text-[14px] font-semibold text-ink">{b.title}</span>
                  <span className="block text-[12px] text-muted">{authorOf(b)}</span>
                </button>
              ))}
            </>
          )}
          {detail.plan.length > 0 && (
            <>
              <div className="mb-1 mt-3 text-[11px] uppercase tracking-[0.2em] text-muted">
                Planned
              </div>
              {detail.plan.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => openBook(b.id)}
                  className="mb-1.5 block w-full text-left"
                >
                  <span className="text-[14px] font-semibold text-ink">{b.title}</span>
                  <span className="block text-[12px] text-muted">{authorOf(b)}</span>
                </button>
              ))}
            </>
          )}
        </Modal>
      )}
    </div>
  )
}

function Releases({ books, openBook }: { books: Book[]; openBook: (id: string) => void }) {
  const today = new Date()
  const key = (p: Book['pub']) => new Date(p.y ?? 0, (p.m ?? 1) - 1, p.d ?? 1).getTime()
  const dated = books.filter((b) => b.pub.y)
  const undated = books.filter((b) => !b.pub.y)
  const upcoming = dated
    .filter((b) => key(b.pub) > today.getTime())
    .sort((a, b) => key(a.pub) - key(b.pub))
  const recent = dated
    .filter((b) => key(b.pub) <= today.getTime() && (today.getTime() - key(b.pub)) / 864e5 <= 120)
    .sort((a, b) => key(b.pub) - key(a.pub))
  const past = dated
    .filter((b) => !upcoming.includes(b) && !recent.includes(b))
    .sort((a, b) => key(b.pub) - key(a.pub))

  const Section = ({ title, sub, list }: { title: string; sub: string; list: Book[] }) =>
    list.length ? (
      <div className="mb-6">
        <h3 className="text-[16px] font-semibold text-ink">{title}</h3>
        <p className="mb-2 text-[12.5px] text-muted">{sub}</p>
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6">
          {list.map((b) => (
            <button
              key={b.id}
              type="button"
              onClick={() => openBook(b.id)}
              className="text-left"
              aria-label={`Open ${b.title}`}
            >
              <div
                className="aspect-[2/3] overflow-hidden rounded-lg border border-line"
                style={{ background: 'var(--field)' }}
              >
                <CoverImage book={b} />
              </div>
              <div className="mt-1 truncate text-[12px] font-semibold text-ink">{b.title}</div>
              <div className="text-[11px] text-primary">📅 {formatPartialDate(b.pub)}</div>
            </button>
          ))}
        </div>
      </div>
    ) : null

  return (
    <div>
      {/* the external half: releases you DON'T own yet, from the authors your library loves */}
      <FromYourAuthors />
      <Surface radius="card" tone="card" pad={2} className="mb-4 text-[13px] text-muted">
        🗓️ Add a pub date to any book from its detail page — year only, month, or a full date. Books
        with dates appear here.
      </Surface>
      <Section title="Coming soon" sub="Upcoming releases you’re tracking" list={upcoming} />
      <Section title="Just released" sub="Out in the last few months" list={recent} />
      <Section title="By release date" sub="Everything else with a date" list={past} />
      {undated.length > 0 && (
        <Section
          title="No date yet"
          sub={`${undated.length} books — open one to add its publication date`}
          list={undated.slice(0, 18)}
        />
      )}
    </div>
  )
}

function PlannerScreen() {
  const navigate = useNavigate()
  const { data: books } = useBooks()
  // Tab lives in the ROUTE — see ShelvesRoute for the full reasoning. `undefined` = the default,
  // so /planner stays canonical and only /planner?tab=releases carries a param.
  const { tab = 'calendar' } = plannerRoute.useSearch()
  const setTab = (t: Tab) =>
    // replace: true — back should leave the page, not undo a tab click.
    void navigate({ to: '/planner', search: t === 'calendar' ? {} : { tab: t }, replace: true })
  const openBook = (id: string) => void navigate({ to: '/book/$bookId', params: { bookId: id } })

  return (
    <section className="px-4 py-6 sm:px-6">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1
          className="text-[22px] italic text-ink"
          style={{ fontFamily: 'var(--font-display)', fontWeight: 600 }}
        >
          Planner
        </h1>
        <Surface radius="control" tone="card" pad={1} className="flex">
          {(['calendar', 'releases'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              aria-pressed={tab === t}
              className="rounded-full px-3 py-1.5 text-[12.5px] font-semibold capitalize"
              style={
                tab === t
                  ? { background: 'var(--accent-fill)', color: 'var(--on-primary)' }
                  : { color: 'var(--muted)' }
              }
            >
              {t}
            </button>
          ))}
        </Surface>
      </header>

      {tab === 'calendar' ? (
        <Calendar books={books ?? []} openBook={openBook} />
      ) : (
        <Releases books={books ?? []} openBook={openBook} />
      )}
    </section>
  )
}

export const plannerRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'planner',
  // Fails closed — unknown values resolve to the default tab rather than throwing.
  validateSearch: (search: Record<string, unknown>): { tab?: Tab } => ({
    tab: search.tab === 'releases' ? 'releases' : undefined,
  }),
  component: PlannerScreen,
})
