import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi, afterEach } from 'vitest'
import { Surface } from './Surface'

/**
 * Unit coverage for the `Surface` primitive (Batch 0 — no call site migrated yet).
 *
 * These assert the CONTRACT the audit's §3 settled, not the implementation's shape. The three that
 * matter most are the independence tests: `radius` must not follow `tone`, and `tone` must not
 * imply `raised`. Both are decisions the audit had to correct itself on, and a component that
 * quietly re-derives one from the other would put the mistake back without anyone editing the doc.
 */

afterEach(() => vi.restoreAllMocks())

const box = () => screen.getByTestId('s')

describe('Surface — defaults', () => {
  it('defaults to tone=card, radius=card, pad=2 (p-3), bordered, flat', () => {
    render(<Surface data-testid="s">x</Surface>)
    const el = box()
    expect(el.tagName).toBe('DIV')
    expect(el.className).toContain('skin-card')
    expect(el.className).toContain('border border-line')
    expect(el.className).toContain('p-3')
    expect(el.style.background).toBe('var(--card)')
    // Flat by default: 65 of 72 measured sites carry no shadow.
    expect(el.style.boxShadow).toBe('')
  })
})

describe('Surface — tone', () => {
  it.each([
    ['card', 'var(--card)'],
    ['card-solid', 'var(--card-solid)'],
    ['field', 'var(--field)'],
  ] as const)('tone=%s paints %s', (tone, expected) => {
    render(
      <Surface data-testid="s" tone={tone}>
        x
      </Surface>,
    )
    expect(box().style.background).toBe(expected)
  })

  it('tone=bare paints NO background — it is a real state, not a missing value', () => {
    render(
      <Surface data-testid="s" tone="bare">
        x
      </Surface>,
    )
    // 18 of 72 sites are bordered + padded + deliberately transparent. Asserting the absence
    // explicitly, because a `bare` that quietly fell back to --card would look correct in every
    // skin whose --card is near-transparent and wrong in the rest.
    expect(box().style.background).toBe('')
  })
})

describe('Surface — radius is INDEPENDENT of tone (audit §7, decision 1)', () => {
  it.each([
    ['panel', 'skin-panel'],
    ['card', 'skin-card'],
    ['control', 'rounded-[var(--radius-control)]'],
  ] as const)('radius=%s applies %s', (radius, cls) => {
    render(
      <Surface data-testid="s" radius={radius}>
        x
      </Surface>,
    )
    expect(box().className).toContain(cls)
  })

  it('radius=none applies no radius class at all', () => {
    render(
      <Surface data-testid="s" radius="none">
        x
      </Surface>,
    )
    const c = box().className
    expect(c).not.toContain('skin-card')
    expect(c).not.toContain('skin-panel')
    expect(c).not.toContain('rounded')
  })

  it('does NOT derive radius from tone — every tone keeps the radius it was given', () => {
    // The decision this guards: the tone→radius pairing holds only for card/card-solid, so
    // deriving it would invent a mapping for `field` and `bare` that no site establishes.
    for (const tone of ['card', 'card-solid', 'field', 'bare'] as const) {
      const { unmount } = render(
        <Surface data-testid="s" tone={tone} radius="panel">
          x
        </Surface>,
      )
      expect(box().className, `tone=${tone} should keep radius=panel`).toContain('skin-panel')
      unmount()
    }
  })
})

describe('Surface — pad', () => {
  it.each([
    [0, ''],
    [1, 'p-1'],
    [2, 'p-3'],
    [3, 'p-4'],
    [4, 'p-5'],
    [5, 'p-6'],
  ] as const)('pad=%s → %s', (pad, cls) => {
    render(
      <Surface data-testid="s" pad={pad}>
        x
      </Surface>,
    )
    if (cls) expect(box().className).toContain(cls)
    else expect(box().className).not.toMatch(/\bp-\d/)
  })

  it('className carries the asymmetric tail rather than growing the enum', () => {
    render(
      <Surface data-testid="s" pad={0} className="py-2 pl-4 pr-2">
        x
      </Surface>,
    )
    expect(box().className).toContain('py-2 pl-4 pr-2')
  })
})

