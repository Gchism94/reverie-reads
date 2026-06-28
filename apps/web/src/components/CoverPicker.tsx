import { useState } from 'react'
import { useUpdateBook } from '../data/books'
import { useCoverAlternates } from '../data/coverStudio'
import { clearCoverBroken } from '../data/brokenCovers'
import { cacheCoverUrl, type CoverAlternate } from '../lib/enrich'

/**
 * Cover Studio — pick a found edition. Expands to the E1 alternate covers (fetched on demand) and sets
 * the chosen one as the book's cover at high (user-confirmed) confidence. The first slice of the
 * Studio's actions; upload / phone photo / themed-placeholder-as-cover come with the design pass.
 */
export function CoverPicker({
  book,
  onPicked,
}: {
  book: { id: string; title?: string; first?: string; last?: string }
  onPicked?: () => void
}) {
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const update = useUpdateBook()
  const { data: alternates, isLoading } = useCoverAlternates(book, open)

  const pick = async (alt: CoverAlternate) => {
    if (!alt.cover || saving) return
    setSaving(true)
    // Materialize the chosen cover to Storage (owned/CDN) before saving it — falls back to the source URL.
    const cover = await cacheCoverUrl({ cover: alt.cover, isbn13: alt.isbn13 })
    update.mutate({ id: book.id, patch: { cover, coverConfidence: 'high' } })
    clearCoverBroken(book.id)
    setSaving(false)
    setOpen(false)
    onPicked?.()
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-1 w-full rounded-full border border-line px-2 py-1 text-[11px] font-semibold text-ink"
        style={{ background: 'var(--field)' }}
      >
        Choose cover
      </button>
    )
  }

  const alts = alternates ?? []
  return (
    <div className="mt-1 rounded-lg border border-line p-2" style={{ background: 'var(--field)' }}>
      {isLoading && <div className="text-[11px] text-muted">Finding editions…</div>}
      {saving && <div className="text-[11px] text-muted">Saving cover…</div>}
      {!isLoading && !saving && alts.length === 0 && <div className="text-[11px] text-muted">No other editions found.</div>}
      {alts.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {alts.map((a, i) => (
            <li key={a.isbn13 || a.cover || i}>
              <button
                type="button"
                onClick={() => void pick(a)}
                disabled={saving}
                aria-label={`Use the ${a.source} edition cover`}
                className="block w-12 overflow-hidden rounded border border-line disabled:opacity-50"
                style={{ aspectRatio: '2 / 3' }}
              >
                <img src={a.cover} alt="" loading="lazy" className="h-full w-full object-cover" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <button type="button" onClick={() => setOpen(false)} disabled={saving} className="mt-1.5 text-[11px] text-muted underline disabled:opacity-50">
        Cancel
      </button>
    </div>
  )
}
