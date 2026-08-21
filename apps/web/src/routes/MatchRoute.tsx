import { useMemo, useState } from 'react'
import { createRoute, useNavigate } from '@tanstack/react-router'
import {
  buildMatchContext,
  CORE_GENRES,
  scoreMatch,
  type Book,
  type MatchProfile,
  type MatchReason,
} from '@reverie/core'
import { Surface } from '../components/Surface'
import { rootRoute } from './RootRoute'
import { CoverImage } from '../components/CoverImage'
import { useBooks } from '../data/books'
import { useCreateList, useLists } from '../data/lists'
import { useAddBooksToList } from '../data/listItems'
import { useDismissed, useDismissBook, useLegacyDismissalSync } from '../data/matchFeedback'
import { useEnsureEmbeddings, useVibeSearch, type SimilarHit } from '../data/similar'
import {
  applyAnswer,
  buildQuizProfile,
  emptyAnswers,
  HEAT,
  INTENSITY,
  QUIZ,
  type QuizAnswers,
} from '../library/quiz'

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
  if (taste?.lovedTags?.length)
    return `Close to your loves: ${taste.lovedTags.slice(0, 2).join(' · ')}`
  const sub = reasons.find((r) => r.key === 'subgenre')
  if (sub && sub.value >= 0.9) return 'Squarely your world'
  // The quiz scores DARKNESS since the axis split, so this line no longer describes heat.
  const dark = reasons.find((r) => r.key === 'darkness')
  if (dark && dark.value >= 0.9) return 'Pitched right for how heavy you want it'
  return 'A fresh pick from your shelves'
}

/** Title-case a lowercased primary-genre key back to its CORE_GENRES display spelling. */
const genreLabel = (key: string): string =>
  CORE_GENRES.find((g) => g.toLowerCase() === key) ?? key.replace(/\b\w/g, (c) => c.toUpperCase())

const modeOf = (m: Map<string, number>): string | undefined =>
  [...m.entries()].sort((x, y) => y[1] - x[1])[0]?.[0]

/** Result vocabulary drawn from the MATCHED books, not a fixed romance script (task §3). The headline
 *  and pills describe what was actually surfaced — the dominant subgenre/genre, its real tropes, and
 *  a representative intensity — so a horror result reads like horror and a literary one like literary.
 *  Intensity shows as spice (🌶️) only when the match is romance-leaning; otherwise a neutral word. */
function describeMatches(
  picks: Pick[],
  a: QuizAnswers,
): { headline: string; sub: string; tags: string[] } {
  const top = picks.slice(0, 8).map((p) => p.b)
  if (!top.length) {
    return {
      headline: 'Nothing quite fits tonight',
      sub: 'Try a different mood or retake the quiz',
      tags: [],
    }
  }
  const subCount = new Map<string, number>()
  const genreCount = new Map<string, number>()
  const tropeCount = new Map<string, number>()
  const intensities: number[] = []
  for (const b of top) {
    if (b.subgenre) subCount.set(b.subgenre, (subCount.get(b.subgenre) ?? 0) + 1)
    if (b.genre) genreCount.set(b.genre, (genreCount.get(b.genre) ?? 0) + 1)
    for (const t of b.tropes) tropeCount.set(t.name, (tropeCount.get(t.name) ?? 0) + 1)
    if (b.intensity != null) intensities.push(b.intensity)
  }
  const domGenreKey = modeOf(genreCount)
  const domSub = modeOf(subCount)
  const domGenreLabel = domGenreKey ? genreLabel(domGenreKey) : undefined
  const headline = `${a.pace === 'slow' ? 'Slow-burn ' : ''}${domSub ?? domGenreLabel ?? 'Your shelves'}`

  const topTropes = [...tropeCount.entries()]
    .sort((x, y) => y[1] - x[1])
    .slice(0, 3)
    .map(([t]) => t)
  const tags: string[] = []
  const sorted = [...intensities].sort((x, y) => x - y)
  const median = sorted[Math.floor(sorted.length / 2)]
  if (median != null) {
    const iv = Math.max(0, Math.min(5, Math.round(median)))
    const word = (domGenreKey === 'romance' ? HEAT[iv] : INTENSITY[iv]) ?? ''
    if (iv > 0 && word) tags.push(domGenreKey === 'romance' ? `${'🌶️'.repeat(iv)} ${word}` : word)
  }
  // add the parent genre only when the headline led with a subgenre (avoid echoing it)
  if (domGenreLabel && domGenreLabel.toLowerCase() !== headline.toLowerCase())
    tags.push(domGenreLabel)
  tags.push(...topTropes)
  return { headline, sub: 'Picked for your mood tonight', tags: [...new Set(tags)] }
}

