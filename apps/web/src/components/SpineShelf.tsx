import { useEffect, useRef, useState } from 'react'
import type { Book } from '@reverie/core'
import { subgenreGradient } from '../library/constants'

/**
 * A horizontal shelf of book spines. The spine nearest the shelf's center flips open to its
 * cover as you scroll — the design's signature spine-shelf interaction.
 */
export function SpineShelf({ books, onOpen }: { books: Book[]; onOpen: (id: string) => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const [activeId, setActiveId] = useState<string | null>(books[0]?.id ?? null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    let raf = 0
    const update = () => {
      const r = el.getBoundingClientRect()
      const cx = r.left + r.width / 2
      let best: string | null = null
      let bd = Infinity
      el.querySelectorAll<HTMLElement>('[data-spine]').forEach((s) => {
        const sr = s.getBoundingClientRect()
        const d = Math.abs(sr.left + sr.width / 2 - cx)
        if (d < bd) {
          bd = d
          best = s.dataset.spine ?? null
        }
      })
      setActiveId(best)
    }
    const onScroll = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(update)
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    update()
    return () => {
      el.removeEventListener('scroll', onScroll)
      cancelAnimationFrame(raf)
    }
  }, [books])

  return (
    <div
      ref={ref}
      className="flex items-end gap-1.5 overflow-x-auto pb-2 pt-1"
      style={{ scrollbarWidth: 'none' }}
    >
      {books.map((b) => {
        const active = b.id === activeId
        const [g0, g1] = subgenreGradient(b.subgenre)
        return (
          <button
            key={b.id}
            data-spine={b.id}
            onClick={() => onOpen(b.id)}
            title={b.title}
            aria-label={`Open ${b.title}`}
            className="relative h-44 flex-none snap-center overflow-hidden rounded-md border border-line transition-[width] duration-300"
            style={{
              width: active ? 120 : 30,
              background: b.cover
                ? `center/cover no-repeat url(${b.cover})`
                : `linear-gradient(160deg, ${g0}, ${g1})`,
            }}
          >
            {(!active || !b.cover) && (
              <span
                className="absolute inset-0 flex items-center justify-center p-1 text-center font-semibold text-on-primary"
                style={{
                  writingMode: active ? 'horizontal-tb' : 'vertical-rl',
                  fontFamily: 'var(--font-display)',
                  fontSize: active ? 12 : 10,
                  background: b.cover ? 'rgba(0,0,0,0.35)' : 'transparent',
                }}
              >
                {b.title}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
