export const AUTHORITY_RETRIEVAL_PROFILES_VERSION = 'authority-retrieval-profiles-v1'

export const authorityRetrievalProfiles = [
  {
    schemaVersion: 1,
    profileVersion: 'pipwritesfiction-pending-v1',
    canonicalOrigin: 'https://www.pipwritesfiction.com',
    canonicalAliases: ['https://pipwritesfiction.com'],
    sourceKind: 'author',
    status: 'pending',
    termsReviewedAt: null,
    expiresAt: null,
    reviewedBy: null,
    reviewReference:
      'docs/decisions/0009-authority-retrieval-gateway.md#first-live-origin-candidate',
  },
]
