import assert from 'node:assert/strict'
import { test } from 'node:test'
import { annotateProviderResults, entityLineage, lineageKey } from '../src/lineage.mjs'

test('marks Inventaire Wikidata mirrors as Wikidata lineage', () => {
  assert.deepEqual(entityLineage('inventaire', 'wd:Q2136877', 'inventaire'), {
    originProvider: 'wikidata',
    originEntityId: 'Q2136877',
    observedVia: 'inventaire',
  })
  assert.deepEqual(entityLineage('inventaire', 'inv:abc', 'inventaire'), {
    originProvider: 'inventaire',
    originEntityId: 'inv:abc',
    observedVia: 'inventaire',
  })
})

test('fills ordinary provider lineage without overwriting a declared origin', () => {
  const declared = entityLineage('inventaire', 'wd:Q1', 'inventaire')
  const [result] = annotateProviderResults('inventaire', [
    {
      caseId: 'book',
      workMatch: {
        matched: true,
        confidence: 'high',
        providerWorkId: 'wd:Q1',
        sourceLineage: declared,
      },
      seriesClaims: [
        {
          evidenceKind: 'relational_membership',
          providerSeriesId: 'inv:series',
          series: 'Series',
          sourceRef: 'record',
        },
      ],
    },
  ])

  assert.deepEqual(result.workMatch.sourceLineage, declared)
  assert.equal(result.seriesClaims[0].sourceLineage.originProvider, 'inventaire')
})

test('normalizes Wikidata URI and Inventaire wd identifiers to one origin', () => {
  const direct = {
    originProvider: 'wikidata',
    originEntityId: 'https://www.wikidata.org/entity/Q12345',
    observedVia: 'wikidata',
  }
  const mirrored = {
    originProvider: 'Wikidata',
    originEntityId: 'wd:Q12345',
    observedVia: 'inventaire',
  }

  assert.equal(lineageKey(direct), 'wikidata:Q12345')
  assert.equal(lineageKey(direct), lineageKey(mirrored))
})
