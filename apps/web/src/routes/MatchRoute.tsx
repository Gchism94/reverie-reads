import { useMemo, useState } from 'react'
import { createRoute, useNavigate } from '@tanstack/react-router'
import { deriveBoyfriend, scoreMatch, type Book, type MatchProfile } from '@reverie/core'
import { rootRoute } from './RootRoute'
import { useBooks } from '../data/books'
import { useCreateList, useLists } from '../data/lists'
import { useAddBooksToList } from '../data/listItems'
import { applyAnswer, emptyAnswers, HEAT, QUIZ, WORLD, type QuizAnswers } from '../library/quiz'

interface Pick {
  b: Book
  s: number
  isRead: boolean
}

function score(books: Book[], a: QuizAnswers): { picks: Pick[]; headline: string; sub: string; tags: string[] } {
  const target = a.spices.length ? Math.round(a.spices.reduce((x, y) => x + y, 0) / a.spices.length) : 3
  const topSub = Object.entries(a.subs).sort((x, y) => y[1] - x[1])[0]?.[0] ?? 'Romance'
  const cravings = [...new Set(a.tropes)]

  // Build a genre-neutral profile from the (romance-flavored) quiz, then score with the core
  // vibe matcher. The book-boyfriend archetype is passed as the Tryst skin's signature signal.
  const subWeights = { ...a.subs }
  if (a.dark) subWeights['Dark Romance'] = (subWeights['Dark Romance'] ?? 0) + 1
  const profile: MatchProfile = { subWeights, wantTags: cravings, targetIntensity: target, archetypeWeights: a.arts }

  const scored: Pick[] = books
    .map((b) => {
      const s = scoreMatch(b, profile, { archetype: deriveBoyfriend })
      const isRead = b.readStatus === 'Read' || b.reads.length > 0
      return { b, s, isRead }
    })
    .sort((x, y) => y.s - x.s)

  const heatWord = HEAT[target] || 'Steamy'
  const worldWord = WORLD[topSub] ?? 'romance'
  const paceLabel = a.pace ? { slow: 'slow burn', mid: 'steady build', fast: 'fast burn' }[a.pace] : ''
  const subBits: string[] = []
  if (a.pace === 'slow') subBits.push('A slow burn')
  if (cravings.length) subBits.push(cravings.slice(0, 2).join(' · '))
  const tags = [`${'🌶️'.repeat(target)} ${heatWord}`, worldWord, ...(paceLabel ? [paceLabel] : []), ...cravings.slice(0, 3)]

  return {
    picks: scored.filter((x) => x.s > 0).slice(0, 12),
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

  const openBook = (id: string) => void navigate({ to: '/book/$bookId', params: { bookId: id } })
  const result = useMemo(
    () => (step >= QUIZ.length ? score(books ?? [], answers) : null),
    [step, books, answers],
  )

  const reset = () => {
    setAnswers(emptyAnswers())
    setStep(0)
    setAdded(null)
  }

  async function addTop3() {
    if (!result) return
    const top3 = result.picks.filter((p) => !p.isRead).slice(0, 3).map((p) => p.b.id)
    if (!top3.length) return
    let priority = (lists ?? []).find((l) => l.kind === 'tbr' && l.priority)
    if (!priority) priority = await createList.mutateAsync({ name: 'Priority TBR', kind: 'tbr', isPriority: true })
    await addToList.mutateAsync({ listId: priority.id, bookIds: top3 })
    setAdded(`Added ${top3.length} to ${priority.name}`)
  }

  // --- quiz ---
  if (!result) {
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
                className="rounded-2xl border border-line px-4 py-3 text-left text-[15px] font-semibold text-ink transition-colors hover:border-[color:var(--primary)]"
                style={{ background: 'var(--field)' }}
              >
                {o.t}
              </button>
            ))}
          </div>
        </div>
      </section>
    )
  }

  // --- reveal ---
  const max = result.picks[0]?.s || 1
  return (
    <section className="px-4 py-8 sm:px-6">
      <div
        className="mx-auto max-w-xl rounded-3xl p-6 text-center"
        style={{ background: 'linear-gradient(150deg, var(--violet), var(--primary))', color: 'var(--on-primary)' }}
      >
        <div className="text-[12px] uppercase tracking-[0.16em] opacity-85">What you’re in the mood for</div>
        <h1 className="mt-1 text-[30px] italic capitalize leading-tight" style={{ fontFamily: 'var(--font-display)', fontWeight: 600 }}>
          {result.headline}
        </h1>
        <div className="mt-1 opacity-90">{result.sub}</div>
        <div className="mt-3 flex flex-wrap justify-center gap-1.5">
          {result.tags.map((t) => (
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
        {result.picks.map(({ b, s, isRead }) => (
          <button key={b.id} type="button" onClick={() => openBook(b.id)} className="text-left" aria-label={`Open ${b.title}`}>
            <div className="aspect-[2/3] overflow-hidden rounded-lg border border-line" style={{ background: 'var(--field)' }}>
              {b.cover && <img src={b.cover} alt="" className="h-full w-full object-cover" />}
            </div>
            <div className="mt-1 truncate text-[11.5px] font-semibold text-ink">{b.title}</div>
            <div className="text-[10.5px] font-bold text-primary">
              {Math.max(62, Math.min(99, Math.round((s / max) * 100)))}% match{isRead ? ' · reread' : ''}
            </div>
          </button>
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
