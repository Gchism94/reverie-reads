import type { SkinId } from '@reverie/core'

// Per-skin font pairing (display + body) as a SELF-HOSTED stylesheet under public/fonts — so a
// normal session loads ONE pairing, not all nine families, and no visitor's browser ever calls a
// third-party font host. The stylesheets are byte-faithful mirrors of the Google Fonts css2
// responses (scripts/fetch-fonts.mjs is the only writer and holds the upstream provenance);
// each @font-face carries font-display: swap and Google's own unicode-range subsetting, which
// glyphAllowlist.ts's tofu analysis depends on (fontSubsetContract.test.ts guards it). The
// index.html boot script injects the active skin's pairing pre-paint (no FOIT); this loads a
// pairing on skin change, and the Skin Gallery loads them all so each card renders in its true
// type. Keep these in sync with the boot map.
export const FONT_CSS: Record<SkinId, string> = {
  tryst: '/fonts/tryst.css',
  grimoire: '/fonts/grimoire.css',
  aphelion: '/fonts/aphelion.css',
  marrow: '/fonts/marrow.css',
  umbra: '/fonts/umbra.css',
  folio: '/fonts/folio.css',
  hearth: '/fonts/hearth.css',
  almanac: '/fonts/almanac.css',
  bloom: '/fonts/bloom.css',
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
