import type { Book } from './types'
import type { SkinId } from './skins'

// Tier-2 adaptive skin: a palette blended from the Tier-1 skins, weighted by the reader's taste.
// Everything here is PURE + deterministic so the weight + blend + AA math is unit-tested; the web
// layer reads the live Tier-1 token values from the DOM and feeds them in (no value duplication).

/** A token bundle as plain CSS values, keyed by custom-property name (e.g. '--bg0'). */
export type Palette = Record<string, string>

/** Colour tokens that blend channel-wise. */
export const ADAPTIVE_COLOR_KEYS = [
  '--bg0', '--bg1', '--ink', '--muted', '--primary', '--accent-fill', '--violet', '--blue',
  '--gold', '--card', '--card-2', '--line', '--glow-a', '--glow-b', '--glow-c', '--glow-d',
  '--star', '--fog', '--on-primary', '--vignette',
] as const

/** Tokens carried verbatim from the dominant skin (don't blend: shadows, grain, fonts). */
export const ADAPTIVE_CARRY_KEYS = [
  '--shadow', '--grain-opacity', '--font-display', '--font-sans', '--font-mono',
] as const

const SKIN_ORDER: SkinId[] = ['tryst', 'grimoire', 'aphelion', 'marrow', 'umbra', 'folio', 'hearth', 'almanac', 'bloom']

// ── colour parsing / contrast ──

type Rgba = [number, number, number, number] // r,g,b 0..255, a 0..1

export function parseColor(input: string): Rgba | null {
  const s = (input || '').trim()
  const hex = s.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i)
  if (hex) {
    const h = hex[1]!
    const f = h.length === 3 ? h.split('').map((c) => c + c).join('') : h
    return [parseInt(f.slice(0, 2), 16), parseInt(f.slice(2, 4), 16), parseInt(f.slice(4, 6), 16), 1]
  }
  const rgb = s.match(/^rgba?\(([^)]+)\)$/i)
  if (rgb) {
    const parts = rgb[1]!.split(/[,/]/).map((p) => p.trim())
    const r = Number(parts[0]), g = Number(parts[1]), b = Number(parts[2])
    const a = parts[3] != null ? Number(parts[3]) : 1
    if ([r, g, b, a].some((n) => Number.isNaN(n))) return null
    return [r, g, b, a]
  }
  return null
}

const hex2 = (n: number) => Math.round(Math.max(0, Math.min(255, n))).toString(16).padStart(2, '0')

export function formatColor([r, g, b, a]: Rgba): string {
  if (a >= 1) return `#${hex2(r)}${hex2(g)}${hex2(b)}`
  return `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, ${Number(a.toFixed(3))})`
}

/** Composite a possibly-translucent colour over a solid background → solid rgb. */
function compositeOver([r, g, b, a]: Rgba, bg: Rgba): Rgba {
  return [r * a + bg[0] * (1 - a), g * a + bg[1] * (1 - a), b * a + bg[2] * (1 - a), 1]
}

