import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createRoute, useNavigate } from '@tanstack/react-router'
import { useQueryClient } from '@tanstack/react-query'
import { APP_NAME, SKIN_LIST, SKINS, nextReadCandidates, type SkinId } from '@reverie/core'
import { rootRoute } from './RootRoute'
import { useSkinControls } from '../skin/controls'
import { useEffectiveSkin, useVoice } from '../skin/labels'
import { useSkin } from '../skin/useSkin'
import { useReaderBooks } from '../data/readerBooks'
import { importDetectedExport, type ImportExportResult } from '../data/importLibrary'
import { enrichImported } from '../data/importEnrich'
import { fileToCsvText } from '../data/xlsxAdapter'
import { Button } from '../components/Button'
import { Label } from '../components/Label'
import { SkinDivider } from '../components/SkinDivider'
import { DuplicateReview } from '../components/DuplicateReview'
import { ImportSummary } from '../components/ImportSummary'
import { Surface } from '../components/Surface'
import { useAuth } from '../auth/AuthProvider'
import { useHouseholdLibraryAuthorization } from '../data/household'
import { AddDestinationPicker } from '../components/AddDestinationPicker'
import type { AddDestination } from '../components/addDestination'

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

// Appearance is optional and does not declare what the reader wants to read.
const ROOMS = SKIN_LIST.map((s) => ({ id: s.id, label: s.label, tagline: s.tagline }))

