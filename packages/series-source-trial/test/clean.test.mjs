import assert from 'node:assert/strict'
import { test } from 'node:test'
import { gradeMembershipEvidence } from '../src/resolver/clean.mjs'

const target = { title: 'A Brightness Long Ago', authors: ['Guy Gavriel Kay'] }

const identity = (provider, confidence = 'high') => ({
  evidenceId: `${provider}:identity`,
  provider,
  confidence,
})

const membership = (
  provider,
  series,
  {
    position = 1,
    memberCount = 3,
    originProvider = provider,
    originEntityId = `${provider}:series`,
    role = 'unknown',
  } = {},
) => ({
  evidenceId: `${provider}:membership:0`,
  provider,
  evidenceKind: 'relational_membership',
  providerSeriesId: `${provider}:series`,
  series,
  position,
  memberCount,
  orderType: 'unspecified',
  role,
  sourceRef: `https://example.test/${provider}`,
  sourceLineage: { originProvider, originEntityId, observedVia: provider },
})

test('quarantines the observed Hardcover universe false-positive pattern', () => {
  const evidence = [membership('hardcover', 'Sarantine Universe', { position: 5 })]
  const [graded] = gradeMembershipEvidence(target, evidence, [identity('hardcover')])

  assert.equal(graded.quality.membershipEligible, false)
  assert.ok(graded.quality.riskFlags.includes('possible_universe_not_series'))
  assert.ok(graded.quality.riskFlags.includes('independent_corroboration_required'))
  assert.ok(graded.quality.riskFlags.includes('position_uncorroborated'))
})

test('quarantines an uncorroborated self-titled Hardcover relation', () => {
  const selfTitledTarget = {
    title: 'The Space Between Worlds',
    authors: ['Micaiah Johnson'],
  }
  const evidence = [membership('hardcover', 'The Space Between Worlds', { memberCount: 2 })]
  const [graded] = gradeMembershipEvidence(selfTitledTarget, evidence, [identity('hardcover')])

  assert.equal(graded.quality.membershipEligible, false)
  assert.ok(graded.quality.riskFlags.includes('self_titled_relation'))
  assert.ok(graded.quality.riskFlags.includes('independent_corroboration_required'))
})

test('allows Hardcover membership only after an independent open graph corroborates it', () => {
  const evidence = [
    membership('hardcover', 'The Sequence', { position: 2 }),
    membership('wikidata', 'The Sequence', { position: 2 }),
  ]
  const graded = gradeMembershipEvidence(
    { title: 'Second Book', authors: ['Ada Reader'] },
    evidence,
    [identity('hardcover'), identity('wikidata')],
  )

  assert.equal(graded[0].quality.membershipEligible, true)
  assert.equal(graded[0].quality.positionEligible, true)
  assert.deepEqual(graded[0].quality.corroboratingEvidenceIds, ['wikidata:membership:0'])
})

test('does not count an Inventaire mirror as independent Wikidata evidence', () => {
  const evidence = [
    membership('wikidata', 'The Sequence', {
      originProvider: 'wikidata',
      originEntityId: 'Q-series',
    }),
    membership('inventaire', 'The Sequence', {
      originProvider: 'wikidata',
      originEntityId: 'Q-series',
    }),
  ]
  const graded = gradeMembershipEvidence(
    { title: 'Second Book', authors: ['Ada Reader'] },
    evidence,
    [identity('wikidata'), identity('inventaire')],
  )

  assert.equal(graded[0].quality.independentOriginCount, 1)
  assert.deepEqual(graded[0].quality.corroboratingEvidenceIds, [])
  assert.equal(graded[0].quality.positionEligible, false)
})

test('does not count differently formatted Wikidata identifiers as independent evidence', () => {
  const evidence = [
    membership('wikidata', 'The Sequence', {
      originProvider: 'wikidata',
      originEntityId: 'https://www.wikidata.org/entity/Q12345',
    }),
    membership('inventaire', 'The Sequence', {
      originProvider: 'wikidata',
      originEntityId: 'wd:Q12345',
    }),
  ]
  const graded = gradeMembershipEvidence(
    { title: 'Second Book', authors: ['Ada Reader'] },
    evidence,
    [identity('wikidata'), identity('inventaire')],
  )

  assert.equal(graded[0].quality.independentOriginCount, 1)
  assert.equal(graded[0].quality.positionEligible, false)
})

test('keeps membership but withholds order when independent positions conflict', () => {
  const evidence = [
    membership('openlibrary', 'The Sequence', { position: 4 }),
    membership('wikidata', 'The Sequence', { position: 5 }),
  ]
  const graded = gradeMembershipEvidence(
    { title: 'Second Book', authors: ['Ada Reader'] },
    evidence,
    [identity('openlibrary'), identity('wikidata')],
  )

  assert.equal(
    graded.every((entry) => entry.quality.membershipEligible),
    true,
  )
  assert.equal(
    graded.every((entry) => !entry.quality.positionEligible),
    true,
  )
  assert.equal(
    graded.every((entry) => entry.quality.riskFlags.includes('position_conflict')),
    true,
  )
})

test('blocks a relationship whose provider did not establish the exact work identity', () => {
  const evidence = [membership('inventaire', 'The Sequence')]
  const [graded] = gradeMembershipEvidence(
    { title: 'Second Book', authors: ['Ada Reader'] },
    evidence,
    [],
  )

  assert.equal(graded.quality.membershipEligible, false)
  assert.ok(graded.quality.riskFlags.includes('unverified_work_identity'))
})
