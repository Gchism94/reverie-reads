import type { ResolvedMode, SkinId } from '@reverie/core'

type Point = readonly [number, number]

export interface RoomPalette {
  base: string
  depth: string
  ink: string
  gold: string
  paper: string
  accent: string
  star: string
  fog: string
  vignette: string
  glowA: string
  glowB: string
  glowC: string
  glowD: string
}

/** Stable labels make the selected material visible in browser diagnostics and visual audits. */
export const ROOM_SCENES: Record<SkinId, string> = {
  tryst: 'star-lit-plum-night',
  grimoire: 'illuminated-vellum',
  aphelion: 'instrument-grid-starfield',
  marrow: 'weathered-fractured-stone',
  umbra: 'rain-on-wet-slate',
  folio: 'cotton-paper-deckle',
  hearth: 'linen-timber-lamplight',
  almanac: 'field-paper-contours',
  bloom: 'dawn-cloud-strata',
}

const SKIN_ORDER: readonly SkinId[] = [
  'tryst',
  'grimoire',
  'aphelion',
  'marrow',
  'umbra',
  'folio',
  'hearth',
  'almanac',
  'bloom',
]

function rng(seed = 37) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0
    return seed / 4294967296
  }
}

function legacyRng(seed = 9) {
  return () => {
    seed = (seed * 1103515245 + 12345) % 2147483648
    return seed / 2147483648
  }
}

function hash(x: number, y: number) {
  let n = Math.imul(x, 374761393) + Math.imul(y, 668265263)
  n = Math.imul(n ^ (n >>> 13), 1274126177)
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295
}

const mix = (a: number, b: number, amount: number) => a + (b - a) * amount
const smooth = (amount: number) => amount * amount * (3 - 2 * amount)

function noise(x: number, y: number) {
  const ix = Math.floor(x)
  const iy = Math.floor(y)
  const fx = smooth(x - ix)
  const fy = smooth(y - iy)
  return mix(
    mix(hash(ix, iy), hash(ix + 1, iy), fx),
    mix(hash(ix, iy + 1), hash(ix + 1, iy + 1), fx),
    fy,
  )
}

function fbm(x: number, y: number) {
  let sum = 0
  let amplitude = 0.55
  for (let i = 0; i < 5; i++) {
    sum += amplitude * noise(x, y)
    x = x * 2.07 + 17.3
    y = y * 2.03 + 8.1
    amplitude *= 0.48
  }
  return sum
}

function canvas(width: number, height: number) {
  const element = document.createElement('canvas')
  element.width = width
  element.height = height
  return element
}

// The cracks begin outside the field and terminate in narrow branches. Displaced authored stress
// paths avoid the regular lightning-bolt silhouette that made the earlier Marrow feel artificial.
const FRACTURES: readonly (readonly Point[])[] = [
  [
    [0.86, -0.04],
    [0.873, 0.063],
    [0.839, 0.128],
    [0.857, 0.205],
    [0.808, 0.271],
    [0.813, 0.329],
    [0.781, 0.368],
  ],
  [
    [0.839, 0.128],
    [0.942, 0.169],
    [0.96, 0.224],
    [1.03, 0.257],
  ],
  [
    [0.857, 0.205],
    [0.879, 0.258],
    [0.864, 0.307],
  ],
  [
    [0.808, 0.271],
    [0.746, 0.256],
    [0.718, 0.29],
  ],
  [
    [-0.025, 0.53],
    [0.056, 0.576],
    [0.041, 0.661],
    [0.123, 0.713],
    [0.159, 0.792],
    [0.252, 0.839],
  ],
  [
    [0.041, 0.661],
    [0.018, 0.727],
    [-0.03, 0.755],
  ],
  [
    [0.123, 0.713],
    [0.204, 0.686],
    [0.236, 0.724],
  ],
  [
    [1.03, 0.71],
    [0.954, 0.742],
    [0.933, 0.809],
    [0.885, 0.847],
    [0.9, 0.923],
    [0.857, 1.03],
  ],
  [
    [0.933, 0.809],
    [0.971, 0.847],
    [1.012, 0.846],
  ],
  [
    [0.885, 0.847],
    [0.823, 0.825],
    [0.797, 0.852],
  ],
]

