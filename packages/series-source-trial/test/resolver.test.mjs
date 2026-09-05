import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  buildEvidencePacket,
  canonicalizeResolutionDecision,
  scoreResolutionRun,
  validateResolution,
} from '../src/resolver/evidence.mjs'
import { resolveEvidencePacket } from '../src/resolver/openai.mjs'

const testCase = {
  id: 'book',
  title: 'Second Book',
  authors: ['Ada Reader'],
}
const run = {
  provider: 'inventaire',
  results: [
    {
      caseId: 'book',
      workMatch: {
        matched: true,
        confidence: 'high',
        providerWorkId: 'inv:work',
        matchedTitle: 'Second Book',
        matchedAuthors: ['Ada Reader'],
        sourceLineage: {
          originProvider: 'inventaire',
          originEntityId: 'inv:work',
          observedVia: 'inventaire',
        },
      },
      seriesClaims: [
        {
          evidenceKind: 'relational_membership',
          providerSeriesId: 'inv:series',
          series: 'The Sequence',
          position: 2,
          memberCount: 3,
          orderType: 'unspecified',
          role: 'unknown',
          sourceRef: 'https://inventaire.io/entity/inv:series',
        },
      ],
    },
  ],
}

const accepted = {
  caseId: 'book',
  decision: 'accept_membership',
  identity: {
    matched: true,
    confidence: 'high',
    evidenceIds: ['inventaire:identity'],
  },
  memberships: [
    {
      series: 'The Sequence',
      position: null,
      orderType: 'unspecified',
      role: 'unknown',
      confidence: 'high',
      evidenceIds: ['inventaire:membership:0'],
    },
  ],
  reviewReasons: [],
  note: 'Exact relationship and order agree.',
}

test('builds a truth-blind evidence packet and accepts a supported membership', () => {
  const packet = buildEvidencePacket(testCase, [run])
  assert.equal('truth' in packet, false)
  assert.equal(packet.membershipEvidence[0].sourceRef.includes('inventaire.io'), true)

  const validation = validateResolution(packet, accepted)
  assert.equal(validation.valid, true)
  assert.equal(validation.policySafe, true)
  assert.equal(validation.validEvidenceCitationCount, 2)
})

test('requires independent order corroboration even when one relationship supplies a position', () => {
  const packet = buildEvidencePacket(testCase, [run])
  const proposed = structuredClone(accepted)
  proposed.memberships[0].position = 2

  const validation = validateResolution(packet, proposed)
  assert.equal(validation.valid, true)
  assert.equal(validation.policySafe, false)
  assert.ok(validation.policyViolations.some((error) => error.includes('position')))
})

test('canonicalizes an order-only review into an eligible membership decision', () => {
  const packet = buildEvidencePacket(testCase, [run])
  const orderOnlyReview = {
    ...structuredClone(accepted),
    decision: 'review',
    reviewReasons: ['position_uncorroborated'],
  }

  const canonical = canonicalizeResolutionDecision(packet, orderOnlyReview)
  assert.equal(canonical.decision, 'accept_membership')
  assert.equal(validateResolution(packet, canonical).policySafe, true)

  const membershipConflict = {
    ...orderOnlyReview,
    reviewReasons: ['membership_conflict', 'position_uncorroborated'],
  }
  assert.equal(canonicalizeResolutionDecision(packet, membershipConflict).decision, 'review')
})

test('rejects facts and citations that do not occur in the evidence packet', () => {
  const packet = buildEvidencePacket(testCase, [run])
  const fabricated = structuredClone(accepted)
  fabricated.memberships[0].series = 'Invented Saga'
  fabricated.memberships[0].position = 9
  fabricated.memberships[0].evidenceIds = ['missing:evidence']

  const validation = validateResolution(packet, fabricated)
  assert.equal(validation.valid, false)
  assert.equal(validation.policySafe, false)
  assert.ok(validation.errors.some((error) => error.includes('unknown evidence')))
})

test('returns validation errors rather than throwing on a malformed identity citation list', () => {
  const packet = buildEvidencePacket(testCase, [run])
  const malformed = structuredClone(accepted)
  delete malformed.identity.evidenceIds

  const validation = validateResolution(packet, malformed)
  assert.equal(validation.valid, false)
  assert.ok(validation.errors.includes('identity.evidenceIds must be an array'))
})

test('keeps singleton and conflicting relationships out of automatic fills', () => {
  const singletonRun = structuredClone(run)
  singletonRun.results[0].seriesClaims[0].evidenceKind = 'singleton_relation'
  singletonRun.results[0].seriesClaims[0].memberCount = 1
  const singleton = validateResolution(buildEvidencePacket(testCase, [singletonRun]), accepted)
  assert.equal(singleton.valid, true)
  assert.equal(singleton.policySafe, false)
  assert.ok(singleton.policyViolations.some((error) => error.includes('singleton')))

  const conflictRun = structuredClone(run)
  conflictRun.provider = 'bookbrainz'
  conflictRun.results[0].seriesClaims[0].series = 'A Different Sequence'
  const conflictPacket = buildEvidencePacket(testCase, [run, conflictRun])
  const conflict = validateResolution(conflictPacket, accepted)
  assert.equal(conflict.policySafe, false)
  assert.ok(conflict.policyViolations.some((error) => error.includes('multiple distinct series')))
})

