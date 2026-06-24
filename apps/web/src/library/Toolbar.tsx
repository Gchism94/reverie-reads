import { activeFilterCount, type LibrarySort } from '@reverie/core'
import { useFilters } from './filterStore'
import { SORTS } from './constants'

export function Toolbar() {
  const filters = useFilters((s) => s.filters)
  const mode = useFilters((s) => s.mode)
  const setQuery = useFilters((s) => s.setQuery)
  const setSort = useFilters((s) => s.setSort)
  const setMode = useFilters((s) => s.setMode)
  const togglePanel = useFilters((s) => s.togglePanel)
  const panelOpen = useFilters((s) => s.panelOpen)
  const count = activeFilterCount(filters)

  return (
    <div className="mb-3 flex flex-wrap items-center gap-2">
      <input
        type="search"
        value={filters.q}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search title, author, series, trope…"
        aria-label="Search your library"
        className="h-10 min-w-[200px] flex-1 rounded-full border border-line px-4 text-[14px] text-ink outline-none"
        style={{ background: 'var(--field)' }}
      />

      <button
        type="button"
        onClick={togglePanel}
        aria-expanded={panelOpen}
        className="flex h-10 items-center gap-1.5 rounded-full border border-line px-4 text-[13px] font-semibold text-ink"
        style={{ background: 'var(--card)' }}
      >
        Filters{count > 0 && <span className="text-gold">({count})</span>}
      </button>

      <label className="sr-only" htmlFor="lib-sort">
        Sort
      </label>
      <select
        id="lib-sort"
        value={filters.sort}
        onChange={(e) => setSort(e.target.value as LibrarySort)}
        className="h-10 rounded-full border border-line px-3 text-[13px] font-semibold text-ink outline-none"
        style={{ background: 'var(--card)' }}
      >
        {SORTS.map((s) => (
          <option key={s.value} value={s.value}>
            {s.label}
          </option>
        ))}
      </select>

      <div
        role="group"
        aria-label="View mode"
        className="flex h-10 items-center rounded-full border border-line p-1"
        style={{ background: 'var(--card)' }}
      >
        {(['grid', 'series'] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            aria-pressed={mode === m}
            className="h-full rounded-full px-3 text-[12.5px] font-semibold capitalize transition-colors"
            style={mode === m ? { background: 'var(--accent-fill)', color: 'var(--on-primary)' } : { color: 'var(--muted)' }}
          >
            {m}
          </button>
        ))}
      </div>
    </div>
  )
}
