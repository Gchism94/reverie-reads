import { useEffect, useRef } from 'react'
import type { ResolvedMode, SkinId } from '@reverie/core'
import { atmosphereForSkin } from './skinAtmosphere'

interface Point {
  x: number
  y: number
}

interface Crack {
  points: Point[]
  weight: number
}

interface Star {
  x: number
  y: number
  radius: number
  phase: number
  speed: number
  base: number
}

function seeded(seedValue: number) {
  let seed = seedValue >>> 0
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0
    return seed / 4294967296
  }
}

function makeCracks(width: number, height: number): Crack[] {
  const random = seeded(Math.round(width * 17 + height * 29))
  const cracks: Crack[] = []

  for (let index = 0; index < 8; index += 1) {
    const fromLeft = index % 2 === 0
    const fromBottom = index % 3 === 0
    let x = fromLeft ? -2 : width + 2
    let y = fromBottom ? height + 2 : height * (0.08 + random() * 0.78)
    const points: Point[] = [{ x, y }]
    const steps = 4 + Math.floor(random() * 4)
    const reach = width * (0.08 + random() * 0.13)

    for (let step = 1; step <= steps; step += 1) {
      const inward = (reach / steps) * (0.72 + random() * 0.5)
      x += fromLeft ? inward : -inward
      y += (random() - 0.5) * Math.min(34, height * 0.055) - (fromBottom ? 8 : 0)
      points.push({ x, y })
    }

    cracks.push({ points, weight: 0.45 + random() * 0.55 })
  }

  return cracks
}

function makeStars(width: number, height: number): Star[] {
  const random = seeded(Math.round(width * 31 + height * 11))
  return Array.from({ length: Math.max(18, Math.min(34, Math.round(width / 34))) }, () => ({
    x: random() * width,
    y: random() * height * 0.88,
    radius: random() < 0.9 ? 0.55 + random() * 0.75 : 1.35 + random() * 0.55,
    phase: random() * Math.PI * 2,
    speed: 0.00008 + random() * 0.00008,
    base: 0.08 + random() * 0.12,
  }))
}

function drawCracks(
  context: CanvasRenderingContext2D,
  cracks: Crack[],
  elapsed: number,
  color: string,
  motion: boolean,
) {
  const phase = elapsed % 24_000
  const reveal = motion && phase > 17_000 && phase < 21_500
  const revealProgress = Math.min(1, Math.max(0, (phase - 17_000) / 1_800))
  const revealFade = Math.min(1, Math.max(0, (21_500 - phase) / 1_500))

  context.strokeStyle = color
  context.lineCap = 'round'
  context.lineJoin = 'round'

  for (const crack of cracks) {
    context.beginPath()
    crack.points.forEach((point, index) => {
      if (index === 0) context.moveTo(point.x, point.y)
      else context.lineTo(point.x, point.y)
    })
    context.globalAlpha = 0.055 + crack.weight * 0.035
    context.lineWidth = 0.55 + crack.weight * 0.35
    context.stroke()

    if (!reveal) continue
    const lastIndex = Math.max(1, Math.floor((crack.points.length - 1) * revealProgress))
    context.beginPath()
    crack.points.slice(0, lastIndex + 1).forEach((point, index) => {
      if (index === 0) context.moveTo(point.x, point.y)
      else context.lineTo(point.x, point.y)
    })
    context.globalAlpha = (0.06 + crack.weight * 0.055) * revealFade
    context.lineWidth = 0.75 + crack.weight * 0.4
    context.stroke()
  }
}

function drawFog(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  elapsed: number,
  color: string,
  motion: boolean,
) {
  const clouds = [
    { x: 0.18, y: 0.28, rx: 0.42, ry: 0.22, speed: 82_000, drift: 18, alpha: 0.045 },
    { x: 0.72, y: 0.48, rx: 0.48, ry: 0.25, speed: 69_000, drift: -15, alpha: 0.035 },
    { x: 0.42, y: 0.76, rx: 0.38, ry: 0.18, speed: 91_000, drift: 12, alpha: 0.028 },
  ]

  for (const cloud of clouds) {
    const movement = motion ? Math.sin((elapsed / cloud.speed) * Math.PI * 2) * cloud.drift : 0
    const x = width * cloud.x + movement
    const y = height * cloud.y
    const radius = Math.max(width * cloud.rx, height * cloud.ry)
    const gradient = context.createRadialGradient(x, y, 0, x, y, radius)
    gradient.addColorStop(0, color)
    gradient.addColorStop(1, 'transparent')
    context.save()
    context.translate(x, y)
    context.scale(1, Math.max(0.42, (height * cloud.ry) / (width * cloud.rx)))
    context.translate(-x, -y)
    context.globalAlpha = cloud.alpha
    context.fillStyle = gradient
    context.fillRect(0, 0, width, height * 2)
    context.restore()
  }
}