test('prevents the resolver from accepting a Hardcover-only self-titled relationship', () => {
  const hardcoverRun = structuredClone(run)
  hardcoverRun.provider = 'hardcover'
  hardcoverRun.results[0].seriesClaims[0].series = testCase.title
  hardcoverRun.results[0].seriesClaims[0].memberCount = 2
  const packet = buildEvidencePacket(testCase, [hardcoverRun])
  const proposal = structuredClone(accepted)
  proposal.memberships[0].series = testCase.title
  proposal.memberships[0].evidenceIds = ['hardcover:membership:0']
  proposal.identity.evidenceIds = ['hardcover:identity']

  const validation = validateResolution(packet, proposal)
  assert.equal(validation.valid, true)
  assert.equal(validation.policySafe, false)
  assert.ok(validation.policyViolations.some((error) => error.includes('self_titled_relation')))
})

test('prevents the resolver from accepting a Hardcover reading-order relationship', () => {
  const hardcoverRun = structuredClone(run)
  hardcoverRun.provider = 'hardcover'
  hardcoverRun.results[0].seriesClaims[0].series = 'The Sequence World Reading Order'
  hardcoverRun.results[0].seriesClaims[0].memberCount = 12
  const packet = buildEvidencePacket(testCase, [hardcoverRun])
  const proposal = structuredClone(accepted)
  proposal.memberships[0].series = 'The Sequence World Reading Order'
  proposal.memberships[0].evidenceIds = ['hardcover:membership:0']
  proposal.identity.evidenceIds = ['hardcover:identity']

  const validation = validateResolution(packet, proposal)
  assert.equal(validation.valid, true)
  assert.equal(validation.policySafe, false)
  assert.ok(
    validation.policyViolations.some((error) =>
      error.includes('possible_reading_order_not_series'),
    ),
  )
})

test('sends a stateless structured-output request to the resolver API', async () => {
  const packet = buildEvidencePacket(testCase, [run])
  let requestBody
  const fetchImpl = async (_url, options) => {
    requestBody = JSON.parse(options.body)
    return new Response(
      JSON.stringify({
        id: 'response-1',
        model: 'test-model',
        output: [{ content: [{ type: 'output_text', text: JSON.stringify(accepted) }] }],
        usage: { input_tokens: 100, output_tokens: 50 },
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    )
  }

  const result = await resolveEvidencePacket(packet, {
    apiKey: 'test-key',
    model: 'test-model',
    fetchImpl,
  })

  assert.equal(requestBody.store, false)
  assert.equal(requestBody.text.format.type, 'json_schema')
  assert.equal(requestBody.text.format.strict, true)
  assert.equal(requestBody.tools, undefined)
  assert.deepEqual(result.output, accepted)
})

test('inherits data-use rights from cited evidence instead of laundering them through the model', () => {
  const policy = {
    hardGates: {
      minimumReviewedCases: 1,
      minimumReviewedPositiveCases: 1,
      minimumReviewedStandaloneCases: 0,
      minimumMembershipPrecision: 1,
      maximumFalseStandaloneRate: 0,
    },
  }
  const caseSet = {
    cases: [
      {
        ...testCase,
        truth: {
          status: 'reviewed',
          standalone: false,
          memberships: [
            {
              series: 'The Sequence',
              aliases: [],
              positions: [],
            },
          ],
        },
      },
    ],
  }
  const completed = (packet) => [
    {
      caseId: testCase.id,
      status: 'completed',
      output: accepted,
      latencyMs: 1,
      validation: validateResolution(packet, accepted),
    },
  ]

  const inventairePacket = buildEvidencePacket(testCase, [run])
  const cc0 = scoreResolutionRun(
    caseSet,
    [inventairePacket],
    completed(inventairePacket),
    policy,
    'test-model',
  )
  assert.equal(cc0.autoFillAccuracy.procurementGate.checks.commercialUsePermitted, true)
  assert.equal(cc0.autoFillAccuracy.procurementGate.checks.persistentStoragePermitted, true)

  const openLibraryRun = structuredClone(run)
  openLibraryRun.provider = 'openlibrary'
  const openLibraryPacket = buildEvidencePacket(testCase, [openLibraryRun])
  const openLibraryOutput = structuredClone(accepted)
  openLibraryOutput.identity.evidenceIds = ['openlibrary:identity']
  openLibraryOutput.memberships[0].evidenceIds = ['openlibrary:membership:0']
  const openLibraryResolution = [
    {
      caseId: testCase.id,
      status: 'completed',
      output: openLibraryOutput,
      latencyMs: 1,
      validation: validateResolution(openLibraryPacket, openLibraryOutput),
    },
  ]
  const pendingRights = scoreResolutionRun(
    caseSet,
    [openLibraryPacket],
    openLibraryResolution,
    policy,
    'test-model',
  )
  assert.equal(pendingRights.autoFillAccuracy.procurementGate.checks.commercialUsePermitted, false)
  assert.equal(
    pendingRights.autoFillAccuracy.procurementGate.checks.persistentStoragePermitted,
    false,
  )
})
