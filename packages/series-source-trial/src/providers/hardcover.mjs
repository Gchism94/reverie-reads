import { fetchJson, sleep } from '../http.mjs'
import { rankWorkCandidate } from '../normalize.mjs'

const API_URL = 'https://api.hardcover.app/v1/graphql'

const numeric = (value) => {
  if (value === null || value === undefined || value === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

const token = () =>
  String(process.env.HARDCOVER_TOKEN ?? '')
    .replace(/^Bearer\s+/i, '')
    .trim()

export const selectHardcoverCandidate = (testCase, hits = []) =>
  hits
    .map((hit) => {
      const document = hit?.document ?? {}
      return {
        document,
        ranking: rankWorkCandidate(testCase, document.title, document.author_names ?? []),
      }
    })
    .sort((left, right) => right.ranking.score - left.ranking.score)[0] ?? null

export const hardcoverRelationshipClaims = (book, sourceRef) =>
  (book?.book_series ?? [])
    .filter((membership) => membership?.series?.name)
    .map((membership) => {
      const memberCount = numeric(membership.series.books_count)
      return {
        evidenceKind: memberCount === 1 ? 'singleton_relation' : 'relational_membership',
        providerSeriesId:
          membership.series.id === null || membership.series.id === undefined
            ? null
            : String(membership.series.id),
        series: String(membership.series.name),
        position: numeric(membership.position),
        memberCount,
        orderType: 'unspecified',
        role: 'unknown',
        sourceRef,
      }
    })

const searchQuery = `
  query SearchBooks($query: String!, $limit: Int!) {
    search(query: $query, query_type: "Book", per_page: $limit) {
      results
    }
  }
`

// The second query is what turns a search label into admissible evidence: it asks Hardcover for
// the exact matched book row and follows its book_series relationship to the named series.
const relationshipQuery = `
  query BookSeriesRelationships($id: Int!) {
    books(where: { id: { _eq: $id } }, limit: 1) {
      id
      book_series {
        position
        series {
          id
          name
          books_count
        }
      }
    }
  }
`

export const hardcover = {
  name: 'hardcover',
  rights: {
    commercialUsePermitted: null,
    persistentStoragePermitted: null,
    claimLevelProvenance: true,
    note: 'The beta API documentation does not grant commercial use or persistent storage rights.',
  },
  async run(cases, progress = () => {}) {
    const apiToken = token()
    if (!apiToken) {
      throw new Error(
        'HARDCOVER_TOKEN is required. Create a personal token in Hardcover settings and keep it server-side.',
      )
    }

    const results = []
    const delayMs = Math.max(1000, Number(process.env.HARDCOVER_DELAY_MS ?? 1100))
    let lastRequestAt = 0

    const graphql = async (query, variables) => {
      const waitMs = Math.max(0, lastRequestAt + delayMs - Date.now())
      if (waitMs) await sleep(waitMs)
      lastRequestAt = Date.now()
      const response = await fetchJson(API_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiToken}`,
          'Content-Type': 'application/json',
          'User-Agent': 'ReverieSeriesSourceTrial/1.0 (https://reveriereads.app)',
        },
        body: JSON.stringify({ query, variables }),
      })
      if (response.body?.errors?.length) {
        throw new Error(`Hardcover GraphQL: ${response.body.errors[0]?.message ?? 'unknown error'}`)
      }
      return response
    }

    for (let index = 0; index < cases.length; index += 1) {
      const testCase = cases[index]
      const startedAt = Date.now()

      try {
        const searchResponse = await graphql(searchQuery, { query: testCase.title, limit: 5 })
        const hits = searchResponse.body?.data?.search?.results?.hits ?? []
        const best = selectHardcoverCandidate(testCase, hits)
        const matched = Boolean(best?.ranking.acceptable && numeric(best.document.id) !== null)
        let claims = []

        if (matched) {
          const relationshipResponse = await graphql(relationshipQuery, {
            id: numeric(best.document.id),
          })
          const book = relationshipResponse.body?.data?.books?.[0] ?? null
          const sourceRef = best.document.slug
            ? `https://hardcover.app/books/${encodeURIComponent(best.document.slug)}`
            : `hardcover:book:${best.document.id}`
          claims = hardcoverRelationshipClaims(book, sourceRef)
        }

        results.push({
          caseId: testCase.id,
          latencyMs: Date.now() - startedAt,
          workMatch: {
            matched,
            confidence: matched ? 'high' : 'none',
            providerWorkId: matched ? String(best.document.id) : null,
            matchedTitle: matched ? best.document.title : null,
            matchedAuthors: matched ? (best.document.author_names ?? []) : [],
          },
          seriesClaims: claims,
        })
      } catch (error) {
        results.push({
          caseId: testCase.id,
          latencyMs: Date.now() - startedAt,
          workMatch: { matched: false, confidence: 'none' },
          seriesClaims: [],
          error: String(error),
        })
      }

      if ((index + 1) % 10 === 0 || index === cases.length - 1) {
        progress(`hardcover ${index + 1}/${cases.length}`)
      }
    }

    return results
  },
}
