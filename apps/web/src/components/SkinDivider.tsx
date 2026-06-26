import { type SkinId } from '@reverie/core'
import { useEffectiveSkin } from '../skin/labels'

// Skin-aware divider: each skin has its own ornament drawn in the skin's tertiary (gold) tone —
// filigree (Tryst), alchemical sun (Grimoire), orbital (Aphelion), thorn (Marrow). Pass `skin`
// to force a motif (gallery previews); otherwise it follows the active skin.
const MOTIFS: Record<SkinId, React.ReactNode> = {
  tryst: (
    <>
      <path d="M10 13h70" strokeOpacity=".5" />
      <path d="M210 13h-70" strokeOpacity=".5" />
      <path d="M80 13c8 0 8-8 16-8s8 8 0 8c-8 0-8-8 0-8M140 13c-8 0-8-8-16-8s-8 8 0 8c8 0 8-8 0-8" />
      <path d="M110 5l5 8-5 8-5-8z" fill="currentColor" stroke="none" />
    </>
  ),
  grimoire: (
    <>
      <path d="M14 13h78" strokeOpacity=".5" />
      <path d="M206 13h-78" strokeOpacity=".5" />
      <circle cx="110" cy="13" r="6" />
      <path d="M110 3v4M110 19v4M100 13h-4M124 13h-4M103 6l3 3M117 20l-3-3M117 6l-3 3M103 20l3-3" />
    </>
  ),
  aphelion: (
    <>
      <path d="M8 13h94M212 13h-94" />
      <circle cx="110" cy="13" r="5" />
      <circle cx="110" cy="13" r="1.6" fill="currentColor" stroke="none" />
      <path d="M84 9v8M136 9v8" strokeOpacity=".7" />
    </>
  ),
  marrow: (
    <>
      <path d="M12 13h88M208 13h-88" strokeOpacity=".55" />
      <path d="M100 13l-7-5M100 13l-7 5M120 13l7-5M120 13l7 5" />
      <circle cx="110" cy="13" r="2.4" fill="currentColor" stroke="none" />
    </>
  ),
}

export function SkinDivider({ skin, className = '' }: { skin?: SkinId; className?: string }) {
  const active = useEffectiveSkin()
  const id = skin ?? active
  return (
    <div className={`flex justify-center ${className}`} aria-hidden>
      <svg viewBox="0 0 220 26" fill="none" stroke="currentColor" strokeWidth={1.4} style={{ color: 'var(--gold)', height: 22, width: 'auto' }}>
        {MOTIFS[id]}
      </svg>
    </div>
  )
}
