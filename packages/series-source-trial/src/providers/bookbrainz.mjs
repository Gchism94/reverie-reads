import { performance } from 'node:perf_hooks'
import { fetchJson, sleep } from '../http.mjs'
import { entityLineage } from '../lineage.mjs'
import { rankWorkCandidate, similarity } from '../normalize.mjs'

const API_ROOT = 'https://api.bookbrainz.org/1'
const headers = {
  Accept: 'application/json',
  'User-Agent': 'ReverieSeriesSourceTrial/1.0 (https://reveriereads.app)',
}

const aliasName = (entity) => entity?.defaultAlias?.name ?? null

export const selectBookBrainzCandidate = (testCase, candidates = []) =>
  candidates
    .map((candidate) => ({
      ...candidate,
      ranking: rankWorkCandidate(
        testCase,
        aliasName(candidate.entity),
        candidate.authors.map(aliasName).filter(Boolean),
      ),
    }))
    .sort((left, right) => right.ranking.score - left.ranking.score)[0] ?? null

export const bookBrainzRelationshipClaims = (
  workBbid,
  seriesRows = [],
  rostersBySeries = new Map(),
) =>
  seriesRows.flatMap((row) => {
    const series = row?.entity
    const seriesBbid = series?.bbid
    const seriesName = aliasName(series)
    if (!seriesBbid || !seriesName) return []

    const roster = rostersBySeries.get(seriesBbid) ?? []
    const exactWork = roster.find((entry) => entry?.entity?.bbid === workBbid)
    if (roster.length && !exactWork) return []
    const memberCount = roster.length || null

    return [
      {
        evidenceKind: memberCount === 1 ? 'singleton_relation' : 'relational_membership',
        providerSeriesId: seriesBbid,
        series: seriesName,
        position: null,
        memberCount,
        orderType: 'unspecified',
        role: 'unknown',
        sourceRef: `https://bookbrainz.org/series/${seriesBbid}`,
        sourceLineage: entityLineage('bookbrainz', seriesBbid),
      },
    ]
  })

const get = async (path) => (await fetchJson(`${API_ROOT}${path}`, { headers })).body

export const bookBrainz = {
  name: 'bookbrainz',
  rights: {
    commercialUsePermitted: true,
    persistentStoragePermitted: true,
    claimLevelProvenance: true,
    note: 'BookBrainz core entity and relationship data is published under CC0.',
  },
  async run(cases, progress = () => {}) {
    const results = []
    const delayMs = Number(process.env.BOOKBRAINZ_DELAY_MS ?? 250)

    for (let index = 0; index < cases.length; index += 1) {
      const testCase = cases[index]
      const started = performance.now()

      try {
        const params = new URLSearchParams({
          q: [testCase.title, testCase.authors[0]].filter(Boolean).join(' '),
          type: 'work',
          size: '5',
        })
        const search = await get(`/search?${params}`)
        const titleCandidates = (search?.searchResult ?? [])
          .filter((entry) => similarity(testCase.title, aliasName(entry)) >= 0.9)
          .slice(0, 3)
        const hydrated = []

        for (const entity of titleCandidates) {
          const relationships = await get(`/work/${encodeURIComponent(entity.bbid)}/relationships`)
          const authorIds = (relationships?.relationships ?? [])
            .filter(
              (relationship) =>
                relationship.targetEntityType === 'author' &&
                ['Writer', 'Author'].includes(relationship.relationshipTypeName),
            )
            .map((relationship) => relationship.targetBbid)
          const authors = await Promise.all(
            authorIds.map((bbid) => get(`/author/${encodeURIComponent(bbid)}`)),
          )
          hydrated.push({ entity, authors })
        }

        const best = selectBookBrainzCandidate(testCase, hydrated)
        const matched = Boolean(best?.ranking.acceptable)
        let claims = []

        if (matched) {
          const seriesResponse = await get(`/series?work=${encodeURIComponent(best.entity.bbid)}`)
          const seriesRows = seriesResponse?.series ?? []
          const rostersBySeries = new Map()
          for (const row of seriesRows) {
            const seriesBbid = row?.entity?.bbid
            if (!seriesBbid) continue
            const roster = await get(`/work?series=${encodeURIComponent(seriesBbid)}`)
            rostersBySeries.set(seriesBbid, roster?.works ?? [])
          }
          claims = bookBrainzRelationshipClaims(best.entity.bbid, seriesRows, rostersBySeries)
        }

        results.push({
          caseId: testCase.id,
          latencyMs: Math.round(performance.now() - started),
          workMatch: {
            matched,
            confidence: matched ? 'high' : 'none',
            providerWorkId: matched ? best.entity.bbid : null,
            matchedTitle: matched ? aliasName(best.entity) : null,
            matchedAuthors: matched ? best.authors.map(aliasName).filter(Boolean) : [],
          },
          seriesClaims: claims,
        })
      } catch (error) {
        results.push({
          caseId: testCase.id,
          latencyMs: Math.round(performance.now() - started),
          workMatch: { matched: false, confidence: 'none' },
          seriesClaims: [],
          error: String(error),
        })
      }

      if ((index + 1) % 10 === 0 || index === cases.length - 1) {
        progress(`bookbrainz ${index + 1}/${cases.length}`)
      }
      if (index < cases.length - 1) await sleep(delayMs)
    }

    return results
  },
}
