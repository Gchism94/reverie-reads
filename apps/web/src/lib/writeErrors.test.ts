import { describe, expect, it } from 'vitest'
import { readableWriteError } from './writeErrors'

/**
 * `readableWriteError` turns a write failure into one sentence a reader can act on. These cases
 * were added with the missing-column branch; the file had no test before it.
 *
 * THE FIXTURES ARE REAL, not remembered. Both shapes below were read off a local PostgREST by
 * asking it for a column that does not exist — a select for 42703, a zero-row PATCH for PGRST204 —
 * rather than written from recollection of what those errors look like.
 */

const MISSING_COLUMN_WRITE = {
  code: 'PGRST204',
  details: null,
  hint: null,
  message: "Could not find the 'darkness' column of 'books' in the schema cache",
}
const MISSING_COLUMN_READ = {
  code: '42703',
  details: null,
  hint: null,
  message: 'column books.darkness does not exist',
}
const DEPLOY_MESSAGE = 'This build expects a database change that hasn’t been deployed yet.'
const FALLTHROUGH = 'The change didn’t save.'

describe('readableWriteError — a missing column names itself', () => {
  it('names an undeployed migration on PGRST204 (the write path)', () => {
    expect(readableWriteError(MISSING_COLUMN_WRITE)).toBe(DEPLOY_MESSAGE)
  })

  it('names it on 42703 too (the read path)', () => {
    expect(readableWriteError(MISSING_COLUMN_READ)).toBe(DEPLOY_MESSAGE)
  })

  it('matches on the CODE, so it still fires when the message names a different column', () => {
    // The point of keying on `code`: PostgREST's wording embeds the column and table, so a message
    // regex would be matching a template. Any column must reach the same sentence.
    expect(
      readableWriteError({
        code: 'PGRST204',
        message: "Could not find the 'plan_y' column of 'reads' in the schema cache",
      }),
    ).toBe(DEPLOY_MESSAGE)
  })

  it('still fires when the code was lost but PostgREST’s exact phrasing survives', () => {
    // A re-thrown Error keeps the text and drops the code; the narrow message fallback covers it.
    expect(
      readableWriteError(
        new Error("Could not find the 'darkness' column of 'books' in the schema cache"),
      ),
    ).toBe(DEPLOY_MESSAGE)
  })
})

describe('readableWriteError — the new branch has not widened into a catch-all', () => {
  // The guard on the branch above. A missing-column test alone would still pass if the branch
  // swallowed everything, so these assert what must NOT reach it.
  it('an unrecognised error still reaches the fallthrough', () => {
    expect(readableWriteError({ code: 'XX000', message: 'something nobody has seen before' })).toBe(
      FALLTHROUGH,
    )
    expect(readableWriteError(new Error('totally unknown'))).toBe(FALLTHROUGH)
    expect(readableWriteError(undefined)).toBe(FALLTHROUGH)
  })

  it('other recognised errors keep their own sentences', () => {
    expect(readableWriteError({ message: 'violates check constraint "books_rating_check"' })).toBe(
      'A rating has to be between 0 and 5.',
    )
    expect(readableWriteError({ message: 'duplicate key value violates unique constraint' })).toBe(
      'That already exists.',
    )
    expect(readableWriteError({ message: 'new row violates row-level security policy' })).toBe(
      'You’re signed out, or that isn’t yours to change.',
    )
  })

  it('a message that merely MENTIONS a column is not a missing-column error', () => {
    // '42703' or the word "column" appearing in prose must not trip the branch.
    expect(
      readableWriteError({
        code: '23514',
        message: 'column value 42703 violates check constraint',
      }),
    ).toBe('One of those values isn’t allowed.')
  })
})