function drawStars(
  context: CanvasRenderingContext2D,
  stars: Star[],
  elapsed: number,
  color: string,
  motion: boolean,
) {
  context.fillStyle = color
  for (const star of stars) {
    const breath = motion ? (Math.sin(elapsed * star.speed + star.phase) + 1) / 2 : 0.35
    context.globalAlpha = star.base + breath * 0.28
    context.beginPath()
    context.arc(star.x, star.y, star.radius, 0, Math.PI * 2)
    context.fill()
  }
}

/**
 * Low-frequency, decorative atmosphere for the few skins that benefit from motion. Geometry is
 * deterministic, never intercepts input, pauses with the page, and becomes a quiet still under the
 * reader's reduced-motion preference.
 */
export function SkinAtmosphereCanvas({ skin, mode }: { skin: SkinId; mode: ResolvedMode }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const kind = atmosphereForSkin(skin, mode)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !kind) return
    const context = canvas.getContext('2d')
    if (!context) return

    const host = canvas.parentElement ?? canvas
    const reducedQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
    let reduced = reducedQuery.matches
    let frame = 0
    let width = 0
    let height = 0
    let lastPaint = 0
    let paintColor = ''
    let cracks: Crack[] = []
    let stars: Star[] = []

    const resize = () => {
      const bounds = canvas.getBoundingClientRect()
      width = Math.max(1, bounds.width)
      height = Math.max(1, bounds.height)
      const ratio = Math.min(2, window.devicePixelRatio || 1)
      canvas.width = Math.round(width * ratio)
      canvas.height = Math.round(height * ratio)
      context.setTransform(ratio, 0, 0, ratio, 0, 0)
      cracks = kind === 'fracture' ? makeCracks(width, height) : []
      stars = kind === 'stars' ? makeStars(width, height) : []
      const styles = getComputedStyle(host)
      paintColor = styles
        .getPropertyValue(kind === 'fracture' ? '--primary' : kind === 'fog' ? '--fog' : '--star')
        .trim()
    }

    const paint = (elapsed: number, motion: boolean) => {
      context.clearRect(0, 0, width, height)
      if (kind === 'fracture') {
        drawCracks(context, cracks, elapsed, paintColor, motion)
      } else if (kind === 'fog') {
        drawFog(context, width, height, elapsed, paintColor, motion)
      } else {
        drawStars(context, stars, elapsed, paintColor, motion)
      }
      context.globalAlpha = 1
    }

    const tick = (timestamp: number) => {
      if (document.hidden || reduced) return
      if (timestamp - lastPaint >= 1000 / 24) {
        paint(timestamp, true)
        lastPaint = timestamp
      }
      frame = window.requestAnimationFrame(tick)
    }

    const start = () => {
      window.cancelAnimationFrame(frame)
      paint(performance.now(), false)
      if (!document.hidden && !reduced) frame = window.requestAnimationFrame(tick)
    }

    const onVisibility = () => start()
    const onMotion = (event: MediaQueryListEvent) => {
      reduced = event.matches
      start()
    }

    resize()
    start()
    const observer =
      typeof ResizeObserver === 'undefined'
        ? null
        : new ResizeObserver(() => {
            resize()
            start()
          })
    observer?.observe(host)
    if (!observer) window.addEventListener('resize', resize)
    document.addEventListener('visibilitychange', onVisibility)
    reducedQuery.addEventListener?.('change', onMotion)

    return () => {
      window.cancelAnimationFrame(frame)
      observer?.disconnect()
      if (!observer) window.removeEventListener('resize', resize)
      document.removeEventListener('visibilitychange', onVisibility)
      reducedQuery.removeEventListener?.('change', onMotion)
    }
  }, [kind, mode, skin])

  if (!kind) return null

  return (
    <canvas
      ref={canvasRef}
      data-testid="skin-atmosphere"
      data-atmosphere={kind}
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 h-full w-full"
    />
  )
}
