import { useMemo, useState, type ReactNode } from 'react'
import type { Book, SeriesLenBucket } from '@reverie/core'
import { useFilters } from './filterStore'
import { Chip } from '../components/Chip'
import { FORMATS, READ_STATUSES, SERIES_STATUSES, SUBGENRES } from './constants'
import { useLabels } from '../skin/labels'

const LEN_BUCKETS: SeriesLenBucket[] = ['Any', '1', '2', '3', '4', '5+', 'Unknown']

function Group({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="mb-3">
      <div className="mb-1.5 text-[11px] uppercase tracking-[0.2em] text-muted">{label}</div>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  )
}

export function FilterPanel({ books }: { books: Book[] }) {
  const s = useFilters()
  const { filters } = s
  const labels = useLabels()
  const [showAllTags, setShowAllTags] = useState(false)

  const subs = useMemo(
    () => ['All', ...SUBGENRES.filter((sub) => books.some((b) => b.subgenre === sub))],
    [books],
  )
  const tags = useMemo(() => {
    const counts = new Map<string, number>()
    for (const b of books) for (const t of b.tags) counts.set(t, (counts.get(t) ?? 0) + 1)
    const sorted = [...counts.keys()].sort((a, b) => (counts.get(b) ?? 0) - (counts.get(a) ?? 0))
    return { all: sorted, shown: showAllTags ? sorted : sorted.slice(0, 14) }
  }, [books, showAllTags])

  return (
    <div
      className="mb-4 rounded-2xl border border-line p-4 backdrop-blur"
      style={{ background: 'var(--card)' }}
    >
      <Group label="Subgenre">
        {subs.map((sub) => (
          <Chip key={sub} active={filters.sub === sub} onClick={() => s.setSub(sub)}>
            {sub}
          </Chip>
        ))}
      </Group>

      <Group label={labels.tags}>
        {tags.shown.map((t) => (
          <Chip key={t} active={filters.tags.includes(t)} onClick={() => s.toggleTag(t)}>
            {t}
          </Chip>
        ))}
        {tags.all.length > 14 && (
          <Chip onClick={() => setShowAllTags((v) => !v)}>
            {showAllTags ? 'show less' : 'show all'}
          </Chip>
        )}
      </Group>

      <Group label="Series status (completed?)">
        {(['All', ...SERIES_STATUSES] as const).map((v) => (
          <Chip key={v} active={filters.status === v} onClick={() => s.setStatus(v)}>
            {v}
          </Chip>
        ))}
      </Group>

      <Group label="Books in series">
        {LEN_BUCKETS.map((v) => (
          <Chip key={v} active={filters.len === v} onClick={() => s.setLen(v)}>
            {v === 'Unknown' ? 'None set' : v}
          </Chip>
        ))}
      </Group>

      <Group label="Reading status">
        {(['All', ...READ_STATUSES] as const).map((v) => (
          <Chip key={v} active={filters.read === v} onClick={() => s.setRead(v)}>
            {v}
          </Chip>
        ))}
      </Group>

      <Group label="Format">
        {(['All', ...FORMATS] as const).map((v) => (
          <Chip key={v} active={filters.format === v} onClick={() => s.setFormat(v)}>
            {v}
          </Chip>
        ))}
      </Group>

      <Group label="Other">
        <Chip active={filters.fave} onClick={s.toggleFave}>
          ♥ Favorites only
        </Chip>
        <Chip onClick={s.clear}>Clear all</Chip>
      </Group>
    </div>
  )
}
