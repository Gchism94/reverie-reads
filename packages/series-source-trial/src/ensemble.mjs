import { normalize } from './normalize.mjs'

const sourcePriority = new Map([
  ['hardcover', 0],
  ['wikidata', 1],
  ['openlibrary', 2],
  ['google-books', 3],
])

const eligibleClaims = (result) => {
  if (!result?.workMatch?.matched || !['high', 'medium'].includes(result.workMatch.confidence)) {
    return []
  }
  return (result.seriesClaims ?? []).filter(
    (claim) =>
      claim.evidenceKind === 'relational_membership' &&
      typeof claim.series === 'string' &&
      claim.series.trim(),
  )
}

const combineRightsValue = (runs, key) => {
  const values = runs.map((run) => run.rights?.[key])
  if (values.some((value) => value === false)) return false
  if (values.every((value) => value === true)) return true
  return null
}

const mergeSeriesClaims = (claims) => {
  const groups = new Map()
  for (const entry of claims) {
    const key = normalize(entry.claim.series)
    const group = groups.get(key) ?? []
    group.push(entry)
    groups.set(key, group)
  }

  return [...groups.values()].map((group) => {
    const preferred = [...group].sort(
      (left, right) =>
        (sourcePriority.get(left.provider) ?? 99) - (sourcePriority.get(right.provider) ?? 99),
    )[0]
    const positions = [
      ...new Set(
        group
          .map(({ claim }) => claim.position)
          .filter((position) => position !== null && position !== undefined)
          .map(Number),
      ),
    ]
    const sourceRefs = [...new Set(group.map(({ claim }) => claim.sourceRef).filter(Boolean))]

    return {
      ...preferred.claim,
      position: positions.length === 1 ? positions[0] : null,
      orderType: 'unspecified',
      sourceRef: preferred.claim.sourceRef ?? sourceRefs[0] ?? null,
      supportingProviders: [...new Set(group.map(({ provider }) => provider))],
      sourceRefs,
      positionConflict: positions.length > 1,
    }
  })
}

export function combineRuns(runs, providerName = runs.map((run) => run.provider).join('+')) {
  if (!runs.length) throw new Error('At least one provider run is required')
  const resultMaps = runs.map((run) => ({
    run,
    results: new Map(run.results.map((result) => [result.caseId, result])),
  }))
  const caseIds = [...new Set(runs.flatMap((run) => run.results.map((result) => result.caseId)))]

  return {
    schemaVersion: 1,
    provider: providerName,
    observedAt: runs
      .map((run) => run.observedAt)
      .sort()
      .at(-1),
    completedAt: runs
      .map((run) => run.completedAt)
      .filter(Boolean)
      .sort()
      .at(-1),
    rights: {
      commercialUsePermitted: combineRightsValue(runs, 'commercialUsePermitted'),
      persistentStoragePermitted: combineRightsValue(runs, 'persistentStoragePermitted'),
      claimLevelProvenance: combineRightsValue(runs, 'claimLevelProvenance'),
      note: `Combined decision using ${runs.map((run) => run.provider).join(', ')}.`,
    },
    results: caseIds.map((caseId) => {
      const providerResults = resultMaps
        .map(({ run, results }) => ({ provider: run.provider, result: results.get(caseId) }))
        .filter(({ result }) => result)
      const matched = providerResults.filter(({ result }) => result.workMatch?.matched)
      const preferredMatch = [...matched].sort(
        (left, right) =>
          (sourcePriority.get(left.provider) ?? 99) - (sourcePriority.get(right.provider) ?? 99),
      )[0]
      const claims = mergeSeriesClaims(
        providerResults.flatMap(({ provider, result }) =>
          eligibleClaims(result).map((claim) => ({ provider, claim })),
        ),
      )
      const errors = providerResults
        .filter(({ result }) => result.error)
        .map(({ provider, result }) => `${provider}: ${result.error}`)
      const latencies = providerResults
        .map(({ result }) => result.latencyMs)
        .filter((latency) => Number.isFinite(latency))

      return {
        caseId,
        latencyMs: latencies.length ? Math.max(...latencies) : null,
        workMatch: preferredMatch
          ? {
              ...preferredMatch.result.workMatch,
              providerWorkId: `${preferredMatch.provider}:${preferredMatch.result.workMatch.providerWorkId}`,
              supportingProviders: matched.map(({ provider }) => provider),
            }
          : { matched: false, confidence: 'none', supportingProviders: [] },
        seriesClaims: claims,
        providerErrors: errors,
        ...(errors.length === providerResults.length && errors.length
          ? { error: 'Every provider failed for this case' }
          : {}),
      }
    }),
  }
}

export function supplementalEnsembles(runs) {
  const byProvider = new Map(runs.map((run) => [run.provider, run]))
  const baseline = ['openlibrary', 'wikidata'].map((name) => byProvider.get(name)).filter(Boolean)
  if (baseline.length !== 2) return []

  return [
    combineRuns(baseline, 'strategy:openlibrary+wikidata'),
    byProvider.has('google-books')
      ? combineRuns(
          [...baseline, byProvider.get('google-books')],
          'strategy:openlibrary+wikidata+google-books',
        )
      : null,
    byProvider.has('hardcover')
      ? combineRuns(
          [...baseline, byProvider.get('hardcover')],
          'strategy:openlibrary+wikidata+hardcover',
        )
      : null,
    byProvider.has('google-books') && byProvider.has('hardcover')
      ? combineRuns(
          [...baseline, byProvider.get('google-books'), byProvider.get('hardcover')],
          'strategy:all-four',
        )
      : null,
  ].filter(Boolean)
}
