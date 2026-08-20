import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { contrastRatio, parseColor } from './adaptive'
import { SKINS, type SkinId } from './skins'
import { SKIN_TOKENS, type Tok } from './skinTokens.fixture'
import {
  BELOW_FLOOR_BUDGET,
  COVER_OVERLAY_SURFACES,
  NON_TEXT_FLOOR,
  scrimOverWhite,
} from './coverOverlay'

// THE SCRIM GUARD — the coverage `statePill.contrast.test.ts` could not have, by construction.
//
// That test enforces "no translucent scrim over cover art" for the pills, keyed to
// STATE_PILL_TOKENS. A component that renders a scrim instead of a token is invisible to it: there
// is no token entry to check, so nothing fails, so the surface reads as covered. CoverCard kept
// `rgba(0,0,0,0.45)` — the exact literal the pill header names as the pattern it abandoned — for
// months underneath a green suite.
//
// This guard keys off WHAT THE COMPONENT DOES instead of what tokens it names: it reads the app
// source, finds every translucent background inside a file that paints uncontrolled cover artwork,
// and requires each one to be declared in COVER_OVERLAY_SURFACES with its class. A sixth mark added
// tomorrow fails here until someone says which case it is. The registry cannot fall behind the
// code because the code is the input — that is the whole difference between this and a second list.

const WEB_SRC = join(__dirname, '..', '..', '..', 'apps', 'web', 'src')
const REPO_REL = (abs: string) => abs.slice(abs.indexOf('apps/web/src'))

function walk(dir: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) out.push(...walk(p))
    else if (p.endsWith('.tsx') && !p.includes('.test.')) out.push(p)
  }
  return out
}

/** A file paints uncontrolled artwork if it renders the cover image component or a raw <img>. */
const PAINTS_ARTWORK = /<CoverImage\b|<img\b/
/**
 * ANY rgba() literal in such a file — not just `background: 'rgba(...)'`.
 *
 * The narrower form was the instrument's own first bug, and it is worth keeping visible: CoverCard
 * assigns its scrim to a variable (`const markBg = showsPlaceholder ? … : 'rgba(0,0,0,0.45)'`) and
 * only later spreads it into `style`. A regex anchored on `background:` therefore reported CoverCard
 * as CLEAN — the exact component this guard was written for, missed by the guard, for the same
 * reason the token-keyed test missed it: the check was keyed to a spelling rather than to the thing.
 */
const SCRIM = /'(rgba\([^']*\))'/g

interface FoundSite {
  file: string
  scrim: string
}

function scanForScrims(): FoundSite[] {
  const found: FoundSite[] = []
  for (const abs of walk(WEB_SRC)) {
    const src = readFileSync(abs, 'utf8')
    if (!PAINTS_ARTWORK.test(src)) continue
    for (const m of src.matchAll(SCRIM)) {
      found.push({ file: REPO_REL(abs), scrim: m[1]!.replace(/\s+/g, '') })
    }
  }
  return found
}

