import { type CSSProperties } from 'react'
import { callsign, fitSpineTitle, spineDims, type SkinId, type SpineStyle } from '@reverie/core'
import { spineNaturalWidth } from './spineMetrics'
import { useEffectiveSkin } from '../skin/labels'
import { useSpineTintStyle } from '../skin/spineTint'
import { useStructure } from '../skin/structure'

// The Spine slot — a spine composed for its own narrow, edge-on read (NOT a rotated cover). The
// anatomy (head band · optional head label · author · vertical title · tail colophon · tail band) is
// the kit every skin fills. Fable 5 treatments:
//  · leather (Tryst) — plum leather, striped gilt bands, blind-ruled inset frame, gilt embossed type,
//    ❦ ornament pair on short titles, hairline+fleuron tail seal
//  · brushed (Aphelion) — brushed metal, tick bands, callsign chip, corner brackets, status LED
//  · tome (Grimoire) — tooled ground, gilt caps, raised cords, gold onum title, ❖ pair + sigil tail
//  · cloth (Marrow) — ash-cloth box, bone head rule, pasted № label, Franklin bone title, oxblood dip
//  · ledger (Gaslight/umbra) — fog cloth, brass band, typed case No., a pasted paper strip carrying
//    the typed title + author, a brass eyelet at the tail
// CSS/SVG only — gradients, borders, type, single glyphs. All values are tokens.
//
// Dimensions come from spineDims (a stable per-book hash) because page count + trim aren't in the Book
// model — see packages/core/src/spine.ts. Title uses fitSpineTitle: scale-to-fit, 13px floor, then
// truncate so a monster title can't overflow while the colophon stays anchored at the tail.

type SpineBook = { id: string; title: string; first?: string; last?: string }

const HEIGHT = [150, 184] as const // px range for trim (proxy); width range lives in spineMetrics

function authorLabel(b: SpineBook): string {
  const a = `${b.first ? `${b.first[0]}. ` : ''}${b.last ?? ''}`.trim()
  return a.toUpperCase()
}

/** The binding surface — spine material gradient + per-skin sheen, all token-driven. */
function bindingStyle(binding: SpineStyle['binding']): CSSProperties {
  if (binding === 'plain') return { background: 'var(--card-solid)' }
  if (binding === 'sky') {
    // Firstlight: the one gradient — night at the head, dawn at the tail
    return { background: ['var(--spine-sheen)', 'var(--sky)'].join(', ') }
  }
  const layers = [
    'var(--spine-sheen)',
    ...(binding === 'brushed'
      ? ['repeating-linear-gradient(90deg, rgba(255, 255, 255, 0.035) 0 1px, transparent 1px 3px)']
      : []),
    ...(binding === 'linen'
      ? [
          'repeating-linear-gradient(0deg, rgba(255, 255, 255, 0.045) 0 1px, transparent 1px 3px)',
          'repeating-linear-gradient(90deg, rgba(0, 0, 0, 0.04) 0 1px, transparent 1px 3px)',
        ]
      : []),
    'linear-gradient(180deg, var(--spine-hi), var(--spine-lo))',
  ]
  return { background: layers.join(', ') }
}