describe('Surface — border', () => {
  it('border={false} drops the border classes', () => {
    render(
      <Surface data-testid="s" border={false}>
        x
      </Surface>,
    )
    expect(box().className).not.toContain('border-line')
  })
})

describe('Surface — raised', () => {
  it('applies the skin shadow token, not a literal', () => {
    render(
      <Surface data-testid="s" raised>
        x
      </Surface>,
    )
    // The token, so it stays per-skin x per-mode (18 definitions in tokens.css). A literal rgba
    // here would render one skin's shadow in all nine.
    expect(box().style.boxShadow).toBe('var(--shadow)')
  })

  it('is NOT implied by tone — card alone stays flat', () => {
    render(
      <Surface data-testid="s" tone="card">
        x
      </Surface>,
    )
    // --card sits on both sides of the split: 4 raised, 25 flat. Tone cannot predict elevation.
    expect(box().style.boxShadow).toBe('')
  })

  it('warns in dev when combined with a non-card tone, and still renders', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    render(
      <Surface data-testid="s" tone="field" raised>
        x
      </Surface>,
    )
    expect(warn).toHaveBeenCalledOnce()
    expect(String(warn.mock.calls[0]?.[0])).toContain('raised')
    // Warns, but honours it: refusing to render is worse than rendering something odd.
    expect(box().style.boxShadow).toBe('var(--shadow)')
  })

  it('does not warn for the card tones', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    render(
      <Surface data-testid="s" tone="card-solid" raised>
        x
      </Surface>,
    )
    expect(warn).not.toHaveBeenCalled()
  })
})

describe('Surface — as', () => {
  it.each(['p', 'li', 'details', 'span', 'section'] as const)('renders as <%s>', (tag) => {
    render(
      <Surface data-testid="s" as={tag}>
        x
      </Surface>,
    )
    expect(box().tagName.toLowerCase()).toBe(tag)
  })
})

describe('Surface — passthrough', () => {
  it('forwards arbitrary HTML attributes (role, aria-*, id)', () => {
    render(
      <Surface data-testid="s" role="status" aria-label="hi" id="x">
        x
      </Surface>,
    )
    const el = box()
    expect(el.getAttribute('role')).toBe('status')
    expect(el.getAttribute('aria-label')).toBe('hi')
    expect(el.id).toBe('x')
  })

  it('caller style merges over the computed style rather than being dropped', () => {
    render(
      <Surface data-testid="s" style={{ maxWidth: '20rem' }}>
        x
      </Surface>,
    )
    const el = box()
    expect(el.style.maxWidth).toBe('20rem')
    expect(el.style.background).toBe('var(--card)')
  })
})

describe('Surface — ref forwarding (API pass)', () => {
  /**
   * The threshold was two independent customers, and two appeared: Modal's focus-on-open
   * `panelRef` and SeriesArranger's dnd-kit `setNodeRef`. The contract is that the ref reaches
   * the RENDERED element — including through `as` — because both customers hand it to code
   * (`.focus()`, dnd-kit measuring) that needs the real node, not a wrapper.
   */
  it('forwards the ref to the rendered element (default div)', () => {
    let node: HTMLElement | null = null
    render(
      <Surface
        data-testid="s"
        ref={(el: HTMLElement | null) => {
          node = el
        }}
      >
        x
      </Surface>,
    )
    expect(node).not.toBeNull()
    expect(node!).toBe(box())
    expect(node!.tagName).toBe('DIV')
  })

  it('forwards through `as` — the ref sees the substituted element, not a div', () => {
    let node: HTMLElement | null = null
    render(
      <Surface
        as="li"
        data-testid="s"
        ref={(el: HTMLElement | null) => {
          node = el
        }}
      >
        x
      </Surface>,
    )
    expect(node!.tagName).toBe('LI')
    expect(node!).toBe(box())
  })

  it('a callback ref can drive imperative focus — the Modal mechanism', () => {
    let node: HTMLElement | null = null
    render(
      <Surface
        data-testid="s"
        tabIndex={-1}
        ref={(el: HTMLElement | null) => {
          node = el
        }}
      >
        x
      </Surface>,
    )
    node!.focus()
    expect(document.activeElement).toBe(box())
  })
})
