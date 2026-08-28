import { describe, expect, it } from 'vitest'
import { validateAddSearch } from './AddRoute'

describe('Add route library scope', () => {
  it('accepts only the explicit household scope while preserving catalog identity', () => {
    expect(
      validateAddSearch({
        scope: 'household',
        work: 'work-1',
        title: 'Household only',
        author: 'A Writer',
        cover: 'https://assets.hardcover.app/cover.jpg',
        source: 'hardcover',
      }),
    ).toEqual({
      scope: 'household',
      work: 'work-1',
      title: 'Household only',
      author: 'A Writer',
      cover: 'https://assets.hardcover.app/cover.jpg',
      source: 'hardcover',
    })
  })

  it.each(['personal', 'family', '', ['household'], 1, null])(
    'fails closed to personal for %j',
    (scope) => {
      expect(validateAddSearch({ scope }).scope).toBeUndefined()
    },
  )
})