function Band({ kind }: { kind: SpineStyle['band'] }) {
  if (kind === 'gilt') {
    // striped brass band — gold/deep-gold 1.5/3 repeat, ringed
    return (
      <span
        aria-hidden
        className="block w-full flex-none"
        style={{
          height: 5,
          background:
            'repeating-linear-gradient(180deg, var(--gold) 0 1.5px, var(--gold-deep) 1.5px 3px)',
          boxShadow: 'inset 0 0 0 1px rgba(0, 0, 0, 0.35)',
        }}
      />
    )
  }
  if (kind === 'tick') {
    return (
      <span
        aria-hidden
        className="block w-full flex-none"
        style={{
          height: 6,
          backgroundImage:
            'repeating-linear-gradient(90deg, color-mix(in srgb, var(--accent) 60%, transparent) 0 1px, transparent 1px 6px)',
        }}
      />
    )
  }
  if (kind === 'bone-rule') {
    // Marrow: a single bone hairline under a shallow shoulder
    return (
      <span
        aria-hidden
        className="block w-full flex-none"
        style={{
          height: 6,
          borderBottom: '1px solid color-mix(in srgb, var(--spine-title) 40%, transparent)',
          boxShadow: 'inset 0 -2px 0 color-mix(in srgb, var(--spine-title) 14%, transparent)',
        }}
      />
    )
  }
  if (kind === 'pencil') {
    // Marginalia: two grease-pencil hairlines, hand-ruled
    return (
      <span
        aria-hidden
        className="flex w-full flex-none flex-col justify-center gap-[2px] px-1.5"
        style={{ height: 8 }}
      >
        <span style={{ height: 1, background: 'var(--spine-muted)', opacity: 0.7 }} />
        <span style={{ height: 1, background: 'var(--spine-muted)', opacity: 0.45 }} />
      </span>
    )
  }
  if (kind === 'stitched') {
    // Hearth: a run of cream thread, stitched
    return (
      <span aria-hidden className="flex w-full flex-none items-center px-1" style={{ height: 8 }}>
        <span
          className="w-full"
          style={{
            height: 2,
            backgroundImage:
              'repeating-linear-gradient(90deg, var(--thread) 0 5px, transparent 5px 9px)',
            borderRadius: 2,
            opacity: 0.85,
          }}
        />
      </span>
    )
  }
  if (kind === 'ink-block') {
    // Almanac: a solid ink band block (the tail block carries the REF № — drawn in Spine itself)
    return (
      <span
        aria-hidden
        className="block w-full flex-none"
        style={{ height: 6, background: 'var(--cta-lo)' }}
      />
    )
  }
  if (kind === 'gel') {
    // Firstlight: the violet gel strip at the head
    return (
      <span
        aria-hidden
        className="block w-full flex-none"
        style={{
          height: 5,
          background: 'var(--accent-fill)',
          boxShadow: 'inset 0 -1px 0 rgba(0, 0, 0, 0.25)',
        }}
      />
    )
  }
  return (
    <span
      aria-hidden
      className="block w-full flex-none"
      style={{ height: 2, background: 'var(--line)' }}
    />
  )
}

function Colophon({ kind }: { kind: SpineStyle['colophon'] }) {
  if (kind === 'fleuron' || kind === 'sigil') {
    // the tail seal: a short gilt hairline over the skin's glyph
    return (
      <span aria-hidden className="flex flex-none flex-col items-center gap-1">
        <span
          style={{
            width: 12,
            height: 1,
            background: 'color-mix(in srgb, var(--gold) 70%, transparent)',
          }}
        />
        <span
          className="text-[11px] leading-none"
          style={{
            color: 'var(--gold)',
            fontFamily: 'var(--font-display)',
            textShadow: 'var(--spine-emboss)',
          }}
        >
          {kind === 'fleuron' ? '❦' : '❖'}
        </span>
      </span>
    )
  }
  if (kind === 'led') {
    return (
      <span
        aria-hidden
        className="rv-anim flex-none rounded-full"
        style={{
          width: 5,
          height: 5,
          background: 'var(--accent)',
          boxShadow: '0 0 6px var(--accent)',
          animation: 'sig-blink 2.4s step-end infinite',
        }}
      />
    )
  }
  if (kind === 'eyelet') {
    // Gaslight: a punched brass eyelet at the tail
    return (
      <span
        aria-hidden
        className="flex-none rounded-full"
        style={{
          width: 8,
          height: 8,
          border: '1.5px solid var(--gold)',
          boxShadow: '0 1px 2px rgba(0, 0, 0, 0.4)',
        }}
      />
    )
  }
  if (kind === 'caret') {
    // Marginalia: the proofreader's caret at the tail — red, hand-pressed
    return (
      <span
        aria-hidden
        className="flex-none text-[12px] font-bold leading-none"
        style={{ color: 'var(--accent-fill)', fontFamily: 'var(--font-display)' }}
      >
        ‸
      </span>
    )
  }
  if (kind === 'button') {
    // Hearth: the sewn wooden button (its four thread holes drawn as background dots)
    return (
      <span
        aria-hidden
        className="flex-none rounded-full"
        style={{
          width: 10,
          height: 10,
          background:
            'radial-gradient(circle at 36% 36%, rgba(40, 28, 12, 0.7) 1px, transparent 1.4px), radial-gradient(circle at 64% 36%, rgba(40, 28, 12, 0.7) 1px, transparent 1.4px), radial-gradient(circle at 36% 64%, rgba(40, 28, 12, 0.7) 1px, transparent 1.4px), radial-gradient(circle at 64% 64%, rgba(40, 28, 12, 0.7) 1px, transparent 1.4px), radial-gradient(circle at 35% 30%, var(--gold), var(--gold-deep))',
          boxShadow: '0 1px 2px rgba(0, 0, 0, 0.4)',
        }}
      />
    )
  }
  if (kind === 'rule') {
    // Almanac: the double index rule above the tail block
    return (
      <span
        aria-hidden
        className="flex-none"
        style={{
          width: '55%',
          height: 3,
          borderTop: '1px solid var(--spine-title)',
          borderBottom: '1px solid var(--spine-title)',
          opacity: 0.55,
        }}
      />
    )
  }
  if (kind === 'sun') {
    // Firstlight: the small sun, always about to rise
    return (
      <span
        aria-hidden
        className="flex-none rounded-full"
        style={{
          width: 9,
          height: 9,
          background: 'radial-gradient(circle at 40% 35%, #ffe2a0, var(--gold))',
          boxShadow: '0 0 8px var(--gold)',
        }}
      />
    )
  }
  return null
}

