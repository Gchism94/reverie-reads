import assert from 'node:assert/strict'
import { test } from 'node:test'
import { refreshRecordedCaseSet } from '../src/cases.mjs'

const candidate = {
  id: 'stable-case',
  title: 'Example Book',
  authors: ['Example Author'],
  truth: { status: 'candidate', standalone: null, memberships: [], sources: [] },
}
const reviewed = {
  ...candidate,
  truth: {
    status: 'reviewed',
    standalone: false,
    memberships: [{ series: 'Example Series', aliases: [], positions: [] }],
    sources: [{ kind: 'author', url: 'https://author.example/example-book' }],
  },
}

test('refreshes authority truth by stable id without adding uncaptured cases', () => {
  const recorded = {
    cases: [candidate, { ...candidate, id: 'historical-only' }],
    methodology: { reviewedCases: 0, candidateCases: 2, note: 'Historical note' },
  }
  const current = {
    sharedSources: { current: { kind: 'publisher', url: 'https://publisher.example' } },
    cases: [reviewed, { ...reviewed, id: 'new-without-provider-observations' }],
    methodology: { reviewedCases: 2, candidateCases: 0, note: 'Current note' },
  }

  const refreshed = refreshRecordedCaseSet(recorded, current)

  assert.deepEqual(
    refreshed.cases.map(({ id }) => id),
    ['stable-case', 'historical-only'],
  )
  assert.equal(refreshed.cases[0].truth.status, 'reviewed')
  assert.equal(refreshed.cases[1].truth.status, 'candidate')
  assert.deepEqual(refreshed.sharedSources, current.sharedSources)
  assert.deepEqual(refreshed.methodology, {
    reviewedCases: 1,
    candidateCases: 1,
    note: 'Current note',
  })
})
