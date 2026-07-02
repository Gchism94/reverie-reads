import { callsign, placeholderColorVars, placeholderSpec } from '@reverie/core'
import { useEffectiveSkin } from '../skin/labels'
import { useStructure } from '../skin/structure'

/**
 * The placeholderCover slot (Fable 5 slot 9): a coverless book gets a DESIGNED plate, never a gray
 * box. FILLS its parent (the caller provides the sized/bordered/overflow-hidden box) and scales via
 * container units, so it drops in from a reading-now thumb to the detail hero.
 *
 * Per-skin bones via `SKIN_STRUCTURE.placeholder` (same registered pattern as the signature motif):
 * - 'cloth-boards'   — Tryst's unjacketed edition: plum cloth, blind-ruled gilt double frame, ❦,
 *                      title hand-set in italic (one-word titles at display scale), author in caps.
 * - 'specimen-plate' — Aphelion's archive plate: gridded metal, corner brackets, a callsign chip,
 *                      the orbit ring holding where art would go, and a status LED.
 * - 'plain'          — the neutral title/author plate (accent-mixed, AA by construction) for skins
 *                      whose designed plate hasn't landed yet.
 * All values are tokens (--ph-*), per skin × mode — AA guarded by the registry-keyed contrast test.
 */
export function CoverPlaceholder({
  book,
  className,
}: {
  book: { id?: string; title?: string; first?: string; last?: string }
  className?: string
}) {
  const variant = useStructure().placeholder
  const skinId = useEffectiveSkin()
  const { title, author, accentVar } = placeholderSpec(book)
  const label = `${title || 'Untitled'}${author ? ` by ${author}` : ''} — placeholder cover`
  const oneWord = !!title && !title.includes(' ')

  if (variant === 'cloth-boards') {
    return (
      <div
        role="img"
        aria-label={label}
        className={className}
        style={{
          position: 'relative',
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
          padding: '12% 9%',
          background: 'var(--ph-glow), linear-gradient(160deg, var(--ph-a), var(--ph-b) 55%, var(--ph-c))',
          containerType: 'inline-size',
        }}
      >
        {/* blind-ruled gilt double frame */}
        <span aria-hidden className="pointer-events-none absolute" style={{ inset: '5.5%', border: '1px solid color-mix(in srgb, var(--gold) 50%, transparent)', borderRadius: 4 }} />
        <span aria-hidden className="pointer-events-none absolute" style={{ inset: '8.5%', border: '1px solid color-mix(in srgb, var(--gold) 26%, transparent)', borderRadius: 2 }} />
        <span aria-hidden style={{ color: 'var(--gold)', fontSize: 'clamp(10px, 9cqw, 14px)', fontFamily: 'var(--font-display)', lineHeight: 1, marginBottom: '7%' }}>
          ❦
        </span>
        <span
          aria-hidden
          style={{
            position: 'relative',
            fontFamily: 'var(--font-display)',
            fontWeight: 600,
            fontStyle: 'italic',
            fontSize: oneWord ? 'clamp(15px, 17cqw, 26px)' : 'clamp(11px, 10cqw, 15px)',
            lineHeight: 1.25,
            color: 'var(--ph-ink)',
            textAlign: 'center',
            display: '-webkit-box',
            WebkitLineClamp: 3,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}
        >
          {title || 'Untitled'}
        </span>
        <span aria-hidden style={{ width: '18%', height: 1, background: 'color-mix(in srgb, var(--gold) 50%, transparent)', margin: '7% 0' }} />
        {author && (
          <span
            aria-hidden
            className="uppercase"
            style={{ fontFamily: 'var(--font-sans)', fontWeight: 600, fontSize: 'clamp(9px, 6.5cqw, 10px)', letterSpacing: '0.2em', color: 'var(--ph-muted)', textAlign: 'center' }}
          >
            {author}
          </span>
        )}
      </div>
    )
  }

  if (variant === 'specimen-plate') {
    const call = callsign(book.id ?? title ?? 'specimen', skinId.slice(0, 3).toUpperCase())
    const grid = 'color-mix(in srgb, var(--primary) 9%, transparent)'
    const bracket = (pos: Record<string, number | string>) => (
      <span aria-hidden style={{ position: 'absolute', width: '6.5%', aspectRatio: '1', borderColor: 'var(--primary)', borderStyle: 'solid', ...pos }} />
    )
    return (
      <div
        role="img"
        aria-label={label}
        className={className}
        style={{
          position: 'relative',
          width: '100%',
          height: '100%',
          overflow: 'hidden',
          background: `linear-gradient(${grid} 1px, transparent 1px), linear-gradient(90deg, ${grid} 1px, transparent 1px), linear-gradient(165deg, var(--ph-a), var(--ph-b) 55%, var(--ph-c))`,
          backgroundSize: '14% 14%, 14% 14%, 100% 100%',
          containerType: 'inline-size',
        }}
      >
        {bracket({ left: 0, top: 0, borderWidth: '1px 0 0 1px' })}
        {bracket({ right: 0, top: 0, borderWidth: '1px 1px 0 0' })}
        {bracket({ left: 0, bottom: 0, borderWidth: '0 0 1px 1px' })}
        {bracket({ right: 0, bottom: 0, borderWidth: '0 1px 1px 0' })}
        {/* callsign chip */}
        <span
          aria-hidden
          style={{ position: 'absolute', left: '7%', top: '6.5%', border: '1px solid color-mix(in srgb, var(--primary) 55%, transparent)', background: 'var(--plate)', padding: '2% 4%', borderRadius: 1, lineHeight: 1.35 }}
        >
          <span className="block font-bold" style={{ fontFamily: 'var(--font-mono)', fontSize: 'clamp(8px, 6cqw, 9px)', letterSpacing: '0.08em', color: 'var(--accent-ink)' }}>
            {call.code}
          </span>
          <span className="block font-bold" style={{ fontFamily: 'var(--font-mono)', fontSize: 'clamp(8px, 6cqw, 9px)', letterSpacing: '0.04em', color: 'var(--ph-muted)' }}>
            {call.id}
          </span>
        </span>
        {/* the orbit ring holding where art would go */}
        <span aria-hidden style={{ position: 'absolute', left: '50%', top: '36%', width: '39%', aspectRatio: '1', transform: 'translate(-50%, -50%)', border: '1px solid color-mix(in srgb, var(--primary) 55%, transparent)', borderRadius: '50%' }} />
        <span aria-hidden style={{ position: 'absolute', left: '50%', top: '36%', width: 5, height: 5, transform: 'translate(-50%, -50%)', borderRadius: '50%', background: 'var(--primary)', boxShadow: '0 0 8px var(--primary)' }} />
        <span
          aria-hidden
          style={{
            position: 'absolute',
            left: '8%',
            right: '8%',
            bottom: '20%',
            fontFamily: 'var(--font-display)',
            fontWeight: 700,
            fontSize: oneWord ? 'clamp(12px, 12cqw, 18px)' : 'clamp(10px, 9.5cqw, 14px)',
            lineHeight: 1.15,
            letterSpacing: oneWord ? '0.04em' : 0,
            textTransform: oneWord ? 'uppercase' : 'none',
            color: 'var(--ph-ink)',
            display: '-webkit-box',
            WebkitLineClamp: 3,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}
        >
          {title || 'Untitled'}
        </span>
        {author && (
          <span
            aria-hidden
            className="uppercase"
            style={{ position: 'absolute', left: '8%', bottom: '8%', fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 'clamp(8px, 6.5cqw, 9px)', letterSpacing: '0.16em', color: 'var(--ph-muted)' }}
          >
            {author}
          </span>
        )}
        <span
          aria-hidden
          className="rv-anim"
          style={{ position: 'absolute', right: '7%', bottom: '8%', width: 5, height: 5, borderRadius: '50%', background: 'var(--primary)', boxShadow: '0 0 8px var(--primary)', animation: 'sig-blink 2.4s step-end infinite' }}
        />
      </div>
    )
  }

  // 'plain' — the neutral accent-mixed title/author plate (AA by construction; see @reverie/core)
  const colors = placeholderColorVars(accentVar)
  return (
    <div
      role="img"
      aria-label={label}
      className={className}
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        gap: '6%',
        padding: '9% 11%',
        overflow: 'hidden',
        background: colors.background,
        containerType: 'inline-size',
      }}
    >
      <span aria-hidden className="block flex-none" style={{ height: 2, width: '34%', background: colors.color, opacity: 0.55 }} />
      <span
        aria-hidden
        style={{
          fontFamily: 'var(--font-display)',
          fontStyle: 'italic',
          fontWeight: 600,
          fontSize: 'clamp(11px, 15cqw, 22px)',
          lineHeight: 1.06,
          color: colors.color,
          display: '-webkit-box',
          WebkitLineClamp: 4,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
        }}
      >
        {title || 'Untitled'}
      </span>
      {author && (
        <span
          aria-hidden
          className="skin-label"
          style={{
            fontSize: 'clamp(8px, 8cqw, 11px)',
            letterSpacing: '0.08em',
            color: colors.color,
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}
        >
          {author}
        </span>
      )}
    </div>
  )
}
