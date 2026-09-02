import type { ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import { APP_NAME, revenueCopy, SKIN_LIST } from '@reverie/core'
import { buyConfig } from '../../lib/buyConfig'
import { Wordmark } from '../Wordmark'
import { SkinShowcase } from './SkinShowcase'
import {
  HouseholdPreview,
  MatchPreview,
  PersonalLibraryPreview,
  SeriesPreview,
} from './StoryPreviews'

const display = { fontFamily: 'var(--font-display)', fontWeight: 600 } as const

// Money language remains derived from the exact configuration that creates the live purchase
// links. If attribution changes, the landing changes with it instead of leaving a stale promise.
const MONEY = revenueCopy(buyConfig())

const CAPABILITIES = [
  {
    number: '01',
    title: 'Bring your books',
    body: 'Search, add by hand, import a spreadsheet, or restore a Reverie backup. Barcode scanning works in Chrome-based browsers.',
  },
  {
    number: '02',
    title: 'Plan the reading',
    body: 'Keep what you’re reading now, monthly plans, releases, finishes and flexible publication dates in one rhythm.',
  },
  {
    number: '03',
    title: 'See your year',
    body: 'Private stats and Wrapped trace pace, formats, genres, authors, tropes and every reread without turning taste into a score.',
  },
  {
    number: '04',
    title: 'Read together',
    body: 'Make shared lists and book-club read-alongs where comments stay hidden until each reader reaches the right place.',
  },
  {
    number: '05',
    title: 'Buy indie',
    tag: MONEY.tag,
    body: MONEY.body,
  },
  {
    number: '06',
    title: 'Take it with you',
    body: 'Export books, shelves, reads, reviews, moods and tropes in one JSON backup. Your library is never trapped in the interface.',
  },
] as const

const PRIVACY = [
  {
    title: 'Private by default',
    body: 'Your library lives in your account behind row-level access rules. It is not a public profile waiting to be discovered.',
  },
  {
    title: 'Shared on purpose',
    body: 'A household catalog, a shared list and a club are explicit spaces. Personal notes, ratings and reading history do not quietly spill into them.',
  },
  {
    title: 'No attention market',
    body: 'No ads, sponsored shelves or aggregate star score. Reverie helps you understand your own reading instead of ranking it for someone else.',
  },
  {
    title: 'Export anytime',
    body: 'Take a complete JSON backup whenever you want it. Data control is a working button, not a line in a promise.',
  },
] as const

function Eyebrow({ children }: { children: string }) {
  return (
    <p
      className="text-[11px] font-semibold uppercase tracking-[0.22em]"
      style={{ color: 'var(--eyebrow)' }}
    >
      {children}
    </p>
  )
}

function StoryPoints({ children }: { children: string[] }) {
  return (
    <ul className="mt-6 space-y-3">
      {children.map((item) => (
        <li key={item} className="flex gap-3 text-[13.5px] leading-relaxed text-muted">
          <span
            aria-hidden
            className="mt-[0.62em] h-1.5 w-1.5 shrink-0 rounded-full"
            style={{ background: 'var(--gold)' }}
          />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  )
}

function StorySection({
  id,
  eyebrow,
  title,
  body,
  points,
  preview,
  reverse = false,
  light = false,
}: {
  id: string
  eyebrow: string
  title: string
  body: string
  points: string[]
  preview: ReactNode
  reverse?: boolean
  light?: boolean
}) {
  return (
    <section id={id} className={light ? 'band-light scroll-mt-20' : 'scroll-mt-20'}>
      <div className="mx-auto max-w-[1180px] px-6 py-20 sm:py-28">
        <div className="grid items-center gap-12 lg:grid-cols-[0.82fr_1.18fr] lg:gap-16">
          <div className={reverse ? 'lg:order-2' : ''}>
            <Eyebrow>{eyebrow}</Eyebrow>
            <h2
              className="mt-3 max-w-[15ch] text-balance text-[clamp(32px,4.7vw,50px)] leading-[1.02] text-ink"
              style={display}
            >
              {title}
            </h2>
            <p className="mt-5 max-w-[48ch] text-[15px] leading-relaxed text-muted">{body}</p>
            <StoryPoints>{points}</StoryPoints>
          </div>
          <div className={reverse ? 'lg:order-1' : ''}>{preview}</div>
        </div>
      </div>
    </section>
  )
}

function CapabilityLedger() {
  return (
    <section id="features" className="band-light scroll-mt-20">
      <div className="mx-auto max-w-[1180px] px-6 py-20 sm:py-28">
        <div className="grid gap-8 border-b border-line pb-10 lg:grid-cols-[0.7fr_1.3fr] lg:items-end">
          <div>
            <Eyebrow>The rest of the room</Eyebrow>
            <h2
              className="mt-3 max-w-[14ch] text-balance text-[clamp(30px,4.4vw,46px)] leading-[1.03] text-ink"
              style={display}
            >
              Useful without asking for applause.
            </h2>
          </div>
          <p className="max-w-[58ch] text-[15px] leading-relaxed text-muted lg:justify-self-end">
            Reverie also handles the practical parts: getting a library in, planning what comes
            next, remembering what happened, reading with people, and leaving with a complete copy.
          </p>
        </div>

        <div className="divide-y divide-line">
          {CAPABILITIES.map((item) => (
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
        <div className="grid gap-8 lg:grid-cols-[0.72fr_1.28fr] lg:gap-16">
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
          <div className="grid gap-3 sm:grid-cols-2">
            {PRIVACY.map((item) => (
              <article
                key={item.title}
                className="border p-5"
                style={{
                  background: 'var(--card)',
                  borderColor: 'var(--line)',
                  borderRadius: 'var(--radius-card)',
                }}
              >
                <h3 className="text-[17px] text-ink" style={display}>
                  {item.title}
                </h3>
                <p className="mt-2 text-[13px] leading-relaxed text-muted">{item.body}</p>
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
      <section className="border-y" style={{ borderColor: 'var(--line)' }}>
        <div className="mx-auto max-w-[900px] px-6 py-14 text-center sm:py-20">
          <Eyebrow>Made for the life around the books</Eyebrow>
          <p
            className="mx-auto mt-4 max-w-[24ch] text-balance text-[clamp(26px,4vw,40px)] leading-[1.08] text-ink"
            style={display}
          >
            A title can be owned, borrowed, reread, shared, abandoned, loved, or still waiting. It
            should not become less specific just to fit an app.
          </p>
        </div>
      </section>

      <StorySection
        id="library"
        eyebrow="The books are only the beginning"
        title="A library that remembers the context."
        body="A cover grid is the doorway, not the whole room. Reverie keeps what a book meant in your reading life close to the book itself."
        points={[
          'Ownership, borrowed, wishlist and format remain separate facts.',
          'Progress, rereads, ratings, notes, moods and tropes keep their own history.',
          'Import, scan, search or add by hand—duplicate intake is reviewed before it multiplies.',
        ]}
        preview={<PersonalLibraryPreview />}
      />

      <StorySection
        id="household"
        eyebrow="Together without becoming the same"
        title="Share a shelf, not an identity."
        body="A household can hold one shared catalog while every reader’s copy stays distinct. Reverie knows the difference between a book being in the house and being yours."
        points={[
          'Choose Personal, Household, both, or an allowed household member when adding.',
          'A neutral add for another reader never invents ownership, wishlist or reading history.',
          'Removing a household entry leaves each personal library and the shared corpus intact.',
        ]}
        preview={<HouseholdPreview />}
        reverse
        light
      />

      <StorySection
        id="series"
        eyebrow="Order with evidence"
        title="Series belong in an order you can trust."
        body="Reverie keeps confirmed membership separate from guesses. That makes progress and gaps useful—and leaves uncertain history somewhere it can be reviewed instead of repeated."
        points={[
          'Primary and secondary memberships can coexist when a book truly belongs to more than one series.',
          'Unknown and pending entries wait for review rather than changing progress in the background.',
          'Rename, merge and reversible removal make cleanup part of the product, not a database chore.',
        ]}
        preview={<SeriesPreview />}
      />

      <StorySection
        id="discover"
        eyebrow="Taste, not a popularity contest"
        title="Discovery begins with your shelves."
        body="Ask what fits tonight and Reverie ranks unread books you already have. Wander farther when you want to—the wider catalog still starts from what your library has taught it."
        points={[
          'Match listens for mood, pace, intensity, tropes and the feeling you want at the end.',
          'Discover can hide books already in your library and bring closer-to-your-taste titles first.',
          'There is no averaged star rating standing in for your own judgment.',
        ]}
        preview={<MatchPreview />}
        reverse
        light
      />

      <SkinShowcase />

      <section className="border-b border-line">
        <div className="mx-auto flex max-w-[1180px] flex-wrap justify-center gap-2 px-6 pb-16">
          {SKIN_LIST.map((skin) => (
            <span
              key={skin.id}
              data-skin={skin.id}
              data-mode="dark"
              className="border px-3 py-1.5 text-[9px] font-semibold uppercase tracking-[0.12em]"
              style={{
                background: 'var(--card-solid)',
                borderColor: 'var(--line)',
                color: 'var(--ink)',
                borderRadius: 'var(--radius-control)',
              }}
            >
              {skin.label}
            </span>
          ))}
        </div>
      </section>

      <CapabilityLedger />
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

      <footer className="border-t" style={{ borderColor: 'var(--line)' }}>
        <div className="mx-auto flex max-w-[1180px] flex-col gap-6 px-6 py-10 sm:flex-row sm:items-start sm:justify-between">
          <div className="max-w-[36ch]">
            <Wordmark />
            <p className="mt-2 text-[13px] leading-relaxed text-muted">
              The whole story of your reading life, kept in a room that feels like yours.
            </p>
          </div>
          <nav aria-label="Landing sections" className="flex flex-wrap gap-x-6 gap-y-2 text-[13px]">
            {[
              ['Library', '#library'],
              ['Household', '#household'],
              ['Series', '#series'],
              ['The skins', '#skins'],
              ['Privacy', '#privacy'],
            ].map(([label, href]) => (
              <a key={href} href={href} className="text-muted hover:text-ink">
                {label}
              </a>
            ))}
          </nav>
        </div>
        <div className="border-t" style={{ borderColor: 'var(--line)' }}>
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
