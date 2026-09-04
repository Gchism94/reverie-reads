import assert from 'node:assert/strict'
import { test } from 'node:test'
import policy from '../data/evaluation-policy.json' with { type: 'json' }
import { scoreProvider } from '../src/score.mjs'

const positive = {
  id: 'positive',
  title: 'Second Book',
  authors: ['Ada Reader'],
  truth: {
    status: 'reviewed',
    standalone: false,
    memberships: [
      {
        series: 'The Sequence',
        aliases: ['Sequence'],
        positions: [{ value: 2, orderType: 'publication' }],
      },
    ],
    sources: [{ kind: 'publisher', url: 'https://publisher.example/sequence' }],
  },
}
const standalone = {
  id: 'standalone',
  title: 'Only Book',
  authors: ['Solo Writer'],
  truth: { status: 'reviewed', standalone: true, memberships: [], sources: [] },
}
const caseSet = {
  methodology: { reviewedCases: 2, candidateCases: 0 },
  cases: [positive, standalone],
}
const rights = {
  commercialUsePermitted: true,
  persistentStoragePermitted: true,
  claimLevelProvenance: true,
}
const result = (caseId, claims) => ({
  caseId,
  latencyMs: 10,
  workMatch: { matched: true, confidence: 'high' },
  seriesClaims: claims,
})
const relationship = (series, position = null) => ({
  evidenceKind: 'relational_membership',
  series,
  position,
  orderType: 'publication',
  sourceRef: 'vendor-record',
})

test('scores reviewed membership and position independently', () => {
  const score = scoreProvider(
    caseSet,
    {
      provider: 'example',
      observedAt: '2026-09-03T00:00:00Z',
      rights,
      results: [result('positive', [relationship('Sequence', 2)]), result('standalone', [])],
    },
    policy,
  )
  assert.equal(score.accuracy.membershipPrecision, 1)
  assert.equal(score.accuracy.membershipRecall, 1)
  assert.equal(score.accuracy.orderAccuracy, 1)
  assert.equal(score.accuracy.falseStandaloneRate, 0)
})

test('counts a relational series assigned to a standalone as a false positive', () => {
  const score = scoreProvider(
    caseSet,
    {
      provider: 'example',
      observedAt: '2026-09-03T00:00:00Z',
      rights,
      results: [
        result('positive', [relationship('Wrong Series', 2)]),
        result('standalone', [relationship('Manufactured Series', 1)]),
      ],
    },
    policy,
  )
  assert.equal(score.accuracy.truePositiveClaims, 0)
  assert.equal(score.accuracy.falsePositiveClaims, 2)
  assert.equal(score.accuracy.falseStandaloneRate, 1)
})

test('does not count a search label as membership evidence', () => {
  const claim = {
    ...relationship('The Sequence', 2),
    evidenceKind: 'candidate_label',
  }
  const score = scoreProvider(
    caseSet,
    {
      provider: 'example',
      observedAt: '2026-09-03T00:00:00Z',
      rights,
      results: [result('positive', [claim]), result('standalone', [])],
    },
    policy,
  )
  assert.equal(score.accuracy.membershipPrecision, null)
  assert.equal(score.accuracy.membershipRecall, 0)
})

test('cannot pass procurement on a tiny perfect sample', () => {
  const score = scoreProvider(
    caseSet,
    {
      provider: 'example',
      observedAt: '2026-09-03T00:00:00Z',
      rights,
      results: [result('positive', [relationship('The Sequence', 2)]), result('standalone', [])],
    },
    policy,
  )
  assert.equal(score.procurementGate.passes, false)
  assert.ok(score.procurementGate.failed.includes('minimumReviewedCases'))
})
