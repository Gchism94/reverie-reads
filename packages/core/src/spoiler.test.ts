import { describe, expect, it } from 'vitest'
import { isCommentVisible, nextUnlockUnit, partitionComments, visibleComments } from './spoiler'

const comments = [
  { id: '1', unit: 3, ts: 1, text: 'early' },
  { id: '2', unit: 10, ts: 2, text: 'the twist' },
  { id: '3', unit: 5, ts: 3, text: 'midpoint' },
]

describe('spoiler gate', () => {
  it('a comment is visible only once progress reaches its unit', () => {
    expect(isCommentVisible({ unit: 5 }, 5)).toBe(true)
    expect(isCommentVisible({ unit: 5 }, 6)).toBe(true)
    expect(isCommentVisible({ unit: 5 }, 4)).toBe(false)
  })

  it('partitions by progress, sorted by unit', () => {
    const { visible, hidden } = partitionComments(comments, 5)
    expect(visible.map((c) => c.unit)).toEqual([3, 5])
    expect(hidden.map((c) => c.unit)).toEqual([10])
  })

  it('visibleComments returns only what the reader has reached', () => {
    expect(visibleComments(comments, 0)).toHaveLength(0)
    expect(visibleComments(comments, 99)).toHaveLength(3)
  })

  it('reports the next unlock unit, or null when nothing is hidden', () => {
    expect(nextUnlockUnit(comments, 5)).toBe(10)
    expect(nextUnlockUnit(comments, 99)).toBeNull()
  })
})
