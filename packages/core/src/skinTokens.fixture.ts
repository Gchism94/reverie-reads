import type { SkinId } from './skins'

// The token sample the contrast guardrails measure against — a mirror of the values in
// apps/web/src/styles/tokens.css, keyed off the SKINS registry so a new skin with no row here
// fails loudly in the tests that consume it (skinCharacter.contrast.test.ts, spineTint.contrast.test.ts).
// Data only — never imported by shipping code, which reads the live CSS custom properties instead.

export type Tok = {
  bg0: string
  cardSolid: string
  /** --field composited over (--card composited over --bg0) — the browser-painted surface of an
   *  unselected control / input row, following pickRing's precomposition precedent. The default
   *  --field is color-mix(in srgb, var(--ink) 5%, transparent); tryst and hearth override it
   *  per-mode in tokens.css (hearth's overrides are the 2026-08-10 a11y-sweep fix: the default
   *  formula left --muted at 3.92:1 on this surface in hearth/dark). */
  fieldOnCard: string
  ink: string
  muted: string
  accentFill: string
  onPrimary: string
  /** --accent-ink: the gilt/instrument eyebrow text on the nameplate (--panel-fill = card-solid) */
  accentInk: string
  /** --mark-accent (= --accent): card-mark glyph; only painted over a DARK scrim (dark mode / covers) */
  markAccent: string
  /** --pick-ring (polish/spine-pick-feel), composited over bg0 the way the browser actually paints
   *  a translucent box-shadow: --ornament-frame is authored as a plate-inset hairline, translucent
   *  by design, so most skins fail 3:1 measured directly against the raw shelf background — the
   *  token falls back to solid --primary there and keeps --ornament-frame only where it clears on
   *  its own (aphelion/dark, hearth/dark, bloom/dark; see tokens.css's --pick-ring comments). */
  pickRing: string
}