function score(
  books: Book[],
  a: QuizAnswers,
  opts: { tasteOnly?: boolean; dismissedAt?: Record<string, number> } = {},
): { picks: Pick[]; headline: string; sub: string; tags: string[] } {
  // Build a genre-neutral profile from the quiz, then score with the core vibe matcher over the
  // library-derived context (tag rarity + series momentum + the LEARNED taste). The genre lean is
  // keyed off the lowercased primary-genre keys, so it steers any of the nine genres (the matcher
  // resolves subWeights[book.subgenre] ?? subWeights[book.genre]). Taste-only mode (Tier 1) skips
  // the quiz entirely: a mood-neutral profile over the standing taste.
  const profile: MatchProfile = opts.tasteOnly
    ? { subWeights: {}, wantTags: [], targetDarkness: null }
    : buildQuizProfile(a)
  const ctx = buildMatchContext(books, { dismissedAt: opts.dismissedAt })

  const scored: Pick[] = books
    .map((b) => {
      const { score: s, reasons } = scoreMatch(b, profile, ctx)
      const isRead = b.readStatus === 'Read' || b.reads.length > 0
      return { b, s, isRead, why: whyLine(reasons) }
    })
    .sort((x, y) => y.s - x.s)

  const picks = scored.filter((x) => x.s >= 45).slice(0, 12) // 0..100 — keep genuinely-decent fits

  if (opts.tasteOnly) {
    // headline chips = the standing loves the profile actually learned
    const loves = Object.entries(ctx.taste?.tagAffinity ?? {})
      .filter(([, a2]) => a2 >= 0.3)
      .sort((x, y) => y[1] - x[1])
      .slice(0, 3)
      .map(([t]) => t.replace(/\b\w/g, (c) => c.toUpperCase()))
    return {
      picks,
      headline: 'Your standing taste',
      sub: 'Learned from how you rate, reread, and shelve',
      tags: loves,
    }
  }

  return { picks, ...describeMatches(picks, a) }
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
  // Seeded from the param — the vibe you RAN, restored on return.
  const [vibeQ, setVibeQ] = useState(matchRoute.useSearch().vibeQ ?? '')
  const [vibe, setVibe] = useState<{ query: string; hits: SimilarHit[] } | null>(null)
  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set())

  const openBook = (id: string) => void navigate({ to: '/book/$bookId', params: { bookId: id } })
  const result = useMemo(
    () =>
      step >= QUIZ.length
        ? score(books ?? [], answers, { tasteOnly, dismissedAt: dismissed })
        : null,
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
    const top3 = visiblePicks
      .filter((p) => !p.isRead)
      .slice(0, 3)
      .map((p) => p.b.id)
    if (!top3.length) return
    let priority = (lists ?? []).find((l) => l.kind === 'tbr' && l.priority)
    if (!priority)
      priority = await createList.mutateAsync({
        name: 'Priority TBR',
        kind: 'tbr',
        isPriority: true,
      })
    await addToList.mutateAsync({ listId: priority.id, bookIds: top3 })
    setAdded(`Added ${top3.length} to ${priority.name}`)
  }

  // --- quiz ---
  if (!banner) {
    const q = QUIZ[step]
    if (!q) return null
    return (
      <section className="mx-auto w-full max-w-xl px-4 py-10 sm:px-6">
        <Surface tone="card" radius="panel" pad={5} raised>
          <div
            className="skin-meter mb-3 h-1.5 overflow-hidden"
            style={{ background: 'var(--chip)' }}
          >
            <div
              className="skin-meter h-full"
              style={{ width: `${(step / QUIZ.length) * 100}%`, background: 'var(--primary)' }}
            />
          </div>
          <div className="text-[12px] uppercase tracking-[0.2em] text-muted">
            Question {step + 1} of {QUIZ.length}
          </div>
          <h1
            className="mt-2 text-[26px] italic leading-tight text-ink"
            style={{ fontFamily: 'var(--font-display)', fontWeight: 600 }}
          >
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
                  // SUBMIT-TIME, not debounced. This field is submit-triggered, so it means "the
                  // search you ran" — putting a half-typed phrase in the URL would restore a vibe
                  // the reader never asked for. Written alongside the mutation rather than in its
                  // onSuccess, so the URL reflects what was asked even if the search returns
                  // nothing (restoring the RESULTS is deliberately out of scope; only the text).
                  void navigate({ to: '/match', search: { vibeQ: query }, replace: true })
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
                <p className="mt-2 text-[12px] text-muted">
                  The vibe engine isn’t reachable right now — the quiz still works.
                </p>
              )}
              {vibeSearch.isSuccess && !vibeSearch.data?.length && (
                <p className="mt-2 text-[12px] text-muted">
                  Still embedding your shelves — give it a minute and try again.
                </p>
              )}
            </>
          )}
        </Surface>
      </section>
    )
  }

  // --- reveal ---
  return (
    <section className="px-4 py-8 sm:px-6">
      <div
        className="mx-auto max-w-xl rounded-3xl p-6 text-center"
        style={{
          background: 'linear-gradient(150deg, var(--violet), var(--primary))',
          color: 'var(--on-primary)',
        }}
      >
        <div className="text-[12px] uppercase tracking-[0.16em] opacity-85">
          What you’re in the mood for
        </div>
        <h1
          className="mt-1 text-[30px] italic capitalize leading-tight"
          style={{ fontFamily: 'var(--font-display)', fontWeight: 600 }}
        >
          {banner.headline}
        </h1>
        <div className="mt-1 opacity-90">{banner.sub}</div>
        <div className="mt-3 flex flex-wrap justify-center gap-1.5">
          {banner.tags.map((t) => (
            <span
              key={t}
              className="skin-control-quiet bg-white/20 px-2.5 py-1 text-[12px] font-semibold"
            >
              {t}
            </span>
          ))}
        </div>
      </div>

      <div className="mx-auto mt-5 flex max-w-xl flex-wrap justify-center gap-2">
        <button
          type="button"
          onClick={addTop3}
          className="skin-control px-4 py-2 text-[13px] font-semibold"
          style={{
            background: 'linear-gradient(135deg, var(--primary), var(--gold))',
            color: 'var(--on-primary)',
          }}
        >
          ＋ Add top 3 to Priority TBR
        </button>
        <button
          type="button"
          onClick={reset}
          className="skin-control border border-line px-4 py-2 text-[13px] font-semibold text-ink"
        >
          ↻ Retake
        </button>
      </div>
      {added && <p className="mt-2 text-center text-[13px] text-primary">{added}</p>}

      <div className="mt-8 text-center">
        <h2
          className="text-[18px] italic text-ink"
          style={{ fontFamily: 'var(--font-display)', fontWeight: 600 }}
        >
          Matched from your shelves
        </h2>
        <p className="text-[12.5px] text-muted">Unread picks first — your next read awaits</p>
      </div>
      <div className="mx-auto mt-4 grid max-w-4xl grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6">
        {visiblePicks.map(({ b, s, isRead, why }) => (
          <div key={b.id} className="group relative">
            <button
              type="button"
              onClick={() => openBook(b.id)}
              className="w-full text-left"
              aria-label={`Open ${b.title}`}
            >
              <div
                className="aspect-[2/3] overflow-hidden rounded-lg border border-line"
                style={{ background: 'var(--field)' }}
              >
                <CoverImage book={b} />
              </div>
              <div className="mt-1 truncate text-[12px] font-semibold text-ink">{b.title}</div>
              <div className="text-[11px] font-bold text-primary">
                {s}% match{isRead ? ' · reread' : ''}
              </div>
              {/* the honest why — every pick can say what earned it (Tier 0) */}
              <div className="truncate text-[11px] text-muted">{why}</div>
            </button>
            {/* feedback capture: "not tonight" floors this book for ~60 days (Tier 1).
                pointer-coarse:opacity-100: same touch-invisibility fix as CoverCard's fave toggle
                (docs/audits/mobile-shelf-interaction.md Defect B) — worse here, since this button
                has no aria-pressed fallback and was PERMANENTLY invisible on touch. */}
            <button
              type="button"
              onClick={() => dismiss(b.id)}
              aria-label={`Not tonight — hide ${b.title}`}
              title="Not tonight"
              className="absolute right-1 top-1 h-6 w-6 rounded-full text-[11px] font-bold opacity-0 backdrop-blur transition-opacity focus-visible:opacity-100 group-hover:opacity-100 pointer-coarse:opacity-100"
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
  // Fails CLOSED — a non-string resolves to undefined rather than throwing.
  validateSearch: (search: Record<string, unknown>): { vibeQ?: string } => ({
    vibeQ: typeof search.vibeQ === 'string' && search.vibeQ.trim() ? search.vibeQ : undefined,
  }),
  component: MatchScreen,
})
