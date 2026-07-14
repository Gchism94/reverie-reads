import { useNavigate } from '@tanstack/react-router'
import { useChainStore } from '../lib/chainPrompt'
import { useBooks, useUpdateBook } from '../data/books'
import { useAllListItems, useAddListItem } from '../data/listItems'
import { useLists } from '../data/lists'
import { useAcquireGhost } from '../data/series'

/**
 * The one-tap next-in-series toast. Fixed above the nav, easily dismissed, and every action
 * closes it. A ghost target becomes a real (unowned) record first — the wanting context.
 */
export function ChainPrompt() {
  const target = useChainStore((s) => s.target)
  const close = useChainStore((s) => s.close)
  const navigate = useNavigate()
  const { data: books } = useBooks()
  const { data: lists } = useLists()
  const { data: items } = useAllListItems()
  const updateBook = useUpdateBook()
  const addListItem = useAddListItem()
  const acquire = useAcquireGhost(target?.seriesName ?? '')

  if (!target) return null
  const { entry } = target
  const linked = entry.bookId ? (books ?? []).find((b) => b.id === entry.bookId) : undefined
  const tbr = (lists ?? []).find((l) => l.kind === 'tbr')
  const tbrMax = tbr ? Math.max(0, ...(items ?? []).filter((it) => it.list_id === tbr.id).map((it) => it.position ?? 0)) : 0

  const readNow = () => {
    if (linked) {
      updateBook.mutate({ id: linked.id, patch: { readStatus: 'Reading', readingNowHidden: false } })
      close()
      void navigate({ to: '/book/$bookId', params: { bookId: linked.id } })
    } else {
      acquire.mutate(
        { entry, genre: target.genre },
        {
          onSuccess: (bookId) => {
            updateBook.mutate({ id: bookId, patch: { readStatus: 'Reading', readingNowHidden: false } })
            close()
            void navigate({ to: '/book/$bookId', params: { bookId } })
          },
          onError: close,
        },
      )
    }
  }

  const addNext = () => {
    if (linked) {
      if (tbr) addListItem.mutate({ listId: tbr.id, bookId: linked.id, afterPosition: tbrMax })
    } else {
      acquire.mutate({ entry, genre: target.genre, tbrId: tbr?.id })
    }
    close()
  }

  return (
    <div className="fixed inset-x-0 bottom-20 z-40 flex justify-center px-4 lg:bottom-6" role="status">
      <div
        className="flex w-full max-w-md flex-wrap items-center gap-2 rounded-2xl border p-3 shadow-xl backdrop-blur"
        style={{ borderColor: 'var(--accent-ink)', background: 'color-mix(in srgb, var(--card) 92%, transparent)' }}
      >
        <p className="min-w-0 flex-1 text-[13px] text-ink">
          <span className="block text-[10.5px] font-bold uppercase tracking-[0.2em]" style={{ color: 'var(--accent-ink)' }}>
            The story continues
          </span>
          <span className="block truncate font-semibold" style={{ fontFamily: 'var(--font-display)' }}>
            Next: {linked?.title ?? entry.title}
          </span>
        </p>
        <button type="button" onClick={readNow} className="rounded-full px-3 py-1.5 text-[12px] font-semibold" style={{ background: 'var(--accent-fill)', color: 'var(--on-primary)' }}>
          Reading now
        </button>
        <button type="button" onClick={addNext} className="rounded-full border border-line px-3 py-1.5 text-[12px] font-semibold text-ink" style={{ background: 'var(--card)' }}>
          {linked ? (tbr ? `Add to ${tbr.name}` : 'Keep it in mind') : tbr ? `⊹ Add to ${tbr.name}` : '⊹ Add to wishlist'}
        </button>
        <button type="button" onClick={close} aria-label="Dismiss" className="h-8 w-8 rounded-full text-[13px] text-muted hover:text-ink">
          ✕
        </button>
      </div>
    </div>
  )
}