/**
 * A state marker on the spine's binding edge — the find-it-fast affordance for borrowed and DNF.
 *
 * Uses the existing absolute z-3 edge idiom (Almanac's orange index tab is the precedent), so it
 * costs NOTHING from the title: `fitSpineTitle` budgets a fixed `reserved` height for the flow
 * anatomy, and an absolutely-positioned marker never enters that flow.
 *
 * LEFT edge, because the right edge is already taken — Almanac's `manual` binding racks its index
 * tab at `right: 0`. Vertical position is what distinguishes the two states, not colour: DNF at the
 * head, borrowed at the tail (see the Spine doc comment). The 20px insets clear both the head/tail
 * bands (≤8px head, ≤14px tail) and Aphelion's corner brackets (y 9–15 at either end).
 *
 * SUPPLEMENTARY by design. Spine bindings are per-skin gradients that no token fixture describes, so
 * this marker is not held to a text-contrast bar and does not try to carry the information alone —
 * the spine button's accessible name does that. The dark hairline keeps it separable on pale cloth
 * and bright brass alike.
 */
function StateMarker({ at }: { at: 'head' | 'tail' }) {
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute"
      style={{
        left: 0,
        ...(at === 'head' ? { top: 20 } : { bottom: 20 }),
        width: 4,
        height: 18,
        background: 'var(--mark-accent)',
        borderRadius: '0 2px 2px 0',
        boxShadow: '0 0 0 1px rgba(0, 0, 0, 0.45)',
        zIndex: 3,
      }}
    />
  )
}

/** Corner brackets (brushed archive container) — inset between the tick bands. */
function Brackets() {
  const base: CSSProperties = {
    position: 'absolute',
    width: 6,
    height: 6,
    borderColor: 'color-mix(in srgb, var(--accent) 60%, transparent)',
    borderStyle: 'solid',
    pointerEvents: 'none',
    zIndex: 3,
  }
  const pos: CSSProperties[] = [
    { top: 9, left: 3, borderWidth: '1px 0 0 1px' },
    { top: 9, right: 3, borderWidth: '1px 1px 0 0' },
    { bottom: 9, left: 3, borderWidth: '0 0 1px 1px' },
    { bottom: 9, right: 3, borderWidth: '0 1px 1px 0' },
  ]
  return (
    <>
      {pos.map((p, i) => (
        <span key={i} aria-hidden style={{ ...base, ...p }} />
      ))}
    </>
  )
}

/** A raised binding cord (the tooled tome) — a shallow ridge above/below the title zone. */
function Cord() {
  return (
    <span
      aria-hidden
      className="block flex-none self-stretch"
      style={{
        height: 5,
        margin: '2px 4px',
        borderRadius: 3,
        background: 'linear-gradient(180deg, rgba(255, 244, 205, 0.24), rgba(0, 0, 0, 0.4))',
        boxShadow: '0 1px 2px rgba(0, 0, 0, 0.35)',
      }}
    />
  )
}

const RADIUS: Record<SpineStyle['binding'], string> = {
  plain: '2px',
  leather: '2px 3px 3px 2px',
  brushed: '1px',
  tome: '2px 4px 4px 2px',
  cloth: '1px',
  ledger: '2px',
  galley: '2px',
  linen: '3px 5px 5px 3px',
  manual: '1px',
  sky: '3px',
}

