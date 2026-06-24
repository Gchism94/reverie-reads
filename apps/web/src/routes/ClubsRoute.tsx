import { useState } from 'react'
import { createRoute, useNavigate } from '@tanstack/react-router'
import type { ClubUnitType } from '@reverie/core'
import { rootRoute } from './RootRoute'
import { useCreateClub, useJoinClub, useMyClubs } from '../data/clubs'
import {
  useCreateSharedList,
  useJoinSharedList,
  useMySharedRefs,
  type SharedKind,
} from '../data/sharedLists'
import { useProfile } from '../data/profile'
import { Modal } from '../components/Modal'

const fieldClass = 'h-10 w-full rounded-xl border border-line px-3 text-[14px] text-ink outline-none'
const fieldStyle = { background: 'var(--field)' } as const

function CreateClubModal({ displayName, onClose, onCreated }: { displayName: string; onClose: () => void; onCreated: (id: string) => void }) {
  const createClub = useCreateClub()
  const [title, setTitle] = useState('')
  const [author, setAuthor] = useState('')
  const [cover, setCover] = useState('')
  const [unitType, setUnitType] = useState<ClubUnitType>('chapter')
  const [count, setCount] = useState('30')

  return (
    <Modal title="Start a read-along" onClose={onClose}>
      <div className="flex flex-col gap-3">
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Book title" className={fieldClass} style={fieldStyle} />
        <div className="grid grid-cols-2 gap-3">
          <input value={author} onChange={(e) => setAuthor(e.target.value)} placeholder="Author" className={fieldClass} style={fieldStyle} />
          <input value={cover} onChange={(e) => setCover(e.target.value)} placeholder="Cover URL (optional)" className={fieldClass} style={fieldStyle} />
        </div>
        <div>
          <div className="mb-1 text-[11px] uppercase tracking-[0.15em] text-muted">Track progress by</div>
          <div className="flex rounded-full border border-line p-1" style={{ background: 'var(--field)' }}>
            {(['chapter', 'page', 'percent'] as const).map((u) => (
              <button
                key={u}
                type="button"
                onClick={() => setUnitType(u)}
                className="flex-1 rounded-full px-3 py-1.5 text-[12.5px] font-semibold capitalize"
                style={unitType === u ? { background: 'var(--accent-fill)', color: 'var(--on-primary)' } : { color: 'var(--muted)' }}
              >
                {u === 'chapter' ? 'Chapters' : u === 'page' ? 'Pages' : 'Percent'}
              </button>
            ))}
          </div>
        </div>
        {unitType !== 'percent' && (
          <label className="block">
            <span className="mb-1 block text-[11px] uppercase tracking-[0.15em] text-muted">
              How many {unitType === 'page' ? 'pages' : 'chapters'}?
            </span>
            <input value={count} onChange={(e) => setCount(e.target.value)} type="number" min={1} className={fieldClass} style={fieldStyle} />
          </label>
        )}
        <p className="text-[12.5px] text-muted">
          Comments are tagged to a {unitType} and stay hidden for each reader until they reach that point.
        </p>
        <button
          type="button"
          disabled={!title.trim() || createClub.isPending}
          onClick={() =>
            createClub.mutate(
              {
                title: title.trim(),
                author: author.trim(),
                cover: cover.trim(),
                unitType,
                unitCount: Math.max(1, parseInt(count) || 1),
                displayName,
              },
              { onSuccess: (club) => onCreated(club.id) },
            )
          }
          className="h-11 rounded-xl text-[14px] font-semibold disabled:opacity-50"
          style={{ background: 'linear-gradient(135deg, var(--primary), var(--gold))', color: 'var(--on-primary)' }}
        >
          Create &amp; get code
        </button>
      </div>
    </Modal>
  )
}

function CreateSharedModal({ onClose, onCreated }: { onClose: () => void; onCreated: (code: string) => void }) {
  const createList = useCreateSharedList()
  const [name, setName] = useState('')
  const [kind, setKind] = useState<SharedKind>('list')
  return (
    <Modal title="New shared list" onClose={onClose}>
      <div className="flex flex-col gap-3">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Household TBR, June Book Club" className={fieldClass} style={fieldStyle} />
        <div className="flex rounded-full border border-line p-1" style={{ background: 'var(--field)' }}>
          {(
            [
              ['list', 'Shared list'],
              ['clubtbr', 'Book-club TBR'],
            ] as [SharedKind, string][]
          ).map(([k, label]) => (
            <button
              key={k}
              type="button"
              onClick={() => setKind(k)}
              className="flex-1 rounded-full px-3 py-1.5 text-[12.5px] font-semibold"
              style={kind === k ? { background: 'var(--accent-fill)', color: 'var(--on-primary)' } : { color: 'var(--muted)' }}
            >
              {label}
            </button>
          ))}
        </div>
        <p className="text-[12.5px] text-muted">Anyone with the code can add and remove books, and everyone sees changes within a few seconds.</p>
        <button
          type="button"
          disabled={!name.trim() || createList.isPending}
          onClick={() => createList.mutate({ name: name.trim(), kind }, { onSuccess: (code) => onCreated(code) })}
          className="h-11 rounded-xl text-[14px] font-semibold disabled:opacity-50"
          style={{ background: 'linear-gradient(135deg, var(--primary), var(--gold))', color: 'var(--on-primary)' }}
        >
          Create &amp; get code
        </button>
      </div>
    </Modal>
  )
}

