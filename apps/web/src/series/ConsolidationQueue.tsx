import { useMemo, useState } from 'react'
import {
  proposeConsolidation,
  type ConsolidationCandidate,
  type ConsolidationSeries,
} from '@reverie/core'
import { Button } from '../components/Button'
import { Surface } from '../components/Surface'
import {
  useMergeSeries,
  useRecordSeriesRuling,
  useSeriesRulings,
  useTier2AutoMerge,
} from '../data/seriesConsolidation'

/**
 * The Tier 3 queue, plus Tier 2's mount point (fix/series-consolidation, PR 3).
 *
 * The spec's three nevers are hard constraints and each has a shape here:
 *   NEVER MODAL — this is an inline section on /series; nothing overlays, nothing traps focus.
 *   NEVER BLOCKING — the page's sections render with or without it; every control is optional.
 *   NEVER ON LOAD — it renders collapsed to one quiet line ("N pairs look like duplicates"), and
 *     the cards appear only when the reader opens it. Nothing is asked at app start, and "Not now"
 *     puts even the line away for the visit.
 *
 * The durable dismissal is the RULING, not the collapse: distinct and related_but_separate write
 * through record_series_ruling and the pair never proposes again. related_but_separate is a real
 * third outcome, not a flavor of distinct — it records sibling series in a shared universe
 * (Sinners / Sinners and Saints), which is the seed data for the universe layer, and collapsing it
 * into 'distinct' would throw that relationship away at the moment the reader states it.
 *
 * Tier 2 (exact variants) never renders anything: useTier2AutoMerge fires those merges silently on
 * this surface's mount. See that hook's header for the trigger-point argument.
 */

function ProposalCard({ candidate }: { candidate: ConsolidationCandidate }) {
  const merge = useMergeSeries()
  const rule = useRecordSeriesRuling()
  // Which row survives a merge is the reader's call — default from pickPrimary's cargo rule.
  const [keepId, setKeepId] = useState(candidate.primary.id)
  const busy = merge.isPending || rule.isPending

  const ordered = [candidate.primary, candidate.loser]
  const chosen = keepId === candidate.primary.id ? candidate : swapped(candidate)

  return (
    <Surface as="li" tone="card" radius="card" pad={3} className="flex flex-col gap-2.5">
      <p className="text-[13px] text-muted">These may be the same series written two ways.</p>
      <div role="radiogroup" aria-label="Which name to keep" className="flex flex-col gap-1.5">
        {ordered.map((s) => (
          <label
            key={s.id}
            className="flex cursor-pointer items-baseline gap-2 rounded-[var(--radius-control)] px-2 py-1.5"
            style={{ background: keepId === s.id ? 'var(--chip)' : 'transparent' }}
          >
            <input
              type="radio"
              name={`keep-${candidate.primary.id}-${candidate.loser.id}`}
              checked={keepId === s.id}
              onChange={() => setKeepId(s.id)}
              disabled={busy}
            />
            <span className="min-w-0">
              <span
                className="block truncate text-[14px] font-semibold text-ink"
                style={{ fontFamily: 'var(--font-display)' }}
              >
                {s.name}
              </span>
              <span className="block text-[12px] text-muted">
                {s.memberBooks} {s.memberBooks === 1 ? 'book' : 'books'} · {s.liveEntries} in the
                reading order
              </span>
            </span>
          </label>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button disabled={busy} onClick={() => merge.mutate(chosen)}>
          Same series — merge
        </Button>
        <Button
          variant="secondary"
          disabled={busy}
          onClick={() => rule.mutate({ candidate, ruling: 'distinct' })}
        >
          Distinct — keep both
        </Button>
        <Button
          variant="secondary"
          disabled={busy}
          onClick={() => rule.mutate({ candidate, ruling: 'related_but_separate' })}
        >
          Related, but separate
        </Button>
      </div>
      <p className="text-[12px]" style={{ color: 'var(--faint)' }}>
        Merging keeps every entry, ghost and removed slot under the name you pick. “Related”
        remembers they share a universe while keeping their own reading orders. Either way, you
        won’t be asked about this pair again.
      </p>
    </Surface>
  )
}

/** The candidate with primary/loser reversed — the reader chose the other survivor. */
function swapped(c: ConsolidationCandidate): ConsolidationCandidate {
  return { ...c, primary: c.loser, loser: c.primary }
}

export function ConsolidationQueue({ rows }: { rows: readonly ConsolidationSeries[] }) {
  const { data: rulings } = useSeriesRulings()
  const candidates = useMemo(
    // Until the rulings have loaded there are NO candidates — proposing (or auto-merging) before
    // the suppression set is in memory would re-surface pairs the reader already ruled on.
    () => (rulings ? proposeConsolidation(rows, rulings) : []),
    [rows, rulings],
  )
  useTier2AutoMerge(candidates)

  const proposals = candidates.filter((c) => c.tier === 3)
  const [open, setOpen] = useState(false)
  const [dismissed, setDismissed] = useState(false)
  if (!proposals.length || dismissed) return null

  return (
    <section aria-label="Possible duplicate series" className="mt-4">
      <Surface tone="card" radius="panel" pad={3}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[13.5px] text-ink">
            {proposals.length === 1
              ? '1 pair of series looks like a duplicate.'
              : `${proposals.length} pairs of series look like duplicates.`}
          </p>
          <div className="flex items-center gap-1.5">
            <Button variant="secondary" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
              {open ? 'Hide' : 'Review'}
            </Button>
            <Button variant="ghost" onClick={() => setDismissed(true)}>
              Not now
            </Button>
          </div>
        </div>
        {open && (
          <ul className="mt-3 flex flex-col gap-2.5">
            {proposals.map((c) => (
              <ProposalCard key={`${c.nameKeyA}:${c.nameKeyB}`} candidate={c} />
            ))}
          </ul>
        )}
      </Surface>
    </section>
  )
}
