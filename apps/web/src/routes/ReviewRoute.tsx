import { useMemo } from 'react'
import { createRoute, Link } from '@tanstack/react-router'
import type { Book, NeedsLookItem, NeedsLookReason } from '@reverie/core'
import { rootRoute } from './RootRoute'
import { useBooks } from '../data/books'
import { useImportReviewModel } from '../data/importReview'
import { CoverImage } from '../components/CoverImage'

const REASON_LABEL: Record<NeedsLookReason, string> = {
  missing_cover: 'No cover',
  low_confidence_cover: 'Low-confidence cover',
  broken_cover: 'Broken cover',
  odd_genre: 'Unmapped genre',
  likely_duplicate: 'Likely duplicate',
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-line px-3 py-2.5" style={{ background: 'var(--card)' }}>
      <div className="text-[20px] font-semibold text-ink" style={{ fontFamily: 'var(--font-display)' }}>
        {value}
      </div>
      <div className="text-[11px] uppercase tracking-[0.12em] text-muted">{label}</div>
    </div>
  )
}

/** A triage tile: shows the book's cover (low-confidence) or the skin placeholder (missing); a dead
 *  link falls back to the placeholder and is reported (CoverImage). */
function TriageTile({ item, book }: { item: NeedsLookItem; book?: Book }) {
  const coverBook = book ?? { id: item.ref, title: item.title, last: item.author, cover: '' }
  return (
    <li className="w-[132px] flex-none">
      <div className="aspect-[2/3] overflow-hidden rounded-[10px] border border-line" style={{ background: 'var(--field)' }}>
        <CoverImage book={coverBook} />
      </div>
      <div className="mt-1.5 truncate text-[12.5px] font-semibold text-ink">{item.title}</div>
      {item.author && <div className="truncate text-[11px] text-muted">{item.author}</div>}
      <div className="mt-1 inline-block rounded-full border border-line px-2 py-0.5 text-[10px] text-muted" style={{ background: 'var(--chip)' }}>
        {REASON_LABEL[item.reason]}
      </div>
    </li>
  )
}

function ListBucket({ title, items }: { title: string; items: NeedsLookItem[] }) {
  if (!items.length) return null
  return (
    <section className="mt-5">
      <h3 className="text-[13px] font-semibold text-ink">
        {title} <span className="text-muted">· {items.length}</span>
      </h3>
      <ul className="mt-2 flex flex-col gap-1.5">
        {items.map((i) => (
          <li key={i.ref} className="rounded-xl border border-line px-3 py-2" style={{ background: 'var(--card)' }}>
            <div className="truncate text-[13.5px] font-semibold text-ink">{i.title}</div>
            <div className="text-[12px] text-muted">
              {i.author ? `${i.author} · ` : ''}
              {i.detail}
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}

function ReviewScreen() {
  const model = useImportReviewModel()
  const { data: books } = useBooks()
  const byId = useMemo(() => new Map((books ?? []).map((b) => [b.id, b])), [books])

  if (!model) {
    return (
      <section className="mx-auto max-w-2xl px-4 py-10 text-center sm:px-6">
        <h1 className="text-[22px] italic text-ink" style={{ fontFamily: 'var(--font-display)', fontWeight: 600 }}>
          Import review
        </h1>
        <p className="mt-2 text-[13px] text-muted">Nothing to review yet. Import a library export to see what came in and what needs a look.</p>
        <Link to="/settings" className="mt-4 inline-block rounded-full px-5 py-2 text-[14px] font-semibold" style={{ background: 'var(--accent-fill)', color: 'var(--on-primary)' }}>
          Go to import
        </Link>
      </section>
    )
  }

  const { summary, needsLook, coverTriage } = model
  const genreChips = Object.entries(summary.genres).sort((a, b) => b[1] - a[1])

  return (
    <section className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
      <h1 className="text-[22px] italic text-ink" style={{ fontFamily: 'var(--font-display)', fontWeight: 600 }}>
        Import review
      </h1>
      <p className="mb-4 text-[13px] text-muted">What came in, and what needs a look. Covers fill in as enrichment runs.</p>

      {/* summary */}
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
        <Stat label="Total" value={summary.total} />
        <Stat label="Added" value={summary.added} />
        <Stat label="Merged" value={summary.merged} />
        <Stat label="In series" value={summary.inSeries} />
        <Stat label="Standalone" value={summary.standalones} />
        <Stat label="Orders" value={summary.readingOrdersBuilt} />
      </div>

      {genreChips.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {genreChips.map(([g, n]) => (
            <span key={g} className="rounded-full border border-line px-2.5 py-1 text-[12px] text-ink" style={{ background: 'var(--chip)' }}>
              {g === '∅' ? 'Unresolved' : g} <span className="text-muted">{n}</span>
            </span>
          ))}
        </div>
      )}

      {/* cover triage */}
      {coverTriage.length > 0 && (
        <section className="mt-6">
          <h2 className="text-[15px] font-semibold text-ink" style={{ fontFamily: 'var(--font-display)' }}>
            Covers to sort <span className="text-muted">· {coverTriage.length}</span>
          </h2>
          <p className="mb-2 text-[12px] text-muted">Missing, low-confidence, or broken. The Cover Studio (next) adds pick / upload / photo / themed placeholder here.</p>
          <ul className="flex flex-wrap gap-3">
            {coverTriage.map((i) => (
              <TriageTile key={i.ref} item={i} book={byId.get(i.ref)} />
            ))}
          </ul>
        </section>
      )}

      <ListBucket title="Unmapped genres" items={needsLook.oddGenre} />
      <ListBucket title="Likely duplicates" items={needsLook.likelyDuplicate} />

      {coverTriage.length === 0 && !needsLook.oddGenre.length && !needsLook.likelyDuplicate.length && (
        <p className="mt-6 rounded-xl border border-line px-3 py-3 text-center text-[13px] text-muted" style={{ background: 'var(--card)' }}>
          Nothing needs a look — every book came in clean. ✦
        </p>
      )}
    </section>
  )
}

export const reviewRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'review',
  component: ReviewScreen,
})
