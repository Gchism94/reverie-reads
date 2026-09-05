import type { SkinId } from '@reverie/core'
import type { RoomPalette } from './roomScene'

type Point = readonly [number, number]

/** Material is authored in the scene's 1200 × 900 space and cached with its still. The seeded
 * detail never moves beneath text; only the renderer's separate lamplight can breathe. */
export function drawRoomMaterials(
  c: CanvasRenderingContext2D,
  skin: SkinId,
  night: boolean,
  p: RoomPalette,
  random: () => number,
) {
  c.save()
  const stroke = (points: readonly Point[], color: string, alpha: number, width = 1) => {
    c.beginPath()
    points.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)))
    c.strokeStyle = color
    c.globalAlpha = alpha
    c.lineWidth = width
    c.stroke()
  }
  const wash = (x: number, y: number, radius: number, color: string, alpha: number) => {
    const gradient = c.createRadialGradient(x, y, 0, x, y, radius)
    gradient.addColorStop(0, color)
    gradient.addColorStop(1, 'transparent')
    c.fillStyle = gradient
    c.globalAlpha = alpha
    c.fillRect(x - radius, y - radius, radius * 2, radius * 2)
  }

  if (skin === 'marrow') {
    // Uneven, water-worn limestone: broad mineral clouds first, then pores and spalled edges.
    for (let i = 0; i < 65; i++) {
      const x = random() < 0.5 ? random() * 240 : 970 + random() * 230
      wash(x, random() * 900, 35 + random() * 145, i % 2 ? p.ink : p.depth, 0.025 + random() * 0.04)
    }
    for (let i = 0; i < 4200; i++) {
      const x = random() * 1200
      const y = random() * 900
      const edge = Math.pow(Math.abs(x - 600) / 600, 2)
      const size = 0.35 + random() * 1.8
      c.fillStyle = p.ink
      c.globalAlpha = (0.025 + edge * 0.14) * random()
      c.fillRect(x, y, size, size * 0.65)
      c.fillStyle = p.depth
      c.fillRect(x + 0.6, y + 0.8, size, size)
    }
    // The worn shoulder of an old stone tablet, partly outside the room; paired incised rules.
    for (const inset of [0, 12, 23]) {
      c.beginPath()
      c.moveTo(986 + inset, 900)
      c.lineTo(986 + inset, 191)
      c.bezierCurveTo(985 + inset, 106, 1090, 64 + inset, 1220, 92 + inset)
      c.strokeStyle = p.depth
      c.globalAlpha = night ? 0.8 : 0.42
      c.lineWidth = inset === 0 ? 9 : 3
      c.stroke()
      c.translate(1.5, 1.5)
      c.strokeStyle = p.ink
      c.globalAlpha = inset === 0 ? 0.13 : 0.065
      c.lineWidth = 1
      c.stroke()
      c.translate(-1.5, -1.5)
    }

    // Midpoint displacement makes mineral fractures, not repeated zigzags. Each seam has a
    // dark cavity, a chipped shoulder, a narrow illuminated lip, and tapering secondary cracks.
    const fracture = (anchors: readonly Point[], breadth: number, branch: boolean) => {
      let points: Point[] = [...anchors]
      for (let pass = 0; pass < 3; pass++) {
        const divided: Point[] = [points[0]!]
        for (let i = 1; i < points.length; i++) {
          const a = points[i - 1]!
          const b = points[i]!
          const dx = b[0] - a[0]
          const dy = b[1] - a[1]
          const length = Math.hypot(dx, dy) || 1
          const displacement = (random() - 0.5) * length * 0.38
          divided.push(
            [
              (a[0] + b[0]) / 2 - (dy / length) * displacement,
              (a[1] + b[1]) / 2 + (dx / length) * displacement,
            ],
            b,
          )
        }
        points = divided
      }
      for (let i = 1; i < points.length; i++) {
        const a = points[i - 1]!
        const b = points[i]!
        const taper = 0.25 + 0.75 * (1 - i / points.length)
        const shoulder = breadth * taper * (1.1 + random() * 0.9)
        stroke([a, b], p.depth, night ? 0.7 : 0.42, shoulder * 1.7)
        stroke([a, b], night ? p.depth : p.ink, night ? 1 : 0.32, breadth * taper)
        stroke(
          [
            [a[0] + shoulder * 0.65, a[1] + 0.9],
            [b[0] + shoulder * 0.65, b[1] + 0.9],
          ],
          night ? p.ink : p.paper,
          night ? 0.15 : 0.6,
          0.7,
        )
        if (branch && i % 9 === 4) {
          const side = random() < 0.5 ? -1 : 1
          fracture(
            [
              a,
              [a[0] + side * (18 + random() * 35), a[1] + 17],
              [a[0] + side * (35 + random() * 52), a[1] + 35 + random() * 45],
            ],
            breadth * 0.38,
            false,
          )
          c.beginPath()
          c.moveTo(a[0] - 2, a[1] - 3)
          c.lineTo(a[0] + breadth * 2.8, a[1] + 2)
          c.lineTo(a[0] + 2, a[1] + 10)
          c.closePath()
          c.fillStyle = p.depth
          c.globalAlpha = 0.55
          c.fill()
        }
      }
    }
    fracture(
      [
        [-8, 95],
        [87, 162],
        [63, 280],
        [170, 380],
        [148, 496],
      ],
      3.6,
      true,
    )
    fracture(
      [
        [1165, -15],
        [1092, 114],
        [1130, 230],
        [1040, 340],
        [1076, 490],
        [994, 580],
      ],
      3.6,
      true,
    )
    fracture(
      [
        [1208, 680],
        [1128, 725],
        [1137, 820],
        [1030, 916],
      ],
      3.2,
      true,
    )
    fracture(
      [
        [-10, 790],
        [76, 754],
        [146, 827],
        [245, 856],
      ],
      2.7,
      true,
    )
  } else if (skin === 'tryst') {
    // Full velvet folds have a broad dark trough and a narrow, warm pile catching the light.
    for (let i = 0; i < 6; i++) {
      const x = -72 + i * 34
      const gradient = c.createLinearGradient(x, 0, x + 65, 0)
      gradient.addColorStop(0, p.depth)
      gradient.addColorStop(0.5, p.base)
      gradient.addColorStop(0.75, p.accent)
      gradient.addColorStop(1, p.depth)
      c.beginPath()
      c.moveTo(x, 0)
      c.bezierCurveTo(x + 96, 200, x + 45, 640, x - 28, 900)
      c.lineTo(x + 13, 900)
      c.bezierCurveTo(x + 91, 650, x + 135, 200, x + 34, 0)
      c.closePath()
      c.fillStyle = gradient
      c.globalAlpha = night ? 0.36 : 0.2
      c.fill()
    }
    wash(115, 630, 200, p.light, 0.08)
  } else if (skin === 'grimoire') {
    // Deep stone reveals, leaded glass and the warm ends of well-used books.
    for (const x of [917, 1185]) {
      c.fillStyle = p.depth
      c.globalAlpha = 0.4
      c.fillRect(x, 190, 22, 710)
      stroke(
        [
          [x + 21, 190],
          [x + 21, 900],
        ],
        p.light,
        0.17,
        2,
      )
      for (let y = 220; y < 900; y += 93)
        stroke(
          [
            [x, y],
            [x + 22, y + 2],
          ],
          p.ink,
          0.065,
        )
    }
    for (let y = 235; y < 820; y += 108) {
      stroke(
        [
          [950, y],
          [1060, y - 95],
          [1170, y],
          [1060, y + 95],
          [950, y],
        ],
        p.light,
        0.09,
      )
    }
    for (const y of [280, 465, 650, 835]) {
      for (let x = 6; x < 166; x += 21) {
        const height = 58 + random() * 65
        c.fillStyle = x % 2 ? p.light : p.accent
        c.globalAlpha = 0.075
        c.fillRect(x, y - height, 15, height - 6)
        for (const offset of [9, height - 17])
          stroke(
            [
              [x + 2, y - height + offset],
              [x + 13, y - height + offset],
            ],
            p.light,
            0.18,
          )
      }
    }
  } else if (skin === 'umbra') {
    // Rain collects into tapered tracks with a pale refracted edge on the glass.
    for (let i = 0; i < 46; i++) {
      const x = 1005 + random() * 210
      const y = 105 + random() * 490
      const length = 10 + random() * 80
      stroke(
        [
          [x, y],
          [x - 1, y + length * 0.6],
          [x - 4, y + length],
        ],
        p.depth,
        0.35,
        2.2,
      )
      stroke(
        [
          [x + 1.2, y + 3],
          [x, y + length * 0.6],
          [x - 3, y + length],
        ],
        p.ink,
        0.16,
        0.65,
      )
      c.beginPath()
      c.ellipse(x - 4, y + length, 1.6, 3.4, 0, 0, Math.PI * 2)
      c.fillStyle = p.ink
      c.globalAlpha = 0.12
      c.fill()
    }
    stroke(
      [
        [990, 52],
        [990, 680],
        [1200, 680],
      ],
      p.depth,
      0.7,
      12,
    )
    stroke(
      [
        [983, 52],
        [983, 687],
        [1200, 687],
      ],
      p.light,
      0.14,
      2,
    )
    wash(70, 666, 215, p.light, 0.09)
  } else if (skin === 'folio') {
    // Offset sheets have deckled edges and graphite pressure rather than a geometric grid.
    for (let sheet = 4; sheet >= 0; sheet--) {
      const x = 1070 + sheet * 12
      const points: Point[] = [[x, 45]]
      for (let y = 52; y < 845; y += 8) points.push([x + random() * 2.5, y])
      points.push([760 + sheet * 11, 845 + sheet * 4])
      stroke(points, p.depth, 0.3, 5)
      stroke(points, p.ink, 0.09, 0.8)
    }
    for (let y = 120; y < 215; y += 14) {
      const points: Point[] = []
      for (let x = 23; x < 58; x += 3) points.push([x, y + (random() - 0.5) * 5])
      stroke(points, p.ink, 0.12, 0.7)
    }
  } else if (skin === 'hearth') {
    // Woven linen beside the seat, with bent timber grain below the sill.
    for (let x = 0; x < 175; x += 4)
      stroke(
        [
          [x, 0],
          [x + 7, 900],
        ],
        p.ink,
        0.018,
      )
    for (let y = 0; y < 900; y += 5)
      stroke(
        [
          [0, y],
          [170, y + 2],
        ],
        p.light,
        0.032,
      )
    for (let i = 0; i < 20; i++) {
      c.beginPath()
      c.ellipse(45, 829, 55 + i * 14, 5 + i * 5, -0.07, 0, Math.PI * 2)
      c.strokeStyle = p.light
      c.globalAlpha = 0.055
      c.lineWidth = 0.8
      c.stroke()
    }
    wash(1100, 610, 260, p.light, 0.08)
  } else if (skin === 'almanac') {
    // A field map's closed contour rings and a small pressed fern at the notebook edge.
    for (let ring = 0; ring < 14; ring++) {
      const points: Point[] = []
      for (let t = 0; t <= 100; t++) {
        const angle = (t / 100) * Math.PI * 2
        const radius = 36 + ring * 18 + Math.sin(angle * 3) * 13 + Math.cos(angle * 5) * 7
        points.push([1180 + Math.cos(angle) * radius * 0.62, 660 + Math.sin(angle) * radius])
      }
      stroke(points, p.accent, ring % 4 === 0 ? 0.14 : 0.07, ring % 4 === 0 ? 1.4 : 0.7)
    }
    stroke(
      [
        [38, 705],
        [94, 509],
      ],
      p.ink,
      0.15,
    )
    for (let i = 0; i < 10; i++) {
      const x = 44 + i * 5
      const y = 684 - i * 17
      for (const side of [-1, 1]) {
        c.beginPath()
        c.moveTo(x, y)
        c.quadraticCurveTo(x + side * 30, y - 8, x + side * (34 - i * 2), y - 28)
        c.quadraticCurveTo(x + side * 12, y - 20, x, y)
        c.fillStyle = p.accent
        c.globalAlpha = 0.09
        c.fill()
      }
    }
  } else if (skin === 'bloom') {
    // Layered dawn hills beyond a rounded window, like a favourite illustrated jacket.
    c.save()
    c.beginPath()
    c.roundRect(1014, 74, 322, 652, [160, 160, 2, 2])
    c.clip()
    wash(1110, 475, 150, p.light, night ? 0.15 : 0.26)
    for (let hill = 0; hill < 4; hill++) {
      c.beginPath()
      c.moveTo(1000, 545 + hill * 49)
      c.bezierCurveTo(1110, 465 + hill * 55, 1170, 640 + hill * 30, 1360, 495 + hill * 54)
      c.lineTo(1360, 750)
      c.lineTo(1000, 750)
      c.closePath()
      c.fillStyle = hill % 2 ? p.accent : p.cool
      c.globalAlpha = 0.08 + hill * 0.015
      c.fill()
    }
    c.restore()
  }
  c.restore()
}
