import { describe, expect, it } from 'vitest'
import { clampOffset, coverScale, CROP_MAX_ZOOM, sourceRect } from './cropMath'

const FRAME = { w: 240, h: 360 } // the sheet's 2:3 frame

describe('cropMath', () => {
  it('coverScale makes the short side fill the frame', () => {
    // landscape photo into a portrait frame: height binds
    expect(coverScale(4000, 3000, FRAME.w, FRAME.h)).toBeCloseTo(360 / 3000)
    // skinny portrait: width binds
    expect(coverScale(300, 3000, FRAME.w, FRAME.h)).toBeCloseTo(240 / 300)
  })

  it('clampOffset keeps the image covering the frame and bounds zoom', () => {
    const c = clampOffset({ zoom: 0.2, tx: 9999, ty: -9999 }, 1000, 1500, FRAME.w, FRAME.h)
    expect(c.zoom).toBe(1)
    const s = coverScale(1000, 1500, FRAME.w, FRAME.h)
    expect(Math.abs(c.tx)).toBeLessThanOrEqual((1000 * s - FRAME.w) / 2 + 1e-9)
    expect(Math.abs(c.ty)).toBeLessThanOrEqual((1500 * s - FRAME.h) / 2 + 1e-9)
    expect(clampOffset({ zoom: 99, tx: 0, ty: 0 }, 100, 150, FRAME.w, FRAME.h).zoom).toBe(CROP_MAX_ZOOM)
  })

  it('sourceRect at rest is the centred cover crop', () => {
    // 3000×3000 square into 2:3 → shows a 2000×3000 centred band
    const r = sourceRect({ zoom: 1, tx: 0, ty: 0 }, 3000, 3000, FRAME.w, FRAME.h)
    expect(r.sw).toBeCloseTo(2000)
    expect(r.sh).toBeCloseTo(3000)
    expect(r.sx).toBeCloseTo(500)
    expect(r.sy).toBeCloseTo(0)
  })

  it('sourceRect pans in image space and never leaves the image', () => {
    const state = { zoom: 2, tx: -10_000, ty: 10_000 } // hard pan, will clamp
    const r = sourceRect(state, 3000, 3000, FRAME.w, FRAME.h)
    expect(r.sx).toBeGreaterThanOrEqual(0)
    expect(r.sy).toBeGreaterThanOrEqual(0)
    expect(r.sx + r.sw).toBeLessThanOrEqual(3000 + 1e-6)
    expect(r.sy + r.sh).toBeLessThanOrEqual(3000 + 1e-6)
    // zoom 2 halves the visible source
    expect(r.sw).toBeCloseTo(1000)
    expect(r.sh).toBeCloseTo(1500)
  })

  it('output keeps the 2:3 aspect at any zoom/pan', () => {
    for (const st of [{ zoom: 1, tx: 0, ty: 0 }, { zoom: 1.7, tx: 33, ty: -21 }, { zoom: 4, tx: -80, ty: 55 }]) {
      const r = sourceRect(st, 2811, 1993, FRAME.w, FRAME.h)
      expect(r.sw / r.sh).toBeCloseTo(2 / 3, 5)
    }
  })
})
