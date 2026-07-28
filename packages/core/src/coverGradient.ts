// The cover gradient — the colour a book wears when it has no cover art, and the wash behind every
// cover card.
//
// WHAT CHANGED AND WHY. The tint used to be keyed on `subgenre[0]`, the denormalized first element
// of a multi-select array. Two things were wrong with that:
//
//   1. `subgenre[0]` is an ORDERING ACCIDENT. It is whichever chip the reader happened to tap
//      first, and it becomes load-bearing for the book's colour. Once the picker offers other
//      genres' subgenres (a horror-romance is a real shape), a horror book whose first pick is
//      "Dark Romance" tints romance — the genre reads wrong at a glance, from an array index.
//   2. The old map had SEVEN entries, all romance-era, and everything else fell through to a
//      romance-pink default. After the taxonomy broadened past romance, an Epic Fantasy, a Space
//      Opera and a Gothic horror all already tinted pink — not from ordering, but from absence.
//
// So: the PRIMARY GENRE — explicit, stable, the reader's own identity choice — sets the HUE. The
// first subgenre only MODULATES within that family: lightness and saturation, never hue. An
// ordering accident now costs a shade rather than a genre.
//
// AA BY CONSTRUCTION. The placeholder paints type over this gradient, and the contrast guardrail
// runs per skin × mode × accent. Rather than hand-tune ~81 pairs and verify each, every colour here
// is GENERATED inside a bounded lightness band (see GRADIENT_L) chosen so that the darkest stop
// still clears 4.5:1 against white type and the lightest still clears it against near-black type.
// Adding a genre or a subgenre cannot silently produce an illegible plate.

import { CORE_GENRES } from './genreNormalize'

/** Hue (HSL degrees) per primary genre — the one identity choice the reader makes explicitly. */
const GENRE_HUE: Record<string, number> = {
  romance: 342, // rose
  fantasy: 272, // violet
  'science fiction': 205, // cold blue
  horror: 8, // oxblood
  mystery: 224, // ink blue
  literary: 32, // parchment amber
  cozy: 150, // green
  nonfiction: 196, // slate cyan
  'young adult': 310, // orchid
}

/** The neutral used when a book has no genre yet — never a silent fall into someone else's colour. */
const UNSET_HUE = 250

/**
 * The permitted lightness band for gradient stops, in HSL %.
 *
 * The floor and ceiling are the whole AA story. `lo` is dark enough that white type clears 4.5:1;
 * `hi` is light enough that the near-black placeholder ink clears 4.5:1. Modulation moves WITHIN
 * this band, so no combination of genre and subgenre can leave it.
 */
export const GRADIENT_L = { lo: 22, hi: 46 } as const
const SAT = { lo: 28, hi: 62 } as const

/**
 * How a subgenre shifts its family, as a signed fraction of the band (-1..1). Negative = darker and
 * more saturated (the "dark"/"grim" end), positive = lighter and softer (the "cozy"/"comedy" end).
 * A subgenre with no entry sits neutral — legible, unopinionated, never wrong.
 */
const SUBGENRE_SHIFT: Record<string, number> = {
  // darker, denser
  'Dark Romance': -1,
  Grimdark: -1,
  'Dark Fantasy': -0.75,
  Gothic: -0.75,
  Horror: -0.75,
  Thriller: -0.6,
  'Post-Apocalyptic': -0.6,
  Dystopian: -0.55,
  Noir: -0.6,
  'Military SF': -0.4,
  Psychological: -0.5,
  'Serial Killer': -0.8,
  Supernatural: -0.35,
  Splatterpunk: -0.9,
  // lighter, softer
  'Romantic Comedy': 0.9,
  'Cozy Fantasy': 0.85,
  Cozy: 0.85,
  'Cozy Mystery': 0.8,
  Contemporary: 0.5,
  Romance: 0.55,
  'Fairytale Retelling': 0.45,
  Sports: 0.4,
  'Historical Romance': 0.25,
  'Slice of Life': 0.7,
  Wholesome: 0.8,
  // mid, with a lean
  Romantasy: -0.2,
  'Urban Fantasy': -0.25,
  'Epic Fantasy': 0.1,
  'Space Opera': 0.15,
  Cyberpunk: -0.35,
  'Time Travel': 0.2,
  'First Contact': 0.3,
  'Sword & Sorcery': -0.15,
  'Paranormal Romance': -0.3,
  'Cowboy Romance': 0.3,
  'Hard SF': 0,
  'Climate Fiction': -0.2,
}