export const SKIN_TOKENS: Record<`${SkinId}/${'dark' | 'light'}`, Tok> = {
  'tryst/dark': {
    bg0: '#0b0612',
    cardSolid: '#1d0e29',
    fieldOnCard: '#271a33',
    ink: '#f5e9f0',
    muted: '#c2a3bd',
    accentFill: '#a3244a',
    onPrimary: '#ffffff',
    accentInk: '#f0b14e',
    markAccent: '#f0b14e',
    pickRing: '#e0517d',
  },
  'tryst/light': {
    bg0: '#f8eee4',
    cardSolid: '#fdf8f1',
    fieldOnCard: '#f5efeb',
    ink: '#351523',
    muted: '#7d556b',
    accentFill: '#9c2246',
    onPrimary: '#ffffff',
    accentInk: '#8a5717',
    markAccent: '#8a5717',
    pickRing: '#b83b64',
  },
  'grimoire/dark': {
    bg0: '#0c0f0b',
    cardSolid: '#161b12',
    fieldOnCard: '#21251c',
    ink: '#ece7d6',
    muted: '#a8b08c',
    accentFill: '#3aa97e',
    onPrimary: '#08110b',
    accentInk: '#d4af37',
    markAccent: '#d4af37',
    pickRing: '#3aa97e',
  },
  'grimoire/light': {
    bg0: '#f1e7cf',
    cardSolid: '#f7efd9',
    fieldOnCard: '#ede5cf',
    ink: '#2a2418',
    muted: '#6b644e',
    accentFill: '#1f7d57',
    onPrimary: '#ffffff',
    accentInk: '#6e5518',
    markAccent: '#8a6a2f',
    pickRing: '#1a6e4c',
  },
  'aphelion/dark': {
    bg0: '#05070d',
    cardSolid: '#0c1220',
    fieldOnCard: '#171d2b',
    ink: '#e6edf7',
    muted: '#8595b4',
    accentFill: '#1f8fa3',
    onPrimary: '#02080a',
    accentInk: '#4fd1e0',
    markAccent: '#4fd1e0',
    pickRing: '#2e7681',
  },
  'aphelion/light': {
    bg0: '#eef3fb',
    cardSolid: '#f7fafe',
    fieldOnCard: '#ebeff3',
    ink: '#0e1626',
    muted: '#51607a',
    accentFill: '#0a6e80',
    onPrimary: '#ffffff',
    accentInk: '#0a6e80',
    markAccent: '#0a6e80',
    pickRing: '#0a6e80',
  },
  'marrow/dark': {
    bg0: '#17181c',
    cardSolid: '#212328',
    fieldOnCard: '#211d1f',
    ink: '#e9e4db',
    muted: '#a8a39a',
    accentFill: '#a84545',
    onPrimary: '#ffffff',
    accentInk: '#d67878',
    markAccent: '#d67878',
    pickRing: '#d06a6a',
  },
  'marrow/light': {
    bg0: '#ece8e0',
    cardSolid: '#f4f0e8',
    fieldOnCard: '#e9e5dd',
    ink: '#1b1815',
    muted: '#6a6358',
    accentFill: '#8a3232',
    onPrimary: '#ffffff',
    accentInk: '#8a3232',
    markAccent: '#8a3232',
    pickRing: '#8a3232',
  },
  'umbra/dark': {
    bg0: '#101216',
    cardSolid: '#191c22',
    fieldOnCard: '#202126',
    ink: '#e8e4da',
    muted: '#99a3ad',
    accentFill: '#d9a441',
    onPrimary: '#23201a',
    accentInk: '#d9a441',
    markAccent: '#d9a441',
    pickRing: '#d9a441',
  },
  'umbra/light': {
    bg0: '#edeae2',
    cardSolid: '#f6f4ee',
    fieldOnCard: '#edeef0',
    ink: '#23201a',
    muted: '#5b656f',
    accentFill: '#8a6a1f',
    onPrimary: '#fbf6e8',
    accentInk: '#7a5d1b',
    markAccent: '#8a6a1f',
    pickRing: '#7a5d1b',
  },
  // Fable 5 chunk 3 — Marginalia ("folio"): the page never inverts, so BOTH modes are ink-on-bond;
  // dark mode dims the page and darkens the desk (the vignette). Marks over a placeholder paint
  // WHITE in both modes (--mark-on-ph override) — the scrim over bond is mid-tone, not dark.
  // MVP polish 1a/1b: Marginalia cooled toward bond (+ the desk pushed into the vignette ring);
  // Hearth toasted deeper — the verdict's Hearth×Folio distance, re-AA'd.
  'folio/dark': {
    bg0: '#c2beb1',
    cardSolid: '#d3cfc3',
    fieldOnCard: '#cbc7bb',
    ink: '#2b2820',
    muted: '#4c483f',
    accentFill: '#b1362b',
    onPrimary: '#fbf1ea',
    accentInk: '#86271f',
    markAccent: '#86271f',
    pickRing: '#86271f',
  },
  'folio/light': {
    bg0: '#e7e4da',
    cardSolid: '#f7f5ee',
    fieldOnCard: '#edebe4',
    ink: '#2b2820',
    muted: '#5d5950',
    accentFill: '#b1362b',
    onPrimary: '#fbf1ea',
    accentInk: '#9c2f25',
    markAccent: '#9c2f25',
    pickRing: '#b1362b',
  },
  'hearth/dark': {
    bg0: '#1d1309',
    cardSolid: '#5c4829',
    fieldOnCard: '#4f3e23',
    ink: '#f0e8d6',
    muted: '#c9b998',
    accentFill: '#b13a4e',
    onPrimary: '#fdf3ea',
    accentInk: '#f0a8b4',
    markAccent: '#f0a8b4',
    pickRing: '#827864',
  },
  'hearth/light': {
    bg0: '#e9d7b4',
    cardSolid: '#dccca2',
    fieldOnCard: '#ece3cc',
    ink: '#3d3226',
    muted: '#5c5240',
    accentFill: '#b13a4e',
    onPrimary: '#fdf3ea',
    accentInk: '#96303f',
    markAccent: '#96303f',
    pickRing: '#9c3243',
  },
  // Almanac: light-lead buff; dark is the tent at night — ink-block surfaces with band-ink type.
  // Its buff placeholder also stays light at night → white marks (--mark-on-ph override).
  'almanac/dark': {
    bg0: '#13120c',
    cardSolid: '#241f14',
    fieldOnCard: '#2e291d',
    ink: '#e6ddc2',
    muted: '#b3a67e',
    accentFill: '#241f14',
    onPrimary: '#d9cda6',
    accentInk: '#e08a3c',
    markAccent: '#e08a3c',
    pickRing: '#cf6b26',
  },
  'almanac/light': {
    bg0: '#e4dcc2',
    cardSolid: '#eadfbe',
    fieldOnCard: '#e0d6b6',
    ink: '#2b2820',
    muted: '#5f5947',
    accentFill: '#2b2820',
    onPrimary: '#eadfbe',
    accentInk: '#8a4413',
    markAccent: '#8a4413',
    pickRing: '#8f400f',
  },
  // Firstlight ("bloom"): the sky is the screen; generic panels are deep-sky, stickers live on --paper.
  'bloom/dark': {
    bg0: '#14162a',
    cardSolid: '#1f2240',
    fieldOnCard: '#292c49',
    ink: '#eef0fa',
    muted: '#b8bcd8',
    accentFill: '#6a55c9',
    onPrimary: '#ffffff',
    accentInk: '#9f8cf0',
    markAccent: '#f5b85a',
    pickRing: '#666875',
  },
  'bloom/light': {
    bg0: '#d5d4ea',
    cardSolid: '#ffffff',
    fieldOnCard: '#f4f4f5',
    ink: '#2b2a3a',
    muted: '#5a5878',
    accentFill: '#6a55c9',
    onPrimary: '#ffffff',
    accentInk: '#5a46b4',
    markAccent: '#5a46b4',
    pickRing: '#5a46b4',
  },
}

