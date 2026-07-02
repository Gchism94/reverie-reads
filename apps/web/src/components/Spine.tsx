import { type CSSProperties } from 'react'
import { callsign, fitSpineTitle, spineDims, type SkinId, type SpineStyle } from '@reverie/core'
import { useEffectiveSkin } from '../skin/labels'
import { useStructure } from '../skin/structure'

// The Spine slot — a spine composed for its own narrow, edge-on read (NOT a rotated cover). The
// anatomy (head band · optional head label · author · vertical title · tail colophon · tail band) is
// the kit every skin fills. Fable 5 chunk 1 refines the two reference treatments: Tryst binds the
// volume in plum leather with striped gilt bands, a blind-ruled inset frame, gold embossed type and a
// ❦ tail seal (short titles gain an ornament pair); Aphelion racks a brushed-metal specimen with
// tick-rules, a callsign chip, corner brackets and a status LED. CSS/SVG only.
//
// Dimensions come from spineDims (a stable per-book hash) because page count + trim aren't in the Book
// model — see packages/core/src/spine.ts. Title uses fitSpineTitle: scale-to-fit, 13px floor, then
// truncate so a monster title can't overflow while the colophon stays anchored at the tail.

type SpineBook = { id: string; title: string; first?: string; last?: string }

const WIDTH = [26, 48] as const // px range for thickness (page-count proxy)
const HEIGHT = [150, 184] as const // px range for trim (proxy)

function authorLabel(b: SpineBook): string {
  const a = `${b.first ? `${b.first[0]}. ` : ''}${b.last ?? ''}`.trim()
  return a.toUpperCase()
}

/** The binding surface — spine material gradient + per-skin sheen, all token-driven. */
function bindingStyle(binding: SpineStyle['binding']): CSSProperties {
  if (binding === 'leather' || binding === 'brushed') {
    const layers = [
      'var(--spine-sheen)',
      ...(binding === 'brushed'
        ? ['repeating-linear-gradient(90deg, rgba(255, 255, 255, 0.035) 0 1px, transparent 1px 3px)']
        : []),
      'linear-gradient(180deg, var(--spine-hi), var(--spine-lo))',
    ]
    return { background: layers.join(', ') }
  }
  return { background: 'var(--card-solid)' }
}