function fracturePaths(width: number, height: number) {
  const random = rng(431)
  return FRACTURES.map((points, index) => {
    const result: Point[] = []
    for (let segment = 0; segment < points.length - 1; segment++) {
      const a = points[segment]!
      const b = points[segment + 1]!
      const dx = (b[0] - a[0]) * width
      const dy = (b[1] - a[1]) * height
      const length = Math.hypot(dx, dy)
      const steps = Math.max(5, Math.round(length / 4))
      for (let i = 0; i < steps; i++) {
        const amount = i / steps
        const displacement =
          Math.sin(amount * Math.PI) *
          ((noise(amount * 9 + index * 4, segment * 7) - 0.5) * 6 + (random() - 0.5) * 1.2)
        result.push([
          a[0] * width + dx * amount + (dy / length) * displacement,
          a[1] * height + dy * amount - (dx / length) * displacement,
        ])
      }
    }
    const last = points.at(-1)!
    result.push([last[0] * width, last[1] * height])
    return { points: result, major: [0, 4, 7].includes(index) }
  })
}

const materialCache = new Map<string, HTMLCanvasElement>()

function makeMaterial(skin: SkinId, width: number, height: number) {
  const key = `${skin}-${width}-${height}`
  const cached = materialCache.get(key)
  if (cached) return cached
  const map = canvas(width, height)
  const context = map.getContext('2d')
  if (!context) throw new Error('Canvas 2D is unavailable')
  const pixels = context.createImageData(width, height)
  const kind = SKIN_ORDER.indexOf(skin)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const nx = x / width
      const ny = y / height
      const fine = hash(x + kind * 31, y) - 0.5
      const broad = fbm(nx * 5.4 + kind * 8, ny * 4.3) - 0.5
      let value = 128 + broad * 43 + fine * 13
      if (skin === 'marrow') {
        const mineral = fbm(nx * 44 + broad * 3, ny * 36) - 0.5
        value = 128 + broad * 84 + mineral * 51 + fine * 9
        if (fine < -0.494) value -= 30
      } else if (skin === 'hearth') {
        const warp = Math.sin(nx * width * 2.05 + noise(nx * 80, ny * 5) * 0.65)
        const weft = Math.sin(ny * height * 2.4 + noise(nx * 5, ny * 70))
        value = 128 + broad * 26 + warp * 3.2 + weft * 3.1 + fine * 6
      } else if (skin === 'folio' || skin === 'almanac') {
        value = 128 + broad * 28 + fine * 11 + (noise(x * 0.018, y * 0.42) - 0.5) * 8
      } else if (skin === 'umbra') {
        value = 128 + broad * 64 + fine * 8
      } else if (skin === 'bloom') {
        value = 128 + (fbm(nx * 3 + 5, ny * 11) - 0.5) * 64 + fine * 3
      }
      const offset = (y * width + x) * 4
      pixels.data[offset] = value
      pixels.data[offset + 1] = value
      pixels.data[offset + 2] = value
      pixels.data[offset + 3] = 255
    }
  }
  context.putImageData(pixels, 0, 0)
  if (skin === 'marrow') {
    const erosion = rng(184)
    // These grayscale marks are height information. The shader colors and lights them with the
    // active room tokens, so the final surface never introduces a hard-coded visual color.
    for (let i = 0; i < 550; i++) {
      const x = erosion() * width
      const y = erosion() * height
      const radius = 0.25 + Math.pow(erosion(), 3) * 1.8
      const heightValue = 75 + Math.round(erosion() * 37)
      context.fillStyle = `rgb(${heightValue},${heightValue},${heightValue})`
      context.beginPath()
      context.ellipse(x, y, radius, radius * (0.5 + erosion() * 0.5), erosion() * 3, 0, Math.PI * 2)
      context.fill()
    }
    for (const { points, major } of fracturePaths(width, height)) {
      for (let i = 1; i < points.length; i++) {
        const start = points[i - 1]!
        const end = points[i]!
        const taper = Math.pow(1 - i / points.length, 0.4)
        context.beginPath()
        context.moveTo(start[0], start[1])
        context.lineTo(end[0], end[1])
        context.strokeStyle = 'rgb(46,46,46)'
        context.lineWidth = (major ? 1.55 : 0.8) * taper + 0.12
        context.stroke()
        if (major && i % 19 === 8 && taper > 0.35) {
          const side = erosion() > 0.5 ? 1 : -1
          context.beginPath()
          context.moveTo(end[0], end[1])
          context.lineTo(end[0] + side * (1 + erosion() * 2.5), end[1] + 2)
          context.lineTo(end[0] + side * 0.4, end[1] + 4.5)
          context.closePath()
          context.fillStyle = 'rgb(62,62,62)'
          context.fill()
        }
      }
    }
  }
  if (materialCache.size >= 8) materialCache.delete(materialCache.keys().next().value!)
  materialCache.set(key, map)
  return map
}

