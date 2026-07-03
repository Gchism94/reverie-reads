import type { SkinId } from '@reverie/core'

// Per-skin font pairing (display + body) as a Google Fonts css2 URL with display=swap — so a normal
// session loads ONE pairing, not all nine families. The index.html boot script injects the active
// skin's pairing pre-paint (no FOIT); this loads a pairing on skin change, and the Skin Gallery
// loads them all so each card renders in its true type. Keep these in sync with the boot map.
export const FONT_CSS: Record<SkinId, string> = {
  tryst:
    'https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,500;0,9..144,600;0,9..144,700;1,9..144,400;1,9..144,500;1,9..144,600&family=Hanken+Grotesk:wght@400;500;600;700;800&display=swap',
  grimoire:
    'https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;500;600;700&family=Spectral:wght@400;500;600;700&display=swap',
  aphelion:
    'https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=Space+Mono:wght@400;700&display=swap',
  marrow:
    'https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;500;600;700&family=Libre+Franklin:wght@400;500;600;700&display=swap',
  umbra:
    'https://fonts.googleapis.com/css2?family=Libre+Caslon+Text:ital,wght@0,400;0,700;1,400&family=Courier+Prime:ital,wght@0,400;0,700;1,400&display=swap',
  folio:
    'https://fonts.googleapis.com/css2?family=EB+Garamond:ital,wght@0,400;0,500;0,600;0,700;1,400;1,500;1,600&family=Caveat:wght@400;600&display=swap',
  hearth:
    'https://fonts.googleapis.com/css2?family=Bitter:ital,wght@0,400;0,500;0,600;0,700;1,400;1,600&family=Varela+Round&display=swap',
  almanac:
    'https://fonts.googleapis.com/css2?family=Source+Serif+4:ital,opsz,wght@0,8..60,400;0,8..60,600;1,8..60,400&family=Archivo:ital,wght@0,400;0,500;0,600;0,700;1,400&display=swap',
  bloom:
    'https://fonts.googleapis.com/css2?family=Baloo+2:wght@400;500;600;700&family=Karla:ital,wght@0,400;0,500;0,700;1,400;1,700&display=swap',
}

const requested = new Set<string>()

function injectFontLink(href: string): void {
  if (typeof document === 'undefined' || requested.has(href)) return
  requested.add(href)
  // The boot script may already have injected the active pairing — don't duplicate it.
  if (document.querySelector(`link[data-skin-font][href="${href}"]`)) return
  const link = document.createElement('link')
  link.rel = 'stylesheet'
  link.href = href
  link.setAttribute('data-skin-font', '')
  document.head.appendChild(link)
}

/** Ensure the given skin's font pairing is loaded (idempotent). */
export function loadSkinFont(skin: SkinId): void {
  injectFontLink(FONT_CSS[skin])
}

/** Load every skin's pairing — for the Skin Gallery, where each card shows its true type. */
export function loadAllSkinFonts(): void {
  for (const s of Object.keys(FONT_CSS) as SkinId[]) injectFontLink(FONT_CSS[s])
}
