import assert from 'node:assert/strict'
import { test } from 'node:test'
import { combineRuns, supplementalEnsembles } from '../src/ensemble.mjs'

const result = (caseId, providerWorkId, claims = [], error = null) => ({
  caseId,
  latencyMs: 10,
  workMatch: {
    matched: true,
    confidence: 'high',
    providerWorkId,
    matchedTitle: 'Book',
    matchedAuthors: ['Writer'],
  },
  seriesClaims: claims,
  ...(error ? { error } : {}),
})

const claim = (series, position, sourceRef) => ({
  evidenceKind: 'relational_membership',
  providerSeriesId: series,
  series,
  position,
  orderType: 'unspecified',
  role: 'unknown',
  sourceRef,
})

const run = (provider, results, rights = true) => ({
  provider,
  observedAt: '2026-09-03T00:00:00Z',
  rights: {
    commercialUsePermitted: rights,
    persistentStoragePermitted: rights,
    claimLevelProvenance: true,
  },
  results,
})

test('supplements work coverage without treating Google labels as relationships', () => {
  const openLibrary = run('openlibrary', [
    {
      caseId: 'book',
      latencyMs: 10,
      workMatch: { matched: false, confidence: 'none' },
      seriesClaims: [],
    },
  ])
  const google = run('google-books', [result('book', 'google-1')], false)
  const combined = combineRuns([openLibrary, google])

  assert.equal(combined.results[0].workMatch.matched, true)
  assert.deepEqual(combined.results[0].seriesClaims, [])
  assert.equal(combined.rights.persistentStoragePermitted, false)
})

test('deduplicates corroborating membership and blanks a disputed position', () => {
  const openLibrary = run('openlibrary', [
    result('book', 'ol-1', [claim('The Sequence', 5, 'openlibrary:book')]),
  ])
  const wikidata = run('wikidata', [
    result('book', 'wd-1', [claim('The Sequence', 4, 'wikidata:book')]),
  ])
  const hardcover = run('hardcover', [
    result('book', 'hc-1', [claim('The Sequence', 5, 'hardcover:book')]),
  ])
  const combined = combineRuns([openLibrary, wikidata, hardcover])

  assert.equal(combined.results[0].seriesClaims.length, 1)
  assert.equal(combined.results[0].seriesClaims[0].series, 'The Sequence')
  assert.equal(combined.results[0].seriesClaims[0].position, null)
  assert.equal(combined.results[0].seriesClaims[0].positionConflict, true)
  assert.deepEqual(combined.results[0].seriesClaims[0].supportingProviders, [
    'openlibrary',
    'wikidata',
    'hardcover',
  ])
})

test('creates baseline, open-data, and marginal supplement strategies', () => {
  const providers = [
    'openlibrary',
    'wikidata',
    'inventaire',
    'bookbrainz',
    'google-books',
    'hardcover',
  ].map((provider) => run(provider, [result('book', `${provider}-1`)]))
  const ensembles = supplementalEnsembles(providers)

  assert.deepEqual(
    ensembles.map((entry) => entry.provider),
    [
      'strategy:openlibrary+wikidata',
      'strategy:openlibrary+wikidata+inventaire',
      'strategy:openlibrary+wikidata+bookbrainz',
      'strategy:openlibrary+wikidata+google-books',
      'strategy:openlibrary+wikidata+hardcover',
      'strategy:all-providers',
    ],
  )
})

test('deduplicates mirrored providers by source lineage', () => {
  const wikidataLineage = {
    originProvider: 'wikidata',
    originEntityId: 'wd:Q1',
    observedVia: 'wikidata',
  }
  const wikidata = run('wikidata', [
    result('book', 'wd:book', [
      { ...claim('Series', 1, 'wd:book'), sourceLineage: wikidataLineage },
    ]),
  ])
  const inventaire = run('inventaire', [
    result('book', 'wd:book', [
      {
        ...claim('Series', 1, 'inventaire:book'),
        sourceLineage: { ...wikidataLineage, observedVia: 'inventaire' },
      },
    ]),
  ])

  const combined = combineRuns([wikidata, inventaire])
  assert.equal(combined.results[0].seriesClaims[0].supportingProviders.length, 2)
  assert.deepEqual(combined.results[0].seriesClaims[0].supportingLineages, [
    {
      originProvider: 'wikidata',
      originEntityId: 'wd:Q1',
      observedVia: ['wikidata', 'inventaire'],
    },
  ])
})
