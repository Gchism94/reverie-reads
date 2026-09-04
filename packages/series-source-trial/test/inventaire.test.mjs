import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  inventaireRelationshipClaims,
  selectInventaireCandidate,
} from '../src/providers/inventaire.mjs'

const testCase = {
  title: 'The Serpent and the Wings of Night',
  authors: ['Carissa Broadbent'],
}
const workUri = 'inv:work'
const seriesUri = 'inv:series'
const authorUri = 'wd:Q-author'
const entities = {
  [workUri]: {
    uri: workUri,
    labels: { en: testCase.title },
    claims: {
      'wdt:P50': [authorUri],
      'wdt:P179': [seriesUri],
      'wdt:P1545': ['1'],
    },
  },
  [seriesUri]: { uri: seriesUri, labels: { en: 'Crowns of Nyaxia' }, claims: {} },
  [authorUri]: { uri: authorUri, labels: { en: 'Carissa Broadbent' }, claims: {} },
}

test('matches a work only after resolving its author relationship', () => {
  const selected = selectInventaireCandidate(
    testCase,
    [
      { uri: 'wd:wrong', label: testCase.title },
      { uri: workUri, label: testCase.title },
    ],
    {
      ...entities,
      'wd:wrong': {
        uri: 'wd:wrong',
        labels: { en: testCase.title },
        claims: { 'wdt:P50': ['wd:wrong-author'] },
      },
      'wd:wrong-author': { labels: { en: 'Another Writer' } },
    },
  )

  assert.equal(selected.entity.uri, workUri)
  assert.equal(selected.ranking.acceptable, true)
})

test('requires the exact work in a returned series roster', () => {
  const claims = inventaireRelationshipClaims(
    entities[workUri],
    entities,
    new Map([
      [
        seriesUri,
        [
          { uri: workUri, ordinal: '1', type: 'work' },
          { uri: 'inv:work-2', ordinal: '2', type: 'work' },
        ],
      ],
    ]),
  )

  assert.equal(claims[0].evidenceKind, 'relational_membership')
  assert.equal(claims[0].position, 1)
  assert.equal(claims[0].memberCount, 2)
  assert.equal(claims[0].sourceLineage.originProvider, 'inventaire')

  const inconsistent = inventaireRelationshipClaims(
    entities[workUri],
    entities,
    new Map([[seriesUri, [{ uri: 'inv:not-this-work', ordinal: '1' }]]]),
  )
  assert.deepEqual(inconsistent, [])
})

test('does not count an Inventaire singleton as automatic evidence', () => {
  const [claim] = inventaireRelationshipClaims(
    entities[workUri],
    entities,
    new Map([[seriesUri, [{ uri: workUri, ordinal: '1' }]]]),
  )
  assert.equal(claim.evidenceKind, 'singleton_relation')
})
