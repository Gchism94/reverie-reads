import { describe, expect, it } from 'vitest'
import { effectiveProEntitlement, type ProEntitlementProof } from './proEntitlement'

describe('effective Pro entitlement', () => {
  const proofs: ProEntitlementProof[] = ['active', 'inactive', 'unavailable']

  it('accepts either independent positive proof, including through the other provider’s outage', () => {
    for (const other of proofs) {
      expect(effectiveProEntitlement('active', other)).toBe('entitled')
      expect(effectiveProEntitlement(other, 'active')).toBe('entitled')
    }
  })

  it('returns a confirmed negative only when both sources confirmed inactive', () => {
    expect(effectiveProEntitlement('inactive', 'inactive')).toBe('not_entitled')
  })

  it('fails closed when no source is positive and either source is unavailable', () => {
    expect(effectiveProEntitlement('unavailable', 'inactive')).toBe('unavailable')
    expect(effectiveProEntitlement('inactive', 'unavailable')).toBe('unavailable')
    expect(effectiveProEntitlement('unavailable', 'unavailable')).toBe('unavailable')
  })
})
