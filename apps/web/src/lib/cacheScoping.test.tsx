import { act, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, useIsRestoring, useQuery } from '@tanstack/react-query'
import {
  PersistQueryClientProvider,
  type PersistedClient,
} from '@tanstack/react-query-persist-client'
import type { AuthChangeEvent, Session } from '@supabase/supabase-js'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// These guards assert on RENDERED OUTPUT, not store contents, because that distinction is the whole
// finding. When the leak was reproduced in the real app, the store already held user B's correct
// data (`["books"]=2`) at a moment when the screen was still showing 286 of user A's book cards. A
// store-level assertion would have passed while a reader looked at someone else's library.

let emitAuth: ((event: AuthChangeEvent, session: Session | null) => void) | null = null

vi.mock('./supabase', () => ({
  supabase: {
    auth: {
      getSession: async () => ({ data: { session: null } }),
      onAuthStateChange: (cb: (e: AuthChangeEvent, s: Session | null) => void) => {
        emitAuth = cb
        return { data: { subscription: { unsubscribe: () => {} } } }
      },
      signOut: async () => ({ error: null }),
    },
  },
}))

const { createDexiePersister, clearAllOfflineCaches } = await import('./offlineCache')
const { AuthProvider, useAuth } = await import('../auth/AuthProvider')

/** Mirrors RootRoute's gate: the library only exists while there is a session. Without this the
 *  test would assert something the app never does — RootRoute swaps the whole app for the
 *  signed-out shell, so a stale observer is unmounted rather than left on screen. */
function Gated({ fetchBooks }: { fetchBooks: () => Promise<string[]> }) {
  const { session } = useAuth()
  return session ? <Library fetchBooks={fetchBooks} /> : <p>signed out</p>
}

const AUTH_KEY = 'sb-127-auth-token'
const BUSTER = 'test-build'
const A_BOOKS = ['Fourth Wing', 'Iron Flame']
const B_BOOKS = ['ZZ USER-B ONLY Alpha']

const signedInAs = (id: string) =>
  localStorage.setItem(AUTH_KEY, JSON.stringify({ access_token: 'x', user: { id } }))
const signedOut = () => localStorage.removeItem(AUTH_KEY)

/** A persisted client holding one reader's `['books']` query, shaped as the real one is. */
const persistedBooks = (titles: string[]): PersistedClient => ({
  timestamp: Date.now(),
  buster: BUSTER,
  clientState: {
    mutations: [],
    queries: [
      {
        queryKey: ['books'],
        queryHash: '["books"]',
        state: {
          data: titles,
          dataUpdateCount: 1,
          dataUpdatedAt: Date.now(),
          error: null,
          errorUpdateCount: 0,
          errorUpdatedAt: 0,
          fetchFailureCount: 0,
          fetchFailureReason: null,
          fetchMeta: null,
          isInvalidated: false,
          status: 'success',
          fetchStatus: 'idle',
        },
      },
    ],
  } as PersistedClient['clientState'],
})

/** Renders a marker once restoration has finished. Without this the negative assertions below are
 *  vacuous: `waitFor(() => expect(...).not.toBeInTheDocument())` succeeds on its FIRST tick, which
 *  can land before the async restore has hydrated anything — so the test would pass even with the
 *  scoping reverted. Mutation testing caught exactly that. */
function RestoreGate() {
  return useIsRestoring() ? <span>restoring</span> : <span>restored</span>
}

/** The screen under test: whatever `['books']` holds, rendered as a list a reader would see. */
function Library({ fetchBooks }: { fetchBooks: () => Promise<string[]> }) {
  const { data } = useQuery({ queryKey: ['books'], queryFn: fetchBooks, staleTime: 0 })
  return (
    <ul>
      {(data ?? []).map((t) => (
        <li key={t}>{t}</li>
      ))}
    </ul>
  )
}

/** A fetch whose resolution the test controls, so the restored-but-not-yet-refetched window —
 *  precisely where the leak was visible — can be inspected rather than raced past. */
function deferredFetch(value: string[]) {
  let release!: () => void
  const gate = new Promise<void>((r) => (release = r))
  return {
    fetch: async () => {
      await gate
      return value
    },
    release,
  }
}

async function rowIds(): Promise<string[]> {
  const { default: Dexie } = await import('dexie')
  const db = new Dexie('reverie-offline')
  db.version(1).stores({ cache: 'id' })
  const all = (await db.table('cache').toArray()) as { id: string }[]
  db.close()
  return all.map((r) => r.id).sort()
}

beforeEach(async () => {
  await clearAllOfflineCaches()
  signedOut()
  emitAuth = null
})

