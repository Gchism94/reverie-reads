import { QueryClient, QueryClientProvider, useMutation } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'

// One deferred books UPDATE per call, so the real hook can be driven without a network.
const writes: { id: string; release: () => void }[] = []
vi.mock('../lib/supabase', () => ({
  supabase: {
    from: () => ({
      update: () => ({
        eq: (_col: string, id: string) => ({
          select: () => ({
            single: () =>
              new Promise((resolve) => {
                writes.push({
                  id,
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

const { useUpdateBook } = await import('./books')

// Serialization of same-book writes, forced rather than raced.
//
// The e2e that caught the original defect was load-sensitive — it failed once at position 27 of 80
// and passed 3/3 in isolation, because it depended on two real HTTP round trips resolving out of
// order. Nothing here depends on timing: the first write's promise is held open by hand and only
// released after the assertions, so "did the second write start?" is a settled fact at the moment it
// is asked, not a race the test hopes to lose.
//
// Tests the SHAPE `useUpdateBook` uses rather than importing it, because the hook's mutationFn talks
// to Supabase. What is under test is query-core's scope gate — `canRun` admits a scoped mutation
// only when no other mutation sharing that id is pending (verified against 5.101's mutationCache) —
// and that gate reads `mutation.options.scope.id`, exactly what `useUpdateBook(id)` sets.

function wrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  )
}

/** A mutation whose every call blocks until the test releases it, recording call order. */
function deferredWriter() {
  const started: string[] = []
  const gates: (() => void)[] = []
  const mutationFn = async (label: string) => {
    started.push(label)
    await new Promise<void>((resolve) => gates.push(resolve))
    return label
  }
  return { started, releaseFirst: () => gates.shift()?.(), mutationFn }
}

describe('same-book writes serialize under a shared scope', () => {
  it('the second write does not START until the first settles', async () => {
    const w = deferredWriter()
    const { result } = renderHook(
      () => useMutation({ scope: { id: 'book:abc' }, mutationFn: w.mutationFn }),
      { wrapper: wrapper() },
    )

    // Two writes to the same book, fired back to back — the tab-through shape.
    result.current.mutate('first')
    result.current.mutate('second')

    // The gate is what is under test: only the first is in flight. Asserted after a real flush, so
    // this is not "the second hasn't got round to it yet".
    await waitFor(() => expect(w.started).toEqual(['first']))
    expect(w.started, 'the second write must not run while the first is pending').toHaveLength(1)

    w.releaseFirst()
    await waitFor(() => expect(w.started).toEqual(['first', 'second']))
  })

  it('WITHOUT a scope both writes are in flight at once — the defect this replaces', async () => {
    // The control. Same harness, scope removed: both mutationFns run at once, so the order they
    // reach the database is whatever the network decides, and the earlier, less complete write can
    // land last. This is what production did before `useUpdateBook(book.id)`.
    const w = deferredWriter()
    const { result } = renderHook(() => useMutation({ mutationFn: w.mutationFn }), {
      wrapper: wrapper(),
    })

    result.current.mutate('first')
    result.current.mutate('second')

    // Neither is ever released, so reaching two started calls can only mean they overlap. Under the
    // scope gate above, this wait times out at one — which is the whole difference.
    await waitFor(() => expect(w.started).toHaveLength(2))
    expect(w.started).toEqual(['first', 'second'])
  })

  // THE MUTATION TARGET. Everything above tests query-core's gate; this drives the real hook, so
  // deleting the `scope` line in useUpdateBook fails HERE and not only in a hand-built harness.
  it('useUpdateBook(bookId) serializes two writes to that book', async () => {
    writes.length = 0
    const { result } = renderHook(() => useUpdateBook('book-1'), { wrapper: wrapper() })

    result.current.mutate({ id: 'book-1', patch: { plan: { y: 2026, m: null, d: null } } })
    result.current.mutate({ id: 'book-1', patch: { plan: { y: 2026, m: 3, d: 14 } } })

    await waitFor(() => expect(writes).toHaveLength(1))
    expect(writes, 'the second write must wait for the first').toHaveLength(1)

    writes[0]!.release()
    await waitFor(() => expect(writes).toHaveLength(2))
  })

  it('useUpdateBook() with no id keeps independent writes parallel', async () => {
    writes.length = 0
    const { result } = renderHook(() => useUpdateBook(), { wrapper: wrapper() })

    result.current.mutate({ id: 'book-a', patch: { readingPosition: 1000 } })
    result.current.mutate({ id: 'book-b', patch: { readingPosition: 2000 } })

    // Neither released; both in flight. This is moveReading's fan-out, deliberately unserialized.
    await waitFor(() => expect(writes).toHaveLength(2))
    expect(writes.map((w) => w.id).sort()).toEqual(['book-a', 'book-b'])
  })

  it('different books do NOT serialize against each other', async () => {
    // The reason the scope is opt-in and keyed on the book. `moveReading` renumbers N books in one
    // gesture, one write each; those are independent and must stay parallel. Distinct scope ids, so
    // both start without either being released.
    const w = deferredWriter()
    const a = renderHook(() => useMutation({ scope: { id: 'book:a' }, mutationFn: w.mutationFn }), {
      wrapper: wrapper(),
    })
    const b = renderHook(() => useMutation({ scope: { id: 'book:b' }, mutationFn: w.mutationFn }), {
      wrapper: wrapper(),
    })

    a.result.current.mutate('book-a')
    b.result.current.mutate('book-b')

    await waitFor(() => expect(w.started).toHaveLength(2))
    expect(w.started.sort()).toEqual(['book-a', 'book-b'])
  })
})
