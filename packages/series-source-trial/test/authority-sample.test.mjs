import assert from 'node:assert/strict'
import { test } from 'node:test'
import plan from '../data/authority-sample-plan.json' with { type: 'json' }
import policy from '../data/evaluation-policy.json' with { type: 'json' }
import { auditAuthoritySample } from '../src/authority-sample.mjs'
import { loadTrialCases } from '../src/cases.mjs'

const source = { kind: 'publisher', url: 'https://publisher.example/books/example' }
const membership = {
  series: 'Example Sequence',
  aliases: [],
  positions: [{ value: 1, orderType: 'publication' }],
}
const reviewedCase = (overrides = {}) => ({
  id: 'reviewed-example',
  title: 'Reviewed Example',
  authors: ['Ada Reader'],
  truth: {
    status: 'reviewed',
    standalone: false,
    memberships: [membership],
    sources: [source],
  },
  ...overrides,
})
const candidateCase = {
  id: 'candidate-example',
  title: 'Candidate Example',
  authors: ['Casey Reader'],
  truth: { status: 'candidate', standalone: null, memberships: [], sources: [] },
}
const smallPolicy = (overrides = {}) => ({
  hardGates: {
    minimumReviewedCases: 1,
    minimumReviewedPositiveCases: 1,
    minimumReviewedStandaloneCases: 0,
    ...overrides,
  },
})
const smallPlan = (strata = []) => ({
  schemaVersion: 1,
  selectionTarget: 1,
  recentPublicationYearFloor: 2021,
  authoritySourceKinds: ['author', 'publisher', 'publisher_catalog'],
  strata,
})

test('reports the exact reviewed and sampling gaps in the current authority set', async () => {
  const audit = auditAuthoritySample(await loadTrialCases(), plan, policy)

  assert.equal(audit.valid, true)
  assert.equal(audit.ready, false)
  assert.deepEqual(audit.counts, {
    selected: 80,
    reviewed: 23,
    candidate: 57,
    reviewedPositive: 12,
    reviewedStandalone: 11,
    selectionTarget: 200,
    selectionGap: 120,
  })
  assert.deepEqual(Object.fromEntries(audit.targets.map((target) => [target.id, target.gap])), {
    reviewed_cases: 177,
    reviewed_positive_cases: 88,
    reviewed_standalone_cases: 39,
  })
  assert.deepEqual(
    audit.strata.find((stratum) => stratum.id === 'reverie_series'),
    {
      id: 'reverie_series',
      label: 'Reverie seeded series',
      minimumReviewed: 69,
      selected: 69,
      reviewed: 12,
      candidate: 57,
      gap: 57,
      met: false,
    },
  )
})

test('never counts an unreviewed candidate toward an authority gate', () => {
  const audit = auditAuthoritySample(
    { cases: [candidateCase], sharedSources: {} },
    smallPlan(),
    smallPolicy(),
  )

  assert.equal(audit.valid, true)
  assert.equal(audit.counts.selected, 1)
  assert.equal(audit.counts.reviewed, 0)
  assert.equal(audit.targets[0].gap, 1)
  assert.equal(audit.ready, false)
})

test('rejects reviewed truth without affirmative author or publisher evidence', () => {
  const standalone = reviewedCase({
    truth: { status: 'reviewed', standalone: true, memberships: [], sources: [] },
  })
  const audit = auditAuthoritySample(
    { cases: [standalone], sharedSources: {} },
    smallPlan(),
    smallPolicy({ minimumReviewedPositiveCases: 0, minimumReviewedStandaloneCases: 1 }),
  )

  assert.equal(audit.valid, false)
  assert.ok(audit.errors.some((error) => error.includes('authority source')))
})

test('accepts an explicitly shared publisher source for standalone controls', () => {
  const standalone = reviewedCase({
    stratum: 'standalone_negative',
    truth: { status: 'reviewed', standalone: true, memberships: [], sources: [] },
  })
  const audit = auditAuthoritySample(
    {
      cases: [standalone],
      sharedSources: { standalone_negative: [source] },
    },
    smallPlan([{ id: 'standalone_control', label: 'Standalone', minimumReviewed: 1 }]),
    smallPolicy({ minimumReviewedPositiveCases: 0, minimumReviewedStandaloneCases: 1 }),
  )

  assert.equal(audit.valid, true)
  assert.equal(audit.ready, true)
  assert.equal(audit.strata[0].reviewed, 1)
})

test('supports overlapping strata but requires their audit metadata', () => {
  const testCase = reviewedCase({
    publicationYear: 2025,
    publicationPath: 'independent',
    riskFeatures: ['connected_universe'],
    strata: ['recent_independent_or_kindle_first', 'multi_series_or_connected_universe'],
    truth: {
      status: 'reviewed',
      standalone: false,
      memberships: [membership],
      membershipsComplete: true,
      sources: [source],
    },
  })
  const audit = auditAuthoritySample(
    { cases: [testCase], sharedSources: {} },
    smallPlan([
      { id: 'recent_independent_or_kindle_first', label: 'Independent', minimumReviewed: 1 },
      { id: 'multi_series_or_connected_universe', label: 'Complex', minimumReviewed: 1 },
    ]),
    smallPolicy(),
  )

  assert.equal(audit.valid, true)
  assert.equal(audit.ready, true)
  assert.deepEqual(
    audit.strata.map((stratum) => stratum.reviewed),
    [1, 1],
  )

  const incomplete = structuredClone(testCase)
  delete incomplete.truth.membershipsComplete
  const invalid = auditAuthoritySample(
    { cases: [incomplete], sharedSources: {} },
    smallPlan([
      { id: 'recent_independent_or_kindle_first', label: 'Independent', minimumReviewed: 1 },
      { id: 'multi_series_or_connected_universe', label: 'Complex', minimumReviewed: 1 },
    ]),
    smallPolicy(),
  )
  assert.ok(invalid.errors.some((error) => error.includes('membershipsComplete')))
})

test('rejects duplicate works even when their case ids differ', () => {
  const duplicate = reviewedCase({ id: 'different-id' })
  const audit = auditAuthoritySample(
    { cases: [reviewedCase(), duplicate], sharedSources: {} },
    { ...smallPlan(), selectionTarget: 2 },
    smallPolicy(),
  )

  assert.equal(audit.valid, false)
  assert.ok(audit.errors.some((error) => error.includes('duplicates work')))
})
