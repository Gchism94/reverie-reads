import { useState } from 'react'
import { createRoute, useNavigate } from '@tanstack/react-router'
import { authorOf, type Book } from '@reverie/core'
import { rootRoute } from '../routes/RootRoute'
import { BackLink } from '../components/BackLink'
import { useBooks } from '../data/books'
import { useProfile } from '../data/profile'
import {
  sharedDocKey,
  useLeaveSharedList,
  useMutateSharedDoc,
  useSharedDoc,
  type SharedListDoc,
} from '../data/sharedLists'
import { useRealtimeRefetch } from '../hooks/useRealtimeRefetch'
import { Modal } from '../components/Modal'
import { useVoice } from '../skin/labels'
import { Surface } from '../components/Surface'

function LibraryPicker({
  books,
  onPick,
  onClose,
}: {
  books: Book[]
  onPick: (b: Book) => void
  onClose: () => void
}) {
  const [q, setQ] = useState('')
  const results = books
    .filter(
      (b) => !q || `${b.title} ${authorOf(b)} ${b.series}`.toLowerCase().includes(q.toLowerCase()),
    )
    .slice(0, 50)
  return (
    <Modal title="Add from your library" onClose={onClose}>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search your library…"
        className="skin-field h-10 w-full border border-line px-3 text-[14px] text-ink outline-none"
        style={{ background: 'var(--field)' }}
      />
      <ul className="mt-3 flex max-h-[55dvh] flex-col gap-1.5 overflow-y-auto">
        {results.map((b) => (
          <li key={b.id}>
            <button
              type="button"
              onClick={() => onPick(b)}
              className="skin-control-quiet flex w-full items-center justify-between gap-3 border border-line px-3 py-2 text-left"
              style={{
                background: 'var(--field)',
              }}
            >
              <span>
                <span className="text-[14px] font-semibold text-ink">{b.title}</span>
                <span className="block text-[12px] text-muted">{authorOf(b)}</span>
              </span>
              <span className="text-[16px] text-primary">＋</span>
            </button>
          </li>
        ))}
      </ul>
    </Modal>
  )
}

function SharedListScreen() {
  const { code } = sharedListRoute.useParams()
  const navigate = useNavigate()
  const { data: doc, isLoading } = useSharedDoc(code)
  const { data: books } = useBooks()
  const { data: profile } = useProfile()
  const mutateDoc = useMutateSharedDoc(code)
  const leave = useLeaveSharedList()
  const [picking, setPicking] = useState(false)

  useRealtimeRefetch(
    `shared-${code}`,
    [{ table: 'shared_docs', filter: `key=eq.${code}` }],
    [sharedDocKey(code)],
  )

  const by = profile?.displayName || 'Reader'

  const addItem = (item: { title: string; author: string; cover: string }) =>
    mutateDoc.mutate((d: SharedListDoc) => ({
      ...d,
      items: [...d.items, { id: crypto.randomUUID(), ...item, by }],
    }))
  const removeItem = (id: string) =>
    mutateDoc.mutate((d: SharedListDoc) => ({ ...d, items: d.items.filter((i) => i.id !== id) }))

  const voice = useVoice()
  if (isLoading) return <p className="px-6 py-16 text-center text-muted">{voice.loading}</p>
  if (!doc)
    return (
      <div className="px-6 py-16 text-center text-muted">
        <p>No shared list found for that code.</p>
        <BackLink fallback="/clubs" className="mt-3 inline-block text-primary">
          ← Back to Clubs
        </BackLink>
      </div>
    )

  return (
    <section className="mx-auto w-full max-w-2xl px-4 py-6 sm:px-6">
      <BackLink fallback="/clubs" className="text-[13px] text-muted hover:text-ink">
        ← Clubs
      </BackLink>

      <h1
        className="mt-3 text-[24px] italic text-ink"
        style={{ fontFamily: 'var(--font-display)', fontWeight: 600 }}
      >
        {doc.name}
      </h1>
      <div className="text-[13px] text-muted">
        {doc.kind === 'clubtbr' ? 'Book-club TBR' : 'Shared list'} · everyone with the code can edit
      </div>
      <div className="mt-2 flex items-center gap-2">
        <span
          className="skin-control-quiet px-2.5 py-1 font-mono text-[13px] font-bold tracking-wider"
          style={{ background: 'var(--ink)', color: 'var(--bg0)' }}
        >
          {code}
        </span>
        <button
          type="button"
          onClick={() => void navigator.clipboard?.writeText(code)}
          className="text-[12px] text-primary"
        >
          copy code
        </button>
      </div>

      <div className="mt-5 flex flex-col gap-1.5">
        {doc.items.length ? (
          doc.items.map((it) => (
            <Surface
              key={it.id}
              tone="field"
              radius="card"
              pad={0}
              className="flex items-center justify-between gap-3 px-3 py-2"
            >
              <div className="min-w-0 flex-1">
                <div className="break-words text-[14px] font-semibold text-ink">{it.title}</div>
                <div className="break-words text-[12px] text-muted">
                  {it.author}
                  {it.by ? ` · added by ${it.by}` : ''}
                </div>
              </div>
              <button
                type="button"
                onClick={() => removeItem(it.id)}
                className="text-[12px] text-muted hover:text-primary"
              >
                remove
              </button>
            </Surface>
          ))
        ) : (
          <p className="text-[13px] text-muted">Empty — add the first book below.</p>
        )}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setPicking(true)}
          className="skin-control border border-line px-4 py-2 text-[13px] font-semibold text-ink"
          style={{ background: 'var(--card)' }}
        >
          ＋ From my library
        </button>
        <button
          type="button"
          onClick={() => {
            const title = window.prompt('Book title:')?.trim()
            if (!title) return
            const author = window.prompt('Author (optional):')?.trim() ?? ''
            addItem({ title, author, cover: '' })
          }}
          className="skin-control border border-line px-4 py-2 text-[13px] font-semibold text-ink"
          style={{ background: 'var(--card)' }}
        >
          ＋ Add manually
        </button>
        <button
          type="button"
          onClick={() => {
            if (
              window.confirm(
                'Leave this shared list? (It stays available to others with the code.)',
              )
            ) {
              leave.mutate(code, { onSuccess: () => void navigate({ to: '/clubs' }) })
            }
          }}
          className="skin-control border border-line px-4 py-2 text-[13px] font-semibold text-primary"
          style={{ background: 'var(--card)' }}
        >
          Leave
        </button>
      </div>

      {picking && (
        <LibraryPicker
          books={books ?? []}
          onClose={() => setPicking(false)}
          onPick={(b) => {
            addItem({ title: b.title, author: authorOf(b), cover: b.cover })
            setPicking(false)
          }}
        />
      )}
    </section>
  )
}

export const sharedListRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'list/$code',
  component: SharedListScreen,
})
