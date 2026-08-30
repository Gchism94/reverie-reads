import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocked = vi.hoisted(() => ({ rpc: vi.fn() }))
vi.mock('../lib/supabase', () => ({ supabase: { rpc: mocked.rpc } }))

import { addImportedBooksToHousehold } from './importLibrary'

beforeEach(() => mocked.rpc.mockReset())

describe('explicit import household destination', () => {
  it('publishes distinct resolved personal rows in one batched RPC', async () => {
    mocked.rpc.mockResolvedValue({ data: 2, error: null })

    await expect(
      addImportedBooksToHousehold(['book-a', 'book-b', 'book-a'], true),
    ).resolves.toBe(2)
    expect(mocked.rpc).toHaveBeenCalledOnce()
    expect(mocked.rpc).toHaveBeenCalledWith('add_personal_books_to_household', {
      p_books: ['book-a', 'book-b'],
    })
  })

  it('does not infer household publication when the reader chose personal only', async () => {
    await expect(addImportedBooksToHousehold(['book-a'], false)).resolves.toBe(0)
    expect(mocked.rpc).not.toHaveBeenCalled()
  })

  it('does not call the database for an empty resolved set', async () => {
    await expect(addImportedBooksToHousehold([], true)).resolves.toBe(0)
    expect(mocked.rpc).not.toHaveBeenCalled()
  })
})
