import { performance } from 'node:perf_hooks'
import { fetchJson, sleep } from '../http.mjs'
import { entityLineage } from '../lineage.mjs'
import { rankWorkCandidate, similarity } from '../normalize.mjs'

const API_ROOT = 'https://inventaire.io/api'
const USER_AGENT =
  process.env.INVENTAIRE_USER_AGENT ?? 'ReverieSeriesSourceTrial/1.0 (https://reveriereads.app)'

const values = (entity, property) =>
  Array.isArray(entity?.claims?.[property]) ? entity.claims[property] : []

const label = (entity) =>
  entity?.labels?.en ?? Object.values(entity?.labels ?? {}).find(Boolean) ?? null

const numeric = (value) => {
  if (value === null || value === undefined || value === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

export const selectInventaireCandidate = (testCase, hits = [], entities = {}) =>
  hits
    .map((hit) => {
      const entity = entities[hit.uri]
      const authors = values(entity, 'wdt:P50')
        .map((uri) => label(entities[uri]))
        .filter(Boolean)
      return {
        hit,
        entity,
        authors,
        ranking: rankWorkCandidate(testCase, label(entity) ?? hit.label, authors),
      }
    })
    .sort((left, right) => right.ranking.score - left.ranking.score)[0] ?? null

export const inventaireRelationshipClaims = (work, entities, partsBySeries = new Map()) => {
  const seriesUris = values(work, 'wdt:P179')
  const fallbackPosition = seriesUris.length === 1 ? numeric(values(work, 'wdt:P1545')[0]) : null

  return seriesUris.flatMap((seriesUri) => {
    const seriesEntity = entities[seriesUri]
    const series = label(seriesEntity)
    if (!series) return []

    const parts = partsBySeries.get(seriesUri) ?? []
    const exactPart = parts.find((part) => part?.uri === work.uri)
    // When the roster endpoint returned a roster, it must contain the exact work. A provider-side
    // inconsistency is not admissible relational evidence.
    if (parts.length && !exactPart) return []
    const memberCount = parts.length || null

    return [
      {
        evidenceKind: memberCount === 1 ? 'singleton_relation' : 'relational_membership',
        providerSeriesId: seriesUri,
        series,
        position: numeric(exactPart?.ordinal) ?? fallbackPosition,
        memberCount,
        orderType: 'unspecified',
        role: 'unknown',
        sourceRef: `https://inventaire.io/entity/${seriesUri}`,
        sourceLineage: entityLineage('inventaire', seriesUri, 'inventaire'),
      },
    ]
  })
}

const headers = { Accept: 'application/json', 'User-Agent': USER_AGENT }

export const inventaire = {
  name: 'inventaire',
  rights: {
    commercialUsePermitted: true,
    persistentStoragePermitted: true,
    claimLevelProvenance: true,
    note: 'Inventaire internal entities and Wikidata-backed entities are published under CC0.',
  },
  async run(cases, progress = () => {}) {
    const results = []
    const delayMs = Number(process.env.INVENTAIRE_DELAY_MS ?? 250)

    for (let index = 0; index < cases.length; index += 1) {
      const testCase = cases[index]
      const started = performance.now()

      try {
        const searchParams = new URLSearchParams({
          search: [testCase.title, testCase.authors[0]].filter(Boolean).join(' '),
          types: 'works',
          limit: '5',
        })
        const search = await fetchJson(`${API_ROOT}/search?${searchParams}`, { headers })
        // Fetching relatives for popular near-matches can explode into a very large graph. The
        // search hit already carries its label, so bound the graph request to title-plausible rows.
        const hits = (search.body?.results ?? [])
          .filter((hit) => similarity(testCase.title, hit?.label) >= 0.9)
          .slice(0, 3)
        const uris = hits.map((hit) => hit?.uri).filter(Boolean)
        let entities = {}

        if (uris.length) {
          const entityParams = new URLSearchParams({
            uris: uris.join('|'),
            attributes: 'labels|claims|descriptions',
            relatives: 'wdt:P179|wdt:P50',
          })
          const response = await fetchJson(`${API_ROOT}/entities/by-uris?${entityParams}`, {
            headers,
          })
          entities = response.body?.entities ?? {}
        }

        const best = selectInventaireCandidate(testCase, hits, entities)
        const matched = Boolean(best?.entity && best.ranking.acceptable)
        const partsBySeries = new Map()

        if (matched) {
          for (const seriesUri of values(best.entity, 'wdt:P179')) {
            const partParams = new URLSearchParams({ uri: seriesUri })
            const response = await fetchJson(`${API_ROOT}/entities/serie-parts?${partParams}`, {
              headers,
            })
            partsBySeries.set(seriesUri, response.body?.parts ?? [])
          }
        }

        results.push({
          caseId: testCase.id,
          latencyMs: Math.round(performance.now() - started),
          workMatch: {
            matched,
            confidence: matched ? 'high' : 'none',
            providerWorkId: matched ? best.entity.uri : null,
            matchedTitle: matched ? label(best.entity) : null,
            matchedAuthors: matched ? best.authors : [],
            ...(matched
              ? { sourceLineage: entityLineage('inventaire', best.entity.uri, 'inventaire') }
              : {}),
          },
          seriesClaims: matched
            ? inventaireRelationshipClaims(best.entity, entities, partsBySeries)
            : [],
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
        progress(`inventaire ${index + 1}/${cases.length}`)
      }
      if (index < cases.length - 1) await sleep(delayMs)
    }

    return results
  },
}
