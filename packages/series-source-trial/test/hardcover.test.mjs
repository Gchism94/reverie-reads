import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  hardcoverRelationshipClaims,
  selectHardcoverCandidate,
} from '../src/providers/hardcover.mjs'

const testCase = {
  title: 'A Court of Silver Flames',
  authors: ['Sarah J. Maas'],
}

test('selects the exact title and author rather than a popular near match', () => {
  const selected = selectHardcoverCandidate(testCase, [
    {
      document: {
        id: 1,
        title: 'A Court of Thorns and Roses',
        author_names: ['Sarah J. Maas'],
      },
    },
    {
      document: {
        id: 2,
        title: 'A Court of Silver Flames',
        author_names: ['Sarah J. Maas'],
      },
    },
  ])

  assert.equal(selected.document.id, 2)
  assert.equal(selected.ranking.acceptable, true)
})

test('emits only relationships from the exact book row', () => {
  const claims = hardcoverRelationshipClaims(
    {
      id: 2,
      book_series: [
        {
          position: 5,
          series: { id: 42, name: 'A Court of Thorns and Roses', books_count: 7 },
        },
        { position: 1, series: null },
      ],
    },
    'https://hardcover.app/books/a-court-of-silver-flames',
  )

  assert.deepEqual(claims, [
    {
      evidenceKind: 'relational_membership',
      providerSeriesId: '42',
      series: 'A Court of Thorns and Roses',
      position: 5,
      memberCount: 7,
      orderType: 'unspecified',
      role: 'unknown',
      sourceRef: 'https://hardcover.app/books/a-court-of-silver-flames',
    },
  ])
})

test('does not turn a search-only series label into a relationship claim', () => {
  const selected = selectHardcoverCandidate(testCase, [
    {
      document: {
        id: 2,
        title: 'A Court of Silver Flames',
        author_names: ['Sarah J. Maas'],
        series_names: ['A Court of Thorns and Roses'],
        featured_series_position: 5,
      },
    },
  ])

  assert.equal(selected.ranking.acceptable, true)
  assert.deepEqual(hardcoverRelationshipClaims(null, 'hardcover:book:2'), [])
})

test('retains a singleton as review-only evidence', () => {
  const claims = hardcoverRelationshipClaims(
    {
      book_series: [
        { position: 1, series: { id: 7, name: 'Manufactured Singleton', books_count: 1 } },
      ],
    },
    'hardcover:book:7',
  )

  assert.equal(claims[0].evidenceKind, 'singleton_relation')
  assert.equal(claims[0].memberCount, 1)
})