function ClubsScreen() {
  const navigate = useNavigate()
  const { data: clubs } = useMyClubs()
  const { data: shared } = useMySharedRefs()
  const { data: profile } = useProfile()
  const joinClub = useJoinClub()
  const joinShared = useJoinSharedList()
  const [dialog, setDialog] = useState<'club' | 'shared' | null>(null)

  const displayName = profile?.displayName || 'Reader'
  const openClub = (id: string) => void navigate({ to: '/club/$clubId', params: { clubId: id } })
  const openList = (code: string) => void navigate({ to: '/list/$code', params: { code } })

  const joinClubByCode = () => {
    const code = window.prompt('Enter the read-along code:')?.trim()
    if (!code) return
    joinClub.mutate(
      { code, displayName },
      {
        onSuccess: (id) => (id ? openClub(id) : window.alert('No read-along found for that code.')),
      },
    )
  }
  const joinListByCode = () => {
    const code = window.prompt('Enter the shared list code:')?.trim()
    if (!code) return
    joinShared.mutate(code, {
      onSuccess: (doc) => (doc ? openList(code.toUpperCase()) : window.alert('No shared list found for that code.')),
    })
  }

  return (
    <section className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
      <h1 className="text-[22px] italic text-ink" style={{ fontFamily: 'var(--font-display)', fontWeight: 600 }}>
        Clubs &amp; sharing
      </h1>
      <p className="mb-5 text-[13px] text-muted">
        Read-alongs with spoiler-gated comments, and shared lists anyone with the code can edit.
      </p>

      {/* read-alongs */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[16px] font-semibold text-ink">Read-alongs</h2>
        <div className="flex gap-2">
          <button type="button" onClick={() => setDialog('club')} className="rounded-full px-3.5 py-1.5 text-[12.5px] font-semibold" style={{ background: 'linear-gradient(135deg, var(--primary), var(--gold))', color: 'var(--on-primary)' }}>
            ＋ Start
          </button>
          <button type="button" onClick={joinClubByCode} className="rounded-full border border-line px-3.5 py-1.5 text-[12.5px] font-semibold text-ink" style={{ background: 'var(--card)' }}>
            Join by code
          </button>
        </div>
      </div>
      {clubs && clubs.length ? (
        <div className="grid gap-2 sm:grid-cols-2">
          {clubs.map((c) => (
            <button key={c.id} type="button" onClick={() => openClub(c.id)} className="flex items-center gap-3 rounded-2xl border border-line p-3 text-left" style={{ background: 'var(--card)' }}>
              <div className="h-14 w-10 flex-none overflow-hidden rounded border border-line" style={{ background: 'var(--field)' }}>
                {c.cover && <img src={c.cover} alt="" className="h-full w-full object-cover" />}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[14px] font-semibold text-ink">{c.title}</div>
                <div className="truncate text-[12px] text-muted">Read-along · code {c.joinCode}</div>
              </div>
              <span className="text-[18px]">📖</span>
            </button>
          ))}
        </div>
      ) : (
        <p className="rounded-2xl border border-line p-4 text-[13px] text-muted">
          No read-alongs yet. Start one for a book your group is reading — everyone tracks their chapter and comments unlock as you reach them.
        </p>
      )}

      {/* shared lists */}
      <div className="mb-3 mt-8 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[16px] font-semibold text-ink">Shared lists</h2>
        <div className="flex gap-2">
          <button type="button" onClick={() => setDialog('shared')} className="rounded-full px-3.5 py-1.5 text-[12.5px] font-semibold" style={{ background: 'linear-gradient(135deg, var(--primary), var(--gold))', color: 'var(--on-primary)' }}>
            ＋ New
          </button>
          <button type="button" onClick={joinListByCode} className="rounded-full border border-line px-3.5 py-1.5 text-[12.5px] font-semibold text-ink" style={{ background: 'var(--card)' }}>
            Join by code
          </button>
        </div>
      </div>
      {shared && shared.length ? (
        <div className="grid gap-2 sm:grid-cols-2">
          {shared.map((l) => (
            <button key={l.code} type="button" onClick={() => openList(l.code)} className="flex items-center gap-3 rounded-2xl border border-line p-3 text-left" style={{ background: 'var(--card)' }}>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[14px] font-semibold text-ink">{l.name}</div>
                <div className="truncate text-[12px] text-muted">
                  {l.kind === 'clubtbr' ? 'Book-club TBR' : 'Shared list'} · code {l.code}
                </div>
              </div>
              <span className="text-[18px]">{l.kind === 'clubtbr' ? '👥' : '🔗'}</span>
            </button>
          ))}
        </div>
      ) : (
        <p className="rounded-2xl border border-line p-4 text-[13px] text-muted">
          No shared lists yet. Create one — a household TBR or a book-club TBR everyone can add to.
        </p>
      )}

      {dialog === 'club' && (
        <CreateClubModal displayName={displayName} onClose={() => setDialog(null)} onCreated={(id) => { setDialog(null); openClub(id) }} />
      )}
      {dialog === 'shared' && (
        <CreateSharedModal onClose={() => setDialog(null)} onCreated={(code) => { setDialog(null); openList(code) }} />
      )}
    </section>
  )
}

export const clubsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'clubs',
  component: ClubsScreen,
})
