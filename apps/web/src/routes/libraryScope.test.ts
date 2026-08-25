import { describe, expect, it } from 'vitest'
import { validateLibrarySearch } from './LibraryRoute'

describe('Library route scope', () => {
  it('uses household only for the one accepted value', () => {
    expect(validateLibrarySearch({ scope: 'household' })).toEqual({
      shelf: undefined,
      scope: 'household',
    })
  })

  it.each(['personal', 'family', '', ['household'], 1, null])(
    'fails closed to Personal for %j',
    (scope) => {
      expect(validateLibrarySearch({ scope }).scope).toBeUndefined()
    },
  )

  it('preserves the existing valid shelf deep link independently', () => {
    expect(validateLibrarySearch({ shelf: 'owned', scope: 'household' })).toEqual({
      shelf: 'owned',
      scope: 'household',
    })
  })
})
