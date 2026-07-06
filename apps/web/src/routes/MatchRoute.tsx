import { useMemo, useState } from 'react'
import { createRoute, useNavigate } from '@tanstack/react-router'
import { buildMatchContext, deriveBoyfriend, scoreMatch, type Book, type MatchProfile, type MatchReason } from '@reverie/core'
import { rootRoute } from './RootRoute'
import { CoverImage } from '../components/CoverImage'
import { useBooks } from '../data/books'
import { useCreateList, useLists } from '../data/lists'
import { useAddBooksToList } from '../data/listItems'
import { useDismissed, useDismissBook, useLegacyDismissalSync } from '../data/matchFeedback'
import { useEnsureEmbeddings, useVibeSearch, type SimilarHit } from '../data/similar'
import { applyAnswer, emptyAnswers, HEAT, QUIZ, WORLD, type QuizAnswers } from '../library/quiz'

interface Pick {
  b: Book
  s: number
  isRead: boolean
  /** the pick's top reason, already worded (Tier 0: every score is explainable) */
  why: string
}

/** One human line from the structured reasons — series momentum first (the strongest story),
 *  then matched cravings, then world/heat fit. */
function whyLine(reasons: MatchReason[]): string {
  const series = reasons.find((r) => r.key === 'series')
  if (series?.series?.lovedEarlier) return `Next in ${series.series.name} — a series you love`
  const tags = reasons.find((r) => r.key === 'tags')
  if (tags?.matchedTags?.length) return `Matches ${tags.matchedTags.slice(0, 2).join(' · ')}`
  const taste = reasons.find((r) => r.key === 'tasteTags')
  if (taste?.lovedTags?.length) return `Close to your loves: ${taste.lovedTags.slice(0, 2).join(' · ')}`
  const sub = reasons.find((r) => r.key === 'subgenre')
  if (sub && sub.value >= 0.9) return 'Squarely your world'
  const heat = reasons.find((r) => r.key === 'intensity')
  if (heat && heat.value >= 0.9) return 'Heat right on target'
  return 'A fresh pick from your shelves'
}

function score(
  books: Book[],
  a: QuizAnswers,
  opts: { tasteOnly?: boolean; dismissedAt?: Record<string, number> } = {},
): { picks: Pick[]; headline: string; sub: string; tags: string[] } {
  const target = a.spices.length ? Math.round(a.spices.reduce((x, y) => x + y, 0) / a.spices.length) : 3
  const topSub = Object.entries(a.subs).sort((x, y) => y[1] - x[1])[0]?.[0] ?? 'Romance'
  const cravings = [...new Set(a.tropes)]

  // Build a genre-neutral profile from the (romance-flavored) quiz, then score with the core
  // vibe matcher over the library-derived context (tag rarity + series momentum + the LEARNED
  // taste). Taste-only mode (Tier 1) skips the quiz entirely: a mood-neutral profile over the
  // standing taste. The book-boyfriend archetype rides along as the Tryst skin's signature signal.
  const profile: MatchProfile = opts.tasteOnly
    ? { subWeights: {}, wantTags: [], targetIntensity: null }
    : (() => {
        const subWeights = { ...a.subs }
        if (a.dark) subWeights['Dark Romance'] = (subWeights['Dark Romance'] ?? 0) + 1
        return { subWeights, wantTags: cravings, targetIntensity: target, archetypeWeights: a.arts }
      })()
  const ctx = buildMatchContext(books, { archetype: deriveBoyfriend, dismissedAt: opts.dismissedAt })

  const scored: Pick[] = books
    .map((b) => {
      const { score: s, reasons } = scoreMatch(b, profile, ctx)
      const isRead = b.readStatus === 'Read' || b.reads.length > 0
      return { b, s, isRead, why: whyLine(reasons) }
    })
    .sort((x, y) => y.s - x.s)

  if (opts.tasteOnly) {
    // headline chips = the standing loves the profile actually learned
    const loves = Object.entries(ctx.taste?.tagAffinity ?? {})
      .filter(([, a2]) => a2 >= 0.3)
      .sort((x, y) => y[1] - x[1])
      .slice(0, 3)
      .map(([t]) => t.replace(/\b\w/g, (c) => c.toUpperCase()))
    return {
      picks: scored.filter((x) => x.s >= 45).slice(0, 12),
      headline: 'Your standing taste',
      sub: 'Learned from how you rate, reread, and shelve',
      tags: loves,
    }
  }

  const heatWord = HEAT[target] || 'Steamy'
  const worldWord = WORLD[topSub] ?? 'romance'
  const paceLabel = a.pace ? { slow: 'slow burn', mid: 'steady build', fast: 'fast burn' }[a.pace] : ''
  const subBits: string[] = []
  if (a.pace === 'slow') subBits.push('A slow burn')
  if (cravings.length) subBits.push(cravings.slice(0, 2).join(' · '))
  const tags = [`${'🌶️'.repeat(target)} ${heatWord}`, worldWord, ...(paceLabel ? [paceLabel] : []), ...cravings.slice(0, 3)]

  return {
    picks: scored.filter((x) => x.s >= 45).slice(0, 12), // 0..100 now — keep genuinely-decent fits
    headline: `${heatWord} ${worldWord}`,
    sub: subBits.join(' — ') || 'Picked for your mood tonight',
    tags,
  }
}

