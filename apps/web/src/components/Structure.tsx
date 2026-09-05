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
        <span
          aria-hidden
          className="text-[13px] font-bold leading-none"
          style={{ color: 'var(--rubric)', fontFamily: 'var(--font-display)' }}
        >
          ¶
        </span>
      )}
      {s.sectionRule === 'caret-rule' && (
        <span
          aria-hidden
          className="text-[15px] font-bold leading-none"
          style={{ color: 'var(--accent-fill)', fontFamily: 'var(--font-display)' }}
        >
          ‸
        </span>
      )}
      {s.sectionRule === 'stitched' && (
        <span
          aria-hidden
          className="h-3 w-3 flex-none self-center rounded-full"
          style={{
            background: 'radial-gradient(circle at 35% 30%, var(--gold), var(--gold-deep))',
            boxShadow: '0 1px 2px rgba(0, 0, 0, 0.4)',
          }}
        />
      )}
      {s.sectionRule === 'index-rule' && (
        <span
          aria-hidden
          className="w-1 flex-none self-center"
          style={{ height: 15, background: 'var(--accent)' }}
        />
      )}
      {s.sectionRule === 'dotted' && (
        <span
          aria-hidden
          className="text-[14px] leading-none"
          style={{ color: 'var(--accent-ink)' }}
        >
          ✦
        </span>
      )}
      <span className="skin-label whitespace-nowrap text-[14px] text-ink">{label}</span>
      {s.sectionRule === 'tick-rule' ? (
        <span
          aria-hidden
          className="h-px flex-1 self-center"
          style={{
            backgroundImage:
              'repeating-linear-gradient(90deg, color-mix(in srgb, var(--accent) 45%, transparent) 0 1px, transparent 1px 7px)',
          }}
        />
      ) : s.sectionRule === 'fleuron' ? (
        <span
          aria-hidden
          className="flex flex-1 items-center gap-2 self-center"
          style={{ color: 'var(--accent)' }}
        >
          <span
            className="h-px flex-1"
            style={{
              background:
                'linear-gradient(90deg, transparent, color-mix(in srgb, var(--accent) 50%, transparent))',
            }}
          />
          <span className="text-[13px] leading-none" style={{ fontFamily: 'var(--font-display)' }}>
            ❦
          </span>
          <span
            className="h-px flex-1"
            style={{
              background:
                'linear-gradient(90deg, color-mix(in srgb, var(--accent) 50%, transparent), transparent)',
            }}
          />
        </span>
      ) : s.sectionRule === 'double-rule' ? (
        <span aria-hidden className="flex flex-1 flex-col gap-[3px] self-center">
          <span
            style={{ height: 2, background: 'color-mix(in srgb, var(--gold) 55%, transparent)' }}
          />
          <span
            style={{ height: 1, background: 'color-mix(in srgb, var(--gold) 30%, transparent)' }}
          />
        </span>
      ) : s.sectionRule === 'fractured' ? (
        <span aria-hidden className="flex flex-1 items-center self-center">
          <span
            className="h-px flex-1"
            style={{ background: 'var(--line)', transform: 'translateY(-1px)' }}
          />
          <span
            className="h-px flex-1"
            style={{ background: 'var(--line)', transform: 'translateY(1px)' }}
          />
        </span>
      ) : s.sectionRule === 'docket' ? (
        <span
          aria-hidden
          className="h-px flex-1 self-center"
          style={{ background: 'color-mix(in srgb, var(--slate) 55%, transparent)' }}
        />
      ) : s.sectionRule === 'caret-rule' ? (
        <span
          aria-hidden
          className="h-px flex-1 self-center"
          style={{ background: 'color-mix(in srgb, var(--gold) 55%, transparent)' }}
        />
      ) : s.sectionRule === 'stitched' ? (
        <span
          aria-hidden
          className="flex-1 self-center"
          style={{
            height: 2,
            backgroundImage:
              'repeating-linear-gradient(90deg, var(--thread) 0 6px, transparent 6px 11px)',
            opacity: 0.55,
            borderRadius: 2,
          }}
        />
      ) : s.sectionRule === 'index-rule' ? (
        <span
          aria-hidden
          className="flex-1 self-center"
          style={{
            height: 4,
            borderTop: '1px solid color-mix(in srgb, var(--ink) 60%, transparent)',
            borderBottom: '1px solid color-mix(in srgb, var(--ink) 60%, transparent)',
          }}
        />
      ) : s.sectionRule === 'dotted' ? (
        <span
          aria-hidden
          className="flex-1 self-center"
          style={{
            height: 2,
            backgroundImage:
              'repeating-linear-gradient(90deg, color-mix(in srgb, var(--muted) 80%, transparent) 0 2px, transparent 2px 8px)',
            opacity: 0.9,
          }}
        />
      ) : (
        <span
          aria-hidden
          className="h-px flex-1 self-center"
          style={{ background: 'var(--line)' }}
        />
      )}
      {readout != null && s.sectionRule === 'docket' ? (
        <span
          className="skin-numeral whitespace-nowrap px-1.5 py-0.5 text-[12px] font-bold"
          style={{
            color: 'var(--accent-ink)',
            border: '1.5px solid color-mix(in srgb, var(--gold) 60%, transparent)',
            transform: 'rotate(-2deg)',
          }}
        >
          {readout}
        </span>
      ) : readout != null && s.sectionRule === 'fractured' ? (
        <span
          className="skin-numeral whitespace-nowrap text-[14px] font-semibold"
          style={{ color: 'var(--accent-ink)' }}
        >
          № {readout}
        </span>
      ) : readout != null && (s.sectionRule === 'caret-rule' || s.sectionRule === 'stitched') ? (
        // pencil / thread counts read quiet, not accented (the sheet sets them in pencil + Varela)
        <span
          className="skin-numeral whitespace-nowrap text-[14px] font-semibold"
          style={{ color: 'var(--muted)' }}
        >
          {readout}
        </span>
      ) : readout != null && s.sectionRule === 'index-rule' ? (
        <span
          className="skin-numeral whitespace-nowrap text-[13px] font-bold"
          style={{ color: 'var(--ink)' }}
        >
          {readout}
        </span>
      ) : readout != null ? (
        <span
          className="skin-numeral whitespace-nowrap text-[14px] font-semibold"
          style={{ color: 'var(--accent-ink)' }}
        >
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
      <div
        className={`relative border border-line ${className}`}
        style={{ borderRadius: 'var(--radius-panel)', background: 'var(--panel-fill)', ...style }}
      >
        <CornerBrackets inset={0} len={11} />
        {children}
      </div>
    )
  }
  if (s.frame === 'illuminated-border') {
    // the illuminated border: outer gilt line, inset rule, filled gold squares at the inset corners
    return (
      <div
        className={`relative border ${className}`}
        style={{
          borderRadius: 'var(--radius-panel)',
          borderColor: 'color-mix(in srgb, var(--gold) 40%, transparent)',
          background: 'var(--panel-fill)',
          ...style,
        }}
      >
        <span
          aria-hidden
          className="pointer-events-none absolute inset-2"
          style={{ border: '1px solid color-mix(in srgb, var(--gold) 24%, transparent)' }}
        />
        {(
          [
            ['-3px', '-3px', 'auto', 'auto'],
            ['-3px', 'auto', 'auto', '-3px'],
            ['auto', '-3px', '-3px', 'auto'],
            ['auto', 'auto', '-3px', '-3px'],
          ] as const
        ).map(([top, right, bottom, left], i) => (
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
        ))}
        {children}
      </div>
    )
  }
  if (s.frame === 'chamfer-tray') {
    // the specimen tray: 45° chamfered corners, a bone line, a pasted № tab over the top edge
    const cham =
      'polygon(8px 0, calc(100% - 8px) 0, 100% 8px, 100% calc(100% - 8px), calc(100% - 8px) 100%, 8px 100%, 0 calc(100% - 8px), 0 8px)'
    return (
      <div
        className={`relative ${className}`}
        style={{
          clipPath: cham,
          background: 'var(--panel-fill)',
          boxShadow: 'inset 0 0 0 1px color-mix(in srgb, var(--ink) 22%, transparent)',
          ...style,
        }}
      >
        <span
          aria-hidden
          className="pointer-events-none absolute right-4 top-0 px-1.5 py-0.5 text-[9px] font-bold uppercase"
          style={{
            background: 'var(--paper)',
            color: 'var(--paper-ink)',
            boxShadow: '0 1px 3px rgba(0, 0, 0, 0.35)',
            fontFamily: 'var(--font-sans)',
            letterSpacing: '0.08em',
          }}
        >
          №{' '}
          {String(
            (Math.abs([...String(children)].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) | 0, 7)) %
              9000) +
              1000,
          ).padStart(4, '0')}
        </span>
        {children}
      </div>
    )
  }
  if (s.frame === 'case-folder') {
    // the case folder: a typed tab riding the top edge, one slate line, opaque folder fill
    return (
      <div
        className={`relative mt-5 ${className}`}
        style={{
          borderRadius: 'var(--radius-panel)',
          border: '1px solid color-mix(in srgb, var(--slate) 45%, transparent)',
          background: 'var(--panel-fill)',
          ...style,
        }}
      >
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
  if (s.frame === 'margin-rule') {
    // the manuscript leaf: opaque bond, no border (the desk shows at the edges), the red margin
    // rule down the left, a blue-pencil query at trace scale in the corner
    return (
      <div
        className={`relative overflow-hidden ${className}`}
        style={{
          borderRadius: 'var(--radius-panel)',
          background: 'var(--paper)',
          boxShadow: 'var(--shadow)',
          ...style,
        }}
      >
        <span
          aria-hidden
          className="pointer-events-none absolute bottom-0 top-0"
          style={{
            left: 14,
            width: 1,
            background: 'color-mix(in srgb, var(--accent-fill) 50%, transparent)',
          }}
        />
        <span
          aria-hidden
          className="pointer-events-none absolute right-3 top-2 text-[12px] leading-none"
          style={{
            fontFamily: 'var(--font-hand)',
            color: 'var(--muted)',
            transform: 'rotate(-4deg)',
          }}
        >
          clarify?
        </span>
        {children}
      </div>
    )
  }
  if (s.frame === 'stitched-inset') {
    // the placemat: an opaque linen card, the thread frame stitched just inside the edge
    return (
      <div
        className={`relative ${className}`}
        style={{
          borderRadius: 'var(--radius-panel)',
          background: 'var(--panel-fill)',
          boxShadow: 'var(--shadow)',
          ...style,
        }}
      >
        <span
          aria-hidden
          className="pointer-events-none absolute"
          style={{
            inset: 8,
            borderRadius: 'calc(var(--radius-panel) - 5px)',
            border: '2px dashed color-mix(in srgb, var(--thread) 60%, transparent)',
          }}
        />
        {children}
      </div>
    )
  }
  if (s.frame === 'record-card') {
    // the record card: opaque buff stock, a double rule at the foot, the tab off the right edge
    return (
      <div
        className={`relative ${className}`}
        style={{
          borderRadius: 'var(--radius-panel)',
          background: 'var(--panel-fill)',
          boxShadow: 'var(--shadow)',
          ...style,
        }}
      >
        <span
          aria-hidden
          className="pointer-events-none absolute"
          style={{
            right: -6,
            top: '24%',
            width: 6,
            height: 30,
            background: 'var(--accent)',
            borderRadius: '0 3px 3px 0',
            boxShadow: '1px 1px 3px rgba(0, 0, 0, 0.3)',
          }}
        />
        <span
          aria-hidden
          className="pointer-events-none absolute bottom-2 left-4 right-4"
          style={{
            height: 4,
            borderTop: '1px solid var(--ornament-frame)',
            borderBottom: '1px solid var(--ornament-frame)',
          }}
        />
        {children}
      </div>
    )
  }
  if (s.frame === 'sticker-ring') {
    // the sticker card: opaque white in BOTH modes, the 3px ring is the border — nothing else
    // outlines it. Re-scope the opaque control surface with the ink: pairing paper ink with the
    // root dark-mode card surface made secondary controls dark-on-dark inside Bloom's night sticker.
    const stickerVars = {
      '--ink': 'var(--paper-ink)',
      '--muted': 'var(--ph-muted)',
      '--accent-ink': 'var(--accent-fill)',
      '--card-solid': 'var(--paper)',
    } as CSSProperties
    return (
      <div
        className={`relative ${className}`}
        style={{
          ...stickerVars,
          borderRadius: 'var(--radius-panel)',
          background: 'var(--paper)',
          color: 'var(--paper-ink)',
          boxShadow: '0 0 0 3px var(--ornament-frame), var(--shadow)',
          ...style,
        }}
      >
        {children}
      </div>
    )
  }
  if (s.frame === 'gilt-plate') {
    return (
      <div className={`skin-plate relative ${className}`} style={style}>
        <span
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-[-2px] -translate-x-1/2 text-[13px] leading-none"
          style={{ color: 'var(--accent)' }}
        >
          ❦
        </span>
        {children}
      </div>
    )
  }
  return (
    <div
      className={`relative border border-line ${className}`}
      style={{ borderRadius: 'var(--radius-panel)', background: 'var(--card-solid)', ...style }}
    >
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
  const border =
    tone === 'accent' ? 'color-mix(in srgb, var(--accent) 50%, transparent)' : 'var(--line)'
  if (s.tag === 'lozenge') {
    // the illuminator's marks — set on point (a lozenge leads, the chip is cut vellum)
    return (
      <span
        className="inline-flex min-h-8 items-center gap-1.5 border px-2.5 py-1 text-[12.5px] font-semibold"
        style={{ borderRadius: '2px', borderColor: border, color }}
      >
        <span
          aria-hidden
          style={{
            width: 6,
            height: 6,
            background: 'var(--accent)',
            transform: 'rotate(45deg)',
            boxShadow: '0 0 0 1px rgba(0, 0, 0, 0.2)',
          }}
        />
        {glyph != null && <span style={{ color: 'var(--accent)' }}>{glyph}</span>}
        {children}
      </span>
    )
  }
  if (s.tag === 'chamfer-chip') {
    const cham =
      'polygon(5px 0, calc(100% - 5px) 0, 100% 5px, 100% calc(100% - 5px), calc(100% - 5px) 100%, 5px 100%, 0 calc(100% - 5px), 0 5px)'
    return (
      <span
        className="inline-flex min-h-8 items-center gap-1 px-2.5 py-1 text-[12px] font-bold uppercase"
        style={{
          clipPath: cham,
          background: 'color-mix(in srgb, var(--ink) 8%, transparent)',
          boxShadow: 'inset 0 0 0 1px color-mix(in srgb, var(--ink) 20%, transparent)',
          color,
          letterSpacing: '0.075em',
          fontFamily: 'var(--font-sans)',
        }}
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
        className="inline-flex min-h-8 items-center gap-1 px-2.5 py-1 text-[12px] font-bold uppercase"
        style={{
          borderRadius: '999px',
          border: `1.5px solid ${border}`,
          color,
          letterSpacing: '0.075em',
          fontFamily: 'var(--font-mono)',
          transform: 'rotate(-2deg)',
        }}
      >
        {glyph != null && <span style={{ color: 'var(--accent-ink)' }}>{glyph}</span>}
        {children}
      </span>
    )
  }
  if (s.tag === 'drawn-mark') {
    // proof marks in the margin — drawn, never boxed: the glyph in the margin hand, the label
    // italic Garamond over its own red underline (set a degree off true)
    return (
      <span
        className="relative inline-flex min-h-8 items-center gap-1.5 px-1 text-[13px]"
        style={{
          fontFamily: 'var(--font-display)',
          fontStyle: 'italic',
          fontWeight: 600,
          color: tone === 'accent' ? 'var(--ink)' : 'var(--muted)',
        }}
      >
        {glyph != null && (
          <span
            style={{
              fontFamily: 'var(--font-hand)',
              fontStyle: 'normal',
              color: 'var(--accent-fill)',
            }}
          >
            {glyph}
          </span>
        )}
        {children}
        {tone === 'accent' && (
          <span
            aria-hidden
            className="absolute bottom-[-1px] left-0 right-0"
            style={{ height: 1.5, background: 'var(--accent-fill)', transform: 'rotate(-1deg)' }}
          />
        )}
      </span>
    )
  }
  if (s.tag === 'jar-label') {
    // sewn and stuck, never printed — a jar label with dashed-thread stitching
    return (
      <span
        className="inline-flex min-h-8 items-center gap-1 px-3 py-1 text-[12.5px] font-bold"
        style={{
          borderRadius: 8,
          background: 'color-mix(in srgb, var(--ink) 8%, transparent)',
          border: '1.5px dashed color-mix(in srgb, var(--thread) 55%, transparent)',
          color,
          letterSpacing: '0.06em',
          fontFamily: 'var(--font-sans)',
        }}
      >
        {glyph != null && <span style={{ color: 'var(--accent-ink)' }}>{glyph}</span>}
        {children}
      </span>
    )
  }
  if (s.tag === 'index-tab') {
    // an index tab racked off the edge — squared, 3px outer radius, boxed (the one skin allowed)
    return (
      <span
        className="inline-flex min-h-8 items-center gap-1 px-2.5 py-1 text-[12px] font-bold uppercase"
        style={{
          borderRadius: '2px 6px 6px 2px',
          border: `1.5px solid ${border}`,
          color,
          letterSpacing: '0.08em',
          fontFamily: 'var(--font-sans)',
        }}
      >
        {glyph != null && <span style={{ color: 'var(--accent-ink)' }}>{glyph}</span>}
        {children}
      </span>
    )
  }
  if (s.tag === 'puffy-sticker') {
    // a puffy sticker — white, gel-ringed, fully round
    return (
      <span
        className="inline-flex min-h-8 items-center gap-1 px-3 py-1 text-[12.5px] font-bold"
        style={{
          borderRadius: 999,
          background: 'var(--paper)',
          color: 'var(--paper-ink)',
          boxShadow: `0 0 0 2px color-mix(in srgb, var(--accent-fill) ${tone === 'accent' ? '45%' : '25%'}, transparent), 0 2px 6px rgba(40, 40, 80, 0.18)`,
          fontFamily: 'var(--font-sans)',
        }}
      >
        {glyph != null && <span style={{ color: 'var(--accent-fill)' }}>{glyph}</span>}
        {children}
      </span>
    )
  }
  if (s.tag === 'squared-bracket') {
    return (
      <span
        className="skin-label inline-flex min-h-8 items-center gap-1 border px-2.5 py-1 text-[12px]"
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
      className="inline-flex min-h-8 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12.5px] font-semibold"
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
                background:
                  i < filled ? 'var(--gold)' : 'color-mix(in srgb, var(--ink) 30%, transparent)',
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
              border:
                i < filled
                  ? undefined
                  : '1px solid color-mix(in srgb, var(--ink) 35%, transparent)',
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
            style={{
              left: 3,
              width: (filled - 1) * 12,
              height: 1.5,
              top: '50%',
              transform: 'translateY(-50%) rotate(-0.6deg)',
              background: 'var(--thread)',
              boxShadow: '0 1px 1px rgba(0, 0, 0, 0.3)',
            }}
          />
        )}
        {Array.from({ length: total }, (_, i) => (
          <span
            key={i}
            className="relative rounded-full"
            style={{
              width: 5,
              height: 5,
              background:
                i < filled ? 'var(--gold)' : 'color-mix(in srgb, var(--ink) 22%, transparent)',
              boxShadow:
                i < filled
                  ? 'inset 0 -1px 1px rgba(0, 0, 0, 0.4), 0 1px 1px rgba(0, 0, 0, 0.3)'
                  : undefined,
            }}
          />
        ))}
      </div>
    )
  }
  if (s.progress === 'page-lines') {
    // lines of a page filling in — the rule takes graphite as it's read; the full page earns the
    // red caret. (The sheet's 12-line leaf, set at meter scale: one written line per twelfth.)
    const total = 12
    const filled = Math.round(pct * total)
    return (
      <div className={`flex items-center gap-[4px] ${className}`} aria-hidden>
        {Array.from({ length: total }, (_, i) => (
          <span
            key={i}
            style={{
              width: 10,
              height: i < filled ? 3 : 0,
              borderRadius: 2,
              background: i < filled ? 'var(--ink)' : 'transparent',
              borderBottom:
                i < filled
                  ? undefined
                  : '1px solid color-mix(in srgb, var(--gold) 75%, transparent)',
            }}
          />
        ))}
        {pct >= 1 && (
          <span
            className="text-[13px] font-bold leading-none"
            style={{ color: 'var(--accent-fill)', fontFamily: 'var(--font-display)' }}
          >
            ‸
          </span>
        )}
      </div>
    )
  }
  if (s.progress === 'cross-stitch') {
    // a hem filling with cross-stitches — jam thread on linen; the finished hem gets its button
    const total = 12
    const filled = Math.round(pct * total)
    return (
      <div className={`flex items-center gap-[5px] ${className}`} aria-hidden>
        {Array.from({ length: total }, (_, i) =>
          i < filled ? (
            <span
              key={i}
              className="text-[11px] font-bold leading-none"
              style={{
                color: 'var(--accent-ink)',
                fontFamily: 'var(--font-sans)',
                transform: i % 2 ? 'rotate(6deg)' : 'rotate(-5deg)',
              }}
            >
              ✕
            </span>
          ) : (
            <span
              key={i}
              className="rounded-full"
              style={{ width: 4, height: 4, background: 'var(--thread)', opacity: 0.5 }}
            />
          ),
        )}
        {pct >= 1 && (
          <span
            className="rounded-full"
            style={{
              width: 11,
              height: 11,
              marginLeft: 2,
              background: 'radial-gradient(circle at 35% 30%, var(--gold), var(--gold-deep))',
              boxShadow: '0 1px 2px rgba(0, 0, 0, 0.4)',
            }}
          />
        )}
      </div>
    )
  }
  if (s.progress === 'rule-ticks') {
    // the measuring rule — ink advances along a tick scale, the orange pointer marks where you are
    return (
      <div
        className={`relative flex flex-col gap-[3px] ${className}`}
        style={{ width: 132 }}
        aria-hidden
      >
        <div className="flex items-end justify-between">
          {Array.from({ length: 13 }, (_, i) => (
            <span
              key={i}
              style={{
                width: 1,
                height: i % 3 === 0 ? 8 : 5,
                background: 'var(--ink)',
                opacity: i % 3 === 0 ? 0.75 : 0.4,
              }}
            />
          ))}
        </div>
        <div
          className="relative"
          style={{
            height: 6,
            borderRadius: 1,
            background: 'color-mix(in srgb, var(--ink) 16%, transparent)',
          }}
        >
          {pct > 0 && (
            <span
              className="absolute bottom-0 left-0 top-0"
              style={{
                width: `${Math.round(pct * 100)}%`,
                borderRadius: 1,
                background: 'var(--ink)',
              }}
            />
          )}
          <span
            className="absolute"
            style={{
              left: `calc(${Math.round(pct * 100)}% - 5px)`,
              top: -5,
              width: 10,
              height: 8,
              background: 'var(--accent)',
              clipPath: 'polygon(50% 100%, 0 0, 100% 0)',
            }}
          />
        </div>
      </div>
    )
  }
  if (s.progress === 'sun-rise') {
    // the sun climbs the card — below the horizon at zero, cresting at half, risen at done. The
    // horizon line never moves. (The sheet's altitude meter, set inline.)
    const rise = Math.round(pct * 14) // px of climb
    return (
      <div
        className={`relative overflow-hidden ${className}`}
        style={{ width: 118, height: 22 }}
        aria-hidden
      >
        <span
          className="absolute left-0 right-0"
          style={{
            bottom: 7,
            height: 1.5,
            background: 'color-mix(in srgb, var(--muted) 70%, transparent)',
          }}
        />
        <span
          className="absolute rounded-full"
          style={{
            left: '50%',
            transform: 'translateX(-50%)',
            bottom: rise - 7,
            width: 13,
            height: 13,
            background: 'radial-gradient(circle at 40% 35%, #ffe2a0, var(--gold))',
            boxShadow: `0 0 ${pct >= 1 ? 12 : 8}px var(--gold)`,
            opacity: pct <= 0 ? 0.45 : 1,
          }}
        />
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
              border:
                i < filled
                  ? undefined
                  : '1px solid color-mix(in srgb, var(--accent) 40%, transparent)',
            }}
          />
        ))}
      </div>
    )
  }
  return (
    <div
      className={`h-1.5 overflow-hidden rounded-full ${className}`}
      style={{ background: 'var(--chip)' }}
      aria-hidden
    >
      <div
        className="h-full rounded-full"
        style={{ width: `${Math.round(pct * 100)}%`, background: 'var(--primary)' }}
      />
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
  const centerSurface = s.motif === 'sun' ? 'var(--paper)' : 'var(--card-solid)'
  const centerInk = s.motif === 'sun' ? 'var(--paper-ink)' : 'var(--ink)'
  const center = (
    <div
      className="absolute grid place-items-center rounded-full"
      style={{
        inset: Math.round(size * 0.09),
        background: centerSurface,
        border: s.motif === 'radar' ? '1px solid var(--line)' : undefined,
      }}
    >
      <div className="text-center leading-none">
        <span
          className="skin-numeral font-bold"
          style={{ color: centerInk, fontSize: Math.round(size * 0.23) }}
        >
          {value}
        </span>
        {max > 0 && (
          <span style={{ color: centerInk, fontSize: Math.round(size * 0.14) }}>/{max}</span>
        )}
      </div>
    </div>
  )

  if (s.motif === 'radar') {
    return (
      <div className="relative flex-none" style={{ width: size, height: size }}>
        <div
          className="absolute inset-0 rounded-full"
          style={{
            background: `conic-gradient(var(--accent) 0deg ${deg}deg, color-mix(in srgb, var(--ink) 10%, transparent) ${deg}deg)`,
          }}
        />
        <div
          className="absolute inset-0 rounded-full"
          style={{
            background: 'repeating-conic-gradient(var(--bg0) 0deg 4deg, transparent 4deg 9deg)',
            mixBlendMode: 'multiply',
            opacity: 0.55,
          }}
        />
        <div
          className="rv-anim absolute inset-0 rounded-full"
          style={{
            background:
              'conic-gradient(transparent 0deg 318deg, color-mix(in srgb, var(--accent) 55%, transparent) 352deg, transparent 360deg)',
            animation: 'radar-sweep 4.5s linear infinite',
          }}
        />
        {center}
      </div>
    )
  }
  if (s.motif === 'caret') {
    // the editor's count — a graphite ring, proof-red to the mark, the caret at the head
    return (
      <div className="relative flex-none" style={{ width: size, height: size }}>
        <div
          className="absolute inset-0 rounded-full"
          style={{
            background: `conic-gradient(var(--accent-fill) 0deg ${deg}deg, color-mix(in srgb, var(--gold) 45%, transparent) ${deg}deg)`,
          }}
        />
        {center}
        <span
          aria-hidden
          className="absolute left-1/2 top-[-6px] -translate-x-1/2 text-[15px] font-bold leading-none"
          style={{ color: 'var(--accent-fill)', fontFamily: 'var(--font-display)' }}
        >
          ‸
        </span>
      </div>
    )
  }
  if (s.motif === 'button') {
    // the hem comes around — jam thread fills the ring; the sewn button crowns it
    return (
      <div className="relative flex-none" style={{ width: size, height: size }}>
        <div
          className="absolute inset-0 rounded-full"
          style={{
            background: `conic-gradient(var(--accent-fill) 0deg ${deg}deg, color-mix(in srgb, var(--thread) 40%, transparent) ${deg}deg)`,
          }}
        />
        {center}
        <span
          aria-hidden
          className="absolute left-1/2 top-[-5px] -translate-x-1/2 rounded-full"
          style={{
            width: 12,
            height: 12,
            background: 'radial-gradient(circle at 35% 30%, var(--gold), var(--gold-deep))',
            boxShadow: '0 1px 2px rgba(0, 0, 0, 0.4)',
          }}
        />
      </div>
    )
  }
  if (s.motif === 'tab') {
    // the survey fills in ink; the orange tab marks the head — filed flush, never floating
    return (
      <div className="relative flex-none" style={{ width: size, height: size }}>
        <div
          className="absolute inset-0 rounded-full"
          style={{
            background: `conic-gradient(var(--ink) 0deg ${deg}deg, color-mix(in srgb, var(--ink) 16%, transparent) ${deg}deg)`,
          }}
        />
        {center}
        <span
          aria-hidden
          className="absolute left-1/2 top-[-4px] -translate-x-1/2"
          style={{
            width: 16,
            height: 8,
            background: 'var(--accent)',
            borderRadius: 2,
            boxShadow: '0 1px 2px rgba(0, 0, 0, 0.3)',
          }}
        />
      </div>
    )
  }
  if (s.motif === 'sun') {
    // the sun climbs the ring — gel to gold; the small sun crowns it and bobs while live
    return (
      <div className="relative flex-none" style={{ width: size, height: size }}>
        <div
          className="absolute inset-0 rounded-full"
          style={{
            background: `conic-gradient(var(--accent-fill) 0deg, var(--gold) ${deg}deg, color-mix(in srgb, var(--muted) 30%, transparent) ${deg}deg)`,
            boxShadow: '0 0 22px color-mix(in srgb, var(--gold) 30%, transparent)',
          }}
        />
        {center}
        <span
          aria-hidden
          className="rv-anim absolute left-1/2 top-[-6px] -translate-x-1/2 rounded-full"
          style={{
            width: 13,
            height: 13,
            background: 'radial-gradient(circle at 40% 35%, #ffe2a0, var(--gold))',
            boxShadow: '0 0 9px var(--gold)',
            animation: 'dawn 3.2s ease-in-out infinite',
          }}
        />
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
          style={{
            background: `conic-gradient(var(--primary) 0deg, var(--gold) ${deg}deg, color-mix(in srgb, var(--ink) 12%, transparent) ${deg}deg)`,
            boxShadow: '0 0 22px color-mix(in srgb, var(--primary) 32%, transparent)',
          }}
        />
        {center}
        {crown ? (
          <span
            aria-hidden
            className="absolute left-1/2 top-[-4px] -translate-x-1/2 text-[14px] leading-none"
            style={{ color: 'var(--accent)' }}
          >
            {crown}
          </span>
        ) : (
          <span
            aria-hidden
            className="absolute left-1/2 top-[-5px] grid -translate-x-1/2 grid-cols-2 gap-[1px] p-[1px]"
            style={{
              width: 12,
              height: 12,
              background: 'color-mix(in srgb, var(--ink) 55%, transparent)',
            }}
          >
            {[0, 1, 2, 3].map((i) => (
              <span
                key={i}
                style={{ background: 'var(--gold)', boxShadow: '0 0 4px var(--gold)' }}
              />
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
          style={{
            background: `conic-gradient(var(--ink) 0deg ${deg}deg, color-mix(in srgb, var(--ink) 14%, transparent) ${deg}deg)`,
          }}
        />
        <span
          aria-hidden
          className="absolute left-1/2 top-0 h-[10px] w-px -translate-x-1/2"
          style={{ background: 'var(--bg0)', transform: 'translateX(-50%) rotate(8deg)' }}
        />
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
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--chip-border)"
          strokeWidth="9"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--primary)"
          strokeWidth="9"
          strokeLinecap="round"
          strokeDasharray={C}
          strokeDashoffset={C * (1 - pct)}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center">{center}</div>
    </div>
  )
}

/** The decorative signature emblem (no value) — for empty states + section flourishes. Aphelion: a
 *  bracketed radar blip. Tryst: a gilt fleuron. Neutral: the skin's voice motif (passed in). */
export function SignatureEmblem({
  fallback,
  size = 34,
  skin,
}: {
  fallback: string
  size?: number
  skin?: SkinId
}) {
  const s = useStructure(skin)
  if (s.motif === 'radar') {
    return (
      <span
        className="relative inline-grid place-items-center"
        style={{ width: size, height: size, color: 'var(--accent)' }}
        aria-hidden
      >
        <span
          className="absolute inset-0 rounded-full"
          style={{ border: '1px solid color-mix(in srgb, var(--accent) 55%, transparent)' }}
        />
        <span
          className="absolute"
          style={{
            inset: size * 0.28,
            borderRadius: '999px',
            border: '1px solid color-mix(in srgb, var(--accent) 40%, transparent)',
          }}
        />
        <span
          className="rounded-full"
          style={{
            width: size * 0.16,
            height: size * 0.16,
            background: 'var(--accent)',
            boxShadow: '0 0 8px var(--accent)',
          }}
        />
      </span>
    )
  }
  if (s.motif === 'fleuron') {
    return (
      <span
        aria-hidden
        style={{
          color: 'var(--accent)',
          fontSize: size * 0.8,
          fontFamily: 'var(--font-display)',
          lineHeight: 1,
        }}
      >
        ❦
      </span>
    )
  }
  if (s.motif === 'sigil') {
    // the gilt sigil — a quatrefoil in a double-ruled lozenge, compass-pointed in rubric
    return (
      <span
        className="relative inline-grid place-items-center"
        style={{ width: size, height: size }}
        aria-hidden
      >
        <span
          className="absolute"
          style={{
            inset: 1,
            border: '1px solid color-mix(in srgb, var(--gold) 60%, transparent)',
            transform: 'rotate(45deg)',
          }}
        />
        <span
          className="absolute"
          style={{
            inset: size * 0.14,
            border: '1px solid color-mix(in srgb, var(--gold) 32%, transparent)',
            transform: 'rotate(45deg)',
          }}
        />
        <span
          className="absolute left-1/2 top-[-2px] -translate-x-1/2 rounded-full"
          style={{ width: 3, height: 3, background: 'var(--rubric)' }}
        />
        <span
          className="rv-anim"
          style={{
            color: 'var(--gold)',
            fontSize: size * 0.5,
            fontFamily: 'var(--font-display)',
            lineHeight: 1,
            animation: 'gleam 7s ease-in-out infinite',
          }}
        >
          ❖
        </span>
      </span>
    )
  }
  if (s.motif === 'crack') {
    // the hairline crack — drawn once, then the house settles (reduced motion shows it complete)
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 34 34"
        aria-hidden
        className="rv-anim"
        style={{ color: 'var(--ink)' }}
      >
        <path
          d="M17 2 L16 9 L19 13 L15 18 L18 23 L14 27 L16 32"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.2"
          strokeLinecap="round"
          pathLength={100}
          style={{
            strokeDasharray: 100,
            strokeDashoffset: 0,
            animation: 'crackdraw 9s ease-out 1',
          }}
        />
        <path
          d="M16 9 L12 11 M18 23 L22 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="0.8"
          opacity="0.6"
        />
      </svg>
    )
  }
  if (s.motif === 'window') {
    // the yellow window — one window, four panes, lit from inside; fog crosses it on .rv-anim
    return (
      <span
        className="relative inline-grid grid-cols-2 gap-[2px] overflow-hidden p-[2px]"
        style={{
          width: size * 0.82,
          height: size,
          background: 'color-mix(in srgb, var(--ink) 45%, var(--bg0))',
          borderRadius: 1,
        }}
        aria-hidden
      >
        {[0, 1, 2, 3].map((i) => (
          <span
            key={i}
            className="rv-anim"
            style={{
              background: 'var(--gold)',
              boxShadow: 'inset 0 0 6px color-mix(in srgb, var(--gold) 60%, #fff)',
              animation: 'flick 7s ease-in-out infinite',
            }}
          />
        ))}
        <span
          className="rv-anim absolute inset-0"
          style={{
            background:
              'linear-gradient(100deg, transparent 20%, color-mix(in srgb, var(--bg0) 55%, transparent) 45%, transparent 70%)',
            filter: 'blur(3px)',
            animation: 'fogdrift 11s ease-in-out infinite alternate',
          }}
        />
      </span>
    )
  }
  if (s.motif === 'caret') {
    // the caret writes itself in — two strokes drawn over four seconds; reduced motion: ink dry
    return (
      <svg
        width={size}
        height={size * 0.94}
        viewBox="0 0 70 66"
        fill="none"
        aria-hidden
        style={{ color: 'var(--accent-fill)' }}
      >
        <path
          d="M10 52 L35 12 L60 52 M35 12 L35 3"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinejoin="round"
          strokeLinecap="round"
          className="rv-anim"
          style={{
            strokeDasharray: 200,
            strokeDashoffset: 0,
            animation: 'dashdraw 4.5s ease-out infinite',
          }}
        />
      </svg>
    )
  }
  if (s.motif === 'button') {
    // a just-sewn button still swings on its thread; reduced motion sews it flat
    return (
      <span
        className="inline-grid place-items-center overflow-hidden"
        style={{ width: size, height: size }}
        aria-hidden
      >
        <span
          className="rv-anim flex flex-col items-center"
          style={{ animation: 'sway 2.6s ease-in-out infinite', transformOrigin: 'top center' }}
        >
          <span
            style={{ width: 2, height: size * 0.26, background: 'var(--thread)', opacity: 0.8 }}
          />
          <span
            className="relative rounded-full"
            style={{
              width: size * 0.36,
              height: size * 0.36,
              background:
                'radial-gradient(circle at 36% 36%, rgba(40, 28, 12, 0.75) 1.5px, transparent 2px), radial-gradient(circle at 64% 36%, rgba(40, 28, 12, 0.75) 1.5px, transparent 2px), radial-gradient(circle at 36% 64%, rgba(40, 28, 12, 0.75) 1.5px, transparent 2px), radial-gradient(circle at 64% 64%, rgba(40, 28, 12, 0.75) 1.5px, transparent 2px), radial-gradient(circle at 35% 30%, var(--gold), var(--gold-deep))',
              boxShadow: '0 3px 6px rgba(0, 0, 0, 0.4)',
            }}
          />
        </span>
      </span>
    )
  }
  if (s.motif === 'tab') {
    // the tab flags you down — it wags once, settles, wags again; reduced motion files it still
    return (
      <span
        className="relative inline-grid place-items-center"
        style={{ width: size, height: size }}
        aria-hidden
      >
        <span
          className="relative"
          style={{
            width: size * 0.5,
            height: size * 0.68,
            borderRadius: 2,
            background: 'var(--paper)',
            boxShadow: '0 3px 8px rgba(0, 0, 0, 0.3)',
          }}
        >
          <span
            className="absolute left-0 top-[14%]"
            style={{ right: '22%', height: '12%', background: 'var(--accent-fill)' }}
          />
          <span
            className="rv-anim absolute"
            style={{
              right: -size * 0.17,
              top: '32%',
              width: size * 0.19,
              height: size * 0.3,
              background: 'var(--accent)',
              borderRadius: '0 3px 3px 0',
              boxShadow: '1px 1px 3px rgba(0, 0, 0, 0.35)',
              transformOrigin: 'left center',
              animation: 'wag 2.8s ease-in-out infinite',
            }}
          />
        </span>
      </span>
    )
  }
  if (s.motif === 'sun') {
    // the sun climbs while something is happening; reduced motion rests it on the line
    return (
      <span
        className="relative inline-grid place-items-center"
        style={{ width: size, height: size }}
        aria-hidden
      >
        <span
          className="absolute"
          style={{
            left: '7%',
            right: '7%',
            bottom: '28%',
            height: 1.5,
            background: 'color-mix(in srgb, var(--muted) 60%, transparent)',
          }}
        />
        <span
          className="rv-anim rounded-full"
          style={{
            width: size * 0.3,
            height: size * 0.3,
            background: 'radial-gradient(circle at 40% 35%, #ffe2a0, var(--gold))',
            boxShadow: '0 0 16px color-mix(in srgb, var(--gold) 80%, transparent)',
            animation: 'dawn 3.2s ease-in-out infinite',
          }}
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
