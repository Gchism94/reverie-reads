import { type CSSProperties, type ReactNode } from 'react'
import { type SkinId } from '@reverie/core'
import { useStructure } from '../skin/structure'

// Structural slots — generic components that render a DIFFERENT BONE per skin by reading the skin's
// structural config (useStructure). The common slots are declarative parameters here; the one bespoke
// emblem per skin (radar cycle-ring / fleuron) lives in SignatureRing + SignatureEmblem. Every slot
// takes an optional `skin` to force one (the /lab/structure preview); otherwise it follows the active
// skin. Neutral skins render plain — no regression.

/** Corner brackets for the Aphelion 'corner-bracket' frame. */
function CornerBrackets({ inset = 0, len = 10 }: { inset?: number; len?: number }) {
  const corners = [
    'left-t border-l border-t',
    'right-t border-r border-t',
    'left-b border-l border-b',
    'right-b border-r border-b',
  ]
  const pos: Record<string, CSSProperties> = {
    'left-t': { left: inset, top: inset },
    'right-t': { right: inset, top: inset },
    'left-b': { left: inset, bottom: inset },
    'right-b': { right: inset, bottom: inset },
  }
  return (
    <>
      {corners.map((c) => {
        const key = c.split(' ')[0]!
        return (
          <span
            key={key}
            aria-hidden
            className={`pointer-events-none absolute ${c.split(' ').slice(1).join(' ')}`}
            style={{ width: len, height: len, ...pos[key], borderColor: 'var(--ornament-frame)' }}
          />
        )
      })}
    </>
  )
}

/** Section header — label + a per-skin RULE + an optional readout. Aphelion: tick-rule + cyan readout.
 *  Tryst: fleuron-centred gilt hairline + gold count. Neutral: a plain hairline. */
export function SectionHeader({
  label,
  readout,
  skin,
  className = '',
}: {
  label: ReactNode
  readout?: ReactNode
  skin?: SkinId
  className?: string
}) {
  const s = useStructure(skin)
  return (
    <div className={`flex items-baseline gap-3 ${className}`}>
      <span className="skin-label whitespace-nowrap text-[14px] text-ink">{label}</span>
      {s.sectionRule === 'tick-rule' ? (
        <span
          aria-hidden
          className="h-px flex-1 self-center"
          style={{ backgroundImage: 'repeating-linear-gradient(90deg, color-mix(in srgb, var(--accent) 45%, transparent) 0 1px, transparent 1px 7px)' }}
        />
      ) : s.sectionRule === 'fleuron' ? (
        <span aria-hidden className="flex flex-1 items-center gap-2 self-center" style={{ color: 'var(--accent)' }}>
          <span className="h-px flex-1" style={{ background: 'linear-gradient(90deg, transparent, color-mix(in srgb, var(--accent) 50%, transparent))' }} />
          <span className="text-[13px] leading-none" style={{ fontFamily: 'var(--font-display)' }}>❦</span>
          <span className="h-px flex-1" style={{ background: 'linear-gradient(90deg, color-mix(in srgb, var(--accent) 50%, transparent), transparent)' }} />
        </span>
      ) : (
        <span aria-hidden className="h-px flex-1 self-center" style={{ background: 'var(--line)' }} />
      )}
      {readout != null && (
        <span className="skin-numeral whitespace-nowrap text-[14px] font-semibold" style={{ color: 'var(--accent-ink)' }}>
          {readout}
        </span>
      )}
    </div>
  )
}

/** Panel / hero-card frame. Aphelion: corner brackets. Tryst: gilt inset plate with a fleuron at the
 *  head. Neutral: a plain bordered card. `head` mounts a small ornament over the top edge. */
