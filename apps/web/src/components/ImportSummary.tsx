import type { ReactNode } from 'react'
import { StatNumber } from './Label'
import { summaryHeadline, summaryNotices } from './importSummaryCopy'
import type { ImportExportResult } from '../data/importLibrary'

// The post-import summary (docs/task-import-quality.md §4): reflects reality, honestly — what came
// in, what folded, where to-read rows landed, and what's still empty in bulk (covers we'll fetch).
// Modest scope: a few stat tiles + a line of plain-language notices. Not a report engine.

function Tile({ n, label }: { n: number; label: string }) {
  return (
    <div
      className="rounded-xl border border-line px-3 py-2.5 text-center"
      style={{ background: 'var(--field)' }}
    >
      <StatNumber className="block text-[22px] font-bold text-ink">{n}</StatNumber>
      <span className="text-[11px] uppercase tracking-[0.12em] text-muted">{label}</span>
    </div>
  )
}

/** The summary body (headline + tiles + notices). Callers wrap it with their own frame + actions. */
export function ImportSummary({
  result,
  children,
}: {
  result: ImportExportResult
  children?: ReactNode
}) {
  const r = result
  const notices = summaryNotices(r)
  return (
    <div>
      <p className="text-[14px] leading-relaxed text-muted">{summaryHeadline(r)}</p>
      <div className="mt-4 grid grid-cols-3 gap-2">
        <Tile n={r.added} label="Added" />
        <Tile n={r.merged} label="Merged" />
        <Tile n={r.extras.shelved} label="Shelved" />
      </div>
      {notices.length > 0 && (
        <ul className="mt-4 flex flex-col gap-1.5">
          {notices.map((line, i) => (
            <li key={i} className="text-[13px] leading-relaxed text-muted">
              {line}
            </li>
          ))}
        </ul>
      )}
      {children}
    </div>
  )
}
