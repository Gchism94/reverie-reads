const inventaireOrigin = (entityId) =>
  String(entityId ?? '').startsWith('wd:') ? 'wikidata' : 'inventaire'

export const sourceLineage = (originProvider, originEntityId, observedVia = originProvider) => ({
  originProvider: String(originProvider).trim().toLowerCase(),
  originEntityId: normalizeOriginEntityId(originProvider, originEntityId),
  observedVia,
})

const normalizeLineage = (lineage) =>
  sourceLineage(lineage.originProvider, lineage.originEntityId, lineage.observedVia)

export const normalizeOriginEntityId = (originProvider, originEntityId) => {
  if (originEntityId == null) return null
  const value = String(originEntityId).trim()
  if (String(originProvider).toLowerCase() === 'wikidata') {
    const entityId = value.match(/\b([pq]\d+)\b/i)?.[1]
    if (entityId) return entityId.toUpperCase()
  }
  return value
}

export const entityLineage = (provider, entityId, observedVia = provider) =>
  sourceLineage(
    provider === 'inventaire' ? inventaireOrigin(entityId) : provider,
    entityId,
    observedVia,
  )

export const lineageKey = (lineage) =>
  [
    String(lineage?.originProvider ?? '').toLowerCase(),
    normalizeOriginEntityId(lineage?.originProvider, lineage?.originEntityId) ?? '',
  ].join(':')

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
            (workMatch.sourceLineage && normalizeLineage(workMatch.sourceLineage)) ??
            entityLineage(provider, workMatch.providerWorkId),
        }
      : workMatch

    return {
      ...result,
      workMatch: annotatedMatch,
      seriesClaims: (result.seriesClaims ?? []).map((claim) => ({
        ...claim,
        sourceLineage:
          (claim.sourceLineage && normalizeLineage(claim.sourceLineage)) ??
          entityLineage(provider, fallbackEntityId(claim, workMatch)),
      })),
    }
  })
}
