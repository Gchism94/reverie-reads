import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import type { Book, Incoming } from '@reverie/core'

// The per-field picker, at rendered output AND at the call that writes.
//
// This file replaces #302's differs-line test. That line stated a contested pair passively; a
// 'replace' checkbox states the same pair and can act on it, so the coverage moves here rather
// than disappearing — the contested `rating` case below is #302's assertion in its new home.
//
// THE ASSERTION THAT MATTERS IS THE LAST ONE. Everything above it is what a reader SEES; only
// `resolveCandidate`'s argument is what reaches the database, and a picker that renders a
// perfect set of checkboxes while writing the engine's answer regardless would pass every
// render assertion in this file. That is the defect this file exists to catch.

// A full literal rather than an `as` cast (core's makeBook fixture is not exported from the
// barrel): a Book shape change fails typecheck here instead of letting this file drift.
const BOOKS: Book[] = [
  {
    id: 'b1',
    title: 'Fourth Wing',
    first: 'Rebecca',
    last: 'Yarros',
    contributors: [],
    series: '', // blank: an incoming series FILLS it — an addition, never a difference
    position: '',
    seriesCount: null,
    status: 'standalone',
    genre: 'romance',
    subgenre: 'Romantasy',
    subgenres: ['Romantasy'],
    genres: [],
    tags: [],
    tropes: [],
    moods: [],
    intensity: 0,
    cover: '', // blank for the same reason as series
    pages: null,
    isbn: '',
    fave: false,
    ownership: 'owned',
    borrowed: false,
    wishlist: false,
    owned: { physical: false, ebook: false, audiobook: false },
    format: 'Paperback',
    rating: 4.5, // the contested value in the second case
    readStatus: 'Read',
    source: 'Owned',
    pub: { y: null, m: null, d: null },
    reads: [],
    plan: { y: null, m: null, d: null },
    progress: 0,
    addedTs: 0,
  },
]

vi.mock('../data/books', () => ({ useBooks: () => ({ data: BOOKS }), booksKey: ['books'] }))
vi.mock('../data/intake', () => ({
  verdictLookupKey: (id: string, inc: { title: string }) => `${id}:${inc.title}`,
}))
vi.mock('../data/duplicates', () => ({ resolveCandidate: vi.fn() }))
vi.mock('../lib/supabase', () => ({ supabase: {} }))

const { DuplicateReview } = await import('./DuplicateReview')
const { resolveCandidate } = await import('../data/duplicates')

beforeEach(() => vi.mocked(resolveCandidate).mockClear())

function wrap(ui: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>)
}

const candidate = (incoming: Incoming) => ({
  incoming,
  existingId: 'b1',
  existingTitle: 'Fourth Wing',
  existingAuthor: 'Yarros',
  strength: 'title-author' as const,
})

/** The `picks` argument of the single write this component made. */
const picksWritten = (): unknown => {
  const calls = vi.mocked(resolveCandidate).mock.calls
  expect(calls).toHaveLength(1)
  return calls[0]![3]
}

const clickField = async (label: string) => {
  const picker = await screen.findByTestId('merge-field-picker')
  const row = within(picker)
    .getAllByRole('checkbox')
    .find((c) => c.closest('label')?.textContent?.includes(label))
  if (!row) throw new Error(`no picker row for ${label}`)
  await userEvent.click(row)
}

describe('the merge field picker', () => {
  it('offers a contested field as an UNCHECKED replace row, stating both values', async () => {
    // #302's case, now actionable: the reader's 4.5 against the import's 5. Unchecked is the
    // whole safety property — a merge a reader does not touch still keeps their rating.
    wrap(<DuplicateReview candidates={[candidate({ title: 'Fourth Wing', rating: 5 })]} />)
    await userEvent.click(await screen.findByText(/choose fields/))
    const row = within(await screen.findByTestId('merge-field-picker')).getByRole('checkbox', {
      name: /rating/,
    })
    expect(row).not.toBeChecked()
    expect(row.closest('label')).toHaveTextContent('keep yours “4.5” — or take “5”')
  })

  it('offers a fillable blank as a CHECKED add row — the engine already takes it', async () => {
    wrap(
      <DuplicateReview
        candidates={[candidate({ title: 'Fourth Wing', series: 'The Empyrean' })]}
      />,
    )
    await userEvent.click(await screen.findByText(/choose fields/))
    const row = within(await screen.findByTestId('merge-field-picker')).getByRole('checkbox', {
      name: /series/,
    })
    expect(row).toBeChecked()
  })

  it('shows the pre-picker summary sentence on the closed card, with the disclosure beside it', async () => {
    wrap(
      <DuplicateReview
        candidates={[candidate({ title: 'Fourth Wing', series: 'The Empyrean' })]}
      />,
    )
    // The card still leads with what a merge ADDS, exactly as it read before the picker existed —
    // read off the summary itself, since the (closed) rows below repeat those field names.
    const summary = (await screen.findByText(/choose fields \(1\)/)).closest('summary')
    expect(summary).toHaveTextContent('series')
    //
    // DELIBERATELY NOT ASSERTED HERE: that the rows are hidden until opened. `<details>` keeps its
    // children in the DOM when closed and hides them by UA stylesheet, which jsdom does not apply —
    // so any jsdom assertion about collapse would either fail against a correct build or pass
    // against a broken one. It is asserted in a real browser instead (add-fuzzy-review.spec.ts).
  })

  // ── what reaches the database ────────────────────────────────────────────────────────────────

  it('MERGING AN UNTOUCHED CARD passes no picks at all — the engine keeps its own answer', async () => {
    wrap(
      <DuplicateReview
        candidates={[candidate({ title: 'Fourth Wing', series: 'The Empyrean', rating: 5 })]}
      />,
    )
    await userEvent.click(await screen.findByRole('button', { name: 'Merge Fourth Wing' }))
    // Undefined — not "an object that happens to match the defaults" — is what makes the
    // one-click path byte-identical to the pre-picker write.
    expect(picksWritten()).toBeUndefined()
  })

  it('DECLINING AN ADD reaches the write as an explicit false', async () => {
    wrap(
      <DuplicateReview
        candidates={[candidate({ title: 'Fourth Wing', series: 'The Empyrean' })]}
      />,
    )
    await userEvent.click(await screen.findByText(/choose fields/))
    await clickField('series')
    await userEvent.click(await screen.findByRole('button', { name: 'Merge Fourth Wing' }))
    expect(picksWritten()).toMatchObject({ series: false })
  })

  it('TAKING THEIRS on a contested field reaches the write as an explicit true', async () => {
    wrap(<DuplicateReview candidates={[candidate({ title: 'Fourth Wing', rating: 5 })]} />)
    await userEvent.click(await screen.findByText(/choose fields/))
    await clickField('rating')
    await userEvent.click(await screen.findByRole('button', { name: 'Merge Fourth Wing' }))
    expect(picksWritten()).toMatchObject({ rating: true })
  })
})
