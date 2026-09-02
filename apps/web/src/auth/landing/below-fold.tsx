import type { ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import { APP_NAME, revenueCopy } from '@reverie/core'
import { buyConfig } from '../../lib/buyConfig'
import { Wordmark } from '../Wordmark'
import { ConnectedStage, HouseholdStage, ReadingRecordStage } from './ProductStage'
import { SkinShowcase } from './SkinShowcase'

const display = { fontFamily: 'var(--font-display)', fontWeight: 600 } as const

// Money language remains derived from the exact configuration that creates the live purchase
// links. If attribution changes, the landing changes with it instead of leaving a stale promise.
const MONEY = revenueCopy(buyConfig())

const PRACTICAL = [
  {
    number: '01',
    title: 'Bring the shelves',
    body: 'Search, scan, add by hand, import a spreadsheet, or restore a Reverie backup. Duplicate intake is reviewed before it multiplies.',
  },
  {
    number: '02',
    title: 'Plan what comes next',
    body: 'Keep current reads, monthly plans, release dates, finishes, and rereads in one rhythm without flattening flexible dates.',
  },
  {
    number: '03',
    title: 'Remember the year',
    body: 'Private stats and Wrapped trace pace, formats, genres, authors, tropes, and rereads without turning taste into a public score.',
  },
  {
    number: '04',
    title: 'Read with people',
    body: 'Shared lists and club read-alongs keep comments hidden until each reader reaches the right place.',
  },
  {
    number: '05',
    title: 'Buy indie',
    tag: MONEY.tag,
    body: MONEY.body,
  },
  {
    number: '06',
    title: 'Leave with everything',
    body: 'Export books, shelves, reads, reviews, moods, and tropes in one JSON backup. The library is never trapped in the interface.',
  },
] as const

const PRIVACY = [
  {
    title: 'Private by default',
    body: 'Your library lives in your account behind row-level access rules. It is not a public profile waiting to be discovered.',
  },
  {
    title: 'Shared on purpose',
    body: 'A household, shared list, or club is an explicit space. Personal notes, ratings, and reading history stay personal.',
  },
  {
    title: 'No attention market',
    body: 'No ads, sponsored shelves, or aggregate star score. Reverie helps you understand your reading instead of ranking it for someone else.',
  },
  {
    title: 'Export anytime',
    body: 'Take a complete JSON backup whenever you want it. Data control is a working button, not a line in a promise.',
  },
] as const

function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <p
      className="text-[11px] font-semibold uppercase tracking-[0.22em]"
      style={{ color: 'var(--eyebrow)' }}
    >
      {children}
    </p>
  )
}

function ChapterHeader({
  number,
  eyebrow,
  title,
  body,
}: {
  number: string
  eyebrow: string
  title: string
  body: string
}) {
  return (
    <div className="grid gap-6 border-t border-line pt-7 lg:grid-cols-[110px_0.72fr_1.28fr] lg:items-start">
      <span
        className="text-[12px] font-semibold tracking-[0.16em]"
        style={{ color: 'var(--eyebrow)' }}
      >
        CHAPTER {number}
      </span>
      <div>
        <Eyebrow>{eyebrow}</Eyebrow>
        <h2
          className="mt-3 max-w-[14ch] text-balance text-[clamp(36px,5.5vw,64px)] leading-[0.98] text-ink"
          style={display}
        >
          {title}
        </h2>
      </div>
      <p className="max-w-[56ch] text-[15px] leading-relaxed text-muted sm:text-[17px] lg:justify-self-end lg:pt-7">
        {body}
      </p>
    </div>
  )
}

function ProofStrip({ children }: { children: Array<[string, string]> }) {
  return (
    <dl
      className="mt-6 grid overflow-hidden border border-line sm:grid-cols-3"
      style={{ borderRadius: 'var(--radius-panel)' }}
    >
      {children.map(([term, detail], index) => (
        <div
          key={term}
          className={`bg-card p-5 ${index > 0 ? 'border-t border-line sm:border-l sm:border-t-0' : ''}`}
        >
          <dt className="text-[13px] font-semibold text-ink">{term}</dt>
          <dd className="mt-2 text-[12.5px] leading-relaxed text-muted">{detail}</dd>
        </div>
      ))}
    </dl>
  )
}