/** One book spine. `active` (the centre-of-shelf spine) widens it for legibility; sizes otherwise come
 *  from spineDims. Pass `skin` to force a skin (the shelf preview). `tint` is the book's stored
 *  dominant cover colour — mixed into the gradient endpoints when it clears the AA clamp, so shelves
 *  take on the palette of the reader's actual editions (skin default otherwise).
 *
 *  `dnf` marks the HEAD and `borrowed` marks the TAIL — two positions, never two colours. DNF takes
 *  the head for two reasons: the tail is the busier end across skins (a colophon plus a band, dip or
 *  ink-block up to 14px), and DNF is the state with no signal anywhere else in the app, so it earns
 *  the clearer position. Head-before-tail also matches the card (top-left read-status slot before
 *  bottom-right possession slot) and the accessible name, so one book reads in the same order on
 *  every surface. */
export function Spine({
  book,
  active = false,
  skin,
  tint,
  dnf = false,
  borrowed = false,
}: {
  book: SpineBook
  active?: boolean
  skin?: SkinId
  tint?: string
  /** abandoned — marked at the HEAD (see StateMarker) */
  dnf?: boolean
  /** in hand but not owned — marked at the TAIL */
  borrowed?: boolean
}) {
  const effective = useEffectiveSkin()
  const skinId = skin ?? effective
  const s = useStructure(skin).spine
  // Gradient bindings consume the tint via their --spine-hi/--spine-lo endpoints; 'plain' has no
  // gradient recipe and 'sky' (Firstlight's night-to-dawn) is the skin's signature — both skip it.
  const tintStyle = useSpineTintStyle(
    s.binding === 'plain' || s.binding === 'sky' ? undefined : tint,
  )
  const { trim } = spineDims(book.id)
  const width = active ? 120 : spineNaturalWidth(book.id)
  const height = Math.round(HEIGHT[0] + trim * (HEIGHT[1] - HEIGHT[0]))
  const author = authorLabel(book)
  // display-serif spines set the title in --font-display (gilt/graphite/linen/sky warm type)
  const serif =
    s.binding === 'leather' ||
    s.binding === 'tome' ||
    s.binding === 'galley' ||
    s.binding === 'linen' ||
    s.binding === 'sky'
  const authorAtTail = s.binding === 'brushed' || s.binding === 'cloth'

  // Head labels cost real length — only wide/tall spines (or the active one) carry them, per the
  // specimen's width gate.
  const wide = active || (width >= 44 && height >= 176)
  const call =
    (s.label === 'callsign' ||
      s.label === 'pasted-no' ||
      s.label === 'case-no' ||
      s.label === 'ref-no') &&
    wide
      ? callsign(book.id, skinId.slice(0, 3).toUpperCase())
      : null

  // Honest available title length: height minus the fixed anatomy at app scale (the specimen's
  // `reserved`). Serif runs wider per glyph than the condensed labels (adv .58 vs .72).
  const reserved = serif
    ? s.binding === 'tome'
      ? 128
      : s.binding === 'galley'
        ? 84
        : s.binding === 'linen'
          ? 92
          : s.binding === 'sky'
            ? 76
            : 88
    : s.binding === 'manual'
      ? call
        ? 108
        : 96
      : call
        ? 134
        : 100
  const avail = Math.max(40, height - reserved)
  const fit = fitSpineTitle(
    book.title,
    avail,
    serif ? { charRatio: 0.58, max: 22 } : { charRatio: 0.72, max: 20 },
  )
  const isShort = book.title.length <= 6 && !fit.truncated
  // ornament pairs + short-title italics belong to the bound/proof serifs, not the linen or sky
  const italicShort =
    isShort && (s.binding === 'leather' || s.binding === 'tome' || s.binding === 'galley')
  const ornament =
    isShort && (s.binding === 'leather' || s.binding === 'tome')
      ? s.binding === 'tome'
        ? '❖'
        : '❦'
      : null

  const authorEl = author && (
    <span
      className="flex-none whitespace-nowrap uppercase"
      style={{
        writingMode: 'vertical-rl',
        textOrientation: 'mixed',
        fontSize: serif ? 9.5 : 9,
        fontWeight: serif ? 600 : 700,
        fontFamily: serif ? 'var(--font-sans)' : 'var(--font-mono)',
        letterSpacing: serif ? '0.2em' : '0.16em',
        color: s.binding === 'plain' ? 'var(--muted)' : 'var(--spine-muted)',
      }}
    >
      {author}
    </span>
  )

  const titleEl = (
    <span
      className="whitespace-nowrap"
      style={{
        writingMode: 'vertical-rl',
        textOrientation: 'mixed',
        fontSize: fit.fontPx,
        lineHeight: serif ? 1.04 : 1.08,
        fontFamily: serif
          ? 'var(--font-display)'
          : s.binding === 'ledger'
            ? 'var(--font-mono)'
            : 'var(--font-sans)',
        fontWeight: serif ? 600 : 700,
        fontStyle: italicShort ? 'italic' : 'normal',
        fontFeatureSettings: serif && s.binding !== 'sky' ? "'onum' 1" : undefined,
        textTransform: s.titleUpper ? 'uppercase' : 'none',
        letterSpacing: s.titleUpper ? (s.binding === 'ledger' ? '0.08em' : '0.1em') : '0.01em',
        color: s.binding === 'plain' ? 'var(--accent-ink)' : 'var(--spine-title)',
        textShadow: 'var(--spine-emboss)',
      }}
    >
      {fit.text}
    </span>
  )

  return (
    <div
      className="relative flex flex-col items-center overflow-hidden border border-line transition-[width] duration-300 motion-reduce:transition-none"
      style={{
        width,
        height,
        borderRadius: RADIUS[s.binding],
        ...tintStyle,
        ...bindingStyle(s.binding),
      }}
    >
      {/* blind-ruled gilt inset frame (the bound volume) / corner brackets (the archive container) */}
      {s.binding === 'leather' && (
        <span
          aria-hidden
          className="pointer-events-none absolute"
          style={{
            inset: '9px 3px',
            border: '1px solid color-mix(in srgb, var(--gold) 42%, transparent)',
            borderRadius: 2,
            zIndex: 3,
          }}
        />
      )}
      {s.binding === 'brushed' && <Brackets />}
      {dnf && <StateMarker at="head" />}
      {borrowed && <StateMarker at="tail" />}
      {s.binding === 'manual' && (
        // the orange index tab, racked off the right edge — "find this fast"
        <span
          aria-hidden
          className="pointer-events-none absolute"
          style={{
            right: 0,
            top: '26%',
            width: 5,
            height: 24,
            background: 'var(--accent)',
            borderRadius: '2px 0 0 2px',
            boxShadow: '-1px 1px 2px rgba(0, 0, 0, 0.3)',
            zIndex: 3,
          }}
        />
      )}
      {s.binding === 'sky' && (
        // stars come out in dark mode only (the .rv-sky-star rule hides them at morning)
        <>
          <span
            aria-hidden
            className="rv-sky-star pointer-events-none absolute rounded-full"
            style={{
              left: '30%',
              top: '12%',
              width: 2,
              height: 2,
              background: 'rgba(238, 240, 250, 0.8)',
            }}
          />
          <span
            aria-hidden
            className="rv-sky-star pointer-events-none absolute rounded-full"
            style={{
              left: '62%',
              top: '22%',
              width: 1.5,
              height: 1.5,
              background: 'rgba(238, 240, 250, 0.55)',
            }}
          />
        </>
      )}
      <Band kind={s.band} />
      <div className="relative z-[2] flex min-h-0 w-full flex-1 flex-col items-center gap-1.5 py-2">
        {/* head labels */}
        {call && s.label === 'callsign' && (
          <span
            className="flex-none px-1 py-0.5 text-center"
            style={{
              background: 'var(--plate)',
              border: '1px solid color-mix(in srgb, var(--accent) 55%, transparent)',
              borderRadius: 1,
              lineHeight: 1.3,
            }}
          >
            <span
              className="block text-[9px] font-bold"
              style={{
                fontFamily: 'var(--font-mono)',
                letterSpacing: '0.08em',
                color: 'var(--accent-ink)',
              }}
            >
              {call.code}
            </span>
            <span
              className="block text-[9px] font-bold"
              style={{
                fontFamily: 'var(--font-mono)',
                letterSpacing: '0.04em',
                color: 'var(--spine-muted)',
              }}
            >
              {call.id}
            </span>
          </span>
        )}
        {call && s.label === 'pasted-no' && (
          <span
            className="flex-none px-1 py-0.5 text-center"
            style={{
              background: 'var(--paper)',
              color: 'var(--paper-ink)',
              boxShadow: '0 1px 3px rgba(0, 0, 0, 0.4)',
              lineHeight: 1.3,
            }}
          >
            <span
              className="block text-[8.5px] font-bold"
              style={{ fontFamily: 'var(--font-sans)', letterSpacing: '0.1em' }}
            >
              №
            </span>
            <span
              className="block text-[9px] font-bold"
              style={{ fontFamily: 'var(--font-sans)', letterSpacing: '0.06em' }}
            >
              {call.id}
            </span>
          </span>
        )}
        {call && s.label === 'case-no' && (
          <span
            className="flex-none text-[9px] font-bold"
            style={{
              fontFamily: 'var(--font-mono)',
              letterSpacing: '0.08em',
              color: 'var(--gold)',
            }}
          >
            No.{call.id}
          </span>
        )}
        {!authorAtTail && s.binding !== 'ledger' && authorEl}
        {s.binding === 'tome' && <Cord />}
        {/* title zone — the ledger pastes a typed paper strip; everything else sets type on the binding */}
        {s.binding === 'ledger' ? (
          <div className="flex min-h-0 w-full flex-1 items-stretch justify-center overflow-hidden py-0.5">
            <div
              className="flex min-h-0 flex-col items-center justify-between gap-1 py-2"
              style={{
                width: Math.max(16, Math.round(width * 0.58)),
                background: 'var(--paper)',
                boxShadow: '0 1px 3px rgba(0, 0, 0, 0.35), inset 0 0 0 1px rgba(0, 0, 0, 0.08)',
              }}
            >
              <div className="flex min-h-0 flex-1 items-center overflow-hidden">{titleEl}</div>
              {author && (
                <span
                  className="flex-none whitespace-nowrap uppercase"
                  style={{
                    writingMode: 'vertical-rl',
                    textOrientation: 'mixed',
                    fontSize: 9,
                    fontFamily: 'var(--font-mono)',
                    letterSpacing: '0.1em',
                    color: 'var(--spine-muted)',
                  }}
                >
                  {author}
                </span>
              )}
            </div>
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 overflow-hidden">
            {ornament && (
              <span
                aria-hidden
                className="text-[11px] leading-none"
                style={{
                  color: 'var(--gold)',
                  opacity: 0.8,
                  fontFamily: 'var(--font-display)',
                  textShadow: 'var(--spine-emboss)',
                }}
              >
                {ornament}
              </span>
            )}
            {titleEl}
            {ornament && (
              <span
                aria-hidden
                className="text-[11px] leading-none"
                style={{
                  color: 'var(--gold)',
                  opacity: 0.8,
                  fontFamily: 'var(--font-display)',
                  textShadow: 'var(--spine-emboss)',
                  transform: 'rotate(180deg)',
                }}
              >
                {ornament}
              </span>
            )}
          </div>
        )}
        {s.binding === 'tome' && <Cord />}
        {authorAtTail && authorEl}
        {s.binding === 'galley' && wide && (
          // the editor's hand signs the galley off — Caveat, never body copy
          <span
            aria-hidden
            className="flex-none text-[10px] leading-none"
            style={{
              fontFamily: 'var(--font-hand)',
              color: 'var(--accent-fill)',
              transform: 'rotate(-4deg)',
            }}
          >
            proof
          </span>
        )}
        <Colophon kind={s.colophon} />
      </div>
      {/* tail: the cloth box dips in oxblood instead of a band; the manual's tail block files the REF № */}
      {s.colophon === 'dip' ? (
        <span
          aria-hidden
          className="block w-full flex-none"
          style={{
            height: 12,
            background:
              'linear-gradient(180deg, color-mix(in srgb, var(--accent-fill) 55%, transparent), var(--accent-fill))',
            boxShadow: 'inset 0 2px 3px rgba(0, 0, 0, 0.25)',
          }}
        />
      ) : s.band === 'ink-block' ? (
        <span
          aria-hidden
          className="grid w-full flex-none place-items-center"
          style={{ height: call ? 14 : 8, background: 'var(--cta-lo)' }}
        >
          {call && (
            <span
              className="whitespace-nowrap text-[9px] font-bold"
              style={{
                fontFamily: 'var(--font-sans)',
                letterSpacing: '0.1em',
                color: 'var(--cta-ink)',
              }}
            >
              REF {call.id.slice(1)}
            </span>
          )}
        </span>
      ) : s.band === 'gel' ? null : (
        <Band kind={s.band} />
      )}
    </div>
  )
}
