import { useRef, useState, type ReactNode } from 'react'
import { createRoute, useNavigate } from '@tanstack/react-router'
import { useQueryClient } from '@tanstack/react-query'
import { APP_NAME, SKIN_LIST, SKINS, type SkinId } from '@reverie/core'
import { rootRoute } from './RootRoute'
import { useSkinControls } from '../skin/controls'
import { useEffectiveSkin, useVoice } from '../skin/labels'
import { useSkin } from '../skin/useSkin'
import { useBooks } from '../data/books'
import { importDetectedExport, type ImportExportResult } from '../data/importLibrary'
import { enrichImported } from '../data/importEnrich'
import { fileToCsvText } from '../data/xlsxAdapter'
import { Button } from '../components/Button'
import { Label } from '../components/Label'
import { SkinDivider } from '../components/SkinDivider'
import { DuplicateReview } from '../components/DuplicateReview'
import { ImportSummary } from '../components/ImportSummary'

// First-run flag — honor-based / client-side (the project's v1 default), so a finished or skipped
// onboarding never reappears. The trigger that sends a brand-new reader here lives in HomeRoute.
const ONBOARDED_KEY = 'reverie.onboarded'
export function markOnboarded(): void {
  try {
    localStorage.setItem(ONBOARDED_KEY, '1')
  } catch {
    /* private mode */
  }
}
export function hasOnboarded(): boolean {
  try {
    return localStorage.getItem(ONBOARDED_KEY) === '1'
  } catch {
    return true // can't tell → don't nag
  }
}

// Genre → skin, straight from the registry (every skin owns a genre). Picking one dresses the whole
// app in that skin, live — the payoff of the Skin Character system, met on the first screen.
const GENRES = SKIN_LIST.map((s) => ({ id: s.id, genre: s.genre, label: s.label }))

/** The shared full-screen stage: skin Sky behind, a single centered column. */
function Stage({ children }: { children: ReactNode }) {
  return (
    <section className="relative z-[1] flex min-h-dvh flex-col items-center justify-center px-5 py-10">
      <div className="w-full max-w-[520px]">{children}</div>
    </section>
  )
}

/** Step dots — current step in the accent, the rest hairline. */
function Progress({ step, total }: { step: number; total: number }) {
  return (
    <div className="mb-7 flex items-center justify-center gap-2" aria-hidden>
      {Array.from({ length: total }, (_, i) => (
        <span
          key={i}
          className="skin-meter h-1.5 transition-all motion-reduce:transition-none"
          style={{
            width: i === step ? 22 : 7,
            background: i === step ? 'var(--accent)' : 'var(--chip-border)',
          }}
        />
      ))}
    </div>
  )
}

type ImportState = null | { phase: 'importing' } | { phase: 'done'; r: ImportExportResult }

