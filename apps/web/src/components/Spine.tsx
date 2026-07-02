import { type CSSProperties } from 'react'
import { fitSpineTitle, spineDims, type SkinId, type SpineStyle } from '@reverie/core'
import { useStructure } from '../skin/structure'

// The Spine slot — a spine composed for its own narrow, edge-on read (NOT a rotated cover). The
// anatomy (head band · author · vertical title · optional head label · tail colophon · tail band) is
// the kit every skin fills; Tryst binds it in cloth-and-leather with gilt bands + a ❦ tail fleuron,
// Aphelion in brushed metal with tick-rule bands + a callsign at the head and a status LED at the
// foot. CSS/SVG only — every surface is gradients / borders / masks / type / one glyph.
//
// Dimensions come from spineDims (a stable per-book hash) because page count + trim aren't in the Book
// model — see packages/core/src/spine.ts. Title uses fitSpineTitle: scale-to-fit, 13px floor, then
// truncate so a monster title can't overflow while the colophon stays anchored at the tail.

type SpineBook = { id: string; title: string; first?: string; last?: string }

const WIDTH = [26, 46] as const // px range for thickness (page-count proxy)
const HEIGHT = [150, 184] as const // px range for trim (proxy)

function authorLabel(b: SpineBook): string {
  const a = `${b.first ? `${b.first[0]}. ` : ''}${b.last ?? ''}`.trim()
  return a.toUpperCase()
}

/** A short catalog code for the Aphelion callsign, deterministic from the book. */
function callCode(b: SpineBook): string {
  let h = 0
  for (let i = 0; i < b.id.length; i++) h = (h * 31 + b.id.charCodeAt(i)) >>> 0
  return String((h % 9000) + 1000)
}

function bindingStyle(binding: SpineStyle['binding']): CSSProperties {
  if (binding === 'leather') {
    // cloth-and-leather: a soft vertical sheen over the opaque card surface (the AA base)
    return {
      background:
        'linear-gradient(100deg, color-mix(in srgb, var(--card-solid) 90%, #000) 0%, var(--card-solid) 38%, color-mix(in srgb, var(--card-solid) 88%, var(--gold)) 52%, var(--card-solid) 66%, color-mix(in srgb, var(--card-solid) 90%, #000) 100%)',
    }
  }
  if (binding === 'brushed') {
    // brushed metal: fine vertical striations + a diagonal sheen over the opaque card surface
    return {
      background:
        'repeating-linear-gradient(90deg, color-mix(in srgb, var(--card-solid) 92%, #fff) 0 1px, color-mix(in srgb, var(--card-solid) 96%, #000) 1px 2px), linear-gradient(110deg, transparent 35%, color-mix(in srgb, var(--accent) 14%, transparent) 50%, transparent 65%)',
      backgroundColor: 'var(--card-solid)',
    }
  }
  return { background: 'var(--card-solid)' }
}

function Band({ kind, edge }: { kind: SpineStyle['band']; edge: 'head' | 'tail' }) {
  const round = edge === 'head' ? '2px 2px 0 0' : '0 0 2px 2px'
  if (kind === 'gilt') {
    return (
      <span
        aria-hidden
        className="block w-full flex-none"
        style={{ height: 4, borderRadius: round, background: 'linear-gradient(90deg, color-mix(in srgb, var(--gold) 30%, transparent), var(--gold), color-mix(in srgb, var(--gold) 30%, transparent))' }}
      />
    )
  }
  if (kind === 'tick') {
    return (
      <span
        aria-hidden
        className="block w-full flex-none"
        style={{ height: 3, backgroundImage: 'repeating-linear-gradient(90deg, color-mix(in srgb, var(--accent) 60%, transparent) 0 1px, transparent 1px 4px)' }}
      />
    )
  }
  return <span aria-hidden className="block w-full flex-none" style={{ height: 2, background: 'var(--line)' }} />
}

function Colophon({ kind }: { kind: SpineStyle['colophon'] }) {
  if (kind === 'fleuron') {
    return (
      <span aria-hidden className="flex-none text-[11px] leading-none" style={{ color: 'var(--accent-ink)', fontFamily: 'var(--font-display)' }}>
        ❦
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

/** One book spine. `active` (the centre-of-shelf spine) widens it for legibility; sizes otherwise come
 *  from spineDims. Pass `skin` to force a skin (the shelf preview). */
export function Spine({ book, active = false, skin }: { book: SpineBook; active?: boolean; skin?: SkinId }) {
  const s = useStructure(skin).spine
  const { thickness, trim } = spineDims(book.id)
  const width = active ? 120 : Math.round(WIDTH[0] + thickness * (WIDTH[1] - WIDTH[0]))
  const height = Math.round(HEIGHT[0] + trim * (HEIGHT[1] - HEIGHT[0]))
  const author = authorLabel(book)
  const fit = fitSpineTitle(book.title, Math.round(height * 0.58))
  const authorAtTail = s.colophon === 'led' // Aphelion sets the author at the tail
  const titleColor = s.titleUpper ? 'var(--ink)' : 'var(--accent-ink)'
  const titleFont = s.titleUpper ? 'var(--font-mono)' : 'var(--font-display)'

  const authorEl = author && (
    <span
      className="skin-label flex-none whitespace-nowrap"
      style={{ writingMode: 'vertical-rl', textOrientation: 'mixed', fontSize: 9, letterSpacing: '0.08em', color: 'var(--muted)' }}
    >
      {author}
    </span>
  )

  return (
    <div
      className="relative flex flex-col items-center overflow-hidden border border-line transition-[width] duration-300 motion-reduce:transition-none"
      style={{ width, height, borderRadius: '2px', ...bindingStyle(s.binding) }}
    >
      <Band kind={s.band} edge="head" />
      <div className="flex min-h-0 flex-1 flex-col items-center gap-1.5 py-2">
        {s.label === 'callsign' && (
          <span className="skin-label flex-none whitespace-nowrap text-[9px]" style={{ color: 'var(--accent-ink)' }}>
            {callCode(book)}
          </span>
        )}
        {!authorAtTail && authorEl}
        <div className="flex min-h-0 flex-1 items-center justify-center">
          <span
            className="whitespace-nowrap"
            style={{
              writingMode: 'vertical-rl',
              textOrientation: 'mixed',
              fontSize: fit.fontPx,
              lineHeight: 1,
              fontFamily: titleFont,
              fontWeight: 600,
              textTransform: s.titleUpper ? 'uppercase' : 'none',
              letterSpacing: s.titleUpper ? '0.1em' : '0',
              color: titleColor,
              textShadow: s.binding === 'leather' ? '0 1px 0 rgba(0,0,0,0.35)' : undefined, // gilt-stamped depth
            }}
          >
            {fit.text}
          </span>
        </div>
        {authorAtTail && authorEl}
        <Colophon kind={s.colophon} />
      </div>
      <Band kind={s.band} edge="tail" />
    </div>
  )
}
