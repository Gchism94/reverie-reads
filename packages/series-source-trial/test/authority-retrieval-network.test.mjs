import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { test } from 'node:test'
import {
  isPublicAddress,
  parseRetrievalUrl,
  requestPinned,
  resolvePublicEndpoint,
  RetrievalError,
  safeRequest,
} from '../src/authority/retrieval/network.mjs'

const profile = {
  canonicalOrigin: 'https://author.example',
  canonicalAliases: ['https://www.author.example'],
}
const publicResolver = async (_hostname, recordType) =>
  recordType === 'A' ? ['93.184.216.34'] : []
const response = (status = 200, headers = {}, body = '') => ({
  status,
  headers,
  body: Buffer.from(body),
  encodedBytes: Buffer.byteLength(body),
})
const fakeRequestFactory = (handleEnd) => (_url, _options, onResponse) => {
  const request = new EventEmitter()
  request.destroy = (error) => queueMicrotask(() => request.emit('error', error))
  request.end = () => handleEnd({ request, onResponse })
  return request
}

test('classifies public and special-use IPv4 and IPv6 addresses', () => {
  for (const address of [
    '0.0.0.0',
    '10.0.0.1',
    '100.64.0.1',
    '127.0.0.1',
    '169.254.169.254',
    '172.16.0.1',
    '192.168.1.1',
    '198.18.0.1',
    '224.0.0.1',
    '::',
    '::1',
    '::ffff:127.0.0.1',
    'fc00::1',
    'fe80::1',
    'ff02::1',
    '2001:db8::1',
    '2002:7f00:1::1',
  ]) {
    assert.equal(isPublicAddress(address), false, address)
  }
  for (const address of [
    '1.1.1.1',
    '8.8.8.8',
    '2606:4700:4700::1111',
    '2a00:1450:4009:81d::200e',
  ]) {
    assert.equal(isPublicAddress(address), true, address)
  }
})

test('normalizes only credential-free default-port HTTPS hostnames', () => {
  assert.equal(
    parseRetrievalUrl('https://Author.Example:443/books#details').href,
    'https://author.example/books',
  )
  for (const raw of [
    'http://author.example/books',
    'https://user:secret@author.example/books',
    'https://author.example:8443/books',
    'https://localhost/books',
    'https://metadata.google.internal/latest',
    'https://127.0.0.1/books',
    'https://2130706433/books',
    'https://0x7f000001/books',
    'https://017700000001/books',
    'https://[::1]/books',
  ]) {
    assert.throws(() => parseRetrievalUrl(raw), RetrievalError, raw)
  }
})

test('rejects a hostname when any A or AAAA answer is not public', async () => {
  const resolver = async (_hostname, recordType) =>
    recordType === 'A' ? ['93.184.216.34', '10.0.0.8'] : ['2606:4700::1111']
  await assert.rejects(
    resolvePublicEndpoint(new URL('https://author.example'), resolver),
    (error) => error.reason === 'unsafe_dns',
  )
})

test('bounds DNS resolution before any request can start', async () => {
  let requested = false
  await assert.rejects(
    safeRequest(
      'https://author.example/books',
      profile,
      { dnsTimeoutMs: 5 },
      {
        resolveDns: async () => new Promise(() => {}),
        requestImpl: async () => {
          requested = true
          return response()
        },
      },
    ),
    (error) => error.reason === 'unsafe_dns',
  )
  assert.equal(requested, false)
})

test('enforces the response-header deadline', async () => {
  await assert.rejects(
    requestPinned(
      new URL('https://author.example/books'),
      { address: '93.184.216.34', family: 4 },
      { headerTimeoutMs: 5, totalTimeoutMs: 50 },
      fakeRequestFactory(() => {}),
    ),
    (error) => error.reason === 'timeout',
  )
})

test('enforces the total body deadline after headers arrive', async () => {
  await assert.rejects(
    requestPinned(
      new URL('https://author.example/books'),
      { address: '93.184.216.34', family: 4 },
      { headerTimeoutMs: 50, totalTimeoutMs: 5 },
      fakeRequestFactory(({ onResponse }) => {
        const pendingResponse = new EventEmitter()
        pendingResponse.statusCode = 200
        pendingResponse.headers = {}
        pendingResponse.destroy = () => {}
        onResponse(pendingResponse)
      }),
    ),
    (error) => error.reason === 'timeout',
  )
})