function MatchScreen() {
  const navigate = useNavigate()
  const { data: books } = useBooks()
  const { data: lists } = useLists()
  const createList = useCreateList()
  const addToList = useAddBooksToList()
  const [answers, setAnswers] = useState<QuizAnswers>(emptyAnswers)
  const [step, setStep] = useState(0)
  const [added, setAdded] = useState<string | null>(null)
  const [tasteOnly, setTasteOnly] = useState(false)
  // "Not tonight" feedback — the matcher's first captured signal, now server-side (it survives
  // the device); the scorer floors a dismissed book's novelty and lets it recover over 60 days.
  const dismissedQ = useDismissed()
  const dismissed = useMemo(() => dismissedQ.data ?? {}, [dismissedQ.data])
  const dismissBook = useDismissBook()
  const libraryIds = useMemo(() => (books ? new Set(books.map((b) => b.id)) : null), [books])
  useLegacyDismissalSync(libraryIds)
  // Tier 2: keep the vectors warm (sig-gated sweep, once per session) + the vibe path state
  useEnsureEmbeddings()
  const vibeSearch = useVibeSearch()
  const [vibeQ, setVibeQ] = useState('')
  const [vibe, setVibe] = useState<{ query: string; hits: SimilarHit[] } | null>(null)
  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set())

  const openBook = (id: string) => void navigate({ to: '/book/$bookId', params: { bookId: id } })
  const result = useMemo(
    () => (step >= QUIZ.length ? score(books ?? [], answers, { tasteOnly, dismissedAt: dismissed }) : null),
    [step, books, answers, tasteOnly, dismissed],
  )
  // Tier 2 vibe path: the reader's words, embedded server-side and ranked over their shelves,
  // flow through the SAME reveal pipeline as quiz/taste picks (add-top-3, not-tonight, why-lines).
  const vibePicks: Pick[] = useMemo(() => {
    if (!vibe || !books) return []
    const byId = new Map(books.map((b) => [b.id, b]))
    return vibe.hits.flatMap((h) => {
      const b = byId.get(h.book_id)
      if (!b) return []
      const isRead = b.readStatus === 'Read' || b.reads.length > 0
      return [{ b, s: Math.round(h.similarity * 100), isRead, why: 'Close to tonight’s vibe' }]
    })
  }, [vibe, books])

  const banner = vibe
    ? { headline: vibe.query, sub: 'Ranked by closeness to your words', tags: [] as string[] }
    : result
      ? { headline: result.headline, sub: result.sub, tags: result.tags }
      : null
  const picks = vibe ? vibePicks : (result?.picks ?? [])
  const visiblePicks = picks.filter((p) => !hidden.has(p.b.id))

  const dismiss = (id: string) => {
    dismissBook.mutate(id) // optimistic — the cache map updates immediately
    setHidden((h) => new Set([...h, id]))
  }

  const reset = () => {
    setAnswers(emptyAnswers())
    setStep(0)
    setAdded(null)
    setTasteOnly(false)
    setVibe(null)
    setVibeQ('')
    setHidden(new Set())
  }

  async function addTop3() {
    if (!banner) return
    const top3 = visiblePicks.filter((p) => !p.isRead).slice(0, 3).map((p) => p.b.id)
    if (!top3.length) return
    let priority = (lists ?? []).find((l) => l.kind === 'tbr' && l.priority)
    if (!priority) priority = await createList.mutateAsync({ name: 'Priority TBR', kind: 'tbr', isPriority: true })
    await addToList.mutateAsync({ listId: priority.id, bookIds: top3 })
    setAdded(`Added ${top3.length} to ${priority.name}`)
  }

  // --- quiz ---
  if (!banner) {
    const q = QUIZ[step]
    if (!q) return null
    return (
      <section className="mx-auto max-w-xl px-4 py-10 sm:px-6">
        <div className="rounded-3xl border border-line p-6" style={{ background: 'var(--card)', boxShadow: 'var(--shadow)' }}>
          <div className="mb-3 h-1.5 overflow-hidden rounded-full" style={{ background: 'var(--chip)' }}>
            <div className="h-full rounded-full" style={{ width: `${(step / QUIZ.length) * 100}%`, background: 'var(--primary)' }} />
          </div>
          <div className="text-[12px] uppercase tracking-[0.2em] text-muted">
            Question {step + 1} of {QUIZ.length}
          </div>
          <h1 className="mt-2 text-[26px] italic leading-tight text-ink" style={{ fontFamily: 'var(--font-display)', fontWeight: 600 }}>
            {q.q}
          </h1>
          <div className="mt-5 flex flex-col gap-2.5">
            {q.opts.map((o) => (
              <button
                key={o.t}
                type="button"
                onClick={() => {
                  setAnswers((a) => applyAnswer(a, o))
                  setStep((s) => s + 1)
                }}
                className="skin-panel border border-line px-4 py-3 text-left text-[15px] font-semibold text-ink transition-colors hover:border-[color:var(--primary)]"
                style={{ background: 'var(--field)' }}
              >
                {o.t}
              </button>
            ))}
          </div>
          {step === 0 && (
            <>
              {/* Tier 1: the quiz is a mood override — the learned baseline can carry Match alone */}
              <button
                type="button"
                onClick={() => {
                  setTasteOnly(true)
                  setStep(QUIZ.length)
                }}
                className="mt-4 w-full text-center text-[13px] font-semibold text-primary"
              >
                Skip the quiz — match my standing taste →
              </button>
              {/* Tier 2: or say it in your own words — embedded server-side, ranked over your shelves */}
              <form
                className="mt-5 flex flex-col gap-2 border-t border-line pt-4 sm:flex-row"
                onSubmit={(e) => {
                  e.preventDefault()
                  const query = vibeQ.trim()
                  if (!query || vibeSearch.isPending) return
                  vibeSearch.mutate(query, {
                    onSuccess: (hits) => {
                      if (hits.length) setVibe({ query, hits })
                    },
                  })
                }}
              >
                <input
                  value={vibeQ}
                  onChange={(e) => setVibeQ(e.target.value)}
                  placeholder="Or describe tonight’s vibe — “cozy small-town rivals, low heat”"
                  aria-label="Describe tonight’s vibe"
                  className="h-10 min-w-0 flex-1 skin-card border border-line px-3 text-[13.5px] text-ink outline-none"
                  style={{ background: 'var(--field)' }}
                />
                <button
                  type="submit"
                  disabled={vibeSearch.isPending || !vibeQ.trim()}
                  className="skin-control h-10 border border-line px-4 text-[13px] font-semibold text-ink disabled:opacity-50 sm:shrink-0"
                  style={{ background: 'var(--chip)' }}
                >
                  {vibeSearch.isPending ? 'Reading…' : 'Match it'}
                </button>
              </form>
              {vibeSearch.isError && (
                <p className="mt-2 text-[12px] text-muted">The vibe engine isn’t reachable right now — the quiz still works.</p>
              )}
              {vibeSearch.isSuccess && !vibeSearch.data?.length && (
                <p className="mt-2 text-[12px] text-muted">Still embedding your shelves — give it a minute and try again.</p>
              )}
            </>
          )}
        </div>
      </section>
    )
  }

  // --- reveal ---
  return (
    <section className="px-4 py-8 sm:px-6">
      <div
        className="mx-auto max-w-xl rounded-3xl p-6 text-center"
        style={{ background: 'linear-gradient(150deg, var(--violet), var(--primary))', color: 'var(--on-primary)' }}
      >
        <div className="text-[12px] uppercase tracking-[0.16em] opacity-85">What you’re in the mood for</div>
        <h1 className="mt-1 text-[30px] italic capitalize leading-tight" style={{ fontFamily: 'var(--font-display)', fontWeight: 600 }}>
          {banner.headline}
        </h1>
        <div className="mt-1 opacity-90">{banner.sub}</div>
        <div className="mt-3 flex flex-wrap justify-center gap-1.5">
          {banner.tags.map((t) => (
            <span key={t} className="rounded-full bg-white/20 px-2.5 py-1 text-[12px] font-semibold">
              {t}
            </span>
          ))}
        </div>
      </div>

      <div className="mx-auto mt-5 flex max-w-xl flex-wrap justify-center gap-2">
        <button
          type="button"
          onClick={addTop3}
          className="rounded-full px-4 py-2 text-[13px] font-semibold"
          style={{ background: 'linear-gradient(135deg, var(--primary), var(--gold))', color: 'var(--on-primary)' }}
        >
          ＋ Add top 3 to Priority TBR
        </button>
        <button type="button" onClick={reset} className="rounded-full border border-line px-4 py-2 text-[13px] font-semibold text-ink">
          ↻ Retake
        </button>
      </div>
      {added && <p className="mt-2 text-center text-[13px] text-primary">{added}</p>}

      <div className="mt-8 text-center">
        <h2 className="text-[18px] italic text-ink" style={{ fontFamily: 'var(--font-display)', fontWeight: 600 }}>
          Matched from your shelves
        </h2>
        <p className="text-[12.5px] text-muted">Unread picks first — your next read awaits</p>
      </div>
      <div className="mx-auto mt-4 grid max-w-4xl grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6">
        {visiblePicks.map(({ b, s, isRead, why }) => (
          <div key={b.id} className="group relative">
            <button type="button" onClick={() => openBook(b.id)} className="w-full text-left" aria-label={`Open ${b.title}`}>
              <div className="aspect-[2/3] overflow-hidden rounded-lg border border-line" style={{ background: 'var(--field)' }}>
                <CoverImage book={b} />
              </div>
              <div className="mt-1 truncate text-[11.5px] font-semibold text-ink">{b.title}</div>
              <div className="text-[10.5px] font-bold text-primary">
                {s}% match{isRead ? ' · reread' : ''}
              </div>
              {/* the honest why — every pick can say what earned it (Tier 0) */}
              <div className="truncate text-[10px] text-muted">{why}</div>
            </button>
            {/* feedback capture: "not tonight" floors this book for ~60 days (Tier 1) */}
            <button
              type="button"
              onClick={() => dismiss(b.id)}
              aria-label={`Not tonight — hide ${b.title}`}
              title="Not tonight"
              className="absolute right-1 top-1 h-6 w-6 rounded-full text-[11px] font-bold opacity-0 backdrop-blur transition-opacity focus-visible:opacity-100 group-hover:opacity-100"
              style={{ background: 'rgba(0,0,0,0.55)', color: '#fff' }}
            >
              ✕
            </button>
          </div>
        ))}
      </div>
    </section>
  )
}

export const matchRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'match',
  component: MatchScreen,
})
