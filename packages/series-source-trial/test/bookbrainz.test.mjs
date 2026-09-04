import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  bookBrainzRelationshipClaims,
  selectBookBrainzCandidate,
} from '../src/providers/bookbrainz.mjs'

const testCase = { title: 'The Way of Kings', authors: ['Brandon Sanderson'] }

test('uses the work-author relationship to reject a title collision', () => {
  const selected = selectBookBrainzCandidate(testCase, [
    {
      entity: { bbid: 'wrong', defaultAlias: { name: 'The Way of Kings' } },
      authors: [{ defaultAlias: { name: 'Another Writer' } }],
    },
    {
      entity: { bbid: 'right', defaultAlias: { name: 'The Way of Kings' } },
      authors: [{ defaultAlias: { name: 'Brandon Sanderson' } }],
    },
  ])

  assert.equal(selected.entity.bbid, 'right')
  assert.equal(selected.ranking.acceptable, true)
})

test('emits membership only when the series roster contains the exact work', () => {
  const seriesRows = [
    {
      entity: {
        bbid: 'series-1',
        defaultAlias: { name: 'The Stormlight Archive' },
      },
    },
  ]
  const claims = bookBrainzRelationshipClaims(
    'work-1',
    seriesRows,
    new Map([['series-1', [{ entity: { bbid: 'work-1' } }, { entity: { bbid: 'work-2' } }]]]),
  )

  assert.equal(claims[0].evidenceKind, 'relational_membership')
  assert.equal(claims[0].memberCount, 2)
  assert.equal(claims[0].position, null)
  assert.equal(claims[0].sourceLineage.originProvider, 'bookbrainz')

  const inconsistent = bookBrainzRelationshipClaims(
    'work-1',
    seriesRows,
    new Map([['series-1', [{ entity: { bbid: 'work-2' } }]]]),
  )
  assert.deepEqual(inconsistent, [])
})