function colorVector(color: string): [number, number, number] {
  const sample = canvas(1, 1)
  const context = sample.getContext('2d')
  if (!context) return [0, 0, 0]
  context.fillStyle = color
  context.fillRect(0, 0, 1, 1)
  const data = context.getImageData(0, 0, 1, 1).data
  return [data[0]! / 255, data[1]! / 255, data[2]! / 255]
}

const VERTEX_SHADER =
  'attribute vec2 position; varying vec2 uv; void main(){uv=position*.5+.5;gl_Position=vec4(position,0.,1.);}'
const FRAGMENT_SHADER = `
precision highp float;
varying vec2 uv;
uniform sampler2D material;
uniform vec2 texel;
uniform vec3 base, ink, gold, depth;
uniform float skin, mode;
void main(){
  vec2 q=vec2(uv.x,1.-uv.y);
  float h=texture2D(material,q).r;
  float dx=texture2D(material,q+vec2(texel.x,0.)).r-texture2D(material,q-vec2(texel.x,0.)).r;
  float dy=texture2D(material,q+vec2(0.,texel.y)).r-texture2D(material,q-vec2(0.,texel.y)).r;
  float edge=smoothstep(.16,.53,abs(q.x-.5));
  float strength=mix(.23,1.,edge);
  vec3 normal=normalize(vec3(-dx*2.3,-dy*2.3,1.));
  vec3 light=normalize(vec3(-.64,-.55,.6));
  float relief=dot(normal,light)-.6;
  float mottling=(h-.50)*(skin==3.? .62 : .22);
  float crevice=skin==3.? (1.-smoothstep(.16,.35,h))*.5:0.;
  vec3 c=base;
  c=mix(c,ink,clamp((-mottling+crevice)*strength,0.,.34));
  c+=vec3(relief)*mix(.19,.30,mode)*strength;
  float pool=exp(-length((q-vec2(.93,.12))*vec2(1.25,1.))*4.4);
  float lamp=exp(-length((q-vec2(.03,.90))*vec2(1.1,1.))*4.3);
  float illumination=pool*.06+lamp*.03;
  if(skin==3.)illumination=0.;
  if(skin==6.)illumination=lamp*.24+pool*.045;
  if(skin==4.)illumination=exp(-length((q-vec2(1.02,.65))*vec2(1.4,1.))*5.)*.14;
  if(skin==5.)illumination=pool*.015;
  if(skin==1.)illumination=pool*.1;
  c=mix(c,gold,illumination);
  c=mix(c,depth,(1.-smoothstep(.0,.72,length(q-vec2(.48,.45))))*.026);
  if(skin==8.)c=mix(c,gold,exp(-pow((q.y-.91)*3.5,2.))*.17);
  gl_FragColor=vec4(c,1.);
}`

function compileShader(gl: WebGLRenderingContext, type: number, source: string) {
  const shader = gl.createShader(type)
  if (!shader) throw new Error('Could not create atmosphere shader')
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const message = gl.getShaderInfoLog(shader) ?? 'Unknown atmosphere shader error'
    gl.deleteShader(shader)
    throw new Error(message)
  }
  return shader
}