export function Frame({
  children,
  skin,
  className = '',
  style,
}: {
  children: ReactNode
  skin?: SkinId
  className?: string
  style?: CSSProperties
}) {
  const s = useStructure(skin)
  if (s.frame === 'corner-bracket') {
    return (
      <div className={`relative border border-line ${className}`} style={{ borderRadius: 'var(--radius-panel)', background: 'var(--panel-fill)', ...style }}>
        <CornerBrackets inset={0} len={11} />
        {children}
      </div>
    )
  }
  if (s.frame === 'gilt-plate') {
    return (
      <div className={`skin-plate relative ${className}`} style={style}>
        <span aria-hidden className="pointer-events-none absolute left-1/2 top-[-2px] -translate-x-1/2 text-[13px] leading-none" style={{ color: 'var(--accent)' }}>
          ❦
        </span>
        {children}
      </div>
    )
  }
  return (
    <div className={`relative border border-line ${className}`} style={{ borderRadius: 'var(--radius-panel)', background: 'var(--card-solid)', ...style }}>
      {children}
    </div>
  )
}

/** A status tag / callsign. Aphelion: a squared bracketed mono tag ([✓]RD). Tryst / neutral: a round
 *  pill with the glyph in the accent. `glyph` is the leading mark; `children` the label. */
export function StatusTag({
  glyph,
  children,
  tone = 'accent',
  skin,
}: {
  glyph?: ReactNode
  children: ReactNode
  tone?: 'accent' | 'muted'
  skin?: SkinId
}) {
  const s = useStructure(skin)
  const color = tone === 'accent' ? 'var(--accent-ink)' : 'var(--muted)'
  const border = tone === 'accent' ? 'color-mix(in srgb, var(--accent) 50%, transparent)' : 'var(--line)'
  if (s.tag === 'squared-bracket') {
    return (
      <span
        className="skin-label inline-flex items-center gap-1 border px-2 py-1 text-[10px]"
        style={{ borderRadius: '2px', borderColor: border, color }}
      >
        {glyph != null && (
          <>
            <span style={{ color: 'var(--accent)' }}>[</span>
            {glyph}
            <span style={{ color: 'var(--accent)' }}>]</span>
          </>
        )}
        {children}
      </span>
    )
  }
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11.5px] font-semibold"
      style={{ borderColor: border, color }}
    >
      {glyph != null && <span style={{ color: 'var(--accent)' }}>{glyph}</span>}
      {children}
    </span>
  )
}

/** Progress meter. Aphelion: segmented blocks. Tryst: filled dots. Neutral: a continuous bar. */
export function ProgressMeter({
  value,
  max,
  skin,
  className = '',
}: {
  value: number
  max: number
  skin?: SkinId
  className?: string
}) {
  const s = useStructure(skin)
  const pct = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0
  if (s.progress === 'segmented' || s.progress === 'dots') {
    const total = 12
    const filled = Math.round(pct * total)
    const square = s.progress === 'segmented'
    return (
      <div className={`flex items-center gap-1 ${className}`} aria-hidden>
        {Array.from({ length: total }, (_, i) => (
          <span
            key={i}
            style={{
              width: square ? 9 : 6,
              height: square ? 5 : 6,
              borderRadius: square ? '1px' : '999px',
              background: i < filled ? 'var(--accent)' : 'transparent',
              border: i < filled ? undefined : '1px solid color-mix(in srgb, var(--accent) 40%, transparent)',
            }}
          />
        ))}
      </div>
    )
  }
  return (
    <div className={`h-1.5 overflow-hidden rounded-full ${className}`} style={{ background: 'var(--chip)' }} aria-hidden>
      <div className="h-full rounded-full" style={{ width: `${Math.round(pct * 100)}%`, background: 'var(--primary)' }} />
    </div>
  )
}

/** The signature goal-ring — the one bespoke emblem per skin, carrying the reading goal. Aphelion: a
 *  radar cycle-ring (conic progress + a multiply segment overlay + a sweep on .rv-anim). Tryst: a gilt
 *  ring with a fleuron at the head. Neutral: a clean SVG progress ring. */
