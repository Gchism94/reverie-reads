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
    // Fable 5: the chapter rule — thick-thin gilt pair meeting at the quatrefoil lozenge
    <>
      <path d="M14 11h80M14 15h80" strokeOpacity=".55" />
      <path d="M206 11h-80M206 15h-80" strokeOpacity=".55" />
      <path d="M110 5l8 8-8 8-8-8z" />
      <path d="M110 9l4 4-4 4-4-4z" strokeOpacity=".6" />
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
    // Fable 5: the settled rule — a hairline that fractures at center, its halves out of true
    <>
      <path d="M12 12h94M208 14h-90" strokeOpacity=".6" />
      <path d="M106 12l4 3" strokeOpacity=".8" />
    </>
  ),
  // Stage 3 motifs: umbra single noir diamond · folio editorial dot-leader · hearth leaf · almanac
  // index ticks · bloom sparkle.
  umbra: (
    // Fable 5 Gaslight: a length of thread left slack between two tacks
    <>
      <path d="M10 13h84M210 13h-84" strokeOpacity=".4" />
      <circle cx="96" cy="13" r="2.4" fill="currentColor" stroke="none" />
      <circle cx="124" cy="13" r="2.4" fill="currentColor" stroke="none" />
      <path d="M96 13q14 7 28 0" strokeOpacity=".9" />
    </>
  ),
  folio: (
    <>
      <path d="M14 13h82M206 13h-82" strokeOpacity=".5" />
      <circle cx="110" cy="13" r="2.2" fill="currentColor" stroke="none" />
      <path d="M99 13h-3M124 13h-3" strokeOpacity=".7" />
    </>
  ),
  hearth: (
    <>
      <path d="M14 13h84M206 13h-84" strokeOpacity=".5" />
      <path d="M110 6c-4 3-4 11 0 14 4-3 4-11 0-14z" strokeOpacity=".9" />
    </>
  ),
  almanac: (
    <>
      <path d="M10 13h92M210 13h-92" />
      <path d="M104 8v10M116 8v10M110 9v8" strokeOpacity=".8" />
    </>
  ),
  bloom: (
    <>
      <path d="M14 13h82M206 13h-82" strokeOpacity=".5" />
      <path d="M110 6v14M103 13h14M105.5 8.5l9 9M114.5 8.5l-9 9" strokeOpacity=".9" />
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