function relLuminance([r, g, b]: Rgba): number {
  const lin = [r, g, b].map((v) => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * lin[0]! + 0.7152 * lin[1]! + 0.0722 * lin[2]!
}

export function contrastRatio(a: Rgba, b: Rgba): number {
  const la = relLuminance(a), lb = relLuminance(b)
  const [hi, lo] = la > lb ? [la, lb] : [lb, la]
  return (hi + 0.05) / (lo + 0.05)
}

/**
 * Mix two colours the way CSS `color-mix(in srgb, a <weightA>, b)` does: a per-channel average in
 * gamma-encoded sRGB, weighted by `weightA` (0–1). Lets a component's `color-mix` and a unit test
 * compute the identical result (e.g. the cover-placeholder contrast guardrail). Throws on bad input.
 */
export function mixSrgb(a: string, b: string, weightA: number): string {
  const ca = parseColor(a), cb = parseColor(b)
  if (!ca || !cb) throw new Error(`mixSrgb: bad colour ${!ca ? a : b}`)
  const w = Math.max(0, Math.min(1, weightA))
  const ch = (i: number) => ca[i]! * w + cb[i]! * (1 - w)
  return formatColor([ch(0), ch(1), ch(2), ch(3)])
}

// ── blend ──

/**
 * Blend the Tier-1 palettes channel-wise by `weights` (same order as the palettes). Colour tokens
 * are averaged (alpha included); carry tokens come from the highest-weighted (dominant) palette.
 */
export function blendPalette(palettes: Palette[], weights: number[]): Palette {
  const total = weights.reduce((s, w) => s + w, 0) || 1
  const norm = weights.map((w) => w / total)
  const out: Palette = {}

  for (const key of ADAPTIVE_COLOR_KEYS) {
    let r = 0, g = 0, b = 0, a = 0, wsum = 0
    for (let i = 0; i < palettes.length; i++) {
      const c = parseColor(palettes[i]?.[key] ?? '')
      if (!c) continue
      const w = norm[i]!
      r += c[0] * w; g += c[1] * w; b += c[2] * w; a += c[3] * w; wsum += w
    }
    if (wsum > 0) out[key] = formatColor([r / wsum, g / wsum, b / wsum, a / wsum])
  }

  const dom = norm.indexOf(Math.max(...norm))
  for (const key of ADAPTIVE_CARRY_KEYS) {
    const v = palettes[dom]?.[key]
    if (v != null) out[key] = v
  }
  return out
}

// ── AA nudge ──

// (text token, background token) pairs the generated palette must satisfy at 4.5:1. Translucent
// backgrounds composite over --bg0 first.
const AA_PAIRS: [string, string][] = [
  ['--ink', '--bg0'],
  ['--ink', '--card'],
  ['--muted', '--bg0'],
  ['--muted', '--card'],
  ['--primary', '--bg0'],
  ['--primary', '--card'],
  ['--on-primary', '--accent-fill'],
]

function solidBg(palette: Palette, key: string, base: Rgba): Rgba {
  const c = parseColor(palette[key] ?? '') ?? base
  return c[3] >= 1 ? c : compositeOver(c, base)
}

/** Nudge a text colour toward black or white until it clears `target` against `bg` (or clamps). */
function nudgeText(text: Rgba, bg: Rgba, target: number): Rgba {
  if (contrastRatio(text, bg) >= target) return text
  const toward: Rgba = relLuminance(bg) > 0.5 ? [0, 0, 0, text[3]] : [255, 255, 255, text[3]]
  let cur = text
  for (let i = 0; i < 40; i++) {
    cur = [
      cur[0] + (toward[0] - cur[0]) * 0.08,
      cur[1] + (toward[1] - cur[1]) * 0.08,
      cur[2] + (toward[2] - cur[2]) * 0.08,
      text[3],
    ]
    if (contrastRatio(cur, bg) >= target) break
  }
  return cur
}

/**
 * Re-check the blended palette for AA in this mode and nudge any failing text token until it
 * passes against the worst of its backgrounds. Returns a corrected copy.
 */
export function nudgeForAA(palette: Palette, target = 4.5): Palette {
  const out = { ...palette }
  const base = parseColor(out['--bg0'] ?? '#000000') ?? [0, 0, 0, 1]
  const byText = new Map<string, string[]>()
  for (const [t, bg] of AA_PAIRS) byText.set(t, [...(byText.get(t) ?? []), bg])

  for (const [textKey, bgKeys] of byText) {
    let text = parseColor(out[textKey] ?? '')
    if (!text) continue
    for (const bgKey of bgKeys) {
      const bg = solidBg(out, bgKey, base)
      text = nudgeText(text, bg, target)
    }
    out[textKey] = formatColor(text)
  }
  return out
}

// ── taste → skin weights ──

// Which skin a subgenre / tag pulls toward. Tags/subgenres not listed contribute to no skin.
const SKIN_AFFINITY: Record<SkinId, { subgenres: string[]; tags: string[] }> = {
  tryst: {
    subgenres: ['Romance', 'Contemporary', 'Sports', 'Cowboy Romance'],
    tags: ['Slow Burn', 'Friends to Lovers', 'Grumpy/Sunshine', 'Small Town', 'Second Chance', 'He Falls First', 'Fake Dating', 'Found Family'],
  },
  grimoire: {
    subgenres: ['Romantasy', 'Fantasy'],
    tags: ['Fae', 'Dragon Riders', 'Magic Academy', 'Court Intrigue', 'Chosen One', 'Shifters', 'Cursed', 'Fated Mates', 'Hidden Powers', 'Rebellion', 'Bonded Pair'],
  },
  aphelion: {
    subgenres: ['Science Fiction', 'Sci-Fi', 'Dystopian'],
    tags: ['Space', 'AI', 'Cyberpunk', 'Time Travel', 'Aliens', 'Dystopian'],
  },
  marrow: {
    subgenres: ['Dark Romance', 'Horror', 'Thriller'],
    tags: ['Mafia', 'Stalker', 'Villain Romance', 'Serial Killers', 'Captive/Captor', 'Morally Black MMC', 'Obsessive', 'Anti-Hero', 'Bully Romance', 'Possessive', 'Revenge'],
  },
  umbra: {
    subgenres: ['Mystery', 'Thriller', 'Crime', 'Detective', 'Suspense'],
    tags: ['Whodunit', 'Noir', 'Heist', 'Spy', 'Cozy Mystery', 'Locked Room', 'Cold Case', 'Conspiracy'],
  },
  folio: {
    subgenres: ['Literary', 'Literary Fiction', 'Classics', 'Fiction', 'Poetry'],
    tags: ['Coming of Age', 'Family Saga', 'Translation', 'Award Winner', 'Essays', 'Modernist'],
  },
  hearth: {
    subgenres: ['Cozy', 'Cottagecore', 'Slice of Life', 'Womens Fiction'],
    tags: ['Comfort Read', 'Small Town', 'Baking', 'Found Family', 'Low Stakes', 'Feel Good'],
  },
  almanac: {
    subgenres: ['Nonfiction', 'Memoir', 'History', 'Science', 'Biography', 'Self Help'],
    tags: ['Reference', 'Essay', 'Field Guide', 'How To', 'Investigative', 'Popular Science'],
  },
  bloom: {
    subgenres: ['YA', 'Young Adult', 'New Adult', 'Contemporary'],
    tags: ['Coming of Age', 'First Love', 'Enemies to Lovers', 'Road Trip', 'Summer', 'High School', 'Friendship'],
  },
}

/** Per-book engagement weight: faves + loved + finished count more; DNF + unread count less. */
function engagement(b: Book): number {
  const read = b.readStatus === 'Read' || b.reads.length > 0
  let w = 1
  if (b.fave) w *= 2
  if (b.rating >= 4) w *= 1.5
  else if (b.rating > 0 && b.rating < 3) w *= 0.6
  if (b.readStatus === 'DNF') w *= 0.3
  else if (!read) w *= 0.8
  return w
}

/**
 * Normalized Tier-1 skin weights from the reader's library — subgenre + tags scored per book and
 * scaled by engagement. A small floor keeps the blend stable (and Tryst-anchored) for thin data.
 */
export function computeSkinWeights(books: readonly Book[]): Record<SkinId, number> {
  const raw = Object.fromEntries(SKIN_ORDER.map((id) => [id, 0])) as Record<SkinId, number>
  for (const b of books) {
    const w = engagement(b)
    const tags = new Set(b.tags)
    for (const id of SKIN_ORDER) {
      const aff = SKIN_AFFINITY[id]
      let score = 0
      // Scored on the PRIMARY subgenre only (subgenres[0] mirror) — the evolve-skins cron and the
      // embedding signature read the same single, and app/cron parity beats marginal signal.
      if (aff.subgenres.includes(b.subgenre)) score += 2
      for (const t of aff.tags) if (tags.has(t)) score += 1
      raw[id] += score * w
    }
  }
  // Floor: a small base weight per skin (Tryst a touch higher as the default anchor).
  const total = SKIN_ORDER.reduce((s, id) => s + raw[id] + skinFloor(id), 0) || 1
  return Object.fromEntries(SKIN_ORDER.map((id) => [id, (raw[id] + skinFloor(id)) / total])) as Record<SkinId, number>
}

/** Base weight that keeps the blend stable for thin data — Tryst anchors as the default skin. */
function skinFloor(id: SkinId): number {
  return id === 'tryst' ? 1.2 : 0.4
}

/** The skin a reader leans toward most. */
export function dominantSkin(weights: Record<SkinId, number>): SkinId {
  return SKIN_ORDER.reduce((best, id) => (weights[id] > weights[best] ? id : best), 'tryst')
}

/** L1 distance between two weight vectors (0 = identical … 2 = opposite). */
export function weightDistance(a: Record<SkinId, number>, b: Record<SkinId, number>): number {
  return SKIN_ORDER.reduce((s, id) => s + Math.abs((a[id] ?? 0) - (b[id] ?? 0)), 0)
}

/**
 * Has the reader's taste shifted enough to be worth surfacing? True when the dominant skin
 * changed or the weight vector moved past `threshold`. Used by the monthly cron so it only fires
 * the reveal on a material change (and never on noise).
 */
export function isMaterialShift(
  current: Record<SkinId, number>,
  next: Record<SkinId, number>,
  threshold = 0.25,
): boolean {
  if (dominantSkin(current) !== dominantSkin(next)) return true
  return weightDistance(current, next) >= threshold
}

/** A short human insight about the taste mix, e.g. "leaning fantasy, with a dark edge". */
export function tasteInsight(weights: Record<SkinId, number>): string {
  const flavour: Record<SkinId, string> = {
    tryst: 'romance',
    grimoire: 'fantasy',
    aphelion: 'sci-fi',
    marrow: 'dark & eerie',
    umbra: 'mystery',
    folio: 'literary',
    hearth: 'cozy',
    almanac: 'nonfiction',
    bloom: 'YA & contemporary',
  }
  const ranked = SKIN_ORDER.filter((id) => weights[id] > 0.05).sort((a, b) => weights[b] - weights[a])
  const top = ranked[0] ?? 'tryst'
  const second = ranked[1]
  if (second && weights[second] > weights[top] * 0.6) {
    return `leaning ${flavour[top]}, with a ${flavour[second]} streak`
  }
  return `leaning ${flavour[top]}`
}

export { SKIN_ORDER }
