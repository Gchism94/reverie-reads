import { useMemo, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { activeFilterCount, formatAuthors, type Book, type LibrarySort } from '@reverie/core'
import { useBooks } from '../data/books'
import { useFilters } from './filterStore'
import { SORTS } from './constants'
import { Frame } from '../components/Structure'

/** The deployed search-results panel (chunk-4: Aphelion "records panel, shown deployed"; Almanac
 *  "results filed in" — `2 ENTRIES // 0.2S · ESC CLOSES`). Composed for all nine from existing
 *  slots: a Frame under the search line, the top matches as rows, a skin-numeral count line, the
 *  Esc hint in the label voice. The grid keeps filtering live behind it. */
function SearchResultsPanel({ q, onPick }: { q: string; onPick: (b: Book) => void }) {
  const { data: books } = useBooks()
  const matches = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle || !books) return []
    return books
      .filter((b) =>
        [
          b.title,
          formatAuthors(b.contributors),
          [b.first, b.last].filter(Boolean).join(' '),
          b.series,
        ]
          .filter(Boolean)
          .some((f) => String(f).toLowerCase().includes(needle)),
      )
      .slice(0, 6)
  }, [books, q])
  if (!q.trim()) return null
  return (
    <Frame
      className="absolute left-0 right-0 top-[calc(100%+6px)] z-30 overflow-hidden p-2 shadow-lg"
      style={{ boxShadow: 'var(--shadow)' }}
    >
      <ul className="flex flex-col">
        {matches.map((b) => (
          <li key={b.id}>
            <button
              type="button"
              // mousedown so the pick lands before the input's blur closes the panel
              onMouseDown={(e) => {
                e.preventDefault()
                onPick(b)
              }}
              className="flex w-full items-baseline justify-between gap-3 px-2 py-1.5 text-left hover:bg-[var(--chip)]"
              style={{ borderRadius: 'calc(var(--radius-control) / 3)' }}
            >
              <span className="truncate text-[13.5px] font-semibold text-ink">{b.title}</span>
              <span className="skin-label flex-none text-[11px] text-muted">
                {formatAuthors(b.contributors) || [b.first, b.last].filter(Boolean).join(' ')}
              </span>
            </button>
          </li>
        ))}
      </ul>
      <div className="mt-1 flex items-baseline justify-between border-t border-line px-2 pt-1.5">
        <span
          className="skin-numeral text-[11px] font-semibold"
          style={{ color: 'var(--accent-ink)' }}
        >
          {matches.length} {matches.length === 1 ? 'match' : 'matches'}
        </span>
        <span className="skin-label text-[9.5px] text-muted">Esc closes</span>
      </div>
    </Frame>
  )
}

export function Toolbar({ filterToggleClass = '' }: { filterToggleClass?: string }) {
  const filters = useFilters((s) => s.filters)
  const mode = useFilters((s) => s.mode)
  const setQuery = useFilters((s) => s.setQuery)
  const setSort = useFilters((s) => s.setSort)
  const setMode = useFilters((s) => s.setMode)
  const togglePanel = useFilters((s) => s.togglePanel)
  const panelOpen = useFilters((s) => s.panelOpen)
  const setAuthor = useFilters((s) => s.setAuthor)
  const count = activeFilterCount(filters)
  const [searchFocused, setSearchFocused] = useState(false)
  const navigate = useNavigate()

  return (
    <div className="mb-3 flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <input
            type="search"
            value={filters.q}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setSearchFocused(false)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') (e.target as HTMLInputElement).blur()
            }}
            placeholder="Search title, author, series, trope…"
            aria-label="Search your library"
            className="skin-field h-10 w-full border border-line px-4 text-[14px] text-ink outline-none"
            style={{ background: 'var(--field)' }}
          />
          {searchFocused && (
            <SearchResultsPanel
              q={filters.q}
              onPick={(b) => navigate({ to: '/book/$bookId', params: { bookId: b.id } })}
            />
          )}
        </div>

        <button
          type="button"
          onClick={togglePanel}
          aria-expanded={panelOpen}
          className={`skin-control flex h-10 items-center gap-1.5 border border-line px-4 text-[13px] text-ink ${filterToggleClass}`}
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
          className="skin-control h-10 border border-line px-3 text-[13px] text-ink outline-none"
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
          className="skin-control flex h-10 items-center border border-line p-1"
          style={{ background: 'var(--card)' }}
        >
          {(['grid', 'series'] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              aria-pressed={mode === m}
              className="h-full px-3 text-[12.5px] font-semibold capitalize transition-colors"
              style={
                mode === m
                  ? {
                      borderRadius: 'var(--radius-control)',
                      background: 'var(--accent-fill)',
                      color: 'var(--on-primary)',
                    }
                  : { borderRadius: 'var(--radius-control)', color: 'var(--muted)' }
              }
            >
              {m}
            </button>
          ))}
        </div>
      </div>
      {filters.author && (
        <div className="flex flex-wrap items-center gap-2">
          <span
            className="skin-control inline-flex items-center gap-1.5 border border-line px-3 py-1 text-[12.5px] text-ink"
            style={{
              textTransform: 'none',
              /* SKIN-UPPERCASE-INTERIM */ background: 'var(--chip)',
            }}
          >
            Author: {filters.author}
            <button
              type="button"
              onClick={() => setAuthor('')}
              aria-label={`Clear author filter ${filters.author}`}
              className="text-muted hover:text-ink"
            >
              ✕
            </button>
          </span>
        </div>
      )}
    </div>
  )
}