function PracticalLedger() {
  return (
    <section id="features" className="band-light scroll-mt-20">
      <div className="mx-auto max-w-[1180px] px-6 py-20 sm:py-28">
        <div className="grid gap-8 border-b border-line pb-10 lg:grid-cols-[0.8fr_1.2fr] lg:items-end">
          <div>
            <Eyebrow>The working library</Eyebrow>
            <h2
              className="mt-3 max-w-[14ch] text-balance text-[clamp(32px,4.7vw,50px)] leading-[1.01] text-ink"
              style={display}
            >
              Beautiful is not the same as precious.
            </h2>
          </div>
          <p className="max-w-[58ch] text-[15px] leading-relaxed text-muted lg:justify-self-end">
            Under the rooms is a practical system for getting books in, deciding what comes next,
            reading together, and taking the entire record with you.
          </p>
        </div>

        <div className="divide-y divide-line">
          {PRACTICAL.map((item) => (
            <article
              key={item.number}
              className="grid gap-2 py-6 sm:grid-cols-[54px_0.55fr_1fr] sm:items-start sm:gap-6"
            >
              <span
                className="text-[11px] font-semibold tracking-[0.14em]"
                style={{ color: 'var(--eyebrow)' }}
              >
                {item.number}
              </span>
              <div>
                {'tag' in item ? (
                  <span
                    className="mb-2 inline-flex px-2 py-1 text-[9px] font-bold uppercase tracking-[0.1em]"
                    style={{
                      background: 'color-mix(in srgb, var(--eyebrow) 14%, transparent)',
                      color: 'var(--eyebrow)',
                      borderRadius: 'var(--radius-control)',
                    }}
                  >
                    {item.tag}
                  </span>
                ) : null}
                <h3 className="text-[18px] text-ink" style={display}>
                  {item.title}
                </h3>
              </div>
              <p className="max-w-[64ch] text-[13.5px] leading-relaxed text-muted">{item.body}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}

function Privacy() {
  return (
    <section id="privacy" className="scroll-mt-20">
      <div className="mx-auto max-w-[1180px] px-6 py-20 sm:py-28">
        <div className="grid gap-10 lg:grid-cols-[0.72fr_1.28fr] lg:gap-16">
          <div>
            <Eyebrow>Yours, privately</Eyebrow>
            <h2
              className="mt-3 max-w-[13ch] text-balance text-[clamp(32px,4.7vw,50px)] leading-[1.02] text-ink"
              style={display}
            >
              A library is personal. The product should know that.
            </h2>
            <p className="mt-5 max-w-[43ch] text-[15px] leading-relaxed text-muted">
              Reverie is built around explicit boundaries: what is yours, what belongs to the
              household, and what you deliberately share.
            </p>
          </div>
          <div className="grid gap-px overflow-hidden border border-line bg-line sm:grid-cols-2">
            {PRIVACY.map((item) => (
              <article key={item.title} className="bg-card p-6">
                <h3 className="text-[18px] text-ink" style={display}>
                  {item.title}
                </h3>
                <p className="mt-3 text-[13px] leading-relaxed text-muted">{item.body}</p>
              </article>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

/** Everything below the hero — lazy-loaded so the first invitation paints before this chunk. */
export default function LandingBelowFold() {
  return (
    <>
      <section className="border-y border-line">
        <div className="mx-auto max-w-[940px] px-6 py-16 text-center sm:py-24">
          <Eyebrow>Made for the life around the books</Eyebrow>
          <p
            className="mx-auto mt-5 max-w-[25ch] text-balance text-[clamp(29px,4.4vw,46px)] leading-[1.07] text-ink"
            style={display}
          >
            A title can be owned, borrowed, reread, shared, abandoned, loved, or still waiting. It
            should not become less specific just to fit an app.
          </p>
        </div>
      </section>

      <SkinShowcase />

      <section id="keep" className="scroll-mt-20 px-4 py-20 sm:px-6 sm:py-28">
        <div className="mx-auto max-w-[1240px]">
          <ChapterHeader
            number="I"
            eyebrow="Keep it"
            title="Keep every version of the story."
            body="A cover grid is only the doorway. Reverie keeps the copies, formats, progress, rereads, notes, and context that make a book part of your reading life—without forcing them into one status."
          />
          <div className="mt-12 sm:mt-16">
            <ReadingRecordStage />
          </div>
          <ProofStrip>
            {[
              [
                'Five independent possession facts',
                'Owned, borrowed, wishlist, and formats can tell the truth at the same time.',
              ],
              [
                'Every read keeps its own history',
                'Progress, dates, format, rating, and notes remain attached to the right reading.',
              ],
              [
                'Shared details are an invitation',
                'A personal copy adopts corpus details only when its owner chooses to use them.',
              ],
            ]}
          </ProofStrip>
        </div>
      </section>

      <section
        id="share"
        className="band-light scroll-mt-20 border-y border-line px-4 py-20 sm:px-6 sm:py-28"
      >
        <div className="mx-auto max-w-[1240px]">
          <ChapterHeader
            number="II"
            eyebrow="Share it"
            title="Share a shelf without merging lives."
            body="A household can hold one shared catalog while every reader’s copy stays distinct. Reverie knows the difference between a book being in the house, belonging to you, and being added for someone else."
          />
          <div className="mt-12 sm:mt-16">
            <HouseholdStage />
          </div>
          <ProofStrip>
            {[
              [
                'One work, distinct copies',
                'The household sees the shared title once; each reader keeps their own possession and reading state.',
              ],
              [
                'Choose the destination',
                'Add to Personal, Household, both, or an allowed household member with the scope shown up front.',
              ],
              [
                'Removal stays local',
                'Removing a shared entry does not quietly erase a personal library or the corpus record beneath it.',
              ],
            ]}
          </ProofStrip>
        </div>
      </section>

      <section id="connect" className="scroll-mt-20 px-4 py-20 sm:px-6 sm:py-28">
        <div className="mx-auto max-w-[1240px]">
          <ChapterHeader
            number="III"
            eyebrow="Connect it · Pro"
            title="Connect series without flattening them."
            body="Follow each series in its own order, then see where several reading paths meet inside one universe. Evidence and administrator review stay visible, so a useful timeline never has to pretend certainty."
          />
          <div className="mt-12 sm:mt-16">
            <ConnectedStage />
          </div>
          <ProofStrip>
            {[
              [
                'Series keep their own lanes',
                'Primary and secondary memberships coexist when a book truly belongs to more than one path.',
              ],
              [
                'Universes reveal the crossing',
                'Connected series join a reviewed central reading order without losing their internal chronology.',
              ],
              [
                'Corrections are part of the product',
                'Administrators can rename, merge, and reversibly remove series instead of repairing rows by hand.',
              ],
            ]}
          </ProofStrip>
        </div>
      </section>

      <PracticalLedger />
      <Privacy />

      <section id="get-started" className="relative border-t border-line">
        <div className="mx-auto max-w-[1180px] px-6 py-24 text-center sm:py-32">
          <span
            aria-hidden
            className="mx-auto mb-6 block h-11 w-11 rounded-full"
            style={{
              background: 'var(--gold)',
              boxShadow: '0 0 34px color-mix(in srgb, var(--gold) 55%, transparent)',
            }}
          />
          <Eyebrow>The shelf is waiting</Eyebrow>
          <h2
            className="mx-auto mt-3 max-w-[16ch] text-balance text-[clamp(34px,5vw,54px)] leading-[1.01] text-ink"
            style={display}
          >
            Make room for every book you’ve lived with.
          </h2>
          <p className="mx-auto mt-5 max-w-[50ch] text-[15px] leading-relaxed text-muted">
            Start with one title or bring the shelves you already have. Reverie runs in your browser
            and installs as an app whenever you are ready.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link
              to="/auth"
              search={{ mode: 'signup' }}
              className="skin-control flex h-12 items-center px-8 text-[15px] font-semibold"
              style={{
                background: 'var(--gold)',
                color: 'var(--on-primary)',
                boxShadow: '0 10px 26px color-mix(in srgb, var(--gold) 36%, transparent)',
              }}
            >
              Begin your library
            </Link>
            <Link
              to="/auth"
              search={{ mode: 'signin' }}
              className="skin-control flex h-12 items-center border border-line px-7 text-[15px] font-semibold text-ink"
            >
              Return to Reverie
            </Link>
          </div>
        </div>
      </section>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-[1180px] flex-col gap-6 px-6 py-10 sm:flex-row sm:items-start sm:justify-between">
          <div className="max-w-[36ch]">
            <Wordmark />
            <p className="mt-2 text-[13px] leading-relaxed text-muted">
              The whole story of your reading life, kept in a room that feels like yours.
            </p>
          </div>
          <nav aria-label="Landing sections" className="flex flex-wrap gap-x-6 gap-y-2 text-[13px]">
            {[
              ['Rooms', '#skins'],
              ['Keep it', '#keep'],
              ['Share it', '#share'],
              ['Connect it', '#connect'],
              ['Privacy', '#privacy'],
            ].map(([label, href]) => (
              <a key={href} href={href} className="text-muted hover:text-ink">
                {label}
              </a>
            ))}
          </nav>
        </div>
        <div className="border-t border-line">
          <div
            className="mx-auto flex max-w-[1180px] flex-col gap-1 px-6 py-5 text-[12px] sm:flex-row sm:items-center sm:justify-between"
            style={{ color: 'var(--faint)' }}
          >
            <span>
              © {new Date().getFullYear()} {APP_NAME}. Made for readers.
            </span>
            <span>{MONEY.footer}</span>
          </div>
        </div>
      </footer>
    </>
  )
}
