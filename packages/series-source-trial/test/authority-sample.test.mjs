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
  authoritySourceKinds: ['author', 'author_post', 'publisher', 'publisher_catalog'],
  samplingSourceKinds: [
    'author',
    'author_post',
    'publisher',
    'publisher_catalog',
    'platform_award',
  ],
  strata,
})

test('reports the exact reviewed and sampling gaps in the current authority set', async () => {
  const audit = auditAuthoritySample(await loadTrialCases(), plan, policy)

  assert.equal(audit.valid, true)
  assert.equal(audit.ready, false)
  assert.deepEqual(audit.counts, {
    selected: 90,
    reviewed: 40,
    candidate: 50,
    reviewedPositive: 26,
    reviewedStandalone: 14,
    selectionTarget: 200,
    selectionGap: 110,
  })
  assert.deepEqual(Object.fromEntries(audit.targets.map((target) => [target.id, target.gap])), {
    reviewed_cases: 160,
    reviewed_positive_cases: 74,
    reviewed_standalone_cases: 36,
  })
  assert.deepEqual(
    audit.strata.find((stratum) => stratum.id === 'reverie_series'),
    {
      id: 'reverie_series',
      label: 'Reverie seeded series',
      minimumReviewed: 69,
      selected: 69,
      reviewed: 22,
      candidate: 47,
      gap: 47,
      met: false,
    },
  )

  assert.deepEqual(
    Object.fromEntries(
      audit.strata
        .filter(({ id }) =>
          [
            'recent_independent_or_kindle_first',
            'recent_traditional',
            'multi_series_or_connected_universe',
          ].includes(id),
        )
        .map(({ id, reviewed, gap }) => [id, { reviewed, gap }]),
    ),
    {
      recent_independent_or_kindle_first: { reviewed: 7, gap: 43 },
      recent_traditional: { reviewed: 6, gap: 44 },
      multi_series_or_connected_universe: { reviewed: 2, gap: 18 },
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
    sampleSources: [source],
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

test('keeps selection-frame provenance separate from truth authority', () => {
  const awardSource = {
    kind: 'platform_award',
    url: 'https://platform.example/complete-shortlist',
  }
  const testCase = reviewedCase({
    publicationYear: 2025,
    publicationPath: 'kindle_first',
    selectionFrame: 'complete-shortlist',
    sampleSources: [awardSource],
    strata: ['recent_independent_or_kindle_first'],
  })
  const samplePlan = {
    ...smallPlan([
      {
        id: 'recent_independent_or_kindle_first',
        label: 'Independent',
        minimumReviewed: 1,
      },
    ]),
    selectionFrames: [
      {
        id: 'complete-shortlist',
        expectedCases: 1,
        strata: ['recent_independent_or_kindle_first'],
        publicationYear: 2025,
        publicationPath: 'kindle_first',
        source: awardSource,
      },
    ],
  }
  const valid = auditAuthoritySample(
    { cases: [testCase], sharedSources: {} },
    samplePlan,
    smallPolicy(),
  )
  assert.equal(valid.valid, true)

  const platformTruth = structuredClone(testCase)
  platformTruth.truth.sources = [awardSource]
  const invalidTruth = auditAuthoritySample(
    { cases: [platformTruth], sharedSources: {} },
    samplePlan,
    smallPolicy(),
  )
  assert.ok(invalidTruth.errors.some((error) => error.includes('authority source')))

  const missingFinalist = auditAuthoritySample(
    { cases: [], sharedSources: {} },
    samplePlan,
    smallPolicy(),
  )
  assert.ok(missingFinalist.errors.some((error) => error.includes('requires 1 cases; found 0')))
})

test('requires recognized sampling provenance for a recent-publication stratum', () => {
  const testCase = reviewedCase({
    publicationYear: 2025,
    publicationPath: 'traditional',
    strata: ['recent_traditional'],
  })
  const samplePlan = smallPlan([
    { id: 'recent_traditional', label: 'Traditional', minimumReviewed: 1 },
  ])
  const invalid = auditAuthoritySample(
    { cases: [testCase], sharedSources: {} },
    samplePlan,
    smallPolicy(),
  )

  assert.ok(invalid.errors.some((error) => error.includes('sampling-provenance')))

  const valid = auditAuthoritySample(
    { cases: [{ ...testCase, sampleSources: [source] }], sharedSources: {} },
    samplePlan,
    smallPolicy(),
  )
  assert.equal(valid.valid, true)
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
