import { useEffect, useRef } from 'react'
import type { AdaptiveBundle, ResolvedMode, SkinId } from '@reverie/core'
import { drawRoomScene, ROOM_SCENES, type RoomPalette } from './roomScene'

/** Bounded, cached Canvas 2D room art shared by the app and landing. No WebGL, image downloads,
 * pointer tracking, or per-frame React renders. Hidden previews and reduced-motion views rest. */
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
      // A slow change in local light, always behind the reading surface; under reduced motion the
      // exact authored still remains. Day rooms need no continuous rendering at all.
      if (time && mode === 'dark') {
        const x = skin === 'aphelion' || skin === 'bloom' ? width * 0.95 : width * 0.06
        const y = height * (skin === 'umbra' ? 0.68 : 0.36)
        const radius = Math.min(width, height) * 0.38
        const glow = context.createRadialGradient(x, y, 0, x, y, radius)
        glow.addColorStop(0, palette.light)
        glow.addColorStop(1, 'transparent')
        context.globalAlpha = 0.018 + 0.012 * Math.sin(time / 14000)
        context.fillStyle = glow
        context.fillRect(0, 0, width, height)
        context.globalAlpha = 1
      }
    }
    const tick = () => {
      if (!visible || document.hidden || motion.matches || mode === 'light') return
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
      const rect = canvas.getBoundingClientRect()
      width = Math.max(1, rect.width)
      height = Math.max(1, rect.height)
      // Cap both density and total pixels: long landing sections cannot allocate giant buffers.
      const ratio = Math.min(
        1.5,
        window.devicePixelRatio || 1,
        Math.sqrt(1_800_000 / (width * height)),
      )
      canvas.width = still.width = Math.max(1, Math.round(width * ratio))
      canvas.height = still.height = Math.max(1, Math.round(height * ratio))
      context.setTransform(ratio, 0, 0, ratio, 0, 0)
      const styles = getComputedStyle(canvas)
      const value = (key: string) => styles.getPropertyValue(key).trim()
      palette = {
        base: value('--bg0'),
        depth: value('--bg1'),
        ink: value('--ink'),
        light: value('--gold'),
        accent: value('--primary'),
        cool: value('--glow-a'),
        paper: value('--card-solid'),
      }
      drawRoomScene(scene, still.width, still.height, skin, mode, palette)
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
