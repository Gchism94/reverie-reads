export type ProEntitlementProof = 'active' | 'inactive' | 'unavailable'
export type EffectiveProEntitlement = 'entitled' | 'not_entitled' | 'unavailable'

/** Combine two independent positive proofs. Either active source is enough; when neither is active,
 * one unavailable source makes the result unavailable rather than silently treating an outage as
 * a negative entitlement. */
export function effectiveProEntitlement(
  subscription: ProEntitlementProof,
  administrator: ProEntitlementProof,
): EffectiveProEntitlement {
  if (subscription === 'active' || administrator === 'active') return 'entitled'
  if (subscription === 'inactive' && administrator === 'inactive') return 'not_entitled'
  return 'unavailable'
}
