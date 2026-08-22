import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { Book } from '@reverie/core'

// THE TOTAL A READER SEES IS STABLE ACROSS MEMBER-BOOK FETCH ORDER — at rendered output.
//
// The original defect (task-series-consolidation.md, defect #1): displayTotal read
// `books.find(b => b.seriesCount != null)`, so "N in all" came from whichever member the array
// handed over first and could change between page loads with no write occurring. A Court of Thorns
// and Roses carried members claiming 6 and 7 and displayed "6 in all". claimedSeriesLength (MAX)
// closed it in core — but a core unit test cannot prove the ROW still routes through it, so this
// renders the actual SeriesRow twice, with the same members in opposite orders, and asserts the
// displayed line is identical and is the max.
//
// Named mutant, run by hand against this test (revert via scripts/safe-revert.sh):
//   MUTANT first-non-null-total — in claimedSeriesLength (packages/core/src/seriesIndex.ts),
//     replace the max fold with `return books.find((b) => b.seriesCount != null)?.seriesCount ??
//     null`. The reversed render below displays "6 in all" and the toEqual fails.

vi.mock('@tanstack/react-router', () => ({
  createRoute: (opts: unknown) => opts,
  Link: ({ children }: { children?: React.ReactNode }) => <a href="#mock">{children}</a>,
}))
vi.mock('./RootRoute', () => ({ rootRoute: {} }))
vi.mock('../series/SeriesArranger', () => ({ SeriesArranger: () => null }))
vi.mock('../series/ConsolidationQueue', () => ({ ConsolidationQueue: () => null }))
vi.mock('../lib/supabase', () => ({ supabase: {} }))

const { SeriesRow } = await import('./SeriesIndexRoute')

// Full literal rather than an `as` cast, so a Book shape change fails typecheck here instead of
// letting this file drift (the plan-precision lesson: casts pass Vitest and lie to tsc).
const member = (id: string, seriesCount: number): Book => ({
  id,
  title: id,
  first: '',
  last: '',
  contributors: [],
  series: 'A Court of Thorns and Roses',
  position: '',
  seriesCount,
  status: 'ongoing',
  genre: 'romance',
  subgenre: 'Romance',
  subgenres: ['Romance'],
  genres: [],
  tags: [],
  tropes: [],
  moods: [],
  intensity: 0,
  darkness: null,
  cover: '',
  pages: null,
  isbn: '',
  fave: false,
  ownership: 'owned',
  borrowed: false,
  wishlist: false,
  owned: { physical: false, ebook: false, audiobook: false },
  format: 'Paperback',
  rating: 0,
  readStatus: 'Unread',
  source: 'Owned',
  pub: { y: null, m: null, d: null },
  reads: [],
  plan: { y: null, m: null, d: null },
  progress: 0,
  addedTs: 0,
})

function renderRow(books: Book[]): string {
  const { unmount } = render(
    <ul>
      <SeriesRow
        name="A Court of Thorns and Roses"
        books={books}
        entries={[]}
        byId={new Map(books.map((b) => [b.id, b]))}
        tbrBookIds={new Set()}
        expanded={false}
        onToggle={() => {}}
        panelId="p1"
      />
    </ul>,
  )
  const line = screen.getByText(/in all/).textContent ?? ''
  unmount()
  return line
}

describe('the series row’s displayed total', () => {
  it('is identical whichever order the member books arrive in, and is the MAX claim', () => {
    const claims6then7 = [member('b1', 6), member('b2', 7), member('b3', 6)]
    const claims7then6 = [...claims6then7].reverse()

    const forward = renderRow(claims6then7)
    const reversed = renderRow(claims7then6)

    expect(forward).toContain('7 in all')
    expect(reversed).toEqual(forward)
  })
})
