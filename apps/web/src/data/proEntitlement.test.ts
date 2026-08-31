import { beforeEach, describe, expect, it, vi } from 'vitest'

const adminCheck = vi.fn<() => Promise<boolean>>()

vi.mock('./enrichCorpus', () => ({ fetchCorpusAdminStatus: () => adminCheck() }))

const { fetchEffectiveProEntitlement, registerReaderProEntitlementProvider } = await import(
  './proEntitlement'
)

beforeEach(() => {
  adminCheck.mockReset()
})

describe('public Pro host contract', () => {
  it('grants an administrator even when the private subscription provider is absent', async () => {
    adminCheck.mockResolvedValue(true)
    await expect(fetchEffectiveProEntitlement()).resolves.toBe('entitled')
  })

  it('fails closed for an ordinary reader when the private provider is absent', async () => {
    adminCheck.mockResolvedValue(false)
    await expect(fetchEffectiveProEntitlement()).resolves.toBe('unavailable')
  })

  it('accepts a private subscription proof without requiring administrator access', async () => {
    adminCheck.mockResolvedValue(false)
    const unregister = registerReaderProEntitlementProvider({
      check: async () => 'active',
    })
    await expect(fetchEffectiveProEntitlement()).resolves.toBe('entitled')
    unregister()
  })

  it('does not convert provider failures into a negative entitlement', async () => {
    adminCheck.mockResolvedValue(false)
    const unregister = registerReaderProEntitlementProvider({
      check: async () => {
        throw new Error('billing unavailable')
      },
    })
    await expect(fetchEffectiveProEntitlement()).resolves.toBe('unavailable')
    unregister()
  })
})
