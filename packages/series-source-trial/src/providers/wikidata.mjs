import { fetchJson, sleep } from '../http.mjs'
import { authorMatches, normalize } from '../normalize.mjs'

const escapeSparql = (value) => String(value).replaceAll('\\', '\\\\').replaceAll('"', '\\"')

const numeric = (value) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

export const wikidata = {
  name: 'wikidata',
  rights: {
    commercialUsePermitted: true,
    persistentStoragePermitted: true,
    claimLevelProvenance: true,
    note: 'Wikidata structured data is published under CC0.',
  },
  async run(cases, progress = () => {}) {
    const results = new Map(
      cases.map((testCase) => [
        testCase.id,
        {
          caseId: testCase.id,
          latencyMs: null,
          workMatch: { matched: false, confidence: 'none' },
          seriesClaims: [],
        },
      ]),
    )

    const batchSize = 15
    for (let start = 0; start < cases.length; start += batchSize) {
      const batch = cases.slice(start, start + batchSize)
      const values = batch.map((entry) => `"${escapeSparql(entry.title)}"@en`).join(' ')
      const query = `
        SELECT ?book ?bookLabel ?authorLabel ?series ?seriesLabel ?ordinal WHERE {
          VALUES ?bookLabel { ${values} }
          ?book rdfs:label ?bookLabel.
          OPTIONAL { ?book wdt:P50 ?author. }
          OPTIONAL {
            ?book p:P179 ?membership.
            ?membership ps:P179 ?series.
            OPTIONAL { ?membership pq:P1545 ?ordinal. }
          }
          SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
        }
      `
      const params = new URLSearchParams({ query, format: 'json' })

      try {
        const { body, latencyMs } = await fetchJson(`https://query.wikidata.org/sparql?${params}`, {
          headers: {
            Accept: 'application/sparql-results+json',
            'User-Agent': 'ReverieSeriesSourceTrial/1.0 (https://reveriereads.app)',
          },
        })
        const bindings = body.results?.bindings ?? []
        for (const testCase of batch) {
          const titleBindings = bindings.filter(
            (binding) => normalize(binding.bookLabel?.value) === normalize(testCase.title),
          )
          const identityBindings = titleBindings.filter((binding) =>
            authorMatches(testCase.authors, [binding.authorLabel?.value].filter(Boolean)),
          )
          const matched = identityBindings.length > 0
          const bookId = matched ? identityBindings[0]?.book?.value : null
          results.set(testCase.id, {
            caseId: testCase.id,
            latencyMs,
            workMatch: {
              matched,
              confidence: matched ? 'high' : 'none',
              providerWorkId: bookId,
              matchedTitle: matched ? identityBindings[0]?.bookLabel?.value : null,
              matchedAuthors: matched
                ? [
                    ...new Set(
                      identityBindings.map((entry) => entry.authorLabel?.value).filter(Boolean),
                    ),
                  ]
                : [],
              rejectedTitleCollisionCount: titleBindings.length - identityBindings.length,
            },
            seriesClaims: identityBindings
              .filter((binding) => binding.series?.value && binding.seriesLabel?.value)
              .map((binding) => ({
                evidenceKind: 'relational_membership',
                providerSeriesId: binding.series.value,
                series: binding.seriesLabel.value,
                position: numeric(binding.ordinal?.value),
                orderType: 'unspecified',
                role: 'unknown',
                sourceRef: bookId,
              })),
          })
        }
      } catch (error) {
        for (const testCase of batch) {
          results.set(testCase.id, {
            ...results.get(testCase.id),
            error: String(error),
          })
        }
      }

      progress(`wikidata ${Math.min(start + batchSize, cases.length)}/${cases.length}`)
      if (start + batchSize < cases.length) await sleep(1000)
    }

    return cases.map((testCase) => results.get(testCase.id))
  },
}