/** The shared full-screen stage: skin Sky behind, a single centered column. */
function Stage({ children }: { children: ReactNode }) {
  return (
    <section className="relative z-[1] flex min-h-dvh flex-col items-center justify-center px-5 py-10">
      <div className="w-full max-w-[520px]">{children}</div>
    </section>
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
  const { session } = useAuth()
  const household = useHouseholdLibraryAuthorization()
  const booksQuery = useReaderBooks()
  const existing = booksQuery.data ?? []
  const currentRead = existing.find((book) => book.readStatus === 'Reading')
  const available = nextReadCandidates(existing)
  const csvRef = useRef<HTMLInputElement>(null)
  const [step, setStep] = useState<'books' | 'appearance' | 'ready'>('books')
  const [picked, setPicked] = useState<SkinId | null>(null)
  const [imp, setImp] = useState<ImportState>(null)
  const [impErr, setImpErr] = useState<{ message: string; mayHaveSaved: boolean } | null>(null)
  const [importDestination, setImportDestination] = useState<AddDestination>('mine')
  const importDestinationChosen = useRef(false)
  useEffect(() => {
    if (!importDestinationChosen.current && household.authorized && household.members.length) {
      setImportDestination('both')
    }
  }, [household.authorized, household.members.length])

  const skinLabel = isAdaptive ? 'Adaptive' : SKINS[activeSkin].label
  const skinTagline = SKINS[activeSkin].tagline

  // In-flow import — same engine as Settings (importDetectedExport auto-detects the column shape +
  // folds duplicates in), then the shared DuplicateReview handles anything fuzzy. fileToCsvText turns
  // a CSV or .xlsx into the same rows, so both file kinds run the one path.
  const onFile = (input: HTMLInputElement) => {
    const file = input.files?.[0]
    input.value = ''
    if (!file || !booksQuery.data || booksQuery.isError) return
    setImpErr(null)
    setImp({ phase: 'importing' })
    void (async () => {
      let importStarted = false
      try {
        const text = await fileToCsvText(file)
        importStarted = true
        const r = await importDetectedExport(existing, text, {
          autoMerge: true,
          addToHousehold: household.authorized && importDestination === 'both',
        })
        await qc.invalidateQueries()
        markOnboarded() // they've brought a library in — don't re-onboard
        setImp({ phase: 'done', r })
        // Cover handoff: backfill missing covers for the imported books in the background (§3).
        void enrichImported(qc, r.bookIds)
      } catch (e) {
        setImpErr({ message: (e as Error).message, mayHaveSaved: importStarted })
        // An importer may stop after earlier rows committed. Refresh those rows and never claim
        // the library is unchanged unless file conversion failed before the importer ran.
        if (importStarted) void qc.invalidateQueries()
        setImp(null)
      }
    })()
  }

  const leave = (to: '/library' | '/add' | '/match') => {
    markOnboarded()
    void navigate({ to, replace: true })
  }

  const pickRoom = (id: SkinId) => {
    setPicked(id)
    setSkin(id) // dress the app live
  }

  // ── in-flow import (overrides the step view while a file is being brought in) ──
  if (imp?.phase === 'importing') {
    return (
      <Stage>
        <div className="text-center">
          <Label className="block text-[12px] text-muted">Bringing it in</Label>
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
        <Label className="block text-[12px] text-muted">Here’s what we found</Label>
        <h2
          className="mt-2 text-[28px] leading-tight text-ink"
          style={{ fontFamily: 'var(--font-display)', fontWeight: 600 }}
        >
          {r.added + r.merged > 0
            ? r.review.length > 0
              ? 'Your books are here. A few need a look.'
              : 'Your books are here.'
            : r.review.length > 0
              ? 'These books need a look.'
              : 'No books were added.'}
        </h2>
        <div className="mt-2">
          <ImportSummary result={r} />
        </div>
        {r.review.length > 0 ? (
          <div className="mt-5">
            <span
              className="skin-label mb-1.5 block text-[12px]"
              style={{ color: 'var(--accent-ink)' }}
            >
              Needs a look · {r.review.length}
            </span>
            <DuplicateReview
              candidates={r.review}
              onDone={() => {
                setImp(null)
                setStep('ready')
              }}
            />
          </div>
        ) : (
          <div className="mt-6 flex justify-end">
            <Button
              onClick={() => {
                setImp(null)
                setStep('ready')
              }}
            >
              Continue →
            </Button>
          </div>
        )}
      </Stage>
    )
  }

  if (step === 'books') {
    return (
      <Stage>
        <Label className="block text-[12px] text-muted">Welcome to {APP_NAME}</Label>
        <h1
          className="mt-3 text-balance text-[34px] leading-tight text-ink"
          style={{ fontFamily: 'var(--font-display)', fontWeight: 600 }}
        >
          Start with some books.
        </h1>
        <p className="mt-3 text-[16px] leading-relaxed text-muted">
          Bring a file from your current tracker, or add one book you want to read. You can choose a
          room and set a reading goal later.
        </p>

        <div className="mt-6">
          <AddDestinationPicker
            value={importDestination}
            onChange={(next) => {
              importDestinationChosen.current = true
              setImportDestination(next)
            }}
            members={household.authorized ? household.members : []}
            currentReaderId={session?.user.id ?? ''}
            importOnly
          />
        </div>
        <div className="mt-5 flex flex-col gap-3">
          <Surface radius="panel" tone="card-solid" pad={4}>
            <h2 className="text-[20px] font-semibold text-ink">Import a file</h2>
            <p className="mt-2 text-[15px] leading-relaxed text-ink">
              Use a Goodreads or StoryGraph export, or a supported CSV or Excel spreadsheet. We’ll
              show what was added or merged and any duplicates that need review.
            </p>
            <Button
              className="mt-4"
              disabled={!booksQuery.data || booksQuery.isError}
              onClick={() => csvRef.current?.click()}
            >
              Import a file
            </Button>
            {!booksQuery.data && !booksQuery.isError && (
              <p role="status" className="mt-3 text-[14px] text-ink">
                Loading your existing books before import…
              </p>
            )}
            {booksQuery.isError && (
              <div className="mt-3">
                <p role="alert" className="text-[14px] text-ink">
                  Your library could not be checked before import.
                </p>
                <Button
                  variant="secondary"
                  className="mt-2"
                  onClick={() => void booksQuery.refetch()}
                >
                  Try again
                </Button>
              </div>
            )}
          </Surface>
          <Surface radius="panel" tone="card-solid" pad={4}>
            <h2 className="text-[20px] font-semibold text-ink">Add a book</h2>
            <p className="mt-2 text-[15px] leading-relaxed text-ink">
              Search by title or ISBN, or enter the details yourself. Camera scanning is available
              in supported Chrome-based browsers.
            </p>
            <Button variant="secondary" className="mt-4" onClick={() => leave('/add')}>
              Add a book
            </Button>
          </Surface>
        </div>
        <p className="mt-4 text-[14px] leading-relaxed text-muted">
          Need a starting file?{' '}
          <a
            href="/Reverie_Import_Template.xlsx"
            download
            className="font-semibold underline decoration-dotted underline-offset-2 text-[color:var(--accent-ink)]"
          >
            Download the Excel template
          </a>
          .
        </p>
        {impErr && (
          <div role="alert" className="mt-4 text-[15px] leading-relaxed text-ink">
            <p>
              {impErr.mayHaveSaved
                ? 'The import stopped. Some books may already have been saved. Check your library before trying again.'
                : 'The file could not be read. Your library has not changed.'}
            </p>
            <p className="mt-1 text-muted">{impErr.message}</p>
            {impErr.mayHaveSaved && (
              <Button variant="secondary" className="mt-3" onClick={() => leave('/library')}>
                Check your library
              </Button>
            )}
          </div>
        )}
        <input
          ref={csvRef}
          type="file"
          accept=".csv,.xlsx,text/csv"
          aria-label="Import library file"
          hidden
          onChange={(e) => onFile(e.currentTarget)}
        />
        <div className="mt-6 flex flex-wrap justify-between gap-2">
          <Button variant="ghost" onClick={() => setStep('appearance')}>
            Preview a room
          </Button>
          <Button variant="ghost" onClick={() => setStep('ready')}>
            Continue without importing
          </Button>
        </div>
      </Stage>
    )
  }

  if (step === 'appearance') {
    return (
      <Stage>
        <Label className="block text-[12px] text-muted">Optional appearance</Label>
        <h2
          className="mt-2 text-[28px] leading-tight text-ink"
          style={{ fontFamily: 'var(--font-display)', fontWeight: 600 }}
        >
          Choose a room when you’re ready.
        </h2>
        <p className="mt-3 text-[16px] leading-relaxed text-muted">
          Every room holds every kind of book. This changes the look of your library, not your
          reading preferences. You can change it later in Appearance.
        </p>
        <div className="mt-5 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
          {ROOMS.map((room) => {
            const selected = !isAdaptive && (picked ?? activeSkin) === room.id
            return (
              <button
                key={room.id}
                type="button"
                onClick={() => pickRoom(room.id)}
                aria-pressed={selected}
                className="skin-card flex min-h-11 flex-col items-start gap-1 border px-3.5 py-3 text-left transition-colors motion-reduce:transition-none"
                style={{
                  borderColor: selected ? 'var(--accent)' : 'var(--line)',
                  background: selected
                    ? 'color-mix(in srgb, var(--accent) 12%, var(--card-solid))'
                    : 'var(--card-solid)',
                  boxShadow: selected ? '0 0 0 1px var(--accent)' : undefined,
                }}
              >
                <span className="text-[15px] font-semibold text-ink">{room.label}</span>
                <span className="text-[12px] leading-relaxed text-ink">{room.tagline}</span>
              </button>
            )
          })}
        </div>
        <Surface radius="panel" tone="card-solid" pad={0} className="mt-5 px-4 py-3">
          <span className="skin-label block text-[12px] text-[color:var(--accent-ink)]">
            Your room · {skinLabel}
          </span>
          <p
            className="mt-1 text-[14px] italic text-ink"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            {skinTagline}
          </p>
        </Surface>
        <div className="mt-6">
          <Button onClick={() => setStep('books')}>Back to your books</Button>
        </div>
      </Stage>
    )
  }

  const waitingForBooks = booksQuery.isPending || !booksQuery.data
  const completionTitle = currentRead
    ? 'Pick up where you left off.'
    : available.length
      ? 'Choose something to read.'
      : existing.length
        ? 'Your books are here.'
        : 'Start with a book you want to read.'
  return (
    <Stage>
      <div className="text-center">
        <SkinDivider className="mb-4" />
        <Label className="block text-[12px] text-muted">Your next step</Label>
        <h2
          className="mt-3 text-[32px] leading-tight text-ink"
          style={{ fontFamily: 'var(--font-display)', fontWeight: 600 }}
        >
          {booksQuery.isError
            ? 'Your library could not be checked.'
            : waitingForBooks
              ? 'Checking your library…'
              : completionTitle}
        </h2>
        <p className="mx-auto mt-3 max-w-[44ch] text-[16px] leading-relaxed text-muted">
          {booksQuery.isError
            ? 'Try again, or open your library to continue.'
            : waitingForBooks
              ? 'Your next step will be ready when your books load.'
              : currentRead
                ? `You’re reading ${currentRead.title}. Continue from your recorded progress.`
                : available.length
                  ? `${available.length} unread ${available.length === 1 ? 'book is' : 'books are'} marked owned or borrowed. Find one that fits now.`
                  : existing.length
                    ? 'Check which books you own or have borrowed to choose from what you have available. Your other personal records stay in your library.'
                    : 'Add one title now, or open your library and come back when you’re ready.'}
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          {booksQuery.isError ? (
            <Button onClick={() => void booksQuery.refetch()}>Try again</Button>
          ) : !waitingForBooks ? (
            <Button
              onClick={() => {
                if (currentRead) {
                  markOnboarded()
                  void navigate({
                    to: '/book/$bookId',
                    params: { bookId: currentRead.id },
                    replace: true,
                  })
                } else {
                  leave(available.length ? '/match' : existing.length ? '/library' : '/add')
                }
              }}
            >
              {currentRead
                ? 'Continue reading'
                : available.length
                  ? 'Choose a next read'
                  : existing.length
                    ? 'Review your library'
                    : 'Add a book'}
            </Button>
          ) : null}
          <Button variant="secondary" onClick={() => leave('/library')}>
            Open my library
          </Button>
        </div>
        <div className="mt-4">
          <Button variant="ghost" onClick={() => setStep('books')}>
            Back to import
          </Button>
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
