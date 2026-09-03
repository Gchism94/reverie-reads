import { fetchJson, sleep } from '../http.mjs'
import { rankWorkCandidate } from '../normalize.mjs'

const numeric = (value) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

export const googleBooks = {
  name: 'google-books',
  rights: {
    commercialUsePermitted: true,
    persistentStoragePermitted: false,
    claimLevelProvenance: true,
    note: 'Google API terms restrict permanent copying and database construction.',
  },
  async run(cases, progress = () => {}) {
    const apiKey = process.env.GOOGLE_BOOKS_API_KEY ?? process.env.VITE_GOOGLE_BOOKS_KEY ?? ''
    const referrer = process.env.GOOGLE_BOOKS_REFERRER ?? ''
    const results = Array(cases.length)
    let nextIndex = 0
    let completed = 0

    async function worker() {
      while (nextIndex < cases.length) {
        const index = nextIndex
        nextIndex += 1
        const testCase = cases[index]
        const query = `intitle:"${testCase.title}" inauthor:"${testCase.authors[0] ?? ''}"`
        const params = new URLSearchParams({ q: query, maxResults: '5', projection: 'full' })
        if (apiKey) params.set('key', apiKey)

        try {
          const headers = referrer ? { Referer: referrer, Origin: referrer } : {}
          const { body, latencyMs } = await fetchJson(
            `https://www.googleapis.com/books/v1/volumes?${params}`,
            { headers },
          )
          const ranked = (body.items ?? [])
            .map((item) => ({
              item,
              ranking: rankWorkCandidate(
                testCase,
                item.volumeInfo?.title,
                item.volumeInfo?.authors ?? [],
              ),
            }))
            .sort((left, right) => right.ranking.score - left.ranking.score)
          const best = ranked[0]
          const matched = Boolean(best?.ranking.acceptable)
          const info = matched ? (best.item.volumeInfo?.seriesInfo ?? best.item.seriesInfo) : null
          const series = Array.isArray(info?.volumeSeries) ? info.volumeSeries : []
          results[index] = {
            caseId: testCase.id,
            latencyMs,
            workMatch: {
              matched,
              confidence: matched ? 'high' : 'none',
              providerWorkId: matched ? best.item.id : null,
              matchedTitle: matched ? best.item.volumeInfo?.title : null,
              matchedAuthors: matched ? (best.item.volumeInfo?.authors ?? []) : [],
            },
            seriesClaims: series.map((entry) => ({
              evidenceKind: entry.seriesId ? 'opaque_series_relation' : 'candidate_label',
              providerSeriesId: entry.seriesId ?? null,
              series: null,
              position: numeric(entry.orderNumber ?? info.bookDisplayNumber),
              orderType: 'unspecified',
              role: entry.seriesBookType ?? 'unknown',
              sourceRef: matched
                ? `https://books.google.com/books?id=${encodeURIComponent(best.item.id)}`
                : null,
            })),
          }
        } catch (error) {
          results[index] = {
            caseId: testCase.id,
            latencyMs: null,
            workMatch: { matched: false, confidence: 'none' },
            seriesClaims: [],
            error: String(error),
          }
        }

        completed += 1
        if (completed % 10 === 0 || completed === cases.length) {
          progress(`google-books ${completed}/${cases.length}`)
        }
        await sleep(250)
      }
    }

    await Promise.all(Array.from({ length: 4 }, () => worker()))
    return results
  },
}
