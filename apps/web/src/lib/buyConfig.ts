import type { AttributionMode, BuyConfig } from '@reverie/core'
import type { DefaultStore } from '../data/profile'

// Affiliate ids + attribution mode come from env so the money routing is a config change, not a
// code change (docs/SCALING.md). Default mode is 'store' (app earns nothing); the ids sit unused
// until someone flips VITE_BUY_ATTRIBUTION_MODE=affiliate.
/** The live attribution mode. Exported so the landing's revenue copy derives from the SAME value
 *  the links do — see revenueCopy() in @reverie/core. */
export const ATTRIBUTION_MODE: AttributionMode =
  (import.meta.env.VITE_BUY_ATTRIBUTION_MODE as string) === 'affiliate' ? 'affiliate' : 'store'

export function buyConfig(store?: DefaultStore | null): BuyConfig {
  return {
    mode: ATTRIBUTION_MODE,
    bookshopAffiliateId: (import.meta.env.VITE_BOOKSHOP_AFFILIATE_ID as string) ?? '',
    libroAffiliateId: (import.meta.env.VITE_LIBRO_AFFILIATE_ID as string) ?? '',
    store: store ? { name: store.name, website: store.website || undefined } : undefined,
  }
}
