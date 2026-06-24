import { useState } from 'react'
import { createRoute } from '@tanstack/react-router'
import { authorOf } from '@reverie/core'
import { rootRoute } from './RootRoute'
import { useBooks } from '../data/books'
import { useAllReads } from '../data/reads'
import { MONTHS } from '../library/constants'

const THIS_YEAR = new Date().getFullYear()

function Bars({ entries }: { entries: [string, number][] }) {
  if (!entries.length) return <p className="text-[13px] text-muted">Nothing here yet.</p>
  const max = Math.max(1, ...entries.map((e) => e[1]))
  return (
    <div className="flex flex-col gap-1.5">
      {entries.map(([label, n]) => (
        <div key={label} className="flex items-center gap-2 text-[13px]">
          <span className="w-28 flex-none truncate text-muted" title={label}>
            {label}
          </span>
          <span className="h-2.5 flex-1 overflow-hidden rounded-full" style={{ background: 'var(--chip)' }}>
            <span className="block h-full rounded-full" style={{ width: `${Math.round((n / max) * 100)}%`, background: 'var(--primary)' }} />
          </span>
          <span className="w-7 flex-none text-right font-semibold text-ink">{n}</span>
        </div>
      ))}
    </div>
  )
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-line p-4" style={{ background: 'var(--card)' }}>
      <h4 className="mb-3 text-[14px] font-semibold text-ink">{title}</h4>
      {children}
    </div>
  )
}

function tally<T>(items: T[], key: (x: T) => string | undefined): [string, number][] {
  const m = new Map<string, number>()
  for (const x of items) {
    const k = key(x)
    if (k) m.set(k, (m.get(k) ?? 0) + 1)
  }
  return [...m.entries()].sort((a, b) => b[1] - a[1])
}

