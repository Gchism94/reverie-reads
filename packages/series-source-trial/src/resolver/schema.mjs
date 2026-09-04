export const RESOLVER_PROMPT_VERSION = 'evidence-resolver-v3-claim-separation'

export const resolverInstructions = `You are Reverie's evidence resolver. You do not know book facts
independently. Use only the supplied evidence packet.

Rules:
- Never use prior knowledge or infer a series from title wording.
- Never declare a work standalone; missing evidence means abstain.
- Cite evidenceId values exactly as supplied.
- A candidate_label is never membership evidence.
- A singleton_relation always requires review.
- Treat each membership's quality object and provider profile as enforced policy, not advice.
- A Hardcover relationship with independent_corroboration_required is not an automatic fact.
- A proposed position is automatic only when quality.positionEligible is true; otherwise use null.
- possible_universe_not_series is a distinct semantic relationship and must remain review unless an
  authority source explicitly supplies its role.
- Keep membership and order decisions separate. A position conflict or uncorroborated position does
  not invalidate an otherwise eligible membership: accept the membership with position null and
  include the applicable review reason.
- If sources conflict on the membership itself, choose review.
- If more than one distinct series relationship is eligible and their roles are unknown, choose
  review; do not accept every relationship or guess which one is primary.
- A membership's series text, position, orderType, and role must occur in its cited evidence. Use null
  or unknown when the evidence does not supply the field.
- accept_membership is reserved for an exact work match with non-singleton relational evidence and no
  unresolved conflict. Otherwise choose review or abstain.
- Keep the note factual and under 240 characters.`

const stringArray = { type: 'array', items: { type: 'string' } }

export const resolverOutputSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['caseId', 'decision', 'identity', 'memberships', 'reviewReasons', 'note'],
  properties: {
    caseId: { type: 'string' },
    decision: { type: 'string', enum: ['accept_membership', 'review', 'abstain'] },
    identity: {
      type: 'object',
      additionalProperties: false,
      required: ['matched', 'confidence', 'evidenceIds'],
      properties: {
        matched: { type: 'boolean' },
        confidence: { type: 'string', enum: ['high', 'medium', 'low', 'none'] },
        evidenceIds: stringArray,
      },
    },
    memberships: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['series', 'position', 'orderType', 'role', 'confidence', 'evidenceIds'],
        properties: {
          series: { type: 'string' },
          position: { type: ['number', 'null'] },
          orderType: {
            type: 'string',
            enum: ['publication', 'recommended', 'narrative', 'unspecified'],
          },
          role: { type: 'string', enum: ['primary', 'secondary', 'universe', 'unknown'] },
          confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
          evidenceIds: stringArray,
        },
      },
    },
    reviewReasons: {
      type: 'array',
      items: {
        type: 'string',
        enum: [
          'identity_conflict',
          'membership_conflict',
          'position_conflict',
          'series_role_unclear',
          'singleton_only',
          'insufficient_evidence',
          'source_requires_corroboration',
          'possible_universe_relation',
          'self_titled_relation',
          'position_uncorroborated',
        ],
      },
    },
    note: { type: 'string' },
  },
}
