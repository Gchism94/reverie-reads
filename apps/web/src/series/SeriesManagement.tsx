import { useMemo, useState } from 'react'
import {
  canonicalPairKeys,
  seriesNameKey,
  type ConsolidationCandidate,
  type ConsolidationSeries,
  type SeriesEntry,
} from '@reverie/core'
import { Button } from '../components/Button'
import { Modal } from '../components/Modal'
import { Surface } from '../components/Surface'
import {
  useArchivedSeriesList,
  useArchiveSeries,
  useRestoreSeries,
  useUpdateSeries,
  type UiSeries,
} from '../data/series'
import { useMergeSeries } from '../data/seriesConsolidation'

export interface SeriesManagementRow extends ConsolidationSeries {
  series: UiSeries
  entries: readonly SeriesEntry[]
  possessedBooks: number
  ghostEntries: number
  unreviewedEntries: number
  removedEntries: number
}

const messageOf = (error: unknown): string =>
  error instanceof Error && error.message.trim() ? error.message : 'The change could not be saved.'

export function RenameSeriesDialog({
  row,
  onClose,
  onRenamed,
}: {
  row: SeriesManagementRow
  onClose: () => void
  onRenamed?: (name: string) => void
}) {
  const [name, setName] = useState(row.name)
  const update = useUpdateSeries(row.name)
  const nextName = name.trim()

  return (
    <Modal title={`Rename ${row.name}`} onClose={onClose}>
      <form
        onSubmit={(event) => {
          event.preventDefault()
          if (!nextName || nextName === row.name || update.isPending) return
          update.mutate(
            { id: row.id, name: nextName },
            {
              onSuccess: () => {
                onRenamed?.(nextName)
                onClose()
              },
            },
          )
        }}
      >
        <label htmlFor="series-rename" className="block text-[13px] font-semibold text-ink">
          Series name
        </label>
        <input
          id="series-rename"
          autoFocus
          value={name}
          onChange={(event) => setName(event.target.value)}
          className="skin-field mt-2 h-11 w-full border border-line px-3 text-[14px] text-ink"
          style={{ background: 'var(--field)' }}
        />
        <p className="mt-2 text-[12.5px] leading-relaxed text-muted">
          Every confirmed membership and linked book will follow the new name.
        </p>
        {update.isError ? (
          <p role="alert" className="mt-3 text-[12.5px] text-primary">
            {messageOf(update.error)}
          </p>
        ) : null}
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={update.isPending}>
            Cancel
          </Button>
          <Button type="submit" disabled={!nextName || nextName === row.name || update.isPending}>
            {update.isPending ? 'Renaming…' : 'Rename series'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}

const asConsolidationRow = (row: SeriesManagementRow): ConsolidationSeries => ({
  id: row.id,
  name: row.name,
  liveEntries: row.liveEntries,
  memberBooks: row.memberBooks,
})

export function MergeSeriesDialog({
  rows,
  onClose,
}: {
  rows: readonly SeriesManagementRow[]
  onClose: () => void
}) {
  const [firstId, setFirstId] = useState(rows[0]?.id ?? '')
  const [secondId, setSecondId] = useState(rows.find((row) => row.id !== firstId)?.id ?? '')
  const [keepId, setKeepId] = useState(firstId)
  const merge = useMergeSeries()
  const first = rows.find((row) => row.id === firstId)
  const second = rows.find((row) => row.id === secondId)

  const preview = useMemo(() => {
    if (!first || !second || first.id === second.id) return null
    const firstPositions = new Set(first.entries.map((entry) => String(entry.position)))
    const positionConflicts = second.entries.filter((entry) =>
      firstPositions.has(String(entry.position)),
    ).length
    const firstBooks = new Set(
      first.entries.flatMap((entry) => (entry.bookId ? [entry.bookId] : [])),
    )
    const duplicateBooks = second.entries.filter(
      (entry) => entry.bookId && firstBooks.has(entry.bookId),
    ).length
    return { positionConflicts, duplicateBooks }
  }, [first, second])

  const chooseFirst = (id: string) => {
    setFirstId(id)
    if (id === secondId) {
      const replacement = rows.find((row) => row.id !== id)?.id ?? ''
      setSecondId(replacement)
      setKeepId(id)
    } else if (keepId !== id && keepId !== secondId) setKeepId(id)
  }
  const chooseSecond = (id: string) => {
    setSecondId(id)
    if (id === firstId) {
      const replacement = rows.find((row) => row.id !== id)?.id ?? ''
      setFirstId(replacement)
      setKeepId(id)
    } else if (keepId !== id && keepId !== firstId) setKeepId(firstId)
  }

  const submit = () => {
    if (!first || !second || first.id === second.id || merge.isPending) return
    const survivor = keepId === second.id ? second : first
    const loser = survivor.id === first.id ? second : first
    const [nameKeyA, nameKeyB] = canonicalPairKeys(
      seriesNameKey(first.name),
      seriesNameKey(second.name),
    )
    const candidate: ConsolidationCandidate = {
      tier: 3,
      primary: asConsolidationRow(survivor),
      loser: asConsolidationRow(loser),
      nameKeyA,
      nameKeyB,
    }
    merge.mutate(candidate, { onSuccess: onClose })
  }

  return (
    <Modal title="Merge series" onClose={onClose} wide>
      {rows.length < 2 ? (
        <p className="text-[13.5px] text-muted">You need at least two active series to merge.</p>
      ) : (
        <div>
          <p className="text-[13px] leading-relaxed text-muted">
            Select any two series. Every confirmed entry, missing-book slot, and removed slot is
            preserved under the name you keep. Entries still awaiting membership review move too.
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="text-[12.5px] font-semibold text-ink">
              First series
              <select
                value={firstId}
                onChange={(event) => chooseFirst(event.target.value)}
                className="skin-control mt-1.5 h-11 w-full border border-line px-3 text-[13px] text-ink"
                style={{ background: 'var(--field)' }}
              >
                {rows.map((row) => (
                  <option key={row.id} value={row.id} disabled={row.id === secondId}>
                    {row.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-[12.5px] font-semibold text-ink">
              Second series
              <select
                value={secondId}
                onChange={(event) => chooseSecond(event.target.value)}
                className="skin-control mt-1.5 h-11 w-full border border-line px-3 text-[13px] text-ink"
                style={{ background: 'var(--field)' }}
              >
                {rows.map((row) => (
                  <option key={row.id} value={row.id} disabled={row.id === firstId}>
                    {row.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {first && second && preview ? (
            <Surface tone="field" radius="control" pad={2} className="mt-4">
              <p className="text-[13px] font-semibold text-ink">Merge preview</p>
              <dl className="mt-2 grid grid-cols-2 gap-2 text-[12.5px]">
                <div>
                  <dt className="text-muted">Confirmed entries</dt>
                  <dd className="font-semibold text-ink">
                    {first.liveEntries} + {second.liveEntries}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted">Books in hand</dt>
                  <dd className="font-semibold text-ink">
                    {first.possessedBooks} + {second.possessedBooks}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted">Awaiting review</dt>
                  <dd className="font-semibold text-ink">
                    {first.unreviewedEntries} + {second.unreviewedEntries}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted">Removed slots preserved</dt>
                  <dd className="font-semibold text-ink">
                    {first.removedEntries} + {second.removedEntries}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted">Overlapping positions</dt>
                  <dd className="font-semibold text-ink">{preview.positionConflicts}</dd>
                </div>
                <div>
                  <dt className="text-muted">Books in both</dt>
                  <dd className="font-semibold text-ink">{preview.duplicateBooks}</dd>
                </div>
              </dl>
              {preview.positionConflicts || preview.duplicateBooks ? (
                <p className="mt-2 text-[12px] leading-relaxed text-muted">
                  Conflicting slots are kept and placed into one stable order. A book already in
                  both series remains one personal book.
                </p>
              ) : null}
            </Surface>
          ) : null}

          {first && second ? (
            <fieldset className="mt-4">
              <legend className="text-[12.5px] font-semibold text-ink">Name to keep</legend>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {[first, second].map((row) => (
                  <label
                    key={row.id}
                    className="skin-control flex min-h-11 cursor-pointer items-center gap-2 border border-line px-3 py-2 text-[13px] text-ink"
                    style={{ background: keepId === row.id ? 'var(--chip)' : 'var(--card)' }}
                  >
                    <input
                      type="radio"
                      name="series-name-to-keep"
                      checked={keepId === row.id}
                      onChange={() => setKeepId(row.id)}
                    />
                    <span className="min-w-0 break-words font-semibold">{row.name}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          ) : null}

          {merge.isError ? (
            <div role="alert" className="mt-4 text-[12.5px] leading-relaxed text-primary">
              <p>{messageOf(merge.error)}</p>
              <p className="mt-1 text-muted">
                If this merge would leave a connected universe with fewer than two series, change
                that universe first and try again.
              </p>
            </div>
          ) : null}

          <div className="mt-5 flex flex-wrap justify-end gap-2">
            <Button variant="secondary" onClick={onClose} disabled={merge.isPending}>
              Cancel
            </Button>
            <Button
              onClick={submit}
              disabled={!first || !second || first.id === second.id || merge.isPending}
            >
              {merge.isPending ? 'Merging…' : 'Merge series'}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  )
}

export function DeleteSeriesDialog({
  row,
  onClose,
}: {
  row: SeriesManagementRow
  onClose: () => void
}) {
  const archive = useArchiveSeries()
  return (
    <Modal title={`Delete ${row.name}?`} onClose={onClose}>
      <p className="text-[13.5px] leading-relaxed text-muted">
        This removes the series from your active collection. Your books, reading history, confirmed
        entries, missing-book slots, and manual order are preserved so the series can be restored.
      </p>
      <Surface tone="field" radius="control" pad={2} className="mt-4 text-[12.5px] text-muted">
        {row.liveEntries} confirmed {row.liveEntries === 1 ? 'entry' : 'entries'} ·{' '}
        {row.unreviewedEntries} awaiting review · {row.possessedBooks} in hand · {row.ghostEntries}{' '}
        missing-book {row.ghostEntries === 1 ? 'slot' : 'slots'} · {row.removedEntries} removed{' '}
        {row.removedEntries === 1 ? 'slot' : 'slots'}
      </Surface>
      {archive.isError ? (
        <div role="alert" className="mt-4 text-[12.5px] leading-relaxed text-primary">
          <p>{messageOf(archive.error)}</p>
          <p className="mt-1 text-muted">
            If this series belongs to a connected universe, remove it from that universe first and
            try again.
          </p>
        </div>
      ) : null}
      <div className="mt-5 flex flex-wrap justify-end gap-2">
        <Button variant="secondary" onClick={onClose} disabled={archive.isPending}>
          Cancel
        </Button>
        <Button
          onClick={() => archive.mutate(row.series, { onSuccess: onClose })}
          disabled={archive.isPending}
        >
          {archive.isPending ? 'Deleting…' : 'Delete series'}
        </Button>
      </div>
    </Modal>
  )
}

export function ArchivedSeriesPanel() {
  const { data: rows, isLoading, isError, error } = useArchivedSeriesList()
  const restore = useRestoreSeries()
  const [open, setOpen] = useState(false)
  if (isLoading || (!isError && !rows?.length)) return null

  return (
    <section className="mt-6" aria-labelledby="archived-series-heading">
      <Surface tone="card" radius="panel" pad={3}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 id="archived-series-heading" className="text-[14px] font-semibold text-ink">
              Deleted series{rows?.length ? ` · ${rows.length}` : ''}
            </h2>
            <p className="mt-0.5 text-[12px] text-muted">Restore a series with its order intact.</p>
          </div>
          {!isError ? (
            <Button
              variant="secondary"
              aria-expanded={open}
              onClick={() => setOpen((value) => !value)}
            >
              {open ? 'Hide' : 'View'}
            </Button>
          ) : null}
        </div>
        {isError ? (
          <p role="alert" className="mt-3 text-[12.5px] text-primary">
            {messageOf(error)}
          </p>
        ) : null}
        {open && rows ? (
          <ul className="mt-3 flex flex-col gap-2">
            {rows.map((row) => (
              <li
                key={row.id}
                className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3 first:border-0 first:pt-0"
              >
                <span className="min-w-0">
                  <span className="block break-words text-[13.5px] font-semibold text-ink">
                    {row.name}
                  </span>
                  <span className="block text-[12px] text-muted">
                    {row.entryCount} {row.entryCount === 1 ? 'entry' : 'entries'} ·{' '}
                    {row.linkedBookCount} linked {row.linkedBookCount === 1 ? 'book' : 'books'} ·{' '}
                    {row.ghostCount} missing
                  </span>
                </span>
                <Button
                  variant="secondary"
                  disabled={restore.isPending}
                  onClick={() => restore.mutate(row)}
                >
                  Restore
                </Button>
              </li>
            ))}
          </ul>
        ) : null}
        {restore.isError ? (
          <p role="alert" className="mt-3 text-[12.5px] text-primary">
            {messageOf(restore.error)}
          </p>
        ) : null}
      </Surface>
    </section>
  )
}
