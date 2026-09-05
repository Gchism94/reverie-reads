export const AUTHORITY_ACQUISITION_PROMPT_VERSION =
  'authority-acquisition-v2-bibliographic-memberships-only'

export const authorityAcquisitionInstructions = `You are Reverie's authority-source scout.
Find attributable evidence for one exact book. Your output is a review proposal, never a database
decision.

Rules:
- Search the live web. Do not answer from memory.
- Match the exact title and author before classifying the work.
- If the first search finds a first-party identity page but not direct classification evidence, run
  a second focused search for the author's series/standalone bibliography or publisher series page.
  Use a third focused search when needed; stop early once the evidence is definitive.
- Prefer the author's official site or author-controlled post, then the publisher's book or catalog
  page. Retailers, Goodreads, Wikipedia, fan wikis, review sites, library catalogs, search snippets,
  and data aggregators are discovery aids only and must not appear as authoritySources.
- A series classification requires an author or publisher source that directly places this exact
  work in a named series. A title pattern, retailer breadcrumb, provider label, or mention of a
  shared world is insufficient.
- A standalone classification requires an author or publisher source that affirmatively calls the
  exact work standalone or explicitly places it in a complete standalone bibliography. Silence,
  absence from a series list, or failure to find a series is not standalone evidence.
- Distinguish a bibliographic series from a universe, setting, collection, companion grouping, or
  recommended reading order. memberships contains bibliographic series only. A standalone inside a
  named universe stays classification standalone with an empty memberships array; describe its
  universe context in uncertainties. If the relationship is unclear, return unresolved.
- Preserve multiple memberships when first-party evidence explicitly supports them; do not guess a
  primary membership.
- Report a position only when the source explicitly supplies it. Otherwise use null.
- Every evidenceUrl and authoritySources.url must be an exact URL consulted during this search.
- evidenceSummary must be a short paraphrase, not a quotation, and must state what the page supports.
- If no qualifying source is found, return unresolved with no invented source.
- Keep note under 240 characters.`

const stringArray = { type: 'array', items: { type: 'string' } }

export const authorityAcquisitionOutputSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'caseId',
    'identity',
    'classification',
    'memberships',
    'authoritySources',
    'uncertainties',
    'note',
  ],
  properties: {
    caseId: { type: 'string' },
    identity: {
      type: 'object',
      additionalProperties: false,
      required: ['matched', 'confidence', 'evidenceUrls'],
      properties: {
        matched: { type: 'boolean' },
        confidence: { type: 'string', enum: ['high', 'medium', 'low', 'none'] },
        evidenceUrls: stringArray,
      },
    },
    classification: {
      type: 'string',
      enum: ['series', 'standalone', 'unresolved'],
    },
    memberships: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['series', 'position', 'role', 'evidenceUrls'],
        properties: {
          series: { type: 'string' },
          position: { type: ['number', 'null'] },
          role: { type: 'string', enum: ['primary', 'secondary', 'unknown'] },
          evidenceUrls: stringArray,
        },
      },
    },
    authoritySources: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['url', 'kind', 'supports', 'evidenceSummary'],
        properties: {
          url: { type: 'string' },
          kind: {
            type: 'string',
            enum: ['author', 'author_post', 'publisher', 'publisher_catalog'],
          },
          supports: {
            type: 'array',
            items: {
              type: 'string',
              enum: ['identity', 'series_membership', 'position', 'standalone'],
            },
          },
          evidenceSummary: { type: 'string' },
        },
      },
    },
    uncertainties: stringArray,
    note: { type: 'string' },
  },
}
