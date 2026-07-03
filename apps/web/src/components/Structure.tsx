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
      {s.sectionRule === 'docket' && (
        <span aria-hidden className="skin-label text-[11px]" style={{ color: 'var(--muted)' }}>
          RE:
        </span>
      )}
      {s.sectionRule === 'double-rule' && (
        <span aria-hidden className="text-[13px] font-bold leading-none" style={{ color: 'var(--rubric)', fontFamily: 'var(--font-display)' }}>
          ¶
        </span>
      )}
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
      ) : s.sectionRule === 'double-rule' ? (
        <span aria-hidden className="flex flex-1 flex-col gap-[3px] self-center">
          <span style={{ height: 2, background: 'color-mix(in srgb, var(--gold) 55%, transparent)' }} />
          <span style={{ height: 1, background: 'color-mix(in srgb, var(--gold) 30%, transparent)' }} />
        </span>
      ) : s.sectionRule === 'fractured' ? (
        <span aria-hidden className="flex flex-1 items-center self-center">
          <span className="h-px flex-1" style={{ background: 'var(--line)', transform: 'translateY(-1px)' }} />
          <span className="h-px flex-1" style={{ background: 'var(--line)', transform: 'translateY(1px)' }} />
        </span>
      ) : s.sectionRule === 'docket' ? (
        <span aria-hidden className="h-px flex-1 self-center" style={{ background: 'color-mix(in srgb, var(--slate) 55%, transparent)' }} />
      ) : (
        <span aria-hidden className="h-px flex-1 self-center" style={{ background: 'var(--line)' }} />
      )}
      {readout != null && s.sectionRule === 'docket' ? (
        <span
          className="skin-numeral whitespace-nowrap px-1.5 py-0.5 text-[12px] font-bold"
          style={{ color: 'var(--accent-ink)', border: '1.5px solid color-mix(in srgb, var(--gold) 60%, transparent)', transform: 'rotate(-2deg)' }}
        >
          {readout}
        </span>
      ) : readout != null && s.sectionRule === 'fractured' ? (
        <span className="skin-numeral whitespace-nowrap text-[14px] font-semibold" style={{ color: 'var(--accent-ink)' }}>
          № {readout}
        </span>
      ) : readout != null ? (
        <span className="skin-numeral whitespace-nowrap text-[14px] font-semibold" style={{ color: 'var(--accent-ink)' }}>
          {readout}
        </span>
      ) : null}
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
  if (s.frame === 'illuminated-border') {
    // the illuminated border: outer gilt line, inset rule, filled gold squares at the inset corners
    return (
      <div className={`relative border ${className}`} style={{ borderRadius: 'var(--radius-panel)', borderColor: 'color-mix(in srgb, var(--gold) 40%, transparent)', background: 'var(--panel-fill)', ...style }}>
        <span aria-hidden className="pointer-events-none absolute inset-2" style={{ border: '1px solid color-mix(in srgb, var(--gold) 24%, transparent)' }} />
        {([['-3px', '-3px', 'auto', 'auto'], ['-3px', 'auto', 'auto', '-3px'], ['auto', '-3px', '-3px', 'auto'], ['auto', 'auto', '-3px', '-3px']] as const).map(
          ([top, right, bottom, left], i) => (
            <span
              key={i}
              aria-hidden
              className="pointer-events-none absolute"
              style={{
                width: 6,
                height: 6,
                background: 'var(--gold)',
                boxShadow: '0 0 0 1px rgba(0, 0, 0, 0.25)',
                top: top === 'auto' ? undefined : 8,
                right: right === 'auto' ? undefined : 8,
                bottom: bottom === 'auto' ? undefined : 8,
                left: left === 'auto' ? undefined : 8,
              }}
            />
          ),
        )}
        {children}
      </div>
    )
  }
  if (s.frame === 'chamfer-tray') {
    // the specimen tray: 45° chamfered corners, a bone line, a pasted № tab over the top edge
    const cham = 'polygon(8px 0, calc(100% - 8px) 0, 100% 8px, 100% calc(100% - 8px), calc(100% - 8px) 100%, 8px 100%, 0 calc(100% - 8px), 0 8px)'
    return (
      <div className={`relative ${className}`} style={{ clipPath: cham, background: 'var(--panel-fill)', boxShadow: 'inset 0 0 0 1px color-mix(in srgb, var(--ink) 22%, transparent)', ...style }}>
        <span
          aria-hidden
          className="pointer-events-none absolute right-4 top-0 px-1.5 py-0.5 text-[9px] font-bold uppercase"
          style={{ background: 'var(--paper)', color: 'var(--paper-ink)', boxShadow: '0 1px 3px rgba(0, 0, 0, 0.35)', fontFamily: 'var(--font-sans)', letterSpacing: '0.08em' }}
        >
          № {String(Math.abs([...String(children)].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) | 0, 7)) % 9000 + 1000).padStart(4, '0')}
        </span>
        {children}
      </div>
    )
  }
  if (s.frame === 'case-folder') {
    // the case folder: a typed tab riding the top edge, one slate line, opaque folder fill
    return (
      <div className={`relative mt-5 ${className}`} style={{ borderRadius: 'var(--radius-panel)', border: '1px solid color-mix(in srgb, var(--slate) 45%, transparent)', background: 'var(--panel-fill)', ...style }}>
        <span
          aria-hidden
          className="pointer-events-none absolute left-4 top-[-21px] flex h-[21px] items-center px-2.5 text-[9px] font-bold uppercase"
          style={{
            background: 'var(--panel-fill)',
            border: '1px solid color-mix(in srgb, var(--slate) 45%, transparent)',
            borderBottom: 'none',
            borderRadius: '6px 6px 0 0',
            color: 'var(--muted)',
            fontFamily: 'var(--font-mono)',
            letterSpacing: '0.1em',
          }}
        >
          Case file
        </span>
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
  if (s.tag === 'lozenge') {
    // the illuminator's marks — set on point (a lozenge leads, the chip is cut vellum)
    return (
      <span className="inline-flex items-center gap-1.5 border px-2 py-1 text-[11px] font-semibold" style={{ borderRadius: '2px', borderColor: border, color }}>
        <span aria-hidden style={{ width: 6, height: 6, background: 'var(--accent)', transform: 'rotate(45deg)', boxShadow: '0 0 0 1px rgba(0, 0, 0, 0.2)' }} />
        {glyph != null && <span style={{ color: 'var(--accent)' }}>{glyph}</span>}
        {children}
      </span>
    )
  }
  if (s.tag === 'chamfer-chip') {
    const cham = 'polygon(5px 0, calc(100% - 5px) 0, 100% 5px, 100% calc(100% - 5px), calc(100% - 5px) 100%, 5px 100%, 0 calc(100% - 5px), 0 5px)'
    return (
      <span
        className="inline-flex items-center gap-1 px-2.5 py-1 text-[10.5px] font-bold uppercase"
        style={{ clipPath: cham, background: 'color-mix(in srgb, var(--ink) 8%, transparent)', boxShadow: 'inset 0 0 0 1px color-mix(in srgb, var(--ink) 20%, transparent)', color, letterSpacing: '0.1em', fontFamily: 'var(--font-sans)' }}
      >
        {glyph != null && <span style={{ color: 'var(--accent-ink)' }}>{glyph}</span>}
        {children}
      </span>
    )
  }
  if (s.tag === 'stamp-ring') {
    // rubber-stamped, landed a degree or two off true
    return (
      <span
        className="inline-flex items-center gap-1 px-2.5 py-1 text-[10.5px] font-bold uppercase"
        style={{ borderRadius: '999px', border: `1.5px solid ${border}`, color, letterSpacing: '0.1em', fontFamily: 'var(--font-mono)', transform: 'rotate(-2deg)' }}
      >
        {glyph != null && <span style={{ color: 'var(--accent-ink)' }}>{glyph}</span>}
        {children}
      </span>
    )
  }
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
  if (s.progress === 'tally') {
    // tally strokes in groups of five — gilded as they're earned; every fifth crosses its group
    const total = 15
    const filled = Math.round(pct * total)
    return (
      <div className={`flex items-center gap-[3px] ${className}`} aria-hidden>
        {Array.from({ length: total }, (_, i) => {
          const fifth = (i + 1) % 5 === 0
          return (
            <span
              key={i}
              style={{
                width: fifth ? 9 : 1.5,
                height: fifth ? 1.5 : 10,
                marginLeft: fifth ? -11 : 0,
                transform: fifth ? 'rotate(-24deg)' : 'none',
                background: i < filled ? 'var(--gold)' : 'color-mix(in srgb, var(--ink) 30%, transparent)',
              }}
            />
          )
        })}
      </div>
    )
  }
  if (s.progress === 'vertebrae') {
    // the house counts in bone — twelve vertebrae, alternating tall and short
    const total = 12
    const filled = Math.round(pct * total)
    return (
      <div className={`flex items-center gap-[3px] ${className}`} aria-hidden>
        {Array.from({ length: total }, (_, i) => (
          <span
            key={i}
            style={{
              width: 5,
              height: i % 2 === 0 ? 11 : 7,
              borderRadius: 2,
              background: i < filled ? 'var(--ink)' : 'transparent',
              border: i < filled ? undefined : '1px solid color-mix(in srgb, var(--ink) 35%, transparent)',
            }}
          />
        ))}
      </div>
    )
  }
  if (s.progress === 'thread-board') {
    // the case board — twelve tacks, the red thread strung between the ones you've reached
    const total = 12
    const filled = Math.round(pct * total)
    return (
      <div className={`relative flex items-center ${className}`} style={{ gap: 7 }} aria-hidden>
        {filled > 1 && (
          <span
            className="absolute"
            style={{ left: 3, width: (filled - 1) * 12, height: 1.5, top: '50%', transform: 'translateY(-50%) rotate(-0.6deg)', background: 'var(--thread)', boxShadow: '0 1px 1px rgba(0, 0, 0, 0.3)' }}
          />
        )}
        {Array.from({ length: total }, (_, i) => (
          <span
            key={i}
            className="relative rounded-full"
            style={{
              width: 5,
              height: 5,
              background: i < filled ? 'var(--gold)' : 'color-mix(in srgb, var(--ink) 22%, transparent)',
              boxShadow: i < filled ? 'inset 0 -1px 1px rgba(0, 0, 0, 0.4), 0 1px 1px rgba(0, 0, 0, 0.3)' : undefined,
            }}
          />
        ))}
      </div>
    )
  }
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
  if (s.motif === 'fleuron' || s.motif === 'sigil' || s.motif === 'window') {
    // a warm conic ring crowned by the skin's emblem (❦ seal · ❖ sigil · the lit window)
    const crown = s.motif === 'fleuron' ? '❦' : s.motif === 'sigil' ? '❖' : null
    return (
      <div className="relative flex-none" style={{ width: size, height: size }}>
        <div
          className="absolute inset-0 rounded-full"
          style={{ background: `conic-gradient(var(--primary) 0deg, var(--gold) ${deg}deg, color-mix(in srgb, var(--ink) 12%, transparent) ${deg}deg)`, boxShadow: '0 0 22px color-mix(in srgb, var(--primary) 32%, transparent)' }}
        />
        {center}
        {crown ? (
          <span aria-hidden className="absolute left-1/2 top-[-4px] -translate-x-1/2 text-[14px] leading-none" style={{ color: 'var(--accent)' }}>{crown}</span>
        ) : (
          <span aria-hidden className="absolute left-1/2 top-[-5px] grid -translate-x-1/2 grid-cols-2 gap-[1px] p-[1px]" style={{ width: 12, height: 12, background: 'color-mix(in srgb, var(--ink) 55%, transparent)' }}>
            {[0, 1, 2, 3].map((i) => (
              <span key={i} style={{ background: 'var(--gold)', boxShadow: '0 0 4px var(--gold)' }} />
            ))}
          </span>
        )}
      </div>
    )
  }
  if (s.motif === 'crack') {
    // the house settles — a bone ring, its stroke fractured at the head
    return (
      <div className="relative flex-none" style={{ width: size, height: size }}>
        <div
          className="absolute inset-0 rounded-full"
          style={{ background: `conic-gradient(var(--ink) 0deg ${deg}deg, color-mix(in srgb, var(--ink) 14%, transparent) ${deg}deg)` }}
        />
        <span aria-hidden className="absolute left-1/2 top-0 h-[10px] w-px -translate-x-1/2" style={{ background: 'var(--bg0)', transform: 'translateX(-50%) rotate(8deg)' }} />
        {center}
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
  if (s.motif === 'sigil') {
    // the gilt sigil — a quatrefoil in a double-ruled lozenge, compass-pointed in rubric
    return (
      <span className="relative inline-grid place-items-center" style={{ width: size, height: size }} aria-hidden>
        <span className="absolute" style={{ inset: 1, border: '1px solid color-mix(in srgb, var(--gold) 60%, transparent)', transform: 'rotate(45deg)' }} />
        <span className="absolute" style={{ inset: size * 0.14, border: '1px solid color-mix(in srgb, var(--gold) 32%, transparent)', transform: 'rotate(45deg)' }} />
        <span className="absolute left-1/2 top-[-2px] -translate-x-1/2 rounded-full" style={{ width: 3, height: 3, background: 'var(--rubric)' }} />
        <span className="rv-anim" style={{ color: 'var(--gold)', fontSize: size * 0.5, fontFamily: 'var(--font-display)', lineHeight: 1, animation: 'gleam 7s ease-in-out infinite' }}>
          ❖
        </span>
      </span>
    )
  }
  if (s.motif === 'crack') {
    // the hairline crack — drawn once, then the house settles (reduced motion shows it complete)
    return (
      <svg width={size} height={size} viewBox="0 0 34 34" aria-hidden className="rv-anim" style={{ color: 'var(--ink)' }}>
        <path
          d="M17 2 L16 9 L19 13 L15 18 L18 23 L14 27 L16 32"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.2"
          strokeLinecap="round"
          pathLength={100}
          style={{ strokeDasharray: 100, strokeDashoffset: 0, animation: 'crackdraw 9s ease-out 1' }}
        />
        <path d="M16 9 L12 11 M18 23 L22 24" fill="none" stroke="currentColor" strokeWidth="0.8" opacity="0.6" />
      </svg>
    )
  }
  if (s.motif === 'window') {
    // the yellow window — one window, four panes, lit from inside; fog crosses it on .rv-anim
    return (
      <span className="relative inline-grid grid-cols-2 gap-[2px] overflow-hidden p-[2px]" style={{ width: size * 0.82, height: size, background: 'color-mix(in srgb, var(--ink) 45%, var(--bg0))', borderRadius: 1 }} aria-hidden>
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className="rv-anim" style={{ background: 'var(--gold)', boxShadow: 'inset 0 0 6px color-mix(in srgb, var(--gold) 60%, #fff)', animation: 'flick 7s ease-in-out infinite' }} />
        ))}
        <span
          className="rv-anim absolute inset-0"
          style={{ background: 'linear-gradient(100deg, transparent 20%, color-mix(in srgb, var(--bg0) 55%, transparent) 45%, transparent 70%)', filter: 'blur(3px)', animation: 'fogdrift 11s ease-in-out infinite alternate' }}
        />
      </span>
    )
  }
  return (
    <span aria-hidden style={{ color: 'var(--accent)', fontSize: size * 0.8, lineHeight: 1 }}>
      {fallback}
    </span>
  )
}