function OnboardingFlow() {
  const navigate = useNavigate()
  const { setSkin } = useSkinControls()
  const activeSkin = useEffectiveSkin()
  const voice = useVoice()
  const isAdaptive = useSkin((s) => s.skin) === 'adaptive'
  const qc = useQueryClient()
  const existing = useBooks().data ?? []
  const csvRef = useRef<HTMLInputElement>(null)
  const [step, setStep] = useState(0)
  const [picked, setPicked] = useState<SkinId | null>(null)
  const [imp, setImp] = useState<ImportState>(null)
  const [impErr, setImpErr] = useState<string | null>(null)

  const skinLabel = isAdaptive ? 'Adaptive' : SKINS[activeSkin].label
  const skinTagline = SKINS[activeSkin].tagline

  // In-flow import — same engine as Settings (importDetectedExport auto-detects the column shape +
  // folds duplicates in), then the shared DuplicateReview handles anything fuzzy. fileToCsvText turns
  // a CSV or .xlsx into the same rows, so both file kinds run the one path.
  const onFile = (input: HTMLInputElement) => {
    const file = input.files?.[0]
    input.value = ''
    if (!file) return
    setImpErr(null)
    setImp({ phase: 'importing' })
    void (async () => {
      try {
        const text = await fileToCsvText(file)
        const r = await importDetectedExport(existing, text, { autoMerge: true })
        await qc.invalidateQueries()
        markOnboarded() // they've brought a library in — don't re-onboard
        setImp({ phase: 'done', r })
        // Cover handoff: backfill missing covers for the imported books in the background (§3).
        void enrichImported(qc, r.bookIds)
      } catch (e) {
        setImpErr((e as Error).message)
        setImp(null)
      }
    })()
  }

  const leave = (to: '/library' | '/add' | '/settings') => {
    markOnboarded()
    void navigate({ to, replace: true })
  }

  const pickGenre = (id: SkinId) => {
    setPicked(id)
    setSkin(id) // dress the app live
  }

  // ── in-flow import (overrides the step view while a file is being brought in) ──
  if (imp?.phase === 'importing') {
    return (
      <Stage>
        <div className="text-center">
          <Label className="block text-[11px] text-muted">Bringing it in</Label>
          <h2
            className="mt-3 text-[28px] leading-tight text-ink"
            style={{ fontFamily: 'var(--font-display)', fontWeight: 600 }}
          >
            Building your library…
          </h2>
          <p
            className="mt-2 text-[14px] italic text-muted"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            {voice.loading}
          </p>
          <div
            className="skin-meter mx-auto mt-6 h-1.5 w-[min(320px,80%)] overflow-hidden"
            style={{ background: 'var(--chip)' }}
          >
            <div
              className="skin-meter rv-anim h-full w-2/5"
              style={{
                background: 'linear-gradient(90deg, transparent, var(--accent), transparent)',
                animation: 'shim 1.4s ease-in-out infinite',
              }}
            />
          </div>
        </div>
      </Stage>
    )
  }
  if (imp?.phase === 'done') {
    const { r } = imp
    return (
      <Stage>
        <Label className="block text-[11px] text-muted">Here’s what we found</Label>
        <h2
          className="mt-2 text-[28px] leading-tight text-ink"
          style={{ fontFamily: 'var(--font-display)', fontWeight: 600 }}
        >
          Your library, mapped.
        </h2>
        <div className="mt-2">
          <ImportSummary result={r} />
        </div>
        {r.review.length > 0 ? (
          <div className="mt-5">
            <span
              className="skin-label mb-1.5 block text-[11px]"
              style={{ color: 'var(--accent-ink)' }}
            >
              Needs a look · {r.review.length}
            </span>
            <DuplicateReview
              candidates={r.review}
              onDone={() => {
                setImp(null)
                setStep(3)
              }}
            />
          </div>
        ) : (
          <div className="mt-6 flex justify-end">
            <Button
              onClick={() => {
                setImp(null)
                setStep(3)
              }}
            >
              Continue →
            </Button>
          </div>
        )}
      </Stage>
    )
  }

  // ── step 0 · welcome (skin-dressed front door) ──
  if (step === 0) {
    return (
      <Stage>
        <div className="text-center">
          <div aria-hidden className="text-[34px] leading-none" style={{ color: 'var(--accent)' }}>
            ☾
          </div>
          <Label className="mt-4 block text-[11px] text-muted">Welcome</Label>
          <h1
            className="mt-3 text-balance text-[40px] leading-[1.05] text-ink"
            style={{ fontFamily: 'var(--font-display)', fontWeight: 600 }}
          >
            Welcome to{' '}
            <span style={{ color: 'var(--accent-ink)', fontStyle: 'italic' }}>{APP_NAME}</span>.
          </h1>
          <p className="mx-auto mt-4 max-w-[40ch] text-[15px] leading-relaxed text-muted">
            Your whole reading life — kept beautifully, dressed in a look that fits what you love.
            Let’s bring it together.
          </p>
          <div className="mt-7 flex justify-center">
            <Button onClick={() => setStep(1)}>Let’s go →</Button>
          </div>
          <p className="mt-5 text-[12.5px] text-muted">
            About two minutes ·{' '}
            <button
              type="button"
              onClick={() => leave('/library')}
              className="underline underline-offset-2 hover:text-ink"
            >
              nothing to lose if you skip
            </button>
          </p>
        </div>
      </Stage>
    )
  }

  // ── step 1 · what do you love to read? (live skin) ──
  if (step === 1) {
    return (
      <Stage>
        <Progress step={0} total={3} />
        <Label className="block text-[11px] text-muted">Step 1 of 3</Label>
        <h2
          className="mt-2 text-[28px] leading-tight text-ink"
          style={{ fontFamily: 'var(--font-display)', fontWeight: 600 }}
        >
          What do you love to read?
        </h2>
        <p className="mt-2 text-[14px] leading-relaxed text-muted">
          Pick your main genre — Reverie dresses your whole library to match, and you can change the
          look anytime.
        </p>

        <div className="mt-5 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
          {GENRES.map((g) => {
            const selected = (picked ?? activeSkin) === g.id
            return (
              <button
                key={g.id}
                type="button"
                onClick={() => pickGenre(g.id)}
                aria-pressed={selected}
                className="skin-card flex flex-col items-start gap-0.5 border px-3.5 py-3 text-left transition-colors motion-reduce:transition-none"
                style={{
                  borderColor: selected ? 'var(--accent)' : 'var(--line)',
                  background: selected
                    ? 'color-mix(in srgb, var(--accent) 12%, var(--card-solid))'
                    : 'var(--card-solid)',
                  boxShadow: selected ? '0 0 0 1px var(--accent)' : undefined,
                }}
              >
                <span className="text-[14px] font-semibold text-ink">{g.genre}</span>
                <span className="skin-label text-[9.5px] text-muted">{g.label}</span>
              </button>
            )
          })}
        </div>

        <div
          className="mt-5 border border-line px-4 py-3"
          style={{ background: 'var(--card-solid)', borderRadius: 'var(--radius-panel)' }}
        >
          <span className="skin-label block text-[11px]" style={{ color: 'var(--accent-ink)' }}>
            Your skin · {skinLabel}
          </span>
          <p
            className="mt-1 text-[13px] italic text-muted"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            {skinTagline}
          </p>
        </div>

        <div className="mt-6 flex items-center justify-between gap-3">
          <Button variant="ghost" onClick={() => setStep(0)}>
            ← Back
          </Button>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              onClick={() => {
                setSkin('tryst')
                setPicked('tryst')
                setStep(2)
              }}
            >
              Skip — keep Tryst
            </Button>
            <Button onClick={() => setStep(2)}>Continue →</Button>
          </div>
        </div>
      </Stage>
    )
  }

  // ── step 2 · bring your library in ──
  if (step === 2) {
    const options: { title: string; body: string; cta: string; onClick: () => void }[] = [
      {
        title: 'Upload a file',
        body: 'Move a Goodreads or StoryGraph export — or any spreadsheet (CSV or Excel) — and we map the columns for you.',
        cta: 'Choose a file →',
        onClick: () => csvRef.current?.click(),
      },
      {
        title: 'Scan books',
        body: 'Point your camera at a barcode and add titles one by one.',
        cta: 'Open scanner →',
        onClick: () => leave('/add'),
      },
      {
        title: 'Start fresh',
        body: 'Add titles by hand as you go. Your shelves grow with you.',
        cta: 'Continue →',
        onClick: () => setStep(3),
      },
    ]
    return (
      <Stage>
        <Progress step={1} total={3} />
        <Label className="block text-[11px] text-muted">Step 2 of 3</Label>
        <h2
          className="mt-2 text-[28px] leading-tight text-ink"
          style={{ fontFamily: 'var(--font-display)', fontWeight: 600 }}
        >
          Bring your library in.
        </h2>
        <p className="mt-2 text-[14px] leading-relaxed text-muted">
          Already track your books somewhere? Move them over in seconds. Starting fresh is just as
          welcome.
        </p>

        <div className="mt-5 flex flex-col gap-3">
          {options.map((o) => (
            <button
              key={o.title}
              type="button"
              onClick={o.onClick}
              className="skin-card flex items-center gap-3 border border-line px-4 py-3.5 text-left transition-colors motion-reduce:transition-none hover:border-[color:var(--accent)]"
              style={{ background: 'var(--card-solid)' }}
            >
              <div className="min-w-0 flex-1">
                <div className="text-[15px] font-semibold text-ink">{o.title}</div>
                <div className="mt-0.5 text-[12.5px] leading-snug text-muted">{o.body}</div>
              </div>
              <span
                className="shrink-0 text-[13px] font-semibold"
                style={{ color: 'var(--accent-ink)' }}
              >
                {o.cta}
              </span>
            </button>
          ))}
        </div>

        <p className="mt-3 text-[12.5px] leading-snug text-muted">
          No export to hand?{' '}
          <a
            href="/Reverie_Import_Template.xlsx"
            download
            className="font-semibold underline decoration-dotted underline-offset-2"
            style={{ color: 'var(--accent-ink)' }}
          >
            Download the Excel template
          </a>
          , fill it in, and upload it here.
        </p>

        {impErr && (
          <p className="mt-3 text-[12.5px]" style={{ color: 'var(--primary)' }}>
            That file didn’t import — {impErr}. A Goodreads or StoryGraph export (CSV or Excel)
            works best.
          </p>
        )}
        <input
          ref={csvRef}
          type="file"
          accept=".csv,.xlsx,text/csv"
          hidden
          onChange={(e) => onFile(e.currentTarget)}
        />

        <div className="mt-6">
          <Button variant="ghost" onClick={() => setStep(1)}>
            ← Back
          </Button>
        </div>
      </Stage>
    )
  }

  // ── step 3 · ready (reveal) ──
  return (
    <Stage>
      <div className="text-center">
        <SkinDivider className="mb-4" />
        <Label className="block text-[11px] text-muted">Your library is ready</Label>
        <h2
          className="mt-3 text-[34px] leading-tight text-ink"
          style={{ fontFamily: 'var(--font-display)', fontWeight: 600 }}
        >
          You’re all set.
        </h2>
        <p className="mx-auto mt-3 max-w-[40ch] text-[15px] leading-relaxed text-muted">
          Your shelves are ready, dressed in {skinLabel}. Add your first book whenever you like —
          the home screen comes alive as your library grows.
        </p>
        <div className="mt-7 flex justify-center">
          <Button onClick={() => leave('/library')}>Open my library →</Button>
        </div>
      </div>
    </Stage>
  )
}

export const onboardingRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'onboarding',
  component: OnboardingFlow,
})
