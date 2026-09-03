import { fetchJson, sleep } from '../http.mjs'
import { rankWorkCandidate } from '../normalize.mjs'

const numeric = (value) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

export const openLibrary = {
  name: 'openlibrary',
  rights: {
    commercialUsePermitted: null,
    persistentStoragePermitted: null,
    claimLevelProvenance: true,
    note: 'Open Library warns that underlying contributions may carry pre-existing rights.',
  },
  async run(cases, progress = () => {}) {
    const results = []
    const delayMs = Number(process.env.OPENLIBRARY_DELAY_MS ?? 1100)

    for (let index = 0; index < cases.length; index += 1) {
      const testCase = cases[index]
      const params = new URLSearchParams({
        title: testCase.title,
        author: testCase.authors[0] ?? '',
        limit: '5',
        fields: 'key,title,author_name,series,series_key,series_name,series_position',
      })

      try {
        const { body, latencyMs } = await fetchJson(
          `https://openlibrary.org/search.json?${params}`,
          {
            headers: { 'User-Agent': 'ReverieSeriesSourceTrial/1.0 (https://reveriereads.app)' },
          },
        )
        const ranked = (body.docs ?? [])
          .map((doc) => ({
            doc,
            ranking: rankWorkCandidate(testCase, doc.title, doc.author_name ?? []),
          }))
          .sort((left, right) => right.ranking.score - left.ranking.score)
        const best = ranked[0]
        const matched = Boolean(best?.ranking.acceptable)
        const hasStructuredRelationship = matched && Array.isArray(best.doc.series_name)
        const names = matched
          ? hasStructuredRelationship
            ? best.doc.series_name
            : Array.isArray(best.doc.series)
              ? best.doc.series
              : []
          : []
        const positions =
          matched && Array.isArray(best.doc.series_position) ? best.doc.series_position : []
        const sourceRef = matched && best.doc.key ? `https://openlibrary.org${best.doc.key}` : null

        results.push({
          caseId: testCase.id,
          latencyMs,
          workMatch: {
            matched,
            confidence: matched ? 'high' : 'none',
            providerWorkId: matched ? (best.doc.key ?? null) : null,
            matchedTitle: matched ? best.doc.title : null,
            matchedAuthors: matched ? (best.doc.author_name ?? []) : [],
          },
          seriesClaims: names.map((series, claimIndex) => ({
            evidenceKind: hasStructuredRelationship ? 'relational_membership' : 'candidate_label',
            providerSeriesId: hasStructuredRelationship
              ? (best.doc.series_key?.[claimIndex] ?? null)
              : null,
            series: String(series),
            position: numeric(positions[claimIndex]),
            orderType: 'unspecified',
            role: 'unknown',
            sourceRef,
          })),
        })
      } catch (error) {
        results.push({
          caseId: testCase.id,
          latencyMs: null,
          workMatch: { matched: false, confidence: 'none' },
          seriesClaims: [],
          error: String(error),
        })
      }

      if ((index + 1) % 10 === 0 || index === cases.length - 1) {
        progress(`openlibrary ${index + 1}/${cases.length}`)
      }
      if (index < cases.length - 1) await sleep(delayMs)
    }

    return results
  },
}