function paintShader(
  target: HTMLCanvasElement,
  map: HTMLCanvasElement,
  palette: RoomPalette,
  skin: SkinId,
  mode: ResolvedMode,
) {
  const gl = target.getContext('webgl', {
    alpha: false,
    antialias: false,
    preserveDrawingBuffer: true,
  })
  if (!gl) return false
  const vertex = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER)
  const fragment = compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER)
  const program = gl.createProgram()
  if (!program) throw new Error('Could not create atmosphere shader program')
  gl.attachShader(program, vertex)
  gl.attachShader(program, fragment)
  gl.linkProgram(program)
  if (!gl.getProgramParameter(program, gl.LINK_STATUS))
    throw new Error(gl.getProgramInfoLog(program) ?? 'Could not link atmosphere shader')
  gl.useProgram(program)
  const buffer = gl.createBuffer()
  const texture = gl.createTexture()
  if (!buffer || !texture) throw new Error('Could not allocate atmosphere material')
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
  const position = gl.getAttribLocation(program, 'position')
  gl.enableVertexAttribArray(position)
  gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0)
  gl.bindTexture(gl.TEXTURE_2D, texture)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, map)
  gl.uniform2f(gl.getUniformLocation(program, 'texel'), 1 / map.width, 1 / map.height)
  gl.uniform3fv(gl.getUniformLocation(program, 'base'), colorVector(palette.base))
  gl.uniform3fv(gl.getUniformLocation(program, 'ink'), colorVector(palette.ink))
  gl.uniform3fv(gl.getUniformLocation(program, 'gold'), colorVector(palette.gold))
  gl.uniform3fv(gl.getUniformLocation(program, 'depth'), colorVector(palette.depth))
  gl.uniform1f(gl.getUniformLocation(program, 'skin'), SKIN_ORDER.indexOf(skin))
  gl.uniform1f(gl.getUniformLocation(program, 'mode'), mode === 'light' ? 1 : 0)
  gl.viewport(0, 0, target.width, target.height)
  gl.drawArrays(gl.TRIANGLES, 0, 3)
  gl.deleteTexture(texture)
  gl.deleteBuffer(buffer)
  gl.deleteProgram(program)
  gl.deleteShader(vertex)
  gl.deleteShader(fragment)
  return true
}

function line(
  context: CanvasRenderingContext2D,
  points: readonly Point[],
  color: string,
  alpha = 0.18,
  weight = 0.65,
) {
  context.beginPath()
  points.forEach(([x, y], index) => (index ? context.lineTo(x, y) : context.moveTo(x, y)))
  context.strokeStyle = color
  context.globalAlpha = alpha
  context.lineWidth = weight
  context.stroke()
  context.globalAlpha = 1
}

function leaf(
  context: CanvasRenderingContext2D,
  palette: RoomPalette,
  x: number,
  y: number,
  angle: number,
  size: number,
  alpha = 0.16,
) {
  context.save()
  context.translate(x, y)
  context.rotate(angle)
  context.beginPath()
  context.moveTo(0, 0)
  context.bezierCurveTo(size * 0.25, -size * 0.3, size * 0.84, -size * 0.27, size, 0)
  context.bezierCurveTo(size * 0.67, size * 0.16, size * 0.26, size * 0.24, 0, 0)
  context.fillStyle = palette.gold
  context.globalAlpha = alpha
  context.fill()
  context.restore()
}

