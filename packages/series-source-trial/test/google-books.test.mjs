import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'
import { googleBooks } from '../src/providers/google-books.mjs'

const originalFetch = globalThis.fetch
const originalKey = process.env.GOOGLE_BOOKS_KEY
const originalApiKey = process.env.GOOGLE_BOOKS_API_KEY
const originalViteKey = process.env.VITE_GOOGLE_BOOKS_KEY
const originalReferrer = process.env.GOOGLE_BOOKS_REFERRER

afterEach(() => {
  globalThis.fetch = originalFetch
  for (const [name, value] of [
    ['GOOGLE_BOOKS_KEY', originalKey],
    ['GOOGLE_BOOKS_API_KEY', originalApiKey],
    ['VITE_GOOGLE_BOOKS_KEY', originalViteKey],
    ['GOOGLE_BOOKS_REFERRER', originalReferrer],
  ]) {
    if (value === undefined) delete process.env[name]
    else process.env[name] = value
  }
})

test('accepts the production Supabase key name and sends the configured origin', async () => {
  process.env.GOOGLE_BOOKS_KEY = 'production-key-name'
  delete process.env.GOOGLE_BOOKS_API_KEY
  delete process.env.VITE_GOOGLE_BOOKS_KEY
  process.env.GOOGLE_BOOKS_REFERRER = 'https://reveriereads.app/'

  let requestedUrl = ''
  let requestedHeaders
  globalThis.fetch = async (url, options) => {
    requestedUrl = String(url)
    requestedHeaders = options?.headers
    return new Response(
      JSON.stringify({
        items: [
          {
            id: 'google-work-1',
            volumeInfo: {
              title: 'The Way of Kings',
              authors: ['Brandon Sanderson'],
              publishedDate: '2010-08-31',
            },
          },
        ],
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    )
  }

  const [result] = await googleBooks.run([
    {
      id: 'way-of-kings',
      title: 'The Way of Kings',
      authors: ['Brandon Sanderson'],
    },
  ])

  assert.equal(new URL(requestedUrl).searchParams.get('key'), 'production-key-name')
  assert.deepEqual(requestedHeaders, {
    Referer: 'https://reveriereads.app/',
    Origin: 'https://reveriereads.app/',
  })
  assert.equal(result.workMatch.matched, true)
  assert.equal(result.workMatch.providerWorkId, 'google-work-1')
  assert.deepEqual(result.seriesClaims, [])
})
