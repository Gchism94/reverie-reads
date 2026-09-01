import { fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SeriesManagementRow } from './SeriesManagement'

const mocks = vi.hoisted(() => ({
  updateMutate: vi.fn(),
  mergeMutate: vi.fn(),
  archiveMutate: vi.fn(),
  restoreMutate: vi.fn(),
  updateError: null as Error | null,
  mergeError: null as Error | null,
  archiveError: null as Error | null,
  archivedRows: [
    {
      id: 'archived-1',
      name: 'Old Saga',
      status: 'completed' as const,
      length: 4,
      archivedAt: '2026-08-31T12:00:00.000Z',
      entryCount: 4,
      linkedBookCount: 3,
      ghostCount: 1,
    },
  ],
}))

vi.mock('../components/Modal', () => ({
  Modal: ({ title, children }: { title: string; children: React.ReactNode }) => (
    <div role="dialog" aria-label={title}>
      {children}
    </div>
  ),
}))

vi.mock('../data/series', () => ({
  useUpdateSeries: () => ({
    mutate: mocks.updateMutate,
    isPending: false,
    isError: !!mocks.updateError,
    error: mocks.updateError,
  }),
  useArchiveSeries: () => ({
    mutate: mocks.archiveMutate,
    isPending: false,
    isError: !!mocks.archiveError,
    error: mocks.archiveError,
  }),
  useArchivedSeriesList: () => ({
    data: mocks.archivedRows,
    isLoading: false,
    isError: false,
    error: null,
  }),
  useRestoreSeries: () => ({
    mutate: mocks.restoreMutate,
    isPending: false,
    isError: false,
    error: null,
  }),
}))

vi.mock('../data/seriesConsolidation', () => ({
  useMergeSeries: () => ({
    mutate: mocks.mergeMutate,
    isPending: false,
    isError: !!mocks.mergeError,
    error: mocks.mergeError,
  }),
}))

const { ArchivedSeriesPanel, DeleteSeriesDialog, MergeSeriesDialog, RenameSeriesDialog } =
  await import('./SeriesManagement')

const row = (
  id: string,
  name: string,
  over: Partial<SeriesManagementRow> = {},
): SeriesManagementRow => ({
  id,
  name,
  liveEntries: 2,
  memberBooks: 1,
  series: {
    id,
    name,
    status: 'ongoing',
    source: 'manual',
    sourceRef: null,
    refreshedAt: null,
  },
  entries: [
    {
      id: `${id}-entry`,
      position: 1,
      label: null,
      title: `${name} One`,
      author: 'Ada Reader',
      bookId: `${id}-book`,
      source: 'manual',
      userEdited: true,
      membershipClaim: { origin: 'reader' },
    },
  ],
  possessedBooks: 1,
  ghostEntries: 1,
  unreviewedEntries: 0,
  removedEntries: 0,
  ...over,
})

describe('series management actions', () => {
  beforeEach(() => {
    mocks.updateMutate.mockReset()
    mocks.mergeMutate.mockReset()
    mocks.archiveMutate.mockReset()
    mocks.restoreMutate.mockReset()
    mocks.updateError = null
    mocks.mergeError = null
    mocks.archiveError = null
  })

  it('renames through the authoritative hook and keeps a mutation error in the dialog', () => {
    const target = row('a', 'Alpha Saga')
    const { rerender } = render(<RenameSeriesDialog row={target} onClose={() => {}} />)
    fireEvent.change(screen.getByLabelText('Series name'), { target: { value: 'Alpha Cycle' } })
    fireEvent.click(screen.getByRole('button', { name: 'Rename series' }))

    expect(mocks.updateMutate).toHaveBeenCalledWith(
      { id: 'a', name: 'Alpha Cycle' },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    )

    mocks.updateError = new Error('That series name is already in use.')
    rerender(<RenameSeriesDialog row={target} onClose={() => {}} />)
    expect(screen.getByRole('alert')).toHaveTextContent('That series name is already in use.')
  })

  it('merges any selected pair with the chosen survivor and narrates hidden cargo', () => {
    const alpha = row('a', 'Alpha Saga', {
      liveEntries: 3,
      unreviewedEntries: 2,
      removedEntries: 1,
    })
    const beta = row('b', 'Beta Cycle', { liveEntries: 4, unreviewedEntries: 1, removedEntries: 2 })
    render(<MergeSeriesDialog rows={[alpha, beta]} onClose={() => {}} />)

    const reviewCargo = screen.getByText('Awaiting review').parentElement
    const removedCargo = screen.getByText('Removed slots preserved').parentElement
    expect(reviewCargo).not.toBeNull()
    expect(removedCargo).not.toBeNull()
    expect(within(reviewCargo!).getByText('2 + 1')).toBeInTheDocument()
    expect(within(removedCargo!).getByText('1 + 2')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('radio', { name: 'Beta Cycle' }))
    fireEvent.click(screen.getByRole('button', { name: 'Merge series' }))

    expect(mocks.mergeMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        primary: expect.objectContaining({ id: 'b', name: 'Beta Cycle' }),
        loser: expect.objectContaining({ id: 'a', name: 'Alpha Saga' }),
      }),
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    )
  })

  it('deletes through the reversible archive action and explains a universe refusal', () => {
    const target = row('a', 'Alpha Saga', { unreviewedEntries: 2, removedEntries: 3 })
    const { rerender } = render(<DeleteSeriesDialog row={target} onClose={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: 'Delete series' }))

    expect(mocks.archiveMutate).toHaveBeenCalledWith(
      target.series,
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    )

    mocks.archiveError = new Error('Series belongs to an active universe.')
    rerender(<DeleteSeriesDialog row={target} onClose={() => {}} />)
    expect(screen.getByRole('alert')).toHaveTextContent('remove it from that universe first')
  })

  it('restores the selected archived series rather than manufacturing a new row', () => {
    render(<ArchivedSeriesPanel />)
    fireEvent.click(screen.getByRole('button', { name: 'View' }))
    fireEvent.click(screen.getByRole('button', { name: 'Restore' }))

    expect(mocks.restoreMutate).toHaveBeenCalledWith(mocks.archivedRows[0])
  })
})