function paintDetails(
  target: HTMLCanvasElement,
  skin: SkinId,
  palette: RoomPalette,
  mode: ResolvedMode,
) {
  const context = target.getContext('2d')
  if (!context) return
  context.save()
  context.scale(target.width / 1200, target.height / 900)
  const random = rng(913)
  const dark = mode === 'dark'
  if (skin === 'grimoire') {
    const at = (amount: number): Point => {
      const inverse = 1 - amount
      return [
        inverse ** 3 * 1210 +
          3 * inverse * inverse * amount * 1070 +
          3 * inverse * amount * amount * 1230 +
          amount ** 3 * 1115,
        inverse ** 3 * 30 +
          3 * inverse * inverse * amount * 155 +
          3 * inverse * amount * amount * 365 +
          amount ** 3 * 530,
      ]
    }
    line(
      context,
      Array.from({ length: 100 }, (_, index) => at(index / 99)),
      palette.gold,
      0.24,
      0.7,
    )
    for (let i = 0; i < 30; i++) {
      const amount = 0.04 + i * 0.029
      const [x, y] = at(amount)
      const [nextX, nextY] = at(amount + 0.005)
      const angle = Math.atan2(nextY - y, nextX - x)
      leaf(
        context,
        palette,
        x,
        y,
        angle + (i % 2 ? -0.85 : 0.9),
        14 + random() * 15,
        0.08 + random() * 0.12,
      )
      if (i % 5 === 0) {
        const branch = angle - 1.1
        line(
          context,
          [
            [x, y],
            [x + Math.cos(branch) * 35, y + Math.sin(branch) * 35],
          ],
          palette.gold,
          0.13,
          0.5,
        )
      }
    }
    for (let i = 0; i < 170; i++) {
      context.fillStyle = palette.gold
      context.globalAlpha = random() * 0.2
      context.fillRect(
        1070 + random() * 125,
        80 + random() * 490,
        0.45 + random() * 1.4,
        0.45 + random() * 1.4,
      )
    }
  } else if (skin === 'umbra') {
    for (let i = 0; i < 55; i++) {
      const x = 1055 + random() * 160
      const y = random() * 880
      const length = 8 + Math.pow(random(), 2) * 46
      line(
        context,
        [
          [x, y],
          [x - 0.5, y + length * 0.72],
          [x - 1.3, y + length],
        ],
        palette.gold,
        0.05 + random() * 0.12,
        0.6 + random() * 0.5,
      )
      context.globalAlpha = 0.1
      context.fillStyle = palette.gold
      context.beginPath()
      context.ellipse(x - 1.3, y + length, 1, 2, 0, 0, Math.PI * 2)
      context.fill()
    }
  } else if (skin === 'folio') {
    for (let i = 0; i < 320; i++) {
      const x = random() * 1200
      const y = random() * 900
      if (x > 180 && x < 1020) continue
      line(
        context,
        [
          [x, y],
          [x + 1 + random() * 5, y + random() * 2],
        ],
        palette.ink,
        0.035,
        0.45,
      )
    }
    const edge: Point[] = Array.from({ length: 300 }, (_, index) => [
      index * 4,
      875 + noise(index * 0.34, 12) * 3,
    ])
    line(context, edge, palette.ink, 0.12, 0.7)
    line(
      context,
      edge.map(([x, y]) => [x, y + 2]),
      palette.paper,
      0.35,
      1,
    )
  } else if (skin === 'hearth') {
    for (let y = 818; y < 900; y += 3) {
      const points: Point[] = Array.from({ length: 121 }, (_, index) => [
        index * 10,
        y + noise(index * 0.055, y * 0.034) * 13,
      ])
      line(context, points, palette.gold, 0.025 + (y - 818) / 4200, 0.6)
    }
    line(
      context,
      [
        [35, 900],
        [35, 825],
        [150, 825],
      ],
      palette.gold,
      0.14,
      0.7,
    )
    context.setLineDash([2, 5])
    line(
      context,
      [
        [42, 900],
        [42, 832],
        [150, 832],
      ],
      palette.gold,
      0.16,
      0.6,
    )
    context.setLineDash([])
  } else if (skin === 'almanac') {
    const step = 8
    const value = (x: number, y: number) => fbm(x / 215 + 6, y / 255 + 2)
    for (let level = 0.26; level < 0.8; level += 0.028) {
      context.beginPath()
      for (let y = 0; y < 900; y += step) {
        for (let x = 0; x < 1200; x += step) {
          if (x > 190 && x < 1025) continue
          const corners: readonly Point[] = [
            [x, y],
            [x + step, y],
            [x + step, y + step],
            [x, y + step],
          ]
          const values = corners.map(([cornerX, cornerY]) => value(cornerX, cornerY))
          const hits: Point[] = []
          for (let i = 0; i < 4; i++) {
            const next = (i + 1) % 4
            const fromValue = values[i]!
            const toValue = values[next]!
            if (fromValue < level !== toValue < level) {
              const amount = (level - fromValue) / (toValue - fromValue)
              const from = corners[i]!
              const to = corners[next]!
              hits.push([mix(from[0], to[0], amount), mix(from[1], to[1], amount)])
            }
          }
          if (hits.length >= 2) {
            context.moveTo(hits[0]![0], hits[0]![1])
            context.lineTo(hits[1]![0], hits[1]![1])
          }
        }
      }
      context.strokeStyle = palette.ink
      context.globalAlpha = dark ? 0.085 : 0.1
      context.lineWidth = 0.5
      context.stroke()
    }
    line(
      context,
      [
        [1130, 890],
        [1110, 807],
        [1132, 746],
        [1123, 687],
      ],
      palette.gold,
      0.25,
      0.8,
    )
    for (let i = 0; i < 13; i++)
      leaf(
        context,
        palette,
        1118 + Math.sin(i * 0.8) * 9,
        870 - i * 13,
        i % 2 ? -2.3 : -0.65,
        15 + random() * 12,
        0.13,
      )
  } else if (skin === 'bloom') {
    for (let band = 0; band < 3; band++) {
      context.beginPath()
      context.moveTo(0, 900)
      for (let x = 0; x <= 1200; x += 8)
        context.lineTo(x, 690 + band * 44 + (noise(x / 450, band * 4) - 0.5) * 130)
      context.lineTo(1200, 900)
      context.closePath()
      context.fillStyle = band % 2 ? palette.gold : palette.accent
      context.globalAlpha = 0.016 + band * 0.003
      context.fill()
    }
    if (dark) {
      for (let i = 0; i < 35; i++) {
        context.globalAlpha = 0.15 + random() * 0.22
        context.fillStyle = palette.star
        context.beginPath()
        context.arc(random() * 1200, random() * 390, 0.4 + random() * 0.7, 0, Math.PI * 2)
        context.fill()
      }
    }
  }
  context.restore()
  context.globalAlpha = 1
}