test('enforces the streamed body ceiling when content length is absent', async () => {
  await assert.rejects(
    requestPinned(
      new URL('https://author.example/books'),
      { address: '93.184.216.34', family: 4 },
      { maxBytes: 4, headerTimeoutMs: 50, totalTimeoutMs: 50 },
      fakeRequestFactory(({ onResponse }) => {
        const streamedResponse = new EventEmitter()
        streamedResponse.statusCode = 200
        streamedResponse.headers = {}
        streamedResponse.destroy = () => {}
        onResponse(streamedResponse)
        queueMicrotask(() => {
          streamedResponse.emit('data', Buffer.from('abc'))
          streamedResponse.emit('data', Buffer.from('def'))
          streamedResponse.emit('end')
        })
      }),
    ),
    (error) => error.reason === 'too_large',
  )
})

test('pins the validated endpoint supplied to the request implementation', async () => {
  const calls = []
  const result = await safeRequest(
    'https://author.example/books',
    profile,
    {},
    {
      resolveDns: publicResolver,
      requestImpl: async (url, endpoint, options) => {
        calls.push({ url: url.href, endpoint, options })
        return response(200, { 'content-type': 'text/html' }, 'safe')
      },
    },
  )

  assert.equal(result.finalUrl, 'https://author.example/books')
  assert.deepEqual(result.connections, [
    {
      url: 'https://author.example/books',
      address: '93.184.216.34',
      family: 4,
    },
  ])
  assert.equal(calls[0].endpoint.address, '93.184.216.34')
})

test('revalidates an allowed canonical redirect before its request', async () => {
  const requested = []
  const result = await safeRequest(
    'https://www.author.example/start',
    profile,
    {},
    {
      resolveDns: publicResolver,
      requestImpl: async (url) => {
        requested.push(url.href)
        if (requested.length === 1) {
          return response(302, { location: 'https://author.example/final' })
        }
        return response(200, {}, 'done')
      },
    },
  )

  assert.equal(result.finalUrl, 'https://author.example/final')
  assert.deepEqual(requested, ['https://www.author.example/start', 'https://author.example/final'])
})

test('blocks public redirects to private or unprofiled targets before a second request', async () => {
  for (const destination of [
    'https://169.254.169.254/latest',
    'https://unreviewed.example/books',
  ]) {
    let requests = 0
    await assert.rejects(
      safeRequest(
        'https://author.example/start',
        profile,
        {},
        {
          resolveDns: publicResolver,
          requestImpl: async () => {
            requests += 1
            return response(302, { location: destination })
          },
        },
      ),
      (error) => ['unsafe_url', 'redirect_outside_profile'].includes(error.reason),
    )
    assert.equal(requests, 1, destination)
  }
})

test('fails closed at the redirect and response-size ceilings', async () => {
  let redirects = 0
  await assert.rejects(
    safeRequest(
      'https://author.example/start',
      profile,
      { maxRedirects: 1 },
      {
        resolveDns: publicResolver,
        requestImpl: async () => {
          redirects += 1
          return response(302, { location: '/again' })
        },
      },
    ),
    (error) => error.reason === 'redirect_limit',
  )
  assert.equal(redirects, 2)

  await assert.rejects(
    safeRequest(
      'https://author.example/start',
      profile,
      { maxBytes: 3 },
      {
        resolveDns: publicResolver,
        requestImpl: async () => response(200, {}, 'four'),
      },
    ),
    (error) => error.reason === 'too_large',
  )
})

test('holds the per-origin lease until an active request completes', async () => {
  let releaseFirst
  let active = 0
  let maximumActive = 0
  const beforeRequest = (() => {
    let tail = Promise.resolve()
    return async () => {
      const previous = tail
      let release
      tail = new Promise((resolve) => {
        release = resolve
      })
      await previous
      return release
    }
  })()
  const requestImpl = async () => {
    active += 1
    maximumActive = Math.max(maximumActive, active)
    if (!releaseFirst) await new Promise((resolve) => (releaseFirst = resolve))
    active -= 1
    return response()
  }
  const first = safeRequest(
    'https://author.example/one',
    profile,
    {},
    {
      resolveDns: publicResolver,
      requestImpl,
      beforeRequest,
    },
  )
  const second = safeRequest(
    'https://author.example/two',
    profile,
    {},
    {
      resolveDns: publicResolver,
      requestImpl,
      beforeRequest,
    },
  )
  await new Promise((resolve) => setImmediate(resolve))
  releaseFirst()
  await Promise.all([first, second])
  assert.equal(maximumActive, 1)
})
