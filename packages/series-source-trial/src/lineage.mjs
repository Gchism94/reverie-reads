const inventaireOrigin = (entityId) =>
  String(entityId ?? '').startsWith('wd:') ? 'wikidata' : 'inventaire'

export const sourceLineage = (originProvider, originEntityId, observedVia = originProvider) => ({
  originProvider,
  originEntityId: originEntityId == null ? null : String(originEntityId),
  observedVia,
})

export const entityLineage = (provider, entityId, observedVia = provider) =>
  sourceLineage(
    provider === 'inventaire' ? inventaireOrigin(entityId) : provider,
    entityId,
    observedVia,
  )

export const lineageKey = (lineage) =>
  [lineage?.originProvider ?? '', lineage?.originEntityId ?? ''].join(':')

const fallbackEntityId = (claim, workMatch) =>
  claim?.providerSeriesId ?? claim?.sourceRef ?? workMatch?.providerWorkId ?? null

/**
 * Make source ancestry explicit in every persisted trial result. Providers with a more precise
 * origin (notably Inventaire's wd: mirror rows) set sourceLineage themselves; this fills the
 * ordinary same-provider case without changing the adapters' evidence decisions.
 */
export function annotateProviderResults(provider, results) {
  return results.map((result) => {
    const workMatch = result.workMatch ?? { matched: false, confidence: 'none' }
    const annotatedMatch = workMatch.matched
      ? {
          ...workMatch,
          sourceLineage:
            workMatch.sourceLineage ?? entityLineage(provider, workMatch.providerWorkId),
        }
      : workMatch

    return {
      ...result,
      workMatch: annotatedMatch,
      seriesClaims: (result.seriesClaims ?? []).map((claim) => ({
        ...claim,
        sourceLineage:
          claim.sourceLineage ?? entityLineage(provider, fallbackEntityId(claim, workMatch)),
      })),
    }
  })
}