function paintCanvasFallback(
  target: HTMLCanvasElement,
  map: HTMLCanvasElement,
  palette: RoomPalette,
  skin: SkinId,
) {
  const context = target.getContext('2d')
  if (!context) return
  context.fillStyle = palette.base
  context.fillRect(0, 0, target.width, target.height)
  context.globalAlpha = skin === 'marrow' ? 0.22 : 0.1
  context.globalCompositeOperation = 'soft-light'
  context.drawImage(map, 0, 0, target.width, target.height)
  context.globalCompositeOperation = 'source-over'
  context.globalAlpha = 1
}

function radialGlow(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  color: string,
  alpha: number,
) {
  const glow = context.createRadialGradient(x, y, 0, x, y, radius)
  glow.addColorStop(0, color)
  glow.addColorStop(1, 'transparent')
  context.globalAlpha = alpha
  context.fillStyle = glow
  context.fillRect(x - radius, y - radius, radius * 2, radius * 2)
  context.globalAlpha = 1
}

function paintVignette(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  color: string,
) {
  const radius = Math.max(width, height) * 0.82
  const vignette = context.createRadialGradient(
    width * 0.45,
    height * 0.35,
    radius * 0.34,
    width * 0.45,
    height * 0.35,
    radius,
  )
  vignette.addColorStop(0, 'transparent')
  vignette.addColorStop(1, color)
  context.fillStyle = vignette
  context.globalAlpha = 0.72
  context.fillRect(0, 0, width, height)
  context.globalAlpha = 1
}