function StatsScreen() {
  const { data: books } = useBooks()
  const reads = useAllReads().data ?? []
  const all = books ?? []

  const years = [...new Set([THIS_YEAR, ...reads.filter((r) => r.read_on).map((r) => +(r.read_on as string).slice(0, 4))])].sort((a, b) => b - a)
  const [statsY, setStatsY] = useState(THIS_YEAR)
  const year = years.includes(statsY) ? statsY : (years[0] ?? THIS_YEAR)

  const dated = reads.filter((r) => r.read_on)
  const yr = dated.filter((r) => +(r.read_on as string).slice(0, 4) === year)
  const uniq = new Set(yr.map((r) => r.book_id)).size

  const readIds = new Set([...dated.map((r) => r.book_id), ...all.filter((b) => b.readStatus === 'Read').map((b) => b.id)])
  const readBooks = all.filter((b) => readIds.has(b.id))
  const rated = all.filter((b) => b.rating > 0)
  const avg = rated.length ? (rated.reduce((a, b) => a + b.rating, 0) / rated.length).toFixed(1) : '—'

  const mo = Array<number>(12).fill(0)
  for (const r of yr) {
    const idx = +(r.read_on as string).slice(5, 7) - 1
    if (idx >= 0 && idx < 12) mo[idx] = (mo[idx] ?? 0) + 1
  }
  const mmax = Math.max(1, ...mo)

  const byYear: [string, number][] = [...years]
    .sort((a, b) => a - b)
    .map((y) => [String(y), dated.filter((r) => +(r.read_on as string).slice(0, 4) === y).length] as [string, number])
    .filter((e) => e[1] > 0)

  const subg = tally(readBooks, (b) => b.subgenre)
  const fmts = tally(all, (b) => b.format)
  const spdist: [string, number][] = [1, 2, 3, 4, 5].map((i) => ['🌶️'.repeat(i), readBooks.filter((b) => b.spice === i).length])
  const tropes = tally(readBooks.flatMap((b) => b.tropes), (t) => t).slice(0, 8)
  const auths = tally(all, (b) => authorOf(b)).slice(0, 8)

  const readsPerBook = new Map<string, number>()
  for (const r of dated) readsPerBook.set(r.book_id, (readsPerBook.get(r.book_id) ?? 0) + 1)
  const mostReread = [...readsPerBook.entries()].sort((a, b) => b[1] - a[1])[0]
  const rereadBook = mostReread && mostReread[1] > 1 ? all.find((b) => b.id === mostReread[0]) : undefined
  const busiest = mo.some((x) => x) ? MONTHS[mo.indexOf(Math.max(...mo))] : null
  const seriesCount = new Set(all.filter((b) => b.series).map((b) => b.series)).size

  const stats: [string | number, string][] = [
    [uniq, `Books in ${year}`],
    [yr.length, 'Reads incl. rereads'],
    [readBooks.length, 'Read all-time'],
    [avg, 'Avg rating'],
    [all.filter((b) => b.rating === 5).length, '5★ books'],
  ]

  return (
    <section className="px-4 py-6 sm:px-6">
      <header className="mb-1 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-[22px] italic text-ink" style={{ fontFamily: 'var(--font-display)', fontWeight: 600 }}>
          Your Reading, Wrapped
        </h1>
        <select
          value={year}
          onChange={(e) => setStatsY(+e.target.value)}
          aria-label="Stats year"
          className="h-9 rounded-full border border-line px-3 text-[13px] font-semibold text-ink"
          style={{ background: 'var(--card)' }}
        >
          {years.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
      </header>
      <p className="mb-4 text-[12.5px] text-muted">
        {readBooks.length} books read all-time · charts use your logged read dates
      </p>

      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
        {stats.map(([n, label]) => (
          <div key={label} className="rounded-2xl border border-line p-3 text-center" style={{ background: 'var(--card)' }}>
            <div className="text-[22px] font-bold text-ink">{n}</div>
            <div className="text-[11px] text-muted">{label}</div>
          </div>
        ))}
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <Card title={`${year}, month by month`}>
          <div className="flex h-28 items-end gap-1.5">
            {mo.map((n, i) => (
              <div key={i} className="flex flex-1 flex-col items-center justify-end gap-1">
                <div
                  className="w-full rounded-t"
                  style={{ height: `${n ? Math.max(6, Math.round((n / mmax) * 92)) : 3}px`, background: n ? 'var(--primary)' : 'var(--chip)' }}
                  title={`${MONTHS[i]}: ${n}`}
                />
                <div className="text-[9px] text-muted">{MONTHS[i]?.[0]}</div>
              </div>
            ))}
          </div>
        </Card>
        {byYear.length > 0 && (
          <Card title="Reads by year">
            <Bars entries={byYear} />
          </Card>
        )}
        <Card title="What you read">
          <Bars entries={subg} />
        </Card>
        <Card title="Your shelves by format">
          <Bars entries={fmts} />
        </Card>
        <Card title="Spice profile 🌶️">
          <Bars entries={spdist} />
        </Card>
        {tropes.length > 0 && (
          <Card title="Your top tropes">
            <Bars entries={tropes} />
          </Card>
        )}
        <Card title="Most-shelved authors">
          <Bars entries={auths} />
        </Card>
        <Card title="Fun facts">
          <div className="flex flex-col gap-2 text-[13px] text-ink">
            {rereadBook && (
              <div>🔁 Most reread: <b>{rereadBook.title}</b> ({mostReread?.[1]}×)</div>
            )}
            {busiest && <div>🔥 Busiest month of {year}: <b>{busiest}</b></div>}
            <div>♥ {all.filter((b) => b.fave).length} all-time faves</div>
            <div>🌶️ {readBooks.filter((b) => b.spice >= 4).length} scorching reads conquered</div>
            <div>📚 {seriesCount} series on your shelves</div>
          </div>
        </Card>
      </div>

      <p className="mt-4 text-[12.5px] text-muted">
        Log past reads on each book — or import a Goodreads/StoryGraph CSV in Settings — to fill in
        history.
      </p>
    </section>
  )
}

export const statsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'stats',
  component: StatsScreen,
})