export function SignatureRing({
  value,
  max,
  size = 92,
  skin,
}: {
  value: number
  max: number
  size?: number
  skin?: SkinId
}) {
  const s = useStructure(skin)
  const pct = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0
  const deg = Math.round(pct * 360)
  const center = (
    <div
      className="absolute grid place-items-center rounded-full"
      style={{ inset: Math.round(size * 0.09), background: 'var(--card-solid)', border: s.motif === 'radar' ? '1px solid var(--line)' : undefined }}
    >
      <div className="text-center leading-none">
        <span className="skin-numeral font-bold text-ink" style={{ fontSize: Math.round(size * 0.23) }}>{value}</span>
        {max > 0 && <span className="text-muted" style={{ fontSize: Math.round(size * 0.14) }}>/{max}</span>}
      </div>
    </div>
  )

  if (s.motif === 'radar') {
    return (
      <div className="relative flex-none" style={{ width: size, height: size }}>
        <div className="absolute inset-0 rounded-full" style={{ background: `conic-gradient(var(--accent) 0deg ${deg}deg, color-mix(in srgb, var(--ink) 10%, transparent) ${deg}deg)` }} />
        <div className="absolute inset-0 rounded-full" style={{ background: 'repeating-conic-gradient(var(--bg0) 0deg 4deg, transparent 4deg 9deg)', mixBlendMode: 'multiply', opacity: 0.55 }} />
        <div
          className="rv-anim absolute inset-0 rounded-full"
          style={{ background: 'conic-gradient(transparent 0deg 318deg, color-mix(in srgb, var(--accent) 55%, transparent) 352deg, transparent 360deg)', animation: 'radar-sweep 4.5s linear infinite' }}
        />
        {center}
      </div>
    )
  }
  if (s.motif === 'fleuron') {
    return (
      <div className="relative flex-none" style={{ width: size, height: size }}>
        <div
          className="absolute inset-0 rounded-full"
          style={{ background: `conic-gradient(var(--primary) 0deg, var(--gold) ${deg}deg, color-mix(in srgb, var(--ink) 12%, transparent) ${deg}deg)`, boxShadow: '0 0 22px color-mix(in srgb, var(--primary) 32%, transparent)' }}
        />
        {center}
        <span aria-hidden className="absolute left-1/2 top-[-4px] -translate-x-1/2 text-[14px] leading-none" style={{ color: 'var(--accent)' }}>❦</span>
      </div>
    )
  }
  // neutral — clean SVG ring
  const r = (size - 9) / 2
  const C = 2 * Math.PI * r
  return (
    <div className="relative flex-none" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--chip-border)" strokeWidth="9" />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--primary)" strokeWidth="9" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - pct)} />
      </svg>
      <div className="absolute inset-0 grid place-items-center">{center}</div>
    </div>
  )
}

/** The decorative signature emblem (no value) — for empty states + section flourishes. Aphelion: a
 *  bracketed radar blip. Tryst: a gilt fleuron. Neutral: the skin's voice motif (passed in). */
export function SignatureEmblem({ fallback, size = 34, skin }: { fallback: string; size?: number; skin?: SkinId }) {
  const s = useStructure(skin)
  if (s.motif === 'radar') {
    return (
      <span className="relative inline-grid place-items-center" style={{ width: size, height: size, color: 'var(--accent)' }} aria-hidden>
        <span className="absolute inset-0 rounded-full" style={{ border: '1px solid color-mix(in srgb, var(--accent) 55%, transparent)' }} />
        <span className="absolute" style={{ inset: size * 0.28, borderRadius: '999px', border: '1px solid color-mix(in srgb, var(--accent) 40%, transparent)' }} />
        <span className="rounded-full" style={{ width: size * 0.16, height: size * 0.16, background: 'var(--accent)', boxShadow: '0 0 8px var(--accent)' }} />
      </span>
    )
  }
  if (s.motif === 'fleuron') {
    return (
      <span aria-hidden style={{ color: 'var(--accent)', fontSize: size * 0.8, fontFamily: 'var(--font-display)', lineHeight: 1 }}>
        ❦
      </span>
    )
  }
  return (
    <span aria-hidden style={{ color: 'var(--accent)', fontSize: size * 0.8, lineHeight: 1 }}>
      {fallback}
    </span>
  )
}
