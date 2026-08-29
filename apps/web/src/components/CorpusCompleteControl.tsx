import type { CorpusBulkProgress } from '../data/enrichCorpus'

export function CorpusCompleteControl({
  completing,
  progress,
  eligibleCount,
  onRun,
  onStop,
}: {
  completing: boolean
  progress: CorpusBulkProgress | null
  eligibleCount: number | null
  onRun: () => void
  onStop: () => void
}) {
  if (completing) {
    return (
      <button
        type="button"
        onClick={onStop}
        className="skin-control border border-line px-4 py-2 text-[13px] font-semibold text-ink"
        style={{ background: 'var(--field)' }}
      >
        ⏹ Stop shared corpus ({progress ? `${progress.scanned}/${progress.total}` : 'starting…'})
      </button>
    )
  }

  return (
    <button
      type="button"
      onClick={onRun}
      className="skin-control border border-line px-4 py-2 text-[13px] font-semibold text-ink"
      style={{ background: 'var(--field)' }}
    >
      ✨ Complete shared corpus covers &amp; info
      {eligibleCount !== null && eligibleCount > 0 ? ` (${eligibleCount})` : ''}
    </button>
  )
}
