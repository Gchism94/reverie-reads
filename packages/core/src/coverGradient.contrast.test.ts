import { describe, expect, it } from 'vitest'
import { coverGradient, gradientMatrix, GRADIENT_L } from './coverGradient'
import { CORE_GENRES } from './genreNormalize'

// The registry-keyed contrast guardrail, extended to the GENERATED gradient space.
//
// The placeholder paints type over this gradient, so every stop the app can produce has to be
// legible under both the light type the dark plates use and the near-black ink the light ones do.
// Hand-tuning ~81 genre × subgenre pairs and verifying each would be a standing invitation to miss
// one; instead every colour is generated inside a bounded lightness band and this asserts the band
// holds — so ADDING a genre or a subgenre cannot silently produce an illegible plate.

/** HSL → relative luminance (WCAG). Measured, not asserted. */
function luminance(h: number, s: number, l: number): number {
  const S = s / 100
  const L = l / 100
  const c = (1 - Math.abs(2 * L - 1)) * S
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = L - c / 2
  const hh = ((h % 360) + 360) % 360
  const [r, g, b] =
    hh < 60 ? [c, x, 0] : hh < 120 ? [x, c, 0] : hh < 180 ? [0, c, x] : hh < 240 ? [0, x, c] : hh < 300 ? [x, 0, c] : [c, 0, x]
  const f = (v: number): number => {
    const u = v + m
    return u <= 0.03928 ? u / 12.92 : Math.pow((u + 0.055) / 1.055, 2.4)
  }
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
}

const ratio = (a: number, b: number): number => {
  const [hi, lo] = a > b ? [a, b] : [b, a]
  return (hi + 0.05) / (lo + 0.05)
}

const parseHsl = (css: string): [number, number, number] => {
  const m = /hsl\((\d+) (\d+)% (\d+)%\)/.exec(css)
  if (!m) throw new Error(`not an hsl() string: ${css}`)
  return [Number(m[1]), Number(m[2]), Number(m[3])]
}

const AA = 4.5
const WHITE = 1.0

describe('cover gradient — every generated stop is legible by construction', () => {
  const matrix = gradientMatrix()

  it('covers the whole space it claims to', () => {
    // one entry per genre with no subgenre, plus every subgenre per genre, plus the no-genre book
    expect(matrix.length).toBeGreaterThan(CORE_GENRES.length)
    expect(matrix.some((m) => m.genre === '')).toBe(true)
  })

  it('never leaves the lightness band', () => {
    for (const { genre, subgenre } of matrix) {
      for (const stop of coverGradient(genre, subgenre)) {
        const [, , l] = parseHsl(stop)
        expect(l, `${genre}/${subgenre || '—'} → ${stop}`).toBeGreaterThanOrEqual(GRADIENT_L.lo)
        expect(l, `${genre}/${subgenre || '—'} → ${stop}`).toBeLessThanOrEqual(GRADIENT_L.hi)
      }
    }
  })

  it('clears AA against white type at every stop', () => {
    for (const { genre, subgenre } of matrix) {
      for (const stop of coverGradient(genre, subgenre)) {
        const [h, s, l] = parseHsl(stop)
        const r = ratio(WHITE, luminance(h, s, l))
        expect(r, `${genre}/${subgenre || '—'} ${stop} vs white = ${r.toFixed(2)}:1`).toBeGreaterThanOrEqual(AA)
      }
    }
  })

  it('is anchored to the genre registry — a new genre without a hue fails here, not in the sweep', () => {
    for (const genre of CORE_GENRES) {
      const [a, b] = coverGradient(genre.toLowerCase(), '')
      const unset = coverGradient('', '')
      // A genre that fell through to the no-genre neutral would silently wear someone else's colour.
      expect(a, `${genre} has no hue of its own`).not.toBe(unset[0])
      expect(b).not.toBe(unset[1])
    }
  })

  it('gives every genre a DISTINCT family — the old map collapsed everything to romance pink', () => {
    const hues = CORE_GENRES.map((g) => parseHsl(coverGradient(g.toLowerCase(), '')[0])[0])
    expect(new Set(hues).size).toBe(CORE_GENRES.length)
  })
})

describe('cover gradient — the subgenre modulates, it never re-genres', () => {
  it('keeps hue fixed across every subgenre of a genre', () => {
    for (const genre of CORE_GENRES) {
      const key = genre.toLowerCase()
      const base = parseHsl(coverGradient(key, '')[0])[0]
      for (const { subgenre } of gradientMatrix().filter((m) => m.genre === key)) {
        expect(parseHsl(coverGradient(key, subgenre)[0])[0], `${key}/${subgenre} drifted off its hue`).toBe(base)
      }
    }
  })

  it('the ordering accident now costs a shade, not a genre', () => {
    // The motivating case: a HORROR book whose first subgenre pick is Dark Romance.
    const horrorHue = parseHsl(coverGradient('horror', 'Dark Romance')[0])[0]
    const romanceHue = parseHsl(coverGradient('romance', 'Dark Romance')[0])[0]
    expect(horrorHue).not.toBe(romanceHue)
    expect(horrorHue).toBe(parseHsl(coverGradient('horror', '')[0])[0])
  })

  it('a dark subgenre reads darker than a soft one within the same family', () => {
    const dark = parseHsl(coverGradient('romance', 'Dark Romance')[0])[2]
    const soft = parseHsl(coverGradient('romance', 'Romantic Comedy')[0])[2]
    expect(dark).toBeLessThan(soft)
  })

  it('an unknown subgenre sits neutral rather than falling anywhere surprising', () => {
    const [a] = coverGradient('fantasy', 'Not A Real Subgenre')
    const [n] = coverGradient('fantasy', '')
    expect(a).toBe(n)
  })
})
