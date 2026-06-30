import { type CSSProperties, type ReactNode } from 'react'
import { type SkinId } from '@reverie/core'
import { useEffectiveSkin } from '../skin/labels'

/**
 * The book-detail "nameplate" — the highest-character single element in the kit. It names the book
 * like an engraved plate, not a heading. Built on the `.skin-plate` material (opaque --panel-fill =
 * the AA floor; gilt/instrument character from the border + inset --ornament-frame), plus a per-skin
 * STRUCTURAL ornament: Tryst hangs a gilt fleuron over the top rule; Aphelion frames it in four
 * instrument corner-brackets with a blinking status dot. Other skins inherit the clean plate until
 * their stage. Pass `skin` to force a skin's ornament (gallery / eyeball previews); otherwise it
 * follows the active skin. Text uses the contract type tokens (--label-font / --font-display), never
 * a parallel type scale.
 */
type PlateOrnament = {
  /** drawn inside the plate, absolutely positioned (brackets, top fleuron, status dot) */
  ornament?: ReactNode
  eyebrowColor: string
  subtitleStyle: CSSProperties
}

/** A single signature glyph hung over the top rule of the plate, in the skin's accent. */
function topGlyph(ch: string): ReactNode {
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute left-1/2 top-[-3px] -translate-x-1/2 text-[13px] leading-none"
      style={{ color: 'var(--accent)' }}
    >
      {ch}
    </span>
  )
}

const PLATE: Partial<Record<SkinId, PlateOrnament>> = {
  tryst: {
    eyebrowColor: 'var(--accent-ink)',
    subtitleStyle: { fontFamily: 'var(--font-display)', fontStyle: 'italic' },
    ornament: (
      <span
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-[-1px] -translate-x-1/2 text-[13px] leading-none"
        style={{ color: 'var(--accent)' }}
      >
        ❦
      </span>
    ),
  },
  aphelion: {
    eyebrowColor: 'var(--accent-ink)',
    subtitleStyle: { fontFamily: 'var(--font-mono)', letterSpacing: '0.06em' },
    ornament: (
      <>
        {/* four instrument corner-brackets */}
        {(
          [
            'left-0 top-0 border-l border-t',
            'right-0 top-0 border-r border-t',
            'left-0 bottom-0 border-l border-b',
            'right-0 bottom-0 border-r border-b',
          ] as const
        ).map((pos) => (
          <span
            key={pos}
            aria-hidden
            className={`pointer-events-none absolute h-2.5 w-2.5 ${pos}`}
            style={{ borderColor: 'var(--ornament-frame)' }}
          />
        ))}
      </>
    ),
  },
  grimoire: {
    eyebrowColor: 'var(--accent-ink)',
    subtitleStyle: { fontFamily: 'var(--font-display)', fontStyle: 'italic' },
    ornament: (
      // illuminated alchemical sun, gold leaf, over the top rule
      <span
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-[-2px] -translate-x-1/2 text-[14px] leading-none"
        style={{ color: 'var(--accent)' }}
      >
        ☉
      </span>
    ),
  },
  marrow: {
    eyebrowColor: 'var(--accent-ink)',
    subtitleStyle: { fontFamily: 'var(--font-display)', fontStyle: 'italic' },
    ornament: (
      // a single oxblood dagger marks the plate
      <span
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-[-3px] -translate-x-1/2 text-[13px] leading-none"
        style={{ color: 'var(--accent)' }}
      >
        †
      </span>
    ),
  },
  // Stage 3 — a single signature glyph over the top rule, in the skin's accent.
  umbra: { eyebrowColor: 'var(--accent-ink)', subtitleStyle: { fontFamily: 'var(--font-display)', fontStyle: 'italic' }, ornament: topGlyph('◆') },
  folio: { eyebrowColor: 'var(--accent-ink)', subtitleStyle: { fontFamily: 'var(--font-display)', fontStyle: 'italic' }, ornament: topGlyph('❡') },
  hearth: { eyebrowColor: 'var(--accent-ink)', subtitleStyle: { fontFamily: 'var(--font-sans)' }, ornament: topGlyph('❀') },
  almanac: { eyebrowColor: 'var(--accent-ink)', subtitleStyle: { fontFamily: 'var(--font-mono)', letterSpacing: '0.04em' }, ornament: topGlyph('‡') },
  bloom: { eyebrowColor: 'var(--accent-ink)', subtitleStyle: { fontFamily: 'var(--font-sans)' }, ornament: topGlyph('✺') },
}

export function Nameplate({
  eyebrow,
  title,
  subtitle,
  skin,
  align = 'center',
  className = '',
}: {
  eyebrow?: ReactNode
  title: ReactNode
  subtitle?: ReactNode
  skin?: SkinId
  align?: 'center' | 'start'
  className?: string
}) {
  const active = useEffectiveSkin()
  const id = skin ?? active
  const plate = PLATE[id]
  const alignCls = align === 'center' ? 'text-center items-center' : 'text-left items-start'

  return (
    <div className={`skin-plate skin-panel overflow-hidden px-5 py-4 ${className}`}>
      {plate?.ornament}
      {/* Aphelion's status dot sits with the eyebrow; Tryst leads with the fleuron only. */}
      <div className={`relative flex flex-col gap-1 ${alignCls}`}>
        {eyebrow && (
          <div className="flex items-center gap-2">
            {id === 'aphelion' && (
              <span
                aria-hidden
                className="rv-anim h-1.5 w-1.5 rounded-full"
                style={{ background: 'var(--accent)', boxShadow: '0 0 8px var(--accent)', animation: 'sig-blink 2s step-end infinite' }}
              />
            )}
            <span className="skin-label text-[10px]" style={{ color: plate?.eyebrowColor ?? 'var(--muted)' }}>
              {eyebrow}
            </span>
          </div>
        )}
        <h2
          className="text-balance text-[22px] leading-tight text-ink"
          style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontFeatureSettings: 'var(--numeral-feature)' }}
        >
          {title}
        </h2>
        {subtitle && (
          <p className="text-[13px] text-muted" style={plate?.subtitleStyle}>
            {subtitle}
          </p>
        )}
      </div>
    </div>
  )
}
