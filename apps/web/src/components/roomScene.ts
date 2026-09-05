import type { SkinId, ResolvedMode } from '@reverie/core'

export interface RoomPalette {
  base: string
  depth: string
  ink: string
  light: string
  accent: string
  cool: string
  paper: string
}

/** Each room has its own architecture, not a shared arrangement of colored glows. */
export const ROOM_SCENES: Record<SkinId, string> = {
  tryst: 'lamplit-salon',
  grimoire: 'tower-study',
  aphelion: 'orbital-alcove',
  marrow: 'sheltered-archive',
  umbra: 'rainy-study',
  folio: 'writing-desk',
  hearth: 'window-seat',
  almanac: 'field-study',
  bloom: 'dawn-corner',
}

function random(seed = 431) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0
    return seed / 4294967296
  }
}

/** Static art is rendered once per size/theme. Coordinates are normalized; details stay at the
 * edges and the quiet central field remains a reading surface. All colors come from room tokens. */
export function drawRoomScene(
  c: CanvasRenderingContext2D,
  w: number,
  h: number,
  skin: SkinId,
  mode: ResolvedMode,
  p: RoomPalette,
) {
  const rng = random()
  const night = mode === 'dark'
  c.clearRect(0, 0, w, h)
  c.save()
  c.scale(w / 1200, h / 900)
  const fill = (color: string | CanvasGradient, alpha: number) => {
    c.fillStyle = color
    c.globalAlpha = alpha
  }
  const line = (color: string, alpha: number, width = 1) => {
    c.strokeStyle = color
    c.globalAlpha = alpha
    c.lineWidth = width
  }
  const glow = (x: number, y: number, rx: number, ry: number, color: string, alpha: number) => {
    c.save()
    c.translate(x, y)
    c.scale(rx, ry)
    const g = c.createRadialGradient(0, 0, 0, 0, 0, 1)
    g.addColorStop(0, color)
    g.addColorStop(1, 'transparent')
    fill(g, alpha)
    c.fillRect(-1, -1, 2, 2)
    c.restore()
  }
  const path = (points: number[][], color: string, alpha: number, width = 1) => {
    line(color, alpha, width)
    c.beginPath()
    points.forEach(([x, y], i) => (i ? c.lineTo(x!, y!) : c.moveTo(x!, y!)))
    c.stroke()
  }
  const window = (x: number, y: number, ww: number, hh: number, rounded = false) => {
    c.save()
    line(p.light, night ? 0.16 : 0.12, 2)
    c.beginPath()
    c.roundRect(x, y, ww, hh, rounded ? [ww / 2, ww / 2, 2, 2] : 2)
    c.stroke()
    path(
      [
        [x + ww / 2, y + (rounded ? 20 : 0)],
        [x + ww / 2, y + hh],
      ],
      p.light,
      0.13,
      2,
    )
    path(
      [
        [x, y + hh * 0.58],
        [x + ww, y + hh * 0.58],
      ],
      p.light,
      0.13,
      2,
    )
    c.restore()
  }
  fill(p.base, 1)
  c.fillRect(0, 0, 1200, 900)
  switch (skin) {
    case 'tryst': {
      glow(95, 370, 560, 640, p.light, night ? 0.19 : 0.1)
      glow(1150, 170, 300, 540, p.accent, 0.16)
      // Velvet folds and the frame of a private salon; the pool of light belongs to the books.
      for (let i = 0; i < 7; i++) {
        c.beginPath()
        c.moveTo(-80 + i * 24, 0)
        c.bezierCurveTo(150 + i * 10, 170, 50 + i * 19, 550, -50 + i * 20, 900)
        line(p.depth, 0.34 - i * 0.025, 18)
        c.stroke()
      }
      window(1060, 90, 195, 560, true)
      path(
        [
          [36, 100],
          [36, 827],
          [215, 827],
        ],
        p.light,
        0.19,
      )
      path(
        [
          [42, 106],
          [42, 819],
          [209, 819],
        ],
        p.light,
        0.07,
      )
      glow(155, 640, 230, 210, p.light, night ? 0.2 : 0.1)
      break
    }
    case 'grimoire': {
      glow(1110, 230, 480, 730, p.light, 0.15)
      // Pointed window, vellum light and stacked shelf rules.
      for (const offset of [0, 15, 31]) {
        line(p.light, 0.17 - offset * 0.002, 1.5)
        c.beginPath()
        c.moveTo(950 - offset, 820)
        c.lineTo(950 - offset, 190)
        c.quadraticCurveTo(950 - offset, 88, 1060, 10 - offset)
        c.quadraticCurveTo(1170 + offset, 88, 1170 + offset, 190)
        c.lineTo(1170 + offset, 820)
        c.stroke()
      }
      for (const y of [280, 465, 650, 835]) {
        path(
          [
            [0, y],
            [175, y],
          ],
          p.light,
          0.15,
          2,
        )
        for (let i = 0; i < 8; i++) {
          const x = i * 22 + 3
          const height = 55 + rng() * 65
          line(p.accent, 0.1, 1)
          c.strokeRect(x, y - height, 14 + rng() * 4, height - 5)
        }
      }
      glow(190, 850, 450, 250, p.paper, 0.08)
      break
    }
    case 'aphelion': {
      glow(1130, 210, 400, 510, p.cool, 0.2)
      glow(90, 790, 270, 260, p.light, 0.09)
      // Wide observation window with an orbital horizon, never a command console.
      line(p.accent, 0.21, 2)
      c.beginPath()
      c.roundRect(945, 35, 450, 655, 110)
      c.stroke()
      c.save()
      c.beginPath()
      c.roundRect(957, 47, 430, 630, 98)
      c.clip()
      line(p.accent, 0.18, 2)
      c.beginPath()
      c.ellipse(1420, 440, 380, 185, -0.3, 0, Math.PI * 2)
      c.stroke()
      glow(1390, 550, 470, 160, p.cool, 0.26)
      fill(p.ink, night ? 0.5 : 0.17)
      for (let i = 0; i < 42; i++) {
        c.beginPath()
        c.arc(960 + rng() * 260, 60 + rng() * 590, 0.4 + rng(), 0, Math.PI * 2)
        c.fill()
      }
      c.restore()
      path(
        [
          [35, 160],
          [35, 820],
          [255, 820],
        ],
        p.accent,
        0.13,
      )
      path(
        [
          [52, 175],
          [52, 805],
        ],
        p.accent,
        0.07,
      )
      break
    }
    case 'marrow': {
      glow(160, 170, 420, 440, p.paper, 0.12)
      glow(1180, 870, 470, 650, p.depth, 0.8)
      // A safe pool of light within a deep archive. Broken mineral seams stay at the perimeter.
      for (let i = 0; i < 8; i++) {
        let x = i % 2 ? 1195 : 5
        let y = 60 + i * 108
        const pts = [[x, y]]
        for (let j = 0; j < 5; j++) {
          x += (i % 2 ? -1 : 1) * (8 + rng() * 18)
          y += rng() * 34 - 12
          pts.push([x, y])
        }
        path(pts, p.ink, 0.075)
      }
      path(
        [
          [1020, 0],
          [1020, 800],
          [1200, 850],
        ],
        p.paper,
        0.08,
        2,
      )
      glow(118, 240, 100, 270, p.light, 0.05)
      break
    }
    case 'umbra': {
      glow(1070, 300, 420, 600, p.cool, 0.17)
      window(997, 40, 250, 625, true)
      for (let i = 0; i < 60; i++) {
        const x = 1002 + rng() * 245
        const y = 80 + rng() * 520
        path(
          [
            [x, y],
            [x - 3, y + 12 + rng() * 30],
          ],
          p.ink,
          0.05 + rng() * 0.07,
        )
      }
      glow(130, 640, 440, 490, p.light, 0.2)
      path(
        [
          [0, 813],
          [300, 813],
        ],
        p.light,
        0.14,
        2,
      )
      path(
        [
          [30, 795],
          [210, 795],
        ],
        p.light,
        0.08,
      )
      break
    }
    case 'folio': {
      glow(160, 160, 580, 670, p.paper, 0.12)
      // Paper edges and a single pencil margin, with a pale desk instead of a heavy vignette.
      for (let i = 0; i < 4; i++) {
        path(
          [
            [1090 + i * 10, 35 + i * 9],
            [1090 + i * 10, 835 + i * 9],
            [760, 835 + i * 9],
          ],
          p.ink,
          0.06,
        )
      }
      path(
        [
          [72, 90],
          [72, 820],
        ],
        p.accent,
        0.12,
      )
      for (let i = 0; i < 7; i++)
        path(
          [
            [25, 280 + i * 9],
            [53 + rng() * 9, 280 + i * 9],
          ],
          p.ink,
          0.09,
        )
      break
    }
    case 'hearth': {
      glow(1095, 245, 510, 690, p.light, night ? 0.24 : 0.18)
      window(1000, 18, 285, 620)
      // Window light across linen, a sill and soft wood grain.
      c.save()
      fill(p.light, night ? 0.035 : 0.05)
      for (let i = 0; i < 3; i++) {
        c.beginPath()
        c.moveTo(1000 + i * 115, 270)
        c.lineTo(1070 + i * 115, 270)
        c.lineTo(560 + i * 150, 900)
        c.lineTo(465 + i * 150, 900)
        c.closePath()
        c.fill()
      }
      c.restore()
      path(
        [
          [965, 660],
          [1200, 660],
        ],
        p.light,
        0.23,
        5,
      )
      for (let i = 0; i < 8; i++) {
        c.beginPath()
        c.moveTo(0, 740 + i * 18)
        c.bezierCurveTo(80, 730 + i * 18, 170, 755 + i * 18, 275, 742 + i * 18)
        line(p.light, 0.055)
        c.stroke()
      }
      break
    }
    case 'almanac': {
      glow(980, 85, 430, 420, p.paper, 0.16)
      // Contours outside the page and a field notebook's indexed edge.
      for (let i = 0; i < 8; i++) {
        c.beginPath()
        c.moveTo(990 + i * 25, 30)
        c.bezierCurveTo(870 + i * 25, 260, 1210 + i * 12, 500, 1010 + i * 24, 850)
        line(p.accent, 0.075)
        c.stroke()
      }
      for (let i = 0; i < 4; i++) {
        fill(i % 2 ? p.light : p.accent, 0.08)
        c.fillRect(15, 180 + i * 130, 40, 70)
        path(
          [
            [72, 160 + i * 130],
            [72, 225 + i * 130],
          ],
          p.ink,
          0.1,
        )
      }
      path(
        [
          [35, 860],
          [290, 860],
        ],
        p.ink,
        0.1,
      )
      break
    }
    case 'bloom': {
      glow(740, 960, 1000, 580, p.light, night ? 0.14 : 0.25)
      glow(1100, 440, 490, 760, p.accent, 0.18)
      glow(0, 10, 620, 650, p.cool, 0.2)
      // A low dawn horizon through a rounded private corner.
      window(1010, 70, 330, 660, true)
      for (let i = 0; i < 3; i++) {
        c.beginPath()
        c.moveTo(0, 860 + i * 13)
        c.bezierCurveTo(300, 765 + i * 24, 850, 960 - i * 9, 1200, 770 + i * 25)
        line(p.light, 0.11 - i * 0.025, 1.5)
        c.stroke()
      }
      if (night) {
        fill(p.ink, 0.24)
        for (let i = 0; i < 25; i++) {
          const x = rng() < 0.5 ? rng() * 180 : 1030 + rng() * 170
          c.beginPath()
          c.arc(x, rng() * 620, 0.5 + rng() * 0.6, 0, Math.PI * 2)
          c.fill()
        }
      }
      break
    }
  }
  // Fine deterministic fibers: a material hint, not image noise animated behind words.
  fill(p.ink, night ? 0.018 : 0.024)
  for (let i = 0; i < 900; i++) c.fillRect(rng() * 1200, rng() * 900, 0.6, 0.6 + rng() * 1.3)
  c.restore()
  c.globalAlpha = 1
}