/** Skins whose placeholders stay LIGHT in dark mode (the page/manual never inverts): the app paints
 *  the placeholder marks white there (--mark-on-ph), so the dark-branch mark test models white. */
export const WHITE_MARK_IN_DARK = new Set<SkinId>(['folio', 'almanac'])

/** Fable 5 material surfaces (chunk 1): CTA text on its card, spine type on the binding (title sits
 *  centred, so it's tested on the gradient's mid), placeholder type on each board stop (it floats
 *  across the whole plate). Alpha inks are composited over the surface before measuring. */
export type Fable5 = {
  ctaInk: string
  ctaHi: string
  ctaLo: string
  spineTitle: string
  spineMuted: string
  spineLo: string
  spineHi: string
  phInk: string
  phMutedInk: string
  phMutedAlpha: number
  phStops: [string, string, string]
}
export const FABLE5: Partial<Record<`${SkinId}/${'dark' | 'light'}`, Fable5>> = {
  'tryst/dark': {
    ctaInk: '#5a1f38',
    ctaHi: '#f7eede',
    ctaLo: '#e9d7bc',
    spineTitle: '#f0b14e',
    spineMuted: '#caa9c4',
    spineLo: '#1f0a18',
    spineHi: '#3c1428',
    phInk: '#ffeede',
    phMutedInk: '#ffdec8',
    phMutedAlpha: 0.78,
    phStops: ['#2a1030', '#4a163a', '#200c1e'],
  },
  'tryst/light': {
    ctaInk: '#fff4ea',
    ctaHi: '#ae2b52',
    ctaLo: '#8e1f42',
    spineTitle: '#6c4313',
    spineMuted: '#60394b',
    spineLo: '#d8a6b4',
    spineHi: '#ecccd4',
    phInk: '#3a1626',
    phMutedInk: '#6b4459',
    phMutedAlpha: 1,
    phStops: ['#f3e2d8', '#e8cbc9', '#eed7cc'],
  },
  'aphelion/dark': {
    ctaInk: '#02080a',
    ctaHi: '#6fdfec',
    ctaLo: '#3ec2d2',
    spineTitle: '#e6edf7',
    spineMuted: '#8595b4',
    spineLo: '#0a1220',
    spineHi: '#1a2a42',
    phInk: '#dff4fb',
    phMutedInk: '#bdf3fa',
    phMutedAlpha: 0.72,
    phStops: ['#0a1530', '#142a52', '#08111f'],
  },
  'aphelion/light': {
    ctaInk: '#f2fbfd',
    ctaHi: '#0d8093',
    ctaLo: '#0a6e80',
    spineTitle: '#0e1626',
    spineMuted: '#4d5d73',
    spineLo: '#c8d6e6',
    spineHi: '#e9f0f8',
    phInk: '#0e1626',
    phMutedInk: '#51607a',
    phMutedAlpha: 1,
    phStops: ['#e8f0f9', '#cfdded', '#dfe9f4'],
  },
  'grimoire/dark': {
    ctaInk: '#241f10',
    ctaHi: '#e7c95c',
    ctaLo: '#c9a22e',
    spineTitle: '#d4af37',
    spineMuted: '#b3ab8a',
    spineLo: '#3a3320',
    spineHi: '#292416',
    phInk: '#f0ead6',
    phMutedInk: '#e6dcbe',
    phMutedAlpha: 0.75,
    phStops: ['#2e2a18', '#3d3520', '#241f10'],
  },
  'grimoire/light': {
    ctaInk: '#f6ecd2',
    ctaHi: '#8a6a2f',
    ctaLo: '#6e5420',
    spineTitle: '#7a5c14',
    spineMuted: '#5e5742',
    spineLo: '#e6d7b2',
    spineHi: '#f0e3c4',
    phInk: '#3a3018',
    phMutedInk: '#5e5742',
    phMutedAlpha: 1,
    phStops: ['#f3e8ca', '#e9dab4', '#efe2c0'],
  },
  'marrow/dark': {
    ctaInk: '#241d18',
    ctaHi: '#f2ead9',
    ctaLo: '#d8cfba',
    spineTitle: '#e9e4db',
    spineMuted: '#a8a39a',
    spineLo: '#26282e',
    spineHi: '#1b1d21',
    phInk: '#e9e4db',
    phMutedInk: '#a8a39a',
    phMutedAlpha: 1,
    phStops: ['#24262c', '#1b1d21', '#212328'],
  },
  'marrow/light': {
    ctaInk: '#f4f0e8',
    ctaHi: '#3a3d44',
    ctaLo: '#26282e',
    spineTitle: '#2a251e',
    spineMuted: '#52483e',
    spineLo: '#c6bfae',
    spineHi: '#d5cfc0',
    phInk: '#2a251e',
    phMutedInk: '#52483e',
    phMutedAlpha: 1,
    phStops: ['#d8d2c4', '#c9c2b2', '#d2cbbc'],
  },
  'umbra/dark': {
    ctaInk: '#2a2214',
    ctaHi: '#e8bc5a',
    ctaLo: '#c1902f',
    spineTitle: '#2a251c',
    spineMuted: '#5d574a',
    spineLo: '#e2d9c2',
    spineHi: '#e2d9c2',
    phInk: '#e8e4da',
    phMutedInk: '#99a3ad',
    phMutedAlpha: 1,
    phStops: ['#2a2f38', '#1c2028', '#242932'],
  },
  'umbra/light': {
    ctaInk: '#f6f0dc',
    ctaHi: '#8a6a1f',
    ctaLo: '#6e5518',
    spineTitle: '#2a251c',
    spineMuted: '#5d574a',
    spineLo: '#f8f2e2',
    spineHi: '#f8f2e2',
    phInk: '#23201a',
    phMutedInk: '#3e474f',
    phMutedAlpha: 1,
    phStops: ['#d6d0c0', '#c5bfae', '#cfc9b9'],
  },
  // Chunk 3. Marginalia: type on the proof-paper galley + bond boards — the page in both modes.
  'folio/dark': {
    ctaInk: '#fbf1ea',
    ctaHi: '#d0463a',
    ctaLo: '#b1362b',
    spineTitle: '#2b2820',
    spineMuted: '#46433b',
    spineLo: '#adaa9e',
    spineHi: '#c6c3b8',
    phInk: '#2b2820',
    phMutedInk: '#3a372f',
    phMutedAlpha: 1,
    phStops: ['#bcb8ac', '#a3a094', '#b1ada1'],
  },
  'folio/light': {
    ctaInk: '#fbf1ea',
    ctaHi: '#d0463a',
    ctaLo: '#b1362b',
    spineTitle: '#2b2820',
    spineMuted: '#6b675e',
    spineLo: '#e5e2d8',
    spineHi: '#f4f2ea',
    phInk: '#2b2820',
    phMutedInk: '#5d5950',
    phMutedAlpha: 1,
    phStops: ['#f4f2ea', '#e4e1d6', '#edeae0'],
  },
  // Hearth: type on the oat linen — spine cloth + the linen board (the paper label is brighter still).
  'hearth/dark': {
    ctaInk: '#fdf3ea',
    ctaHi: '#c74e60',
    ctaLo: '#a03344',
    spineTitle: '#f0e8d6',
    spineMuted: '#d9ccb0',
    spineLo: '#5c4829',
    spineHi: '#705a37',
    phInk: '#f0e8d6',
    phMutedInk: '#e6dcc4',
    phMutedAlpha: 1,
    phStops: ['#705a37', '#5c4829', '#665231'],
  },
  'hearth/light': {
    ctaInk: '#fdf3ea',
    ctaHi: '#c04a5e',
    ctaLo: '#9c3243',
    spineTitle: '#3d3226',
    spineMuted: '#5c5240',
    spineLo: '#dccca2',
    spineHi: '#e8dab4',
    phInk: '#3d3226',
    phMutedInk: '#5c5240',
    phMutedAlpha: 1,
    phStops: ['#e8dab4', '#d8c698', '#e1d2a6'],
  },
  // Almanac: spine type on the buff manual; placeholder type lives ON THE INK BAND (the band block
  // carries title + author — the boards carry no type), so the ph stops are the band's, like the
  // Gaslight paper strip. The author mixes cta-ink 78% into the band.
  'almanac/dark': {
    ctaInk: '#d9cda6',
    ctaHi: '#332c1c',
    ctaLo: '#241f14',
    spineTitle: '#241f14',
    spineMuted: '#3a3426',
    spineLo: '#a3946c',
    spineHi: '#b3a67e',
    phInk: '#d9cda6',
    phMutedInk: '#d9cda6',
    phMutedAlpha: 0.78,
    phStops: ['#332c1c', '#241f14', '#2b2618'],
  },
  'almanac/light': {
    ctaInk: '#eadfbe',
    ctaHi: '#3a3322',
    ctaLo: '#241f14',
    spineTitle: '#2b2820',
    spineMuted: '#5f5947',
    spineLo: '#ddd0a8',
    spineHi: '#eadfbe',
    phInk: '#eadfbe',
    phMutedInk: '#eadfbe',
    phMutedAlpha: 0.78,
    phStops: ['#3a3322', '#241f14', '#2f291b'],
  },
  // Firstlight: spine type on the night stops of the sky; placeholder type lives ON THE STICKER
  // (opaque white in both modes) — the sky carries no type.
  'bloom/dark': {
    ctaInk: '#ffffff',
    ctaHi: '#8a73e0',
    ctaLo: '#6a55c9',
    spineTitle: '#eef0fa',
    spineMuted: '#b8bcd8',
    spineLo: '#20223a',
    spineHi: '#262a4d',
    phInk: '#2b2a3a',
    phMutedInk: '#5a5878',
    phMutedAlpha: 1,
    phStops: ['#fbfbff', '#fbfbff', '#fbfbff'],
  },
  'bloom/light': {
    ctaInk: '#ffffff',
    ctaHi: '#8a73e0',
    ctaLo: '#6a55c9',
    spineTitle: '#2b2a3a',
    spineMuted: '#4a4866',
    spineLo: '#c9cee8',
    spineHi: '#d5d4ea',
    phInk: '#2b2a3a',
    phMutedInk: '#5a5878',
    phMutedAlpha: 1,
    phStops: ['#ffffff', '#ffffff', '#ffffff'],
  },
}
