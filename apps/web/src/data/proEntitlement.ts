import { useQuery } from '@tanstack/react-query'
import {
  effectiveProEntitlement,
  type EffectiveProEntitlement,
  type ProEntitlementProof,
} from '@reverie/core'
import { fetchCorpusAdminStatus } from './enrichCorpus'

/** Private modules register only the subscription proof. They do not replace or imitate the
 * service-managed corpus-administrator grant, and absence is unavailable rather than inactive. */
export interface ReaderProEntitlementProvider {
  check(): Promise<ProEntitlementProof>
}

let readerProProvider: ReaderProEntitlementProvider | null = null

export function registerReaderProEntitlementProvider(
  provider: ReaderProEntitlementProvider,
): () => void {
  readerProProvider = provider
  return () => {
    if (readerProProvider === provider) readerProProvider = null
  }
}

const proof = async (check: () => Promise<boolean>): Promise<ProEntitlementProof> => {
  try {
    return (await check()) ? 'active' : 'inactive'
  } catch {
    return 'unavailable'
  }
}

export async function fetchEffectiveProEntitlement(): Promise<EffectiveProEntitlement> {
  const [administrator, subscription] = await Promise.all([
    proof(fetchCorpusAdminStatus),
    readerProProvider
      ? readerProProvider.check().catch(() => 'unavailable' as const)
      : Promise.resolve('unavailable' as const),
  ])
  return effectiveProEntitlement(subscription, administrator)
}

export const effectiveProEntitlementKey = ['effective-pro-entitlement'] as const

export function useEffectiveProEntitlement() {
  return useQuery({
    queryKey: effectiveProEntitlementKey,
    queryFn: fetchEffectiveProEntitlement,
    staleTime: 60_000,
  })
}
