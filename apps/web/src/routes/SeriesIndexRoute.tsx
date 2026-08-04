import { useMemo, useState } from 'react'
import { createRoute } from '@tanstack/react-router'
import { Link } from '@tanstack/react-router'
import {
  claimedSeriesLength,
  displayTotal,
  groupSeriesByAuthor,
  isBookRead,
  progressLine,
  seriesProgress,
  type Book,
  type SeriesEntry,
} from '@reverie/core'
import { rootRoute } from './RootRoute'
import { useBooks } from '../data/books'
import { useLists } from '../data/lists'
import { useAllListItems } from '../data/listItems'
import { useSeriesList } from '../data/series'
import { SeriesArranger } from '../series/SeriesArranger'

/**
 * /series — the series INDEX, author-grouped (feat/series-builder).
 *
 * This COEXISTS with Library's Series mode by decision, and the split is the reason it exists:
 * Library's strips are for browsing — covers, progress, a door into one series — while this is for
 * ARRANGING, which wants every series a reader owns in one place, grouped by who wrote it, with the
 * reading order editable in situ. Two jobs, two surfaces; neither replaces the other.
 *
 * Series are ordered by name within each author, and authors by display name. One order, no toggle.
 *
 * Everything on a collapsed row comes from data already in the cache — `useBooks` (which embeds the
 * contributor join) and the widened `useSeriesList`. No query was added. Expanding a row mounts
 * `SeriesArranger`, whose `useSeriesDetail` materializes that one series' entries; doing that for
 * every series at page load would be a write storm, which is why the index itself reads only.
 */

function SeriesRow({
  name,
  books,
  entries,
  byId,
  tbrBookIds,
  expanded,
  onToggle,
  panelId,
}: {
  name: string
  books: readonly Book[]
  entries: readonly SeriesEntry[]
  byId: ReadonlyMap<string, Book>
  tbrBookIds: ReadonlySet<string>
  expanded: boolean
  onToggle: () => void
  panelId: string
}) {
  // Progress from entries when the series has been materialized (ghosts count as "to get"); from the
  // library books alone before that, which is all there is to count.
  const progress = entries.length
    ? seriesProgress(entries, byId)
    : { read: books.filter(isBookRead).length, total: books.length, toGet: 0 }
  const seriesCount = claimedSeriesLength(books)
  const total = displayTotal(seriesCount, entries.length || null, books.length)

  return (
    <li className="rounded-xl border border-line" style={{ background: 'var(--card)' }}>
      <div className="flex items-center gap-2 px-3 py-2.5">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          aria-controls={panelId}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
        >
          <span className="w-4 flex-none text-[11px]" style={{ color: 'var(--muted)' }} aria-hidden>
            {expanded ? '▾' : '▸'}
          </span>
          <span className="min-w-0 flex-1">
            <span
              className="block truncate text-[14px] font-semibold text-ink"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              {name}
            </span>
            <span className="block text-[12px] text-muted">
              {progressLine(progress)}
              {total ? ` · ${total} in all` : ''}
            </span>
          </span>
        </button>
        <Link
          to="/series/$seriesName"
          params={{ seriesName: encodeURIComponent(name) }}
          className="flex-none rounded-lg border border-line px-2.5 py-1 text-[12px] font-semibold text-ink"
          aria-label={`Open the ${name} series page`}
        >
          Open
        </Link>
      </div>
      <div id={panelId} hidden={!expanded} className="border-t border-line px-2.5 py-2">
        {/* Mounted only while expanded, so useSeriesDetail's reconciliation runs for one series on a
            deliberate gesture rather than for every series on page load. */}
        {expanded && <SeriesArranger name={name} books={byId} tbrBookIds={tbrBookIds} />}
      </div>
    </li>
  )
}

function SeriesIndexScreen() {
  const { data: books } = useBooks()
  const { data: seriesList } = useSeriesList()
  const { data: lists } = useLists()
  const { data: items } = useAllListItems()
  // A SET, not one open row: arranging often means comparing two series, and a cross-series drag has
  // to be ATTEMPTABLE for its refusal to be a real guard rather than a structural impossibility.
  const [open, setOpen] = useState<ReadonlySet<string>>(() => new Set())

  const byId = useMemo(() => new Map((books ?? []).map((b) => [b.id, b])), [books])

  const tbrBookIds = useMemo(() => {
    const tbrIds = new Set((lists ?? []).filter((l) => l.kind === 'tbr').map((l) => l.id))
    const out = new Set<string>()
    for (const it of items ?? []) if (tbrIds.has(it.list_id)) out.add(it.book_id)
    return out
  }, [lists, items])

  // Series NAME (as written on the series row) -> its live entries. Keyed by the row's own name so
  // the index and the entries agree on spelling; groupSeriesByAuthor trims book-side names to match.
  const entriesBySeries = useMemo(() => {
    const m = new Map<string, SeriesEntry[]>()
    for (const row of (seriesList ?? new Map()).values()) m.set(row.series.name, row.entries)
    return m
  }, [seriesList])

  const sections = useMemo(
    () => groupSeriesByAuthor(books ?? [], entriesBySeries),
    [books, entriesBySeries],
  )

  return (
    <section className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6">
      <header>
        <h1
          className="text-[26px] italic leading-tight text-ink"
          style={{ fontFamily: 'var(--font-display)', fontWeight: 600 }}
        >
          Series
        </h1>
        <p className="mt-1 text-[13px] text-muted">
          Every series you have, by author. Open one to arrange its reading order.
        </p>
      </header>

      {!sections.length ? (
        <p className="mt-8 text-[13.5px] text-muted">
          No series yet. Give a book a series name and it appears here.
        </p>
      ) : (
        <div className="mt-5 flex flex-col gap-6">
          {sections.map((section) => (
            <section
              key={section.key}
              aria-labelledby={`author-${section.key.replace(/\s+/g, '-')}`}
            >
              <h2
                id={`author-${section.key.replace(/\s+/g, '-')}`}
                className="mb-2 text-[13px] font-semibold uppercase tracking-wide"
                style={{ color: 'var(--muted)' }}
              >
                {section.name}
              </h2>
              <ul className="flex flex-col gap-2">
                {section.series.map((s) => {
                  const rowKey = `${section.key}::${s.name}`
                  return (
                    <SeriesRow
                      key={rowKey}
                      name={s.name}
                      books={s.books}
                      entries={entriesBySeries.get(s.name) ?? []}
                      byId={byId}
                      tbrBookIds={tbrBookIds}
                      expanded={open.has(rowKey)}
                      onToggle={() =>
                        setOpen((cur) => {
                          const next = new Set(cur)
                          if (!next.delete(rowKey)) next.add(rowKey)
                          return next
                        })
                      }
                      panelId={`arrange-panel-${rowKey.replace(/[^a-zA-Z0-9]+/g, '-')}`}
                    />
                  )
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
    </section>
  )
}

export const seriesIndexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'series',
  component: SeriesIndexScreen,
})
