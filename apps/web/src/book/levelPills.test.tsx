import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { visibleLevelPills } from './BookDetailRoute'
import { LevelGuideCard } from '../components/LevelGuideCard'

/**
 * The two gating rules, and the shared guide card. Both were previously unassertable: the gates
 * were inline JSX conditions, and the card only existed inside LevelPicker.
 */

const book = (intensity: number | null, darkness: number | null) =>
  ({ intensity, darkness }) as Parameters<typeof visibleLevelPills>[0]

describe('which level pills show', () => {
  it('NULL is not a level — not assessed earns no pill on either axis', () => {
    // #326's ruling: null = nobody judged it, 0 = judged and found none. Neither is a claim.
    expect(visibleLevelPills(book(null, null), false)).toEqual({
      intensity: false,
      darkness: false,
    })
  })

  it('0 is not a level either — assessed as none still earns no pill', () => {
    expect(visibleLevelPills(book(0, 0), false)).toEqual({ intensity: false, darkness: false })
  })

  it('a set level on either axis earns its pill', () => {
    expect(visibleLevelPills(book(3, 2), false)).toEqual({ intensity: true, darkness: true })
  })

  it('hideIntensity hides SPICE ONLY — darkness is a different axis and survives it', () => {
    // The rule most likely to be "tidied" into one condition. A reader who hid spice has said
    // nothing about darkness, and gating both on one flag hides a level they never asked to hide.
    expect(visibleLevelPills(book(4, 3), true)).toEqual({ intensity: false, darkness: true })
  })

  it('darkness alone shows when spice is unset — the common case today', () => {
    // books.darkness is NULL across essentially the whole library, so the inverse (spice only) is
    // what a reader sees now; this asserts the other direction works when the column fills in.
    expect(visibleLevelPills(book(null, 5), false)).toEqual({ intensity: false, darkness: true })
  })
})

describe('LevelGuideCard', () => {
  it('states the level and its definition, and announces itself', () => {
    render(<LevelGuideCard level={4} definition="Explicit" />)
    const card = screen.getByRole('status')
    expect(card).toHaveTextContent('4')
    expect(card).toHaveTextContent('Explicit')
  })

  it('renders level 0 as a real level — "assessed as none" is a definition worth reading', () => {
    render(<LevelGuideCard level={0} definition="None on the page" />)
    expect(screen.getByRole('status')).toHaveTextContent('None on the page')
  })

  it('has no close control unless one is given — a surface with nothing to close shows no ✕', () => {
    const { rerender } = render(<LevelGuideCard level={1} definition="Kisses" />)
    expect(screen.queryByRole('button')).toBeNull()
    const onDismiss = vi.fn()
    rerender(
      <LevelGuideCard
        level={1}
        definition="Kisses"
        onDismiss={onDismiss}
        dismissLabel="Close it"
      />,
    )
    screen.getByRole('button', { name: 'Close it' }).click()
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })

  it('exposes NO way to change a level — it is read-only by construction', () => {
    // The reason this component exists rather than a read-only LevelPicker: there is no onChange
    // to forget, so book detail cannot become an editing surface by a prop defaulting wrong.
    render(<LevelGuideCard level={2} definition="Closed door" />)
    expect(screen.queryByRole('slider')).toBeNull()
    expect(screen.queryAllByRole('button')).toHaveLength(0)
  })
})
