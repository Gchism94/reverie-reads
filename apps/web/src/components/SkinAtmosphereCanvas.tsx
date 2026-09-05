import { useEffect, useRef } from 'react'
import type { AdaptiveBundle, ResolvedMode, SkinId } from '@reverie/core'
import { paintRoomMaterial, paintRoomMotion, ROOM_SCENES, type RoomPalette } from './roomMaterials'

/** The approved material study shared by the app and landing. A small WebGL shader lights a
 * bounded height map once and releases its context; the visible canvas only redraws its cached
 * still plus quiet lamplight. Hidden previews and reduced-motion views rest. */
export function SkinAtmosphereCanvas({
  skin,
  mode,
  adaptiveBundle,
}: {
  skin: SkinId
  mode: ResolvedMode
  /** Repaint when the adaptive palette changes without changing its dominant room. */
  adaptiveBundle?: AdaptiveBundle | null
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = canvasRef.current
    const context = canvas?.getContext('2d')
    if (!canvas || !context) return
    const still = document.createElement('canvas')
    const scene = still.getContext('2d')
    if (!scene) return
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)')
    let visible = true
    let timer = 0
    let frame = 0
    let width = 1
    let height = 1
    let palette: RoomPalette
    const cancel = () => {
      window.clearTimeout(timer)
      window.cancelAnimationFrame(frame)
    }
    const paint = (time = 0) => {
      context.clearRect(0, 0, width, height)
      context.drawImage(still, 0, 0, width, height)
      if (time) paintRoomMotion(context, width, height, skin, palette, time)
    }
    const tick = () => {
      if (!visible || document.hidden || motion.matches) return
      frame = window.requestAnimationFrame((time) => {
        paint(time)
        timer = window.setTimeout(tick, 125)
      })
    }
    const start = () => {
      cancel()
      paint()
      tick()
    }
    const resize = () => {
      const started = performance.now()
      const rect = canvas.getBoundingClientRect()
      width = Math.max(1, rect.width)
      height = Math.max(1, rect.height)
      // Match the reviewed material bound: previews and long app surfaces never retain more than
      // 900,000 material pixels, even on a high-density display.
      const ratio = Math.min(
        1.5,
        window.devicePixelRatio || 1,
        Math.sqrt(900_000 / (width * height)),
      )
      canvas.width = still.width = Math.max(1, Math.floor(width * ratio))
      canvas.height = still.height = Math.max(1, Math.floor(height * ratio))
      context.setTransform(ratio, 0, 0, ratio, 0, 0)
      const styles = getComputedStyle(canvas)
      const value = (key: string) => styles.getPropertyValue(key).trim()
      palette = {
        base: value('--bg0'),
        depth: value('--bg1'),
        ink: value('--ink'),
        gold: value('--gold'),
        accent: value('--primary'),
        paper: value('--card-solid'),
        star: value('--star'),
        fog: value('--fog'),
        vignette: value('--vignette'),
        glowA: value('--glow-a'),
        glowB: value('--glow-b'),
        glowC: value('--glow-c'),
        glowD: value('--glow-d'),
      }
      canvas.dataset.renderer = paintRoomMaterial(still, skin, mode, palette, width)
      canvas.dataset.materialPixels = String(still.width * still.height)
      canvas.dataset.paintMs = (performance.now() - started).toFixed(1)
      start()
    }
    const resizeObserver = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(resize)
    const intersection =
      typeof IntersectionObserver === 'undefined'
        ? null
        : new IntersectionObserver(([entry]) => {
            visible = entry?.isIntersecting ?? false
            start()
          })
    resizeObserver?.observe(canvas)
    intersection?.observe(canvas)
    if (!resizeObserver) window.addEventListener('resize', resize)
    motion.addEventListener('change', start)
    document.addEventListener('visibilitychange', start)
    resize()
    return () => {
      cancel()
      resizeObserver?.disconnect()
      intersection?.disconnect()
      window.removeEventListener('resize', resize)
      motion.removeEventListener('change', start)
      document.removeEventListener('visibilitychange', start)
    }
  }, [skin, mode, adaptiveBundle])
  return (
    <canvas
      ref={canvasRef}
      data-testid="skin-atmosphere"
      data-atmosphere={ROOM_SCENES[skin]}
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 h-full w-full"
    />
  )
}
