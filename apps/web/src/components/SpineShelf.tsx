import { useEffect, useRef, useState } from 'react'
import type { Book } from '@reverie/core'
import { Spine } from './Spine'

/**
 * A horizontal shelf of book spines — each a real per-skin Spine (gilt-bound Tryst · brushed-metal
 * Aphelion), sized book-to-book. The spine nearest the shelf's centre widens, and flips open to its
 * cover when it has one — the design's signature spine-shelf interaction.
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
      className="flex items-end gap-1.5 overflow-x-auto pb-4 pt-4"
      style={{ scrollbarWidth: 'none' }}
    >
      {books.map((b) => {
        const active = b.id === activeId
        return (
          <button
            key={b.id}
            data-spine={b.id}
            onClick={() => onOpen(b.id)}
            title={b.title}
            aria-label={`Open ${b.title}`}
            className="flex-none snap-center self-end"
          >
            {/* the featured volume lifts off the shelf, the skin's accent pointing beneath it —
                the chunk-4 composed screens' shared shelf gesture (all nine skins agree) */}
            <span
              className="relative block transition-transform duration-300 motion-reduce:transition-none"
              style={active ? { transform: 'translateY(-8px)', filter: 'drop-shadow(0 12px 14px rgba(0, 0, 0, 0.38))', zIndex: 2 } : undefined}
            >
              {active && b.cover ? (
                <div
                  className="h-44 w-[120px] overflow-hidden rounded-md border border-line"
                  style={{ background: `center/cover no-repeat url(${b.coverThumb || b.cover})` }}
                />
              ) : (
                <Spine book={b} active={active} tint={b.coverColor} />
              )}
              {active && (
                <span
                  aria-hidden
                  className="absolute left-1/2 bottom-[-9px]"
                  style={{ width: 7, height: 7, transform: 'translateX(-50%) rotate(45deg)', background: 'var(--accent)', boxShadow: '0 0 8px color-mix(in srgb, var(--accent) 55%, transparent)' }}
                />
              )}
            </span>
          </button>
        )
      })}
    </div>
  )
}
