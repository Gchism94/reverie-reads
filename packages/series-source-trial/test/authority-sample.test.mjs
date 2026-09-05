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
    selected: 108,
    reviewed: 97,
    candidate: 11,
    reviewedPositive: 76,
    reviewedStandalone: 21,
    selectionTarget: 200,
    selectionGap: 92,
  })
  assert.deepEqual(Object.fromEntries(audit.targets.map((target) => [target.id, target.gap])), {
    reviewed_cases: 103,
    reviewed_positive_cases: 24,
    reviewed_standalone_cases: 29,
  })
  assert.deepEqual(
    audit.strata.find((stratum) => stratum.id === 'reverie_series'),
    {
      id: 'reverie_series',
      label: 'Reverie seeded series',
      minimumReviewed: 69,
      selected: 69,
      reviewed: 67,
      candidate: 2,
      gap: 2,
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
            'standalone_control',
          ].includes(id),
        )
        .map(({ id, reviewed, gap }) => [id, { reviewed, gap }]),
    ),
    {
      recent_independent_or_kindle_first: { reviewed: 16, gap: 34 },
      recent_traditional: { reviewed: 27, gap: 23 },
      multi_series_or_connected_universe: { reviewed: 12, gap: 8 },
      standalone_control: { reviewed: 24, gap: 26 },
    },
  )
})

test('records high-risk membership without inventing order and preserves ambiguous candidates', async () => {
  const caseSet = await loadTrialCases()
  const byId = new Map(caseSet.cases.map((testCase) => [testCase.id, testCase]))

  const reviewedMemberships = new Map([
    ['reverie-bloodline-vampires-court-of-the-vampire-queen', 'Bloodline Vampires'],
    ['reverie-bride-mate', 'Bride'],
    ['reverie-merciless-all-he-ll-ever-be', 'Merciless Series'],
    ['reverie-pucked-up-omegaverse-one-pucked-up-pack', 'Pucked Up Omegaverse'],
    ['reverie-wicked-games-enchantra', 'Wicked Games'],
  ])

  for (const [id, series] of reviewedMemberships) {
    const testCase = byId.get(id)
    assert.equal(testCase?.truth.status, 'reviewed')
    assert.equal(testCase?.truth.standalone, false)
    assert.deepEqual(testCase?.truth.memberships[0]?.positions, [])
    assert.equal(testCase?.truth.memberships[0]?.series, series)
  }

  assert.equal(byId.get('reverie-dark-forces-bulletproof')?.truth.status, 'candidate')
  assert.equal(byId.get('reverie-lords-the-sacrifice')?.truth.status, 'candidate')

  const grey = byId.get('gold-grey')
  assert.equal(grey?.truth.membershipsComplete, true)
  assert.deepEqual(
    grey?.truth.memberships.map(({ series, role }) => [series, role]),
    [
      ['Fifty Shades as Told by Christian', 'primary'],
      ['Fifty Shades of Grey', 'secondary'],
    ],
  )
})

test('records exact first-party series numbers without mistaking readable standalones for non-membership', async () => {
  const caseSet = await loadTrialCases()
  const byId = new Map(caseSet.cases.map((testCase) => [testCase.id, testCase]))
  const reviewedMemberships = new Map([
    ['reverie-gold-rush-ranch-off-to-the-races', ['Gold Rush Ranch', 1]],
    ['reverie-never-after-hooked', ['Never After', 1]],
    ['reverie-priest-priest', ['The Priest Collection', 1]],
    ['reverie-stay-a-spell-wolf-gone-wild', ['Stay A Spell', 1]],
    ['reverie-the-broken-blades-five-broken-blades', ['The Broken Blades', 1]],
  ])

  for (const [id, [series, position]] of reviewedMemberships) {
    const testCase = byId.get(id)
    assert.equal(testCase?.truth.status, 'reviewed')
    assert.equal(testCase?.truth.standalone, false)
    assert.equal(testCase?.truth.memberships[0]?.series, series)
    assert.equal(testCase?.truth.memberships[0]?.positions[0]?.value, position)
    assert.equal(testCase?.truth.memberships[0]?.positions[0]?.orderType, 'publication')
  }
})

test('records independently confirmed series positions for the sixth Reverie seed batch', async () => {
  const caseSet = await loadTrialCases()
  const byId = new Map(caseSet.cases.map((testCase) => [testCase.id, testCase]))
  const reviewedMemberships = new Map([
    ['reverie-beneath-the-mask-distance', ['Beneath the Mask', 1]],
    ['reverie-cruel-castaways-ruthless-rival', ['Cruel Castaways', 1]],
    ['reverie-flame-and-thorns-war-of-fire-and-fury', ['Flame and Thorns', 5]],
    ['reverie-hell-bent-my-demon-hunter', ['Hell Bent', 2]],
    ['reverie-into-darkness-game-on', ['Into Darkness', 3]],
  ])

  for (const [id, [series, position]] of reviewedMemberships) {
    const testCase = byId.get(id)
    assert.equal(testCase?.truth.status, 'reviewed')
    assert.equal(testCase?.truth.standalone, false)
    assert.equal(testCase?.truth.memberships[0]?.series, series)
    assert.equal(testCase?.truth.memberships[0]?.positions[0]?.value, position)
    assert.equal(testCase?.truth.memberships[0]?.positions[0]?.orderType, 'publication')
    assert.ok(testCase?.truth.sources.length >= 2)
  }
})