describe('guard: one reader’s cached library never renders for another', () => {
  it('does not restore user A’s books into user B’s session', async () => {
    // A used this device and their library was mirrored.
    signedInAs('user-a')
    const persister = createDexiePersister()
    await persister.persistClient(persistedBooks(A_BOOKS))

    // B now signs in on the same device.
    signedInAs('user-b')
    const b = deferredFetch(B_BOOKS)
    render(
      <PersistQueryClientProvider
        client={new QueryClient()}
        persistOptions={{ persister: createDexiePersister(), buster: BUSTER }}
      >
        <RestoreGate />
        <Library fetchBooks={b.fetch} />
      </PersistQueryClientProvider>,
    )

    // Restoration has DEFINITELY run, and B's own fetch has not resolved. This is the exact window
    // in which the real app painted 286 of A's book cards.
    expect(await screen.findByText('restored')).toBeInTheDocument()
    expect(screen.queryByText('Fourth Wing')).not.toBeInTheDocument()
    expect(screen.queryByText('Iron Flame')).not.toBeInTheDocument()

    await act(async () => {
      b.release()
    })
    expect(await screen.findByText('ZZ USER-B ONLY Alpha')).toBeInTheDocument()
    expect(screen.queryByText('Fourth Wing')).not.toBeInTheDocument()
  })

  it('still restores a reader’s OWN library — scoping must not disable the mirror', async () => {
    signedInAs('user-a')
    await createDexiePersister().persistClient(persistedBooks(A_BOOKS))

    const never = new Promise<string[]>(() => {})
    render(
      <PersistQueryClientProvider
        client={new QueryClient()}
        persistOptions={{ persister: createDexiePersister(), buster: BUSTER }}
      >
        <Library fetchBooks={() => never} />
      </PersistQueryClientProvider>,
    )

    // Rendered from IndexedDB alone — the fetch never resolves, which is the offline case.
    expect(await screen.findByText('Fourth Wing')).toBeInTheDocument()
  })
})

describe('guard: sign-out forgets the library', () => {
  const renderWithAuth = (fetchBooks: () => Promise<string[]>, client: QueryClient) =>
    render(
      <PersistQueryClientProvider
        client={client}
        persistOptions={{ persister: createDexiePersister(), buster: BUSTER }}
      >
        <AuthProvider>
          <Library fetchBooks={fetchBooks} />
        </AuthProvider>
      </PersistQueryClientProvider>,
    )

  it('leaves no library data in IndexedDB after SIGNED_OUT', async () => {
    signedInAs('user-a')
    await createDexiePersister().persistClient(persistedBooks(A_BOOKS))
    expect(await rowIds()).toEqual(['react-query:user-a'])

    const client = new QueryClient()
    renderWithAuth(() => new Promise<string[]>(() => {}), client)
    await waitFor(() => expect(emitAuth).not.toBeNull())

    // auth-js removes the stored session before it emits the event; mirror that ordering.
    signedOut()
    await act(async () => {
      emitAuth!('SIGNED_OUT', null)
    })

    await waitFor(async () => expect(await rowIds()).toEqual([]))
  })

  it('B does not see A’s library after a sign-out and sign-in with NO reload', async () => {
    // The same-page-load case: the in-memory client, not IndexedDB, holds A's data here. The
    // library unmounts on sign-out and REMOUNTS for B against the same QueryClient — so if the
    // cache were not cleared, B's first paint would come straight from A's ['books'] entry.
    signedInAs('user-a')
    const client = new QueryClient()
    client.setQueryData(['books'], A_BOOKS)

    const b = deferredFetch(B_BOOKS)
    render(
      <PersistQueryClientProvider
        client={client}
        persistOptions={{ persister: createDexiePersister(), buster: BUSTER }}
      >
        <AuthProvider>
          <Gated fetchBooks={b.fetch} />
        </AuthProvider>
      </PersistQueryClientProvider>,
    )
    await waitFor(() => expect(emitAuth).not.toBeNull())

    await act(async () => {
      emitAuth!('SIGNED_IN', { user: { id: 'user-a' } } as unknown as Session)
    })
    expect(await screen.findByText('Fourth Wing')).toBeInTheDocument()

    signedOut()
    await act(async () => {
      emitAuth!('SIGNED_OUT', null)
    })
    expect(await screen.findByText('signed out')).toBeInTheDocument()

    signedInAs('user-b')
    await act(async () => {
      emitAuth!('SIGNED_IN', { user: { id: 'user-b' } } as unknown as Session)
    })

    // B's library is mounted and subscribed; their fetch has NOT resolved. Nothing of A's may show.
    await waitFor(() => expect(screen.queryByText('signed out')).not.toBeInTheDocument())
    expect(screen.queryByText('Fourth Wing')).not.toBeInTheDocument()
    expect(screen.queryByText('Iron Flame')).not.toBeInTheDocument()

    await act(async () => {
      b.release()
    })
    expect(await screen.findByText('ZZ USER-B ONLY Alpha')).toBeInTheDocument()
    expect(screen.queryByText('Fourth Wing')).not.toBeInTheDocument()
  })
})
