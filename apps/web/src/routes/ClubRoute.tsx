import { useState } from 'react'
import { createRoute, useNavigate } from '@tanstack/react-router'
import type { ClubUnitType } from '@reverie/core'
import { rootRoute } from '../routes/RootRoute'
import { BackLink } from '../components/BackLink'
import { CoverImage } from '../components/CoverImage'
import { useAuth } from '../auth/AuthProvider'
import {
  clubCommentsKey,
  clubLockedKey,
  clubMembersKey,
  useClub,
  useClubComments,
  useClubLockedInfo,
  useClubMembers,
  useLeaveClub,
  usePostComment,
  useSetCommentHidden,
  useSetProgress,
} from '../data/clubs'
import { useReportContent } from '../data/moderation'
import { useRealtimeRefetch } from '../hooks/useRealtimeRefetch'
import { useVoice } from '../skin/labels'

function unitWord(type: ClubUnitType, label: string, n: number): string {
  return type === 'percent' ? `${n}%` : `${label} ${n}`
}

function ClubScreen() {
  const { clubId } = clubRoute.useParams()
  const navigate = useNavigate()
  const { session } = useAuth()
  const myId = session?.user.id
  const { data: club, isLoading } = useClub(clubId)
  const { data: members } = useClubMembers(clubId)
  const { data: comments } = useClubComments(clubId)
  const { data: locked } = useClubLockedInfo(clubId)
  const setProgress = useSetProgress(clubId)
  const postComment = usePostComment(clubId)
  const setCommentHidden = useSetCommentHidden(clubId)
  const report = useReportContent()
  const [reported, setReported] = useState<Record<string, boolean>>({})
  const leaveClub = useLeaveClub()
  const [draft, setDraft] = useState('')

  // Subscribe to the club row's activity bump (content-free) in addition to members/comments.
  // A behind-progress reader never receives the gated club_comments INSERT (RLS filters it),
  // so the clubs-row signal is what makes their "🔒 N hidden" count refresh live.
  useRealtimeRefetch(
    `club-${clubId}`,
    [
      { table: 'clubs', filter: `id=eq.${clubId}` },
      { table: 'club_members', filter: `club_id=eq.${clubId}` },
      { table: 'club_comments', filter: `club_id=eq.${clubId}` },
    ],
    [clubMembersKey(clubId), clubCommentsKey(clubId), clubLockedKey(clubId)],
  )

  const voice = useVoice()
  if (isLoading) return <p className="px-6 py-16 text-center text-muted">{voice.loading}</p>
  if (!club)
    return (
      <div className="px-6 py-16 text-center text-muted">
        <p>This read-along isn’t available — you may need to join it by code.</p>
        <BackLink fallback="/clubs" className="mt-3 inline-block text-primary">
          ← Back to Clubs
        </BackLink>
      </div>
    )

  const me = members?.find((m) => m.userId === myId)
  const myProgress = me?.progress ?? 0
  const step = club.unitType === 'percent' ? 5 : 1
  const nameOf = (userId: string) => members?.find((m) => m.userId === userId)?.displayName ?? 'Reader'

  const changeProgress = (delta: number) =>
    setProgress.mutate(Math.max(0, Math.min(club.unitCount, myProgress + delta)))

  return (
    <section className="mx-auto max-w-2xl px-4 py-6 sm:px-6">
      <BackLink fallback="/clubs" className="text-[13px] text-muted hover:text-ink">
        ← Clubs
      </BackLink>

      <div className="mt-3 flex gap-4">
        <div className="aspect-[2/3] w-20 flex-none overflow-hidden rounded-lg border border-line" style={{ background: 'var(--field)' }}>
          <CoverImage book={{ id: club.id, title: club.title, cover: club.cover }} />
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="text-[24px] italic leading-tight text-ink" style={{ fontFamily: 'var(--font-display)', fontWeight: 600 }}>
            {club.title}
          </h1>
          <div className="text-[14px] text-muted">{club.author || 'Read-along'}</div>
          <div className="mt-2 flex items-center gap-2">
            <span className="rounded-lg px-2.5 py-1 font-mono text-[13px] font-bold tracking-wider" style={{ background: 'var(--ink)', color: 'var(--bg0)' }}>
              {club.joinCode}
            </span>
            <button type="button" onClick={() => void navigator.clipboard?.writeText(club.joinCode)} className="text-[12px] text-primary">
              copy code
            </button>
          </div>
        </div>
      </div>

      {/* my progress */}
      <div className="mt-6 rounded-2xl border border-line p-4" style={{ background: 'var(--card)' }}>
        <div className="mb-1 text-[11px] uppercase tracking-[0.2em] text-muted">Your progress</div>
        <div className="flex items-center gap-3">
          <button type="button" onClick={() => changeProgress(-step)} aria-label="Less progress" className="h-9 w-9 rounded-full border border-line text-ink">
            −
          </button>
          <div className="text-[18px] font-semibold text-ink">
            {unitWord(club.unitType, club.unitLabel, myProgress)}
            {club.unitType !== 'percent' && <span className="text-[13px] text-muted"> of {club.unitCount}</span>}
          </div>
          <button type="button" onClick={() => changeProgress(step)} aria-label="More progress" className="h-9 w-9 rounded-full border border-line text-ink">
            ＋
          </button>
        </div>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full" style={{ background: 'var(--chip)' }}>
          <div
            className="h-full rounded-full"
            style={{ width: `${Math.min(100, Math.round((myProgress / (club.unitType === 'percent' ? 100 : club.unitCount)) * 100))}%`, background: 'var(--primary)' }}
          />
        </div>
      </div>

      {/* members */}
      <div className="mt-6">
        <h2 className="mb-2 text-[15px] font-semibold text-ink">Members</h2>
        <div className="flex flex-col gap-1.5">
          {(members ?? []).map((m) => (
            <div key={m.userId} className="flex items-center justify-between rounded-xl border border-line px-3 py-2 text-[13.5px]" style={{ background: 'var(--field)' }}>
              <span className="text-ink">
                {m.displayName}
                {m.userId === myId ? ' (you)' : ''}
              </span>
              <span className="text-muted">{unitWord(club.unitType, club.unitLabel, m.progress)}</span>
            </div>
          ))}
        </div>
      </div>

      {/* comments */}
      <div className="mt-6">
        <h2 className="mb-2 text-[15px] font-semibold text-ink">Discussion</h2>
        <div className="flex flex-col gap-2">
          {(comments ?? []).map((c) => (
            <div key={c.id} className="rounded-xl border border-line p-3" style={{ background: 'var(--field)' }}>
              <div className="mb-1 flex items-center gap-2 text-[12px]">
                <b className="text-ink">{nameOf(c.userId)}</b>
                <span className="rounded-full px-2 py-0.5 text-[11px]" style={{ background: 'var(--chip)', color: 'var(--muted)' }}>
                  {unitWord(club.unitType, club.unitLabel, c.unit)}
                </span>
              </div>
              <div className="text-[14px] text-ink">{c.body}</div>
              <div className="mt-1.5 flex items-center gap-3 text-[11.5px]">
                {c.hidden && <span className="rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ background: 'var(--chip)', color: 'var(--muted)' }}>Hidden — only you can see this</span>}
                {myId === c.userId ? (
                  <button type="button" onClick={() => setCommentHidden.mutate({ commentId: c.id, hidden: !c.hidden })} className="text-muted hover:text-ink">
                    {c.hidden ? 'Unhide' : 'Hide'}
                  </button>
                ) : reported[c.id] ? (
                  <span className="text-muted">Reported — thanks</span>
                ) : (
                  <button
                    type="button"
                    onClick={() => report.mutate({ targetType: 'club_comment', targetId: c.id }, { onSuccess: () => setReported((p) => ({ ...p, [c.id]: true })) })}
                    className="text-muted hover:text-ink"
                  >
                    Report
                  </button>
                )}
              </div>
            </div>
          ))}
          {locked && locked.hidden > 0 && (
            <div className="rounded-xl border border-dashed border-line p-3 text-center text-[13px] text-muted">
              🔒 {locked.hidden} comment{locked.hidden > 1 ? 's' : ''} hidden — next unlocks at{' '}
              {locked.nextUnit != null ? unitWord(club.unitType, club.unitLabel, locked.nextUnit) : 'a later point'}
            </div>
          )}
          {!comments?.length && (!locked || locked.hidden === 0) && (
            <p className="text-[13px] text-muted">No comments yet. Be the first once you’ve read a bit.</p>
          )}
        </div>

        {me && (
          <div className="mt-3">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={2}
              placeholder={`Comment on ${unitWord(club.unitType, club.unitLabel, myProgress)}…`}
              className="w-full rounded-xl border border-line p-3 text-[14px] text-ink outline-none"
              style={{ background: 'var(--field)' }}
            />
            <button
              type="button"
              disabled={!draft.trim() || postComment.isPending}
              onClick={() =>
                postComment.mutate(
                  { unit: myProgress, body: draft.trim() },
                  { onSuccess: () => setDraft('') },
                )
              }
              className="mt-2 rounded-full px-4 py-2 text-[13px] font-semibold disabled:opacity-50"
              style={{ background: 'linear-gradient(135deg, var(--primary), var(--gold))', color: 'var(--on-primary)' }}
            >
              Post comment
            </button>
            <p className="mt-1 text-[11.5px] text-muted">
              Your comment is tagged to {unitWord(club.unitType, club.unitLabel, myProgress)} — hidden for others until they reach it.
            </p>
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={() => {
          if (window.confirm('Leave this read-along?')) leaveClub.mutate(clubId, { onSuccess: () => void navigate({ to: '/clubs' }) })
        }}
        className="mt-8 rounded-full border border-line px-4 py-2 text-[13px] font-semibold text-primary"
        style={{ background: 'var(--card)' }}
      >
        Leave read-along
      </button>
    </section>
  )
}

export const clubRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'club/$clubId',
  component: ClubScreen,
})
