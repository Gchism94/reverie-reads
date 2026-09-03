import { normalize, percentile, seriesMatches } from './normalize.mjs'

const ratio = (numerator, denominator) => (denominator ? numerator / denominator : null)

const uniqueClaims = (claims) => {
  const seen = new Set()
  return claims.filter((claim) => {
    const key = [
      normalize(claim.series),
      claim.position ?? '',
      claim.orderType ?? '',
      claim.providerSeriesId ?? '',
    ].join('|')
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

const eligibleClaims = (result) => {
  if (!result.workMatch?.matched || !['high', 'medium'].includes(result.workMatch.confidence)) {
    return []
  }
  return uniqueClaims(
    (result.seriesClaims ?? []).filter(
      (claim) =>
        claim.evidenceKind === 'relational_membership' &&
        typeof claim.series === 'string' &&
        claim.series.trim(),
    ),
  )
}

const matchingMembership = (testCase, claim) =>
  testCase.truth.memberships.find((membership) => seriesMatches(membership, claim.series))

const positionMatches = (membership, claim) => {
  if (claim.position == null || !membership.positions?.length) return null
  const comparable = membership.positions.filter(
    (position) =>
      claim.orderType === 'unspecified' ||
      position.orderType === 'unspecified' ||
      position.orderType === claim.orderType,
  )
  if (!comparable.length) return null
  return comparable.some((position) => Number(position.value) === Number(claim.position))
}

const percent = (value) => (value == null ? 'n/a' : `${(value * 100).toFixed(1)}%`)

export function scoreProvider(caseSet, run, policy) {
  if (!run?.provider || !Array.isArray(run.results)) {
    throw new Error('Provider result must contain provider and results')
  }
  const caseById = new Map(caseSet.cases.map((entry) => [entry.id, entry]))
  const resultById = new Map()
  for (const result of run.results) {
    if (!caseById.has(result.caseId)) throw new Error(`Unknown case id ${result.caseId}`)
    if (resultById.has(result.caseId)) throw new Error(`Duplicate result for ${result.caseId}`)
    resultById.set(result.caseId, result)
  }

  const evaluated = caseSet.cases.filter((entry) => resultById.has(entry.id))
  const reviewed = evaluated.filter((entry) => entry.truth.status === 'reviewed')
  const positives = reviewed.filter((entry) => !entry.truth.standalone)
  const standalones = reviewed.filter((entry) => entry.truth.standalone)

  let truePositiveClaims = 0
  let falsePositiveClaims = 0
  let recoveredPositiveCases = 0
  let falseStandaloneCases = 0
  let orderComparableClaims = 0
  let correctOrderClaims = 0
  let referenceAgreementCases = 0
  let relationalMembershipCases = 0
  const details = []

  for (const testCase of evaluated) {
    const result = resultById.get(testCase.id)
    const claims = eligibleClaims(result)
    if (claims.length) relationalMembershipCases += 1

    const matchedClaims = claims
      .map((claim) => ({ claim, membership: matchingMembership(testCase, claim) }))
      .filter((entry) => entry.membership)
    if (matchedClaims.length) referenceAgreementCases += 1

    if (testCase.truth.status === 'reviewed') {
      if (testCase.truth.standalone) {
        if (claims.length) falseStandaloneCases += 1
        falsePositiveClaims += claims.length
      } else {
        truePositiveClaims += matchedClaims.length
        falsePositiveClaims += claims.length - matchedClaims.length
        if (matchedClaims.length) recoveredPositiveCases += 1
        for (const { claim, membership } of matchedClaims) {
          const correct = positionMatches(membership, claim)
          if (correct == null) continue
          orderComparableClaims += 1
          if (correct) correctOrderClaims += 1
        }
      }
    }

    details.push({
      caseId: testCase.id,
      truthStatus: testCase.truth.status,
      standalone: testCase.truth.standalone,
      workMatched: Boolean(result.workMatch?.matched),
      eligibleClaimCount: claims.length,
      referenceMatched: matchedClaims.length > 0,
      claims,
      error: result.error ?? null,
    })
  }

  const latencies = run.results
    .map((result) => result.latencyMs)
    .filter((value) => Number.isFinite(value))
  const membershipPrecision = ratio(truePositiveClaims, truePositiveClaims + falsePositiveClaims)
  const membershipRecall = ratio(recoveredPositiveCases, positives.length)
  const falseStandaloneRate = ratio(falseStandaloneCases, standalones.length)
  const orderAccuracy = ratio(correctOrderClaims, orderComparableClaims)
  const referenceAgreement = ratio(
    referenceAgreementCases,
    evaluated.filter((entry) => entry.truth.memberships.length > 0).length,
  )
  const workMatchCoverage = ratio(
    evaluated.filter((entry) => resultById.get(entry.id).workMatch?.matched).length,
    evaluated.length,
  )
  const allRelationalClaims = run.results.flatMap(eligibleClaims)
  const allClaimsProvenanced = allRelationalClaims.every((claim) => Boolean(claim.sourceRef))
  const gates = policy.hardGates

  const gateChecks = {
    commercialUsePermitted: run.rights?.commercialUsePermitted === true,
    persistentStoragePermitted: run.rights?.persistentStoragePermitted === true,
    claimLevelProvenance: run.rights?.claimLevelProvenance === true && allClaimsProvenanced,
    relationalMembershipEvidence: relationalMembershipCases > 0,
    minimumReviewedCases: reviewed.length >= gates.minimumReviewedCases,
    minimumReviewedPositiveCases: positives.length >= gates.minimumReviewedPositiveCases,
    minimumReviewedStandaloneCases: standalones.length >= gates.minimumReviewedStandaloneCases,
    minimumMembershipPrecision:
      membershipPrecision != null && membershipPrecision >= gates.minimumMembershipPrecision,
    maximumFalseStandaloneRate:
      falseStandaloneRate != null && falseStandaloneRate <= gates.maximumFalseStandaloneRate,
  }

  return {
    schemaVersion: 1,
    provider: run.provider,
    observedAt: run.observedAt,
    scope: {
      evaluatedCases: evaluated.length,
      reviewedCases: reviewed.length,
      reviewedPositiveCases: positives.length,
      reviewedStandaloneCases: standalones.length,
      candidateCases: evaluated.filter((entry) => entry.truth.status === 'candidate').length,
    },
    coverage: {
      workMatchCoverage,
      relationalMembershipCoverage: ratio(relationalMembershipCases, evaluated.length),
      referenceAgreement,
    },
    accuracy: {
      membershipPrecision,
      membershipRecall,
      falseStandaloneRate,
      orderAccuracy,
      truePositiveClaims,
      falsePositiveClaims,
      recoveredPositiveCases,
      falseStandaloneCases,
      orderComparableClaims,
      correctOrderClaims,
    },
    operations: {
      errorCount: run.results.filter((result) => result.error).length,
      latencyMs: {
        p50: percentile(latencies, 0.5),
        p95: percentile(latencies, 0.95),
        measuredCount: latencies.length,
      },
    },
    procurementGate: {
      passes: Object.values(gateChecks).every(Boolean),
      checks: gateChecks,
      failed: Object.entries(gateChecks)
        .filter(([, passed]) => !passed)
        .map(([name]) => name),
    },
    details,
  }
}

export function renderScoreMarkdown(scores, caseSet) {
  const lines = [
    '# Series-source trial score',
    '',
    `Cases: ${caseSet.cases.length} total; ${caseSet.methodology.reviewedCases} authority-reviewed; ${caseSet.methodology.candidateCases} candidate references.`,
    '',
    '| Provider | Work match | Relational series | Precision | Recall | False standalone | Order accuracy | Procurement gate |',
    '| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |',
  ]
  for (const score of scores) {
    lines.push(
      `| ${score.provider} | ${percent(score.coverage.workMatchCoverage)} | ${percent(score.coverage.relationalMembershipCoverage)} | ${percent(score.accuracy.membershipPrecision)} | ${percent(score.accuracy.membershipRecall)} | ${percent(score.accuracy.falseStandaloneRate)} | ${percent(score.accuracy.orderAccuracy)} | ${score.procurementGate.passes ? 'pass' : 'not yet'} |`,
    )
  }
  lines.push(
    '',
    'Precision, recall, standalone safety, and order accuracy use authority-reviewed cases only.',
    'Reference agreement includes candidate Reverie labels and is diagnostic, not an accuracy claim.',
    'A provider cannot pass until the policy sample-size, rights, persistence, provenance, and accuracy gates all pass.',
    '',
  )
  for (const score of scores) {
    lines.push(
      `## ${score.provider}`,
      '',
      `Failed gates: ${score.procurementGate.failed.join(', ') || 'none'}.`,
      `Errors: ${score.operations.errorCount}; latency p50/p95: ${score.operations.latencyMs.p50 ?? 'n/a'}/${score.operations.latencyMs.p95 ?? 'n/a'} ms.`,
      '',
    )
  }
  return `${lines.join('\n').trimEnd()}\n`
}