describe('cover-overlay registry — the source is the input, so it cannot fall behind', () => {
  it('finds the surfaces it is supposed to find (the scanner is not vacuous)', () => {
    const found = scanForScrims()
    // If this ever reads 0, the scanner broke — every assertion below would pass for the wrong
    // reason, which is the failure mode this whole file exists to prevent elsewhere.
    expect(found.length).toBeGreaterThan(0)
    expect(found.map((f) => f.file)).toContain('apps/web/src/components/CoverCard.tsx')
  })

  it('every scrim painted in a cover-rendering file is declared', () => {
    const declared = new Set(
      COVER_OVERLAY_SURFACES.map((s) => `${s.file}::${s.scrim.replace(/\s+/g, '')}`),
    )
    const undeclared = scanForScrims()
      .map((f) => `${f.file}::${f.scrim}`)
      .filter((k) => !declared.has(k))
    expect(
      [...new Set(undeclared)],
      'a translucent background appeared in a file that paints cover artwork and is not in ' +
        'COVER_OVERLAY_SURFACES. Declare it: OVER_ARTWORK (contrast is unbounded — the ink must ' +
        'clear the floor against white artwork) or OVER_OWN_ART (say what bounds it).',
    ).toEqual([])
  })

  it('every OVER_OWN_ART claim states what bounds it', () => {
    for (const s of COVER_OVERLAY_SURFACES) {
      if (s.class !== 'OVER_OWN_ART') continue
      expect(s.bounded, `${s.file} ${s.scrim} claims OVER_OWN_ART without saying why`).toBeTruthy()
    }
  })

  it('the below-floor budget is a ratchet — lower it, never raise it', () => {
    const below = COVER_OVERLAY_SURFACES.filter(
      (s) => s.class === 'OVER_ARTWORK' && s.belowFloor,
    ).length
    expect(
      below,
      `${below} OVER_ARTWORK surfaces are declared below the ${NON_TEXT_FLOOR}:1 floor against ` +
        `a budget of ${BELOW_FLOOR_BUDGET}. If this went DOWN, lower BELOW_FLOOR_BUDGET to match.`,
    ).toBeLessThanOrEqual(BELOW_FLOOR_BUDGET)
  })
})

// ── The contrast half: white ink over the worst artwork a scrim can sit on ──────────────────────
//
// Over uncontrolled artwork the worst case is WHITE: a black scrim at alpha `a` composites no
// darker than rgb(255(1-a)), so any ink that clears the floor there clears it over every cover.
// That is the only bound available, and it is why the pills went solid instead.

const MODES = ['dark', 'light'] as const

describe('cover-overlay contrast — the ink clears the non-text floor over white artwork', () => {
  for (const surface of COVER_OVERLAY_SURFACES) {
    if (surface.class !== 'OVER_ARTWORK') continue
    const alpha = Number(surface.scrim.match(/([\d.]+)\s*\)$/)?.[1] ?? 1)
    const composite = scrimOverWhite(alpha)

    it(`${surface.file} ${surface.scrim} — white ink clears ${NON_TEXT_FLOOR}:1`, () => {
      const white = parseColor('#ffffff')
      expect(white, 'parseColor failed on #ffffff').toBeTruthy()
      const r = contrastRatio(white!, composite)
      expect(
        Number(r.toFixed(2)),
        `white on ${surface.scrim} over white artwork is ${r.toFixed(2)}:1`,
      ).toBeGreaterThanOrEqual(NON_TEXT_FLOOR)
    })
  }

  // The accent case, measured across the whole registry rather than asserted — this is the number
  // the state-pill header quotes ("the nine skins' accents measure 1.1-2.7:1") and the reason a
  // mark that must be identifiable cannot ride the accent over an unknown cover.
  it('records why --mark-accent cannot carry an identifying mark over artwork', () => {
    const composite = scrimOverWhite(0.45)
    const ratios: number[] = []
    for (const id of Object.keys(SKINS) as SkinId[]) {
      for (const mode of MODES) {
        const key = `${id}/${mode}` as const
        const tok: Tok | undefined = SKIN_TOKENS[key]
        expect(tok, `add a SKIN_TOKENS row for ${key}`).toBeDefined()
        const ink = parseColor(tok!.markAccent)
        expect(ink, `${key} markAccent is not parseable: ${tok!.markAccent}`).toBeTruthy()
        ratios.push(contrastRatio(ink!, composite))
      }
    }
    expect(ratios).toHaveLength(Object.keys(SKINS).length * 2)
    const worst = Math.max(...ratios)
    expect(
      Number(worst.toFixed(2)),
      `the BEST skin accent over 0.45-black-on-white is ${worst.toFixed(2)}:1 — still under ` +
        `${NON_TEXT_FLOOR}:1, which is why the favourite heart was moved to white ink and why the ` +
        `remaining accent marks are declared belowFloor rather than called covered.`,
    ).toBeLessThan(NON_TEXT_FLOOR)
  })
})
