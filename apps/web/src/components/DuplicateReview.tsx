import { useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import {
  mergeDifferences,
  mergeImport,
  type Book,
  type Incoming,
  type MatchStrength,
  type MergeDifference,
} from '@reverie/core'
import { useBooks } from '../data/books'
import { resolveCandidate, type ReviewAction } from '../data/duplicates'
import { verdictLookupKey, type ReviewCandidate } from '../data/intake'
import { Surface } from './Surface'

const STRENGTH_LABEL: Record<MatchStrength, string> = {
  isbn: 'same ISBN',
  'title-author': 'same title + author',
  'title-series-pos': 'same series position',
  fuzzy: 'similar title — may be a different book',
  none: '',
}

const FIELD_LABELS: Record<string, string> = {
  cover: 'cover',
  series: 'series',
  position: 'series #',
  seriesCount: 'series length',
  isbn: 'ISBN',
  pub: 'publication date',
  intensity: 'intensity',
  rating: 'rating',
  tags: 'tags',
  genres: 'genres',
  owned: 'formats owned',
  status: 'series status',
  genre: 'genre',
  subgenre: 'subgenre',
  first: 'author',
  last: 'author',
  format: 'format',
  source: 'source',
  readStatus: 'read status',
}

/** Human summary of what folding the incoming record would ADD to the existing one. */
function foldSummary(existing: Book, inc: Incoming): string[] {
  const { patch, newReads } = mergeImport(existing, inc)
  const fields = Object.keys(patch).map((k) => FIELD_LABELS[k] ?? k)
  const seen = new Set<string>()
  const out = fields.filter((f) => (seen.has(f) ? false : (seen.add(f), true)))
  if (newReads.length) out.push(`${newReads.length} read date${newReads.length > 1 ? 's' : ''}`)
  return out
}

const author = (inc: Incoming) => [inc.first, inc.last].filter(Boolean).join(' ')

/**
 * THE DIFFERS LINE — the one place its phrasing lives, so changing the wording is a one-function
 * edit rather than a hunt through JSX.
 *
 * It narrates what the merge SILENTLY DISCARDS: `mergeImport`'s patch reports only what a merge
 * ADDS, so a field both records set — the reader's 4.5 rating against an import's 5 — renders
 * nothing at all today. `mergeDifferences` (core, sharing the merge's own field classification)
 * finds those pairs; this states them.
 *
 * PASSIVE BY DESIGN — not a picker. The measured contested count is 0-1 fields on a typical merge,
 * and the most common one (`rating`) is a value no import may move at all. Two server-side
 * decisions a control could never reach even if one were built: the plan moves whole-or-not-at-all
 * (merge_books' `take_plan`) and `series_user_chosen` is derived inside the RPC.
 *
 * Returns null when nothing differs, which is most merges — a "differs: —" on every card is the
 * noise that teaches a reader to stop reading the line.
 */
function differsLine(diffs: readonly MergeDifference[]): string | null {
  if (!diffs.length) return null
  return `differs: ${diffs.map((d) => `${d.field} ${d.kept} kept over ${d.offered}`).join(', ')}`
}

export function DuplicateReview({
  candidates,
  onDone,
}: {
  candidates: ReviewCandidate[]
  onDone?: () => void
}) {
  const qc = useQueryClient()
  const { data: books } = useBooks()
  const byId = useMemo(() => new Map((books ?? []).map((b) => [b.id, b])), [books])

  const [queue, setQueue] = useState<ReviewCandidate[]>(candidates)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const keyOf = (c: ReviewCandidate) => verdictLookupKey(c.existingId, c.incoming)

  async function resolveMany(items: ReviewCandidate[], action: ReviewAction) {
    setBusy(true)
    setError(null)
    const done = new Set<string>()
    try {
      for (const c of items) {
        const existing = byId.get(c.existingId)
        if (!existing) continue
        await resolveCandidate(c, existing, action)
        done.add(keyOf(c))
      }
    } catch (e) {
      setError(`Couldn’t finish: ${(e as Error).message}`)
    }
    setQueue((q) => q.filter((c) => !done.has(keyOf(c))))
    setSelected((s) => {
      const next = new Set(s)
      done.forEach((k) => next.delete(k))
      return next
    })
    await qc.invalidateQueries({ queryKey: ['books'] })
    await qc.invalidateQueries({ queryKey: ['reads', 'all'] })
    setBusy(false)
  }

  if (!queue.length) {
    return <p className="text-[13px] text-muted">All set — no duplicates left to review ✨</p>
  }

  const selectedItems = queue.filter((c) => selected.has(keyOf(c)))
  const allSelected = selected.size === queue.length

  return (
    <div className="flex flex-col gap-3">
      <Surface
        tone="field"
        radius="card"
        pad={0}
        className="flex flex-wrap items-center gap-2 p-2.5"
      >
        <label className="flex items-center gap-2 text-[12.5px] text-ink">
          <input
            type="checkbox"
            checked={allSelected}
            onChange={(e) => setSelected(e.target.checked ? new Set(queue.map(keyOf)) : new Set())}
          />
          Select all ({queue.length})
        </label>
        <span className="flex-1" />
        <span className="text-[12px] text-muted">
          Apply to {selectedItems.length || 'selected'}:
        </span>
        <button
          type="button"
          disabled={busy || !selectedItems.length}
          onClick={() => void resolveMany(selectedItems, 'merge')}
          className="skin-control px-3 py-1.5 text-[12.5px] font-semibold text-on-primary disabled:opacity-40"
          style={{ background: 'var(--accent-fill)' }}
        >
          Merge
        </button>
        <button
          type="button"
          disabled={busy || !selectedItems.length}
          onClick={() => void resolveMany(selectedItems, 'keep_both')}
          className="skin-control border border-line px-3 py-1.5 text-[12.5px] font-semibold text-ink disabled:opacity-40"
          style={{ background: 'var(--card)' }}
        >
          Keep both
        </button>
        <button
          type="button"
          disabled={busy || !selectedItems.length}
          onClick={() => void resolveMany(selectedItems, 'dismiss')}
          className="skin-control border border-line px-3 py-1.5 text-[12.5px] font-semibold text-muted disabled:opacity-40"
          style={{ background: 'var(--card)' }}
        >
          Dismiss
        </button>
      </Surface>

      {error && <p className="text-[12.5px] text-primary">{error}</p>}

      {queue.map((c) => {
        const existing = byId.get(c.existingId)
        const adds = existing ? foldSummary(existing, c.incoming) : []
        const differs = existing ? differsLine(mergeDifferences(existing, c.incoming)) : null
        const k = keyOf(c)
        return (
          <Surface key={k} tone="card" radius="card" pad={2}>
            <div className="flex items-start gap-2">
              <input
                type="checkbox"
                className="mt-1"
                checked={selected.has(k)}
                onChange={(e) =>
                  setSelected((s) => {
                    const n = new Set(s)
                    if (e.target.checked) n.add(k)
                    else n.delete(k)
                    return n
                  })
                }
                aria-label={`Select ${c.incoming.title}`}
              />
              <div className="min-w-0 flex-1">
                <div className="text-[14px] font-semibold text-ink">
                  {c.incoming.title}{' '}
                  <span className="text-[12px] font-normal text-muted">
                    · {author(c.incoming) || 'unknown author'}
                  </span>
                </div>
                <div className="mt-0.5 text-[12.5px] text-muted">
                  Matches your <span className="text-ink">{c.existingTitle}</span>
                  {c.existingAuthor ? ` · ${c.existingAuthor}` : ''}{' '}
                  <span className="italic">({STRENGTH_LABEL[c.strength]})</span>
                </div>
                <div className="mt-1.5 grid gap-1 text-[12.5px] sm:grid-cols-2">
                  <Surface tone="field" radius="card" pad={0} className="px-2 py-1">
                    <span className="text-[11px] uppercase tracking-[0.12em] text-muted">Kept</span>
                    <div className="text-ink">
                      your entry — rating, notes, shelves &amp; reads stay
                    </div>
                  </Surface>
                  <Surface tone="field" radius="card" pad={0} className="px-2 py-1">
                    <span className="text-[11px] uppercase tracking-[0.12em] text-muted">
                      Added on merge
                    </span>
                    <div className="text-ink">
                      {adds.length ? adds.join(', ') : 'nothing new — already complete'}
                    </div>
                  </Surface>
                </div>
                {differs && (
                  <p className="mt-1 text-[12px] text-muted" data-testid="merge-differs">
                    {differs}
                  </p>
                )}
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void resolveMany([c], 'merge')}
                    className="skin-control px-3 py-1.5 text-[12.5px] font-semibold text-on-primary disabled:opacity-40"
                    style={{ background: 'var(--accent-fill)' }}
                  >
                    Merge
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void resolveMany([c], 'keep_both')}
                    className="skin-control border border-line px-3 py-1.5 text-[12.5px] font-semibold text-ink disabled:opacity-40"
                    style={{ background: 'var(--field)' }}
                  >
                    Keep both
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void resolveMany([c], 'always_merge')}
                    className="skin-control border border-line px-3 py-1.5 text-[12.5px] font-semibold text-muted disabled:opacity-40"
                    style={{ background: 'var(--field)' }}
                    title="Merge now and auto-merge this pair on future imports"
                  >
                    Always merge
                  </button>
                </div>
              </div>
            </div>
          </Surface>
        )
      })}

      {onDone && (
        <button type="button" onClick={onDone} className="self-start text-[12.5px] text-primary">
          Done reviewing
        </button>
      )}
    </div>
  )
}
