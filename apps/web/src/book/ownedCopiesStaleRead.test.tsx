import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import type { Book, Owned } from '@reverie/core'

// IS THE `owned` PROP ACTUALLY STALE FOR A SECOND FAST TOGGLE?
//
// BACKLOG claims two defects in OwnedCopies, "not one": (1) unscoped writes that can land out of
// order, and (2) a SEPARATE stale read — "each toggle's payload is built from the `owned` prop,
// which lags one render behind the store, so two fast toggles can each compute their payload from
// the same stale snapshot regardless of write ordering."
//
// (1) is already closed: both call sites pass `useUpdateBook(book.id)` (BookDetailRoute.tsx:86,
// dialogs.tsx:167), scoped by c5ffd04 (#117). This file is about (2), which scoping cannot fix and
// which therefore needs its own evidence before anyone writes a fix for it.
//
// The test drives the REAL hook against a held-open write, exactly the way bookWriteRace.test.tsx
// does, so nothing depends on timing: the first write's promise never resolves during the
// assertions. If the prop were stale, the second toggle's payload would be computed from the
// pre-first-toggle `owned` and would carry `physical: 'paperback'` — the value the first toggle just
// cleared. If the optimistic `onMutate` has already patched the cache, it carries `physical: false`.

const writes: { patch: Record<string, unknown>; release: () => void }[] = []
vi.mock('../lib/supabase', () => ({
  supabase: {
    from: () => ({
      update: (patch: Record<string, unknown>) => ({
        eq: (_col: string, id: string) => ({
          select: () => ({
            single: () =>
              new Promise((resolve) => {
                writes.push({
                  patch,
                  release: () =>
                    resolve({
                      data: { id, title: 'T', added_at: '2026-01-01T00:00:00Z' },
                      error: null,
                    }),
                })
              }),
          }),
        }),
      }),
    }),
  },
}))

const { useUpdateBook, booksKey } = await import('../data/books')
const { OwnedCopies } = await import('./OwnedCopies')

const BOOK_ID = 'b1'
const start: Book = {
  id: BOOK_ID,
  title: 'T',
  owned: { physical: 'paperback', ebook: false, audiobook: false },
  ownership: 'owned',
  borrowed: false,
  wishlist: false,
} as unknown as Book

/** Every `owned` object the component hands its parent — the payload the claim is about. */
const payloads: Owned[] = []

/** Wired the way BookDetailRoute wires it: prop from the query cache, writes through the hook. */
function Harness({ qc }: { qc: QueryClient }) {
  const updateBook = useUpdateBook(BOOK_ID)
  const book = (qc.getQueryData<Book[]>(booksKey) ?? []).find((b) => b.id === BOOK_ID)!
  return (
    <OwnedCopies
      possession="owned"
      owned={book.owned}
      onChange={(owned: Owned) => {
        payloads.push(owned)
        updateBook.mutate({ id: BOOK_ID, patch: { owned } })
      }}
      onPossessionChange={() => {}}
    />
  )
}

describe('OwnedCopies — the second of two fast toggles', () => {
  it('builds its payload on the first toggle, not on a stale snapshot', async () => {
    writes.length = 0
    payloads.length = 0
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    qc.setQueryData<Book[]>(booksKey, [start])

    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    )
    render(<Harness qc={qc} />, { wrapper })

    // Toggle 1 — physical OFF. Its write is held open and never resolves during this test.
    fireEvent.click(screen.getByRole('switch', { name: 'Have a physical copy' }))
    await waitFor(() => expect(payloads).toHaveLength(1))
    expect(payloads[0]).toMatchObject({ physical: false })
    // Only ONE request is in flight: the scope (c5ffd04) holds everything else behind it, which is
    // why the payload — not the network — is the place to observe the second toggle.
    expect(writes).toHaveLength(1)

    // Toggle 2 — ebook ON, while the first write is still in flight.
    fireEvent.click(screen.getByRole('switch', { name: 'Have an ebook' }))
    await waitFor(() => expect(payloads).toHaveLength(2))

    // THE ASSERTION. `physical: false` means the second toggle read the optimistically-patched
    // cache. `physical: 'paperback'` would mean it read a stale prop and is about to resurrect a
    // format the reader just cleared.
    expect(payloads[1]).toMatchObject({ physical: false, ebook: true })

    writes.forEach((w) => w.release())
  })
})
