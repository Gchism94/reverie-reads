import { useMemo, useState } from 'react'
import { createRoute } from '@tanstack/react-router'
import { FACET_LABELS, TROPE_FACETS, tropeMatches } from '@reverie/core'
import { rootRoute } from './RootRoute'
import { TropeChip } from '../components/TropeChip'
import { useAllBookTropes, useTropes } from '../data/tropes'
import { useLabels } from '../skin/labels'

/**
 * The tropes index (docs/task-trope-system.md §5): your active vocabulary ordered by usage —
 * the browsing entry point and the door to every trope page (where the per-trope sweep lives).
 * Private like everything else.
 */
function TropesScreen() {
  const labels = useLabels()
  const { data: tropes } = useTropes()
  const { data: assignments } = useAllBookTropes()
  const [q, setQ] = useState('')

  const usage = useMemo(() => {
    const counts = new Map<string, number>()
    for (const a of assignments ?? []) counts.set(a.trope_id, (counts.get(a.trope_id) ?? 0) + 1)
    return counts
  }, [assignments])

  const matching = useMemo(() => (tropes ?? []).filter((t) => tropeMatches(q, t)), [tropes, q])
  const active = matching
    .filter((t) => (usage.get(t.id) ?? 0) > 0)
    .sort((a, b) => (usage.get(b.id) ?? 0) - (usage.get(a.id) ?? 0) || a.name.localeCompare(b.name))

  return (
    <section className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
      <h1 className="text-[26px] italic leading-tight text-ink" style={{ fontFamily: 'var(--font-display)', fontWeight: 600 }}>
        {labels.tags}
      </h1>
      <p className="mt-0.5 text-[13px] text-muted">Your vocabulary, loudest first — open one to see its shelf and sweep your library.</p>

      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search names and aliases…"
        aria-label={`Search ${labels.tags}`}
        className="mt-3 h-10 w-full rounded-xl border border-line px-3 text-[14px] text-ink outline-none sm:max-w-sm"
        style={{ background: 'var(--field)' }}
      />

      {active.length > 0 && (
        <div className="mt-5">
          <h2 className="mb-2 text-[11px] uppercase tracking-[0.2em] text-muted">In your library</h2>
          <div className="flex flex-wrap items-center gap-1.5">
            {active.map((t) => (
              <span key={t.id} className="inline-flex items-center gap-1">
                <TropeChip name={t.name} emphasis="present" to={`/tropes/${t.id}`} />
                <span className="text-[11px] text-muted">×{usage.get(t.id)}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {TROPE_FACETS.map((facet) => {
        const group = matching.filter((t) => t.facet === facet && (usage.get(t.id) ?? 0) === 0).sort((a, b) => a.name.localeCompare(b.name))
        if (!group.length) return null
        return (
          <div key={facet} className="mt-5">
            <h2 className="mb-2 text-[11px] uppercase tracking-[0.2em] text-muted">{FACET_LABELS[facet]}</h2>
            <div className="flex flex-wrap gap-1.5">
              {group.slice(0, q ? 60 : 14).map((t) => (
                <TropeChip key={t.id} name={t.name} emphasis="off" to={`/tropes/${t.id}`} title={t.personal ? `${t.name} (yours)` : t.name} />
              ))}
            </div>
          </div>
        )
      })}
    </section>
  )
}

export const tropesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'tropes',
  component: TropesScreen,
})