function paintLegacySky(
  target: HTMLCanvasElement,
  skin: 'tryst' | 'aphelion',
  palette: RoomPalette,
  displayWidth: number,
) {
  const context = target.getContext('2d')
  if (!context) return
  const ratio = target.width / displayWidth
  const width = target.width
  const height = target.height
  context.fillStyle = palette.base
  context.fillRect(0, 0, width, height)
  const extent = Math.max(width, height)
  const glows = [
    [width * -0.1 + extent * 0.3, height * -0.15 + extent * 0.3, extent * 0.3, palette.glowA, 0.5],
    [
      width * 1.12 - extent * 0.25,
      height * 0.08 + extent * 0.25,
      extent * 0.25,
      palette.glowB,
      0.5,
    ],
    [
      width * 0.12 + extent * 0.275,
      height * 1.2 - extent * 0.275,
      extent * 0.275,
      palette.glowC,
      0.5,
    ],
    [
      width * 0.96 - extent * 0.17,
      height * 1.08 - extent * 0.17,
      extent * 0.17,
      palette.glowD,
      0.32,
    ],
  ] as const
  context.globalCompositeOperation = 'screen'
  for (const [x, y, radius, color, alpha] of glows) radialGlow(context, x, y, radius, color, alpha)
  context.globalCompositeOperation = 'source-over'
  const random = legacyRng()
  const count = skin === 'aphelion' ? 95 : 60
  context.fillStyle = palette.star
  for (let i = 0; i < count; i++) {
    const x = random() * width
    const y = random() * height
    const size = (random() < 0.85 ? 1 : 2) * ratio
    random()
    random()
    context.globalAlpha = 0.58
    context.beginPath()
    context.arc(x, y, Math.max(0.45, size / 2), 0, Math.PI * 2)
    context.fill()
  }
  const fog = context.createRadialGradient(
    width * 0.5,
    height * 0.58,
    0,
    width * 0.5,
    height * 0.58,
    extent * 0.62,
  )
  fog.addColorStop(0, palette.fog)
  fog.addColorStop(1, 'transparent')
  context.globalAlpha = 0.75
  context.fillStyle = fog
  context.fillRect(0, height * 0.25, width, height * 0.64)
  context.globalAlpha = 1
  paintVignette(context, width, height, palette.vignette)
  if (skin === 'aphelion') {
    // The original instrument mesh is a 46 CSS-pixel grid with a radial fade from the top.
    const grid = 46 * ratio
    context.strokeStyle = palette.accent
    context.lineWidth = Math.max(0.5, ratio)
    for (let x = (width % grid) / 2; x < width; x += grid) {
      const edge = Math.abs(x / width - 0.5) / 0.5
      context.globalAlpha = 0.045 * Math.max(0, 1 - edge * 0.72)
      context.beginPath()
      context.moveTo(x, 0)
      context.lineTo(x, height)
      context.stroke()
    }
    for (let y = 0; y < height; y += grid) {
      context.globalAlpha = 0.045 * Math.max(0, 1 - y / height)
      context.beginPath()
      context.moveTo(0, y)
      context.lineTo(width, y)
      context.stroke()
    }
    context.globalAlpha = 1
  }
}

/** Paint the approved study into a cached still. WebGL lights the height map once, then releases
 * its context; the visible app remains an ordinary Canvas 2D surface. */
export function paintRoomMaterial(
  target: HTMLCanvasElement,
  skin: SkinId,
  mode: ResolvedMode,
  palette: RoomPalette,
  displayWidth: number,
) {
  if (skin === 'tryst' || skin === 'aphelion') {
    paintLegacySky(target, skin, palette, displayWidth)
    return 'Canvas restored sky'
  }
  const map = makeMaterial(skin, target.width, target.height)
  const gpu = canvas(target.width, target.height)
  let renderer = 'Canvas material fallback'
  try {
    if (paintShader(gpu, map, palette, skin, mode)) {
      target.getContext('2d')?.drawImage(gpu, 0, 0)
      renderer = 'WebGL material cached as Canvas'
    } else paintCanvasFallback(target, map, palette, skin)
  } catch {
    paintCanvasFallback(target, map, palette, skin)
  } finally {
    gpu.getContext('webgl')?.getExtension('WEBGL_lose_context')?.loseContext()
  }
  if (skin !== 'marrow') paintDetails(target, skin, palette, mode)
  const context = target.getContext('2d')
  if (context) paintVignette(context, target.width, target.height, palette.vignette)
  return renderer
}

/** A quiet motion layer. Materials remain fixed; only local light and restored stars breathe. */
export function paintRoomMotion(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  skin: SkinId,
  palette: RoomPalette,
  time: number,
) {
  const warm = skin === 'hearth' || skin === 'grimoire' || skin === 'umbra'
  const x = warm ? width * 0.01 : width * 0.94
  const y = warm ? height * 0.82 : height * 0.22
  const radius = Math.max(width, height) * (warm ? 0.34 : 0.42)
  radialGlow(context, x, y, radius, palette.gold, 0.035 + 0.018 * Math.sin(time / 16000))
  if (skin !== 'tryst' && skin !== 'aphelion') return
  const random = legacyRng()
  const count = skin === 'aphelion' ? 95 : 60
  context.fillStyle = palette.star
  for (let i = 0; i < count; i++) {
    const starX = random() * width
    const starY = random() * height
    const size = random() < 0.85 ? 1 : 2
    const delay = random() * 6000
    const duration = 3000 + random() * 5000
    const phase = ((time + delay) % duration) / duration
    context.globalAlpha = 0.03 + 0.19 * (0.5 - 0.5 * Math.cos(phase * Math.PI * 2))
    context.beginPath()
    context.arc(starX, starY, size * 0.55, 0, Math.PI * 2)
    context.fill()
  }
  context.globalAlpha = 1
}