test('corrects false standalones, connected-world noise, and the seventh batch seed position', async () => {
  const caseSet = await loadTrialCases()
  const byId = new Map(caseSet.cases.map((testCase) => [testCase.id, testCase]))
  const reviewedMemberships = new Map([
    ['reverie-lucky-river-ranch-wyatt', ['Lucky River Ranch', 2]],
    ['reverie-lyonesse-honey-cut', ['Lyonesse', 2]],
    ['reverie-playing-for-keeps-fall-with-me', ['Playing for Keeps', 4]],
    ['reverie-rose-hill-wild-card', ['Rose Hill', 4]],
    ['reverie-sparrow-falls-secret-haven', ['Sparrow Falls', 6]],
  ])

  for (const [id, [series, position]] of reviewedMemberships) {
    const testCase = byId.get(id)
    assert.equal(testCase?.truth.status, 'reviewed')
    assert.equal(testCase?.truth.standalone, false)
    assert.equal(testCase?.truth.memberships[0]?.series, series)
    assert.equal(testCase?.truth.memberships[0]?.positions[0]?.value, position)
    assert.equal(testCase?.truth.memberships[0]?.positions[0]?.orderType, 'publication')
    assert.ok(testCase?.truth.sources.length >= 2)
  }

  const honeyCut = byId.get('reverie-lyonesse-honey-cut')
  assert.equal(honeyCut?.truth.membershipsComplete, true)
  assert.equal(honeyCut?.truth.memberships.length, 1)
  assert.deepEqual(honeyCut?.riskFeatures, ['connected_universe'])
})

test('promotes the final unambiguous seed candidates while preserving ambiguous controls', async () => {
  const caseSet = await loadTrialCases()
  const byId = new Map(caseSet.cases.map((testCase) => [testCase.id, testCase]))
  const reviewedMemberships = new Map([
    ['reverie-sinful-manor-keep-me', ['Sinful Manor', 1]],
    ['reverie-the-eye-of-the-goddess-a-tribute-of-fire', ['The Eye of the Goddess', 1]],
    ['reverie-the-wolves-of-ruin-dire-bound', ['The Wolves of Ruin', 1]],
  ])

  for (const [id, [series, position]] of reviewedMemberships) {
    const testCase = byId.get(id)
    assert.equal(testCase?.truth.status, 'reviewed')
    assert.equal(testCase?.truth.standalone, false)
    assert.equal(testCase?.truth.memberships[0]?.series, series)
    assert.equal(testCase?.truth.memberships[0]?.positions[0]?.value, position)
    assert.equal(testCase?.truth.memberships[0]?.positions[0]?.orderType, 'publication')
    assert.ok(testCase?.truth.sources.length >= 2)
  }

  assert.equal(byId.get('reverie-sinful-manor-keep-me')?.publicationPath, 'traditional')
  assert.equal(
    byId.get('reverie-the-eye-of-the-goddess-a-tribute-of-fire')?.publicationPath,
    'traditional',
  )
  assert.equal(byId.get('reverie-the-wolves-of-ruin-dire-bound')?.publicationPath, 'independent')
  assert.equal(byId.get('reverie-dark-forces-bulletproof')?.truth.status, 'candidate')
  assert.equal(byId.get('reverie-lords-the-sacrifice')?.truth.status, 'candidate')
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

test('supports a complete-list frame whose cases span publication years and paths', () => {
  const listSource = {
    kind: 'publisher',
    url: 'https://publisher.example/complete-list',
  }
  const standalone = reviewedCase({
    selectionFrame: 'complete-list',
    sampleSources: [listSource],
    truth: {
      status: 'reviewed',
      standalone: true,
      memberships: [],
      sources: [source],
    },
  })
  const samplePlan = {
    ...smallPlan([{ id: 'standalone_control', label: 'Standalone', minimumReviewed: 1 }]),
    selectionFrames: [
      {
        id: 'complete-list',
        expectedCases: 1,
        strata: ['standalone_control'],
        source: listSource,
      },
    ],
  }

  const audit = auditAuthoritySample(
    { cases: [standalone], sharedSources: {} },
    samplePlan,
    smallPolicy({ minimumReviewedPositiveCases: 0, minimumReviewedStandaloneCases: 1 }),
  )

  assert.equal(audit.valid, true)
  assert.equal(audit.ready, true)
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
