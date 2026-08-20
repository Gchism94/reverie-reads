import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import type { Book, Incoming } from '@reverie/core'

// The differs line, at RENDERED output — the assertion that matters is the ABSENT case.
//
// A "differs: —" on every card is the noise that teaches a reader to stop reading the line, so
// "renders nothing when nothing differs" is the actual product requirement; the present case is
// its control. Both are anchored on the card itself being on screen (the candidate title), so an
// absence can never be confused with a component that failed to render at all.

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
  resolveCandidate: vi.fn(),
}))
vi.mock('../lib/supabase', () => ({ supabase: {} }))

const { DuplicateReview } = await import('./DuplicateReview')

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

describe('the merge differs line', () => {
  it('renders NOTHING when the two records disagree about nothing', async () => {
    // series and cover are blank on the existing record: the incoming values FILL them, which is
    // an addition, not a difference. Nothing here is contested.
    wrap(
      <DuplicateReview
        candidates={[
          candidate({ title: 'Fourth Wing', series: 'The Empyrean', cover: 'http://c/x.jpg' }),
        ]}
      />,
    )
    // Anchor first: the card is on screen (its own select control), so the absence is a real absence.
    expect(await screen.findByLabelText('Select Fourth Wing')).toBeInTheDocument()
    expect(screen.queryByTestId('merge-differs')).toBeNull()
  })

  it('states the kept and discarded values when one field is contested', async () => {
    wrap(<DuplicateReview candidates={[candidate({ title: 'Fourth Wing', rating: 5 })]} />)
    expect(await screen.findByLabelText('Select Fourth Wing')).toBeInTheDocument()
    expect(screen.getByTestId('merge-differs')).toHaveTextContent('differs: rating 4.5 kept over 5')
  })
})