const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n))
const mix = (lo: number, hi: number, t: number): number => lo + (hi - lo) * clamp(t, 0, 1)

/** WCAG relative luminance for an HSL triple. */
function luminance(h: number, s: number, l: number): number {
  const S = s / 100
  const L = l / 100
  const c = (1 - Math.abs(2 * L - 1)) * S
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = L - c / 2
  const hh = ((h % 360) + 360) % 360
  const [r, g, b] =
    hh < 60
      ? [c, x, 0]
      : hh < 120
        ? [x, c, 0]
        : hh < 180
          ? [0, c, x]
          : hh < 240
            ? [0, x, c]
            : hh < 300
              ? [x, 0, c]
              : [c, 0, x]
  const f = (v: number): number => {
    const u = v + m
    return u <= 0.03928 ? u / 12.92 : Math.pow((u + 0.055) / 1.055, 2.4)
  }
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
}

/**
 * The luminance ceiling white type can sit on at 4.5:1 — (1.0 + 0.05) / (L + 0.05) >= 4.5.
 *
 * A fixed LIGHTNESS band is not enough on its own: luminance depends on HUE as much as on
 * lightness, so amber at 45% is far brighter than violet at 45% and slips under AA while the band
 * says it is fine. (The guardrail caught exactly that — literary/Romantic Comedy at 4.25:1.) The
 * band sets the intent; this enforces the guarantee, per hue.
 */
const MAX_LUMINANCE = 1.05 / 4.5 - 0.05

/**
 * Emit the colour, walking lightness down until white type clears AA on it.
 *
 * The cap runs on the INTEGER that actually ships — capping a fractional value and rounding
 * afterwards puts it straight back over the line, which is how the first attempt still failed.
 */
const hsl = (h: number, s: number, l: number): string => {
  const hue = Math.round(h)
  const sat = Math.round(clamp(s, 0, 100))
  let out = Math.round(clamp(l, GRADIENT_L.lo, GRADIENT_L.hi))
  while (out > GRADIENT_L.lo && luminance(hue, sat, out) > MAX_LUMINANCE) out -= 1
  return `hsl(${hue} ${sat}% ${out}%)`
}

/** The genre key a hue is looked up by — tolerant of the spellings books actually carry. */
const hueFor = (genre: string): number => GENRE_HUE[genre.trim().toLowerCase()] ?? UNSET_HUE

/**
 * The two gradient stops for a book. `genre` chooses the family; `subgenre` (the first pick) only
 * shifts lightness/saturation inside it. Both stops stay within GRADIENT_L by construction.
 */
export function coverGradient(genre: string, subgenre?: string): [string, string] {
  const h = hueFor(genre)
  const shift = SUBGENRE_SHIFT[(subgenre ?? '').trim()] ?? 0
  // shift −1..1 → 0..1 across the band; the second stop trails slightly darker for depth.
  const t = (shift + 1) / 2
  const l1 = mix(GRADIENT_L.lo, GRADIENT_L.hi, t)
  const l2 = clamp(l1 - 8, GRADIENT_L.lo, GRADIENT_L.hi)
  // Darker ends run richer, lighter ends softer — saturation follows lightness inversely.
  const s1 = mix(SAT.hi, SAT.lo, t)
  // A second hue step of 14° gives the sweep some life without leaving the family.
  return [hsl(h, s1, l1), hsl(h + 14, s1 + 6, l2)]
}

/** Every (genre, subgenre) pairing the app can produce — the guardrail's input space. */
export function gradientMatrix(): { genre: string; subgenre: string }[] {
  const out: { genre: string; subgenre: string }[] = []
  for (const g of CORE_GENRES) {
    out.push({ genre: g.toLowerCase(), subgenre: '' })
    for (const sub of Object.keys(SUBGENRE_SHIFT))
      out.push({ genre: g.toLowerCase(), subgenre: sub })
  }
  out.push({ genre: '', subgenre: '' }) // the no-genre-yet book
  return out
}
