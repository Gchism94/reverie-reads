import { useNavigate } from '@tanstack/react-router'
import { authorOf, SERIES_STATUS_LABELS, type Book, type SeriesGroup } from '@reverie/core'
import { subgenreGradient } from './constants'
import { useSeriesList } from '../data/series'

const posNum = (b: Book) => (typeof b.position === 'number' ? b.position : Number(b.position) || 0)
const isRead = (b: Book) => b.readStatus === 'Read' || b.reads.length > 0

/**
 * Library Series mode (docs/task-series-experience.md §3) — each series as a compact strip:
 * covers in reading order, read ticks, "X to get", the series' publication status. The strip is
 * a door: tapping opens the full series page (which owns ghosts, Next Up, and reorder).
 * Standalones stay in the Grid view — a series list stays a series list (reported call).
 */
function badgeFor(g: SeriesGroup, canonicalTotal: number | null): { text: string; bg: string; fg: string } {
  const total = canonicalTotal ?? g.total
  if (total && g.owned < total)
    return { text: `📚 ${total - g.owned} to get`, bg: 'rgba(232,58,120,0.16)', fg: 'var(--primary)' }
  if (total && g.read >= total)
    return { text: '✓ Series done', bg: 'rgba(123,63,160,0.18)', fg: 'var(--ink)' }
  if (!total) return { text: 'length not set', bg: 'rgba(123,63,160,0.14)', fg: 'var(--muted)' }
  return { text: '✓ All collected', bg: 'rgba(123,63,160,0.18)', fg: 'var(--ink)' }
}

function SeriesCard({
  group,
  canonicalTotal,
  status,
  onOpen,
}: {
  group: SeriesGroup
  canonicalTotal: number | null
  status: string | null
  onOpen: () => void
}) {
  const badge = badgeFor(group, canonicalTotal)
  const slots = Math.min(Math.max(group.owned, canonicalTotal ?? group.total ?? 0), 10)
  const hasPos = group.books.some((b) => b.position !== '' && b.position != null)

  const spines = []
  for (let i = 1; i <= slots; i++) {
    const b = hasPos ? group.books.find((x) => posNum(x) === i) : group.books[i - 1]
    if (b) {
      const [g0, g1] = subgenreGradient(b.subgenre, b.genre)
      spines.push(
        <div
          key={i}
          title={b.title}
          className="relative h-12 w-3 flex-none overflow-hidden rounded-sm"
          style={{ background: b.cover ? `center/cover url(${b.coverThumb || b.cover})` : `linear-gradient(${g0}, ${g1})` }}
        >
          {isRead(b) && (
            <span
              className="absolute inset-x-0 bottom-0 text-center text-[7px] leading-3"
              style={{ background: 'var(--gold)', color: '#3a2400' }}
            >
              ✓
            </span>
          )}
        </div>,
      )
    } else {
      spines.push(
        <div
          key={i}
          title={`#${i} — not on your shelf`}
          className="h-12 w-3 flex-none rounded-sm border border-dashed border-line"
        />,
      )
    }
  }

  return (
    <button
      type="button"
      onClick={onOpen}
      className="rounded-2xl border border-line p-4 text-left backdrop-blur"
      style={{ background: 'var(--card)' }}
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-[18px] italic text-ink" style={{ fontFamily: 'var(--font-display)', fontWeight: 600 }}>
          {group.name}
        </h3>
        <span
          className="flex-none rounded-full px-2 py-0.5 text-[11px] font-semibold"
          style={{ background: badge.bg, color: badge.fg }}
        >
          {badge.text}
        </span>
      </div>
      <div className="mt-1 text-[12px] text-muted">
        {authorOf(group.books[0] ?? ({} as Book))} · {group.owned} owned
        {canonicalTotal ?? group.total ? ` of ${canonicalTotal ?? group.total}` : ''} · {group.read} read
        {status && <> · {SERIES_STATUS_LABELS[status as keyof typeof SERIES_STATUS_LABELS] ?? status}</>}
      </div>
      <div className="mt-3 flex items-end gap-1">{spines}</div>
    </button>
  )
}

export function SeriesView({ groups }: { groups: SeriesGroup[]; allBooks: Book[] }) {
  const navigate = useNavigate()
  const { data: canonical } = useSeriesList()

  const openSeries = (name: string) =>
    void navigate({ to: '/series/$seriesName', params: { seriesName: encodeURIComponent(name) } })

  const newSeries = () => {
    const name = window.prompt('Name the series — you can add books on its page.')?.trim()
    if (name) openSeries(name)
  }

  return (
    <>
      <div className="mb-3 flex items-center justify-end">
        <button
          type="button"
          onClick={newSeries}
          className="rounded-full border border-line px-3.5 py-1.5 text-[12.5px] font-semibold text-ink"
          style={{ background: 'var(--card)' }}
        >
          ＋ New series
        </button>
      </div>
      {!groups.length && (
        <p className="px-2 py-10 text-center text-[14px] text-muted">
          No series match these filters. Add a series name to a book via “edit details”, or start
          one with ＋ New series.
        </p>
      )}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {groups.map((g) => {
          const canon = canonical?.get(g.name.toLowerCase())
          return (
            <SeriesCard
              key={g.name}
              group={g}
              canonicalTotal={canon?.total && canon.total > g.books.length ? canon.total : null}
              status={canon?.series.status ?? null}
              onOpen={() => openSeries(g.name)}
            />
          )
        })}
      </div>
    </>
  )
}