function Band({ kind }: { kind: SpineStyle['band'] }) {
  if (kind === 'gilt') {
    // striped brass band — gold/deep-gold 1.5/3 repeat, ringed (the bound volume's head + tail)
    return (
      <span
        aria-hidden
        className="block w-full flex-none"
        style={{
          height: 5,
          background: 'repeating-linear-gradient(180deg, var(--gold) 0 1.5px, var(--gold-deep) 1.5px 3px)',
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
        style={{ height: 6, backgroundImage: 'repeating-linear-gradient(90deg, color-mix(in srgb, var(--accent) 60%, transparent) 0 1px, transparent 1px 6px)' }}
      />
    )
  }
  return <span aria-hidden className="block w-full flex-none" style={{ height: 2, background: 'var(--line)' }} />
}

function Colophon({ kind }: { kind: SpineStyle['colophon'] }) {
  if (kind === 'fleuron') {
    // the tail seal: a short gilt hairline over the fleuron
    return (
      <span aria-hidden className="flex flex-none flex-col items-center gap-1">
        <span style={{ width: 12, height: 1, background: 'color-mix(in srgb, var(--gold) 70%, transparent)' }} />
        <span className="text-[11px] leading-none" style={{ color: 'var(--gold)', fontFamily: 'var(--font-display)', textShadow: 'var(--spine-emboss)' }}>
          ❦
        </span>
      </span>
    )
  }
  if (kind === 'led') {
    return (
      <span
        aria-hidden
        className="rv-anim flex-none rounded-full"
        style={{ width: 5, height: 5, background: 'var(--accent)', boxShadow: '0 0 6px var(--accent)', animation: 'sig-blink 2.4s step-end infinite' }}
      />
    )
  }
  return null
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

/** One book spine. `active` (the centre-of-shelf spine) widens it for legibility; sizes otherwise come
 *  from spineDims. Pass `skin` to force a skin (the shelf preview). */
export function Spine({ book, active = false, skin }: { book: SpineBook; active?: boolean; skin?: SkinId }) {
  const effective = useEffectiveSkin()
  const skinId = skin ?? effective
  const s = useStructure(skin).spine
  const { thickness, trim } = spineDims(book.id)
  const width = active ? 120 : Math.round(WIDTH[0] + thickness * (WIDTH[1] - WIDTH[0]))
  const height = Math.round(HEIGHT[0] + trim * (HEIGHT[1] - HEIGHT[0]))
  const author = authorLabel(book)
  const leather = s.binding === 'leather'
  const authorAtTail = s.colophon === 'led' // Aphelion sets the author at the tail
  // Callsign chip (code + id) costs real length — only wide/tall spines (or the active one) carry it,
  // per the specimen's width gate.
  const call = s.label === 'callsign' && (active || (width >= 44 && height >= 176)) ? callsign(book.id, skinId.slice(0, 3).toUpperCase()) : null
  // Honest available title length: height minus the fixed anatomy (bands, author zone, chip, colophon,
  // paddings) — the specimen's `reserved`, at app scale. Fable 5 fit params per binding (serif runs
  // wider per glyph than the condensed mono: adv .58 vs .72).
  const reserved = leather ? 88 : call ? 134 : 100
  const avail = Math.max(40, height - reserved)
  const fit = fitSpineTitle(book.title, avail, leather ? { charRatio: 0.58, max: 22 } : { charRatio: 0.72, max: 20 })
  const isShort = book.title.length <= 6 && !fit.truncated

  const authorEl = author && (
    <span
      className="flex-none whitespace-nowrap uppercase"
      style={{
        writingMode: 'vertical-rl',
        textOrientation: 'mixed',
        fontSize: leather ? 9.5 : 9,
        fontWeight: leather ? 600 : 700,
        fontFamily: leather ? 'var(--font-sans)' : 'var(--font-mono)',
        letterSpacing: leather ? '0.2em' : '0.16em',
        color: s.binding === 'plain' ? 'var(--muted)' : 'var(--spine-muted)',
      }}
    >
      {author}
    </span>
  )

  return (
    <div
      className="relative flex flex-col items-center overflow-hidden border border-line transition-[width] duration-300 motion-reduce:transition-none"
      style={{ width, height, borderRadius: leather ? '2px 3px 3px 2px' : '1px', ...bindingStyle(s.binding) }}
    >
      {/* blind-ruled gilt inset frame (the bound volume) / corner brackets (the archive container) */}
      {leather && (
        <span
          aria-hidden
          className="pointer-events-none absolute"
          style={{ inset: '9px 3px', border: '1px solid color-mix(in srgb, var(--gold) 42%, transparent)', borderRadius: 2, zIndex: 3 }}
        />
      )}
      {s.binding === 'brushed' && <Brackets />}
      <Band kind={s.band} />
      <div className="relative z-[2] flex min-h-0 w-full flex-1 flex-col items-center gap-1.5 py-2">
        {call && (
          <span
            className="flex-none px-1 py-0.5 text-center"
            style={{ background: 'var(--plate)', border: '1px solid color-mix(in srgb, var(--accent) 55%, transparent)', borderRadius: 1, lineHeight: 1.3 }}
          >
            <span className="block text-[9px] font-bold" style={{ fontFamily: 'var(--font-mono)', letterSpacing: '0.08em', color: 'var(--accent-ink)' }}>
              {call.code}
            </span>
            <span className="block text-[9px] font-bold" style={{ fontFamily: 'var(--font-mono)', letterSpacing: '0.04em', color: 'var(--spine-muted)' }}>
              {call.id}
            </span>
          </span>
        )}
        {!authorAtTail && authorEl}
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 overflow-hidden">
          {isShort && leather && (
            <span aria-hidden className="text-[11px] leading-none" style={{ color: 'var(--gold)', opacity: 0.8, fontFamily: 'var(--font-display)', textShadow: 'var(--spine-emboss)' }}>
              ❦
            </span>
          )}
          <span
            className="whitespace-nowrap"
            style={{
              writingMode: 'vertical-rl',
              textOrientation: 'mixed',
              fontSize: fit.fontPx,
              lineHeight: leather ? 1.04 : 1.1,
              fontFamily: leather ? 'var(--font-display)' : 'var(--font-mono)',
              fontWeight: leather ? 600 : 700,
              fontStyle: isShort && leather ? 'italic' : 'normal',
              fontFeatureSettings: leather ? "'onum' 1" : undefined,
              textTransform: s.titleUpper ? 'uppercase' : 'none',
              letterSpacing: s.titleUpper ? '0.06em' : '0.005em',
              color: s.binding === 'plain' ? 'var(--accent-ink)' : 'var(--spine-title)',
              textShadow: 'var(--spine-emboss)',
            }}
          >
            {fit.text}
          </span>
          {isShort && leather && (
            <span
              aria-hidden
              className="text-[11px] leading-none"
              style={{ color: 'var(--gold)', opacity: 0.8, fontFamily: 'var(--font-display)', textShadow: 'var(--spine-emboss)', transform: 'rotate(180deg)' }}
            >
              ❦
            </span>
          )}
        </div>
        {authorAtTail && authorEl}
        <Colophon kind={s.colophon} />
      </div>
      <Band kind={s.band} />
    </div>
  )
}
