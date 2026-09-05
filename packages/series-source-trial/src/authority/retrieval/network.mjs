import { createHash } from 'node:crypto'
import { resolve4, resolve6 } from 'node:dns/promises'
import { request as httpsRequest } from 'node:https'
import { isIP } from 'node:net'

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308])
const NON_PUBLIC_HOST_SUFFIXES = ['.localhost', '.local', '.internal', '.home.arpa']

const ipv4Number = (input) => {
  const parts = input.split('.')
  if (parts.length !== 4) return null
  let value = 0
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null
    const octet = Number(part)
    if (octet > 255) return null
    value = value * 256 + octet
  }
  return value >>> 0
}

const inV4Cidr = (value, base, bits) => {
  if (bits === 0) return true
  const mask = (0xffffffff << (32 - bits)) >>> 0
  return (value & mask) === (base & mask)
}

const NON_PUBLIC_V4 = [
  [0x00000000, 8],
  [0x0a000000, 8],
  [0x64400000, 10],
  [0x7f000000, 8],
  [0xa9fe0000, 16],
  [0xac100000, 12],
  [0xc0000000, 24],
  [0xc0000200, 24],
  [0xc0586300, 24],
  [0xc0a80000, 16],
  [0xc6120000, 15],
  [0xc6336400, 24],
  [0xcb007100, 24],
  [0xe0000000, 4],
  [0xf0000000, 4],
]

const parseIpv6 = (input) => {
  const raw = input.replace(/^\[/, '').replace(/\]$/, '').split('%', 1)[0].toLowerCase()
  if (!raw.includes(':')) return null
  const halves = raw.split('::')
  if (halves.length > 2) return null

  const parseHalf = (half) => {
    if (!half) return []
    const values = []
    for (const piece of half.split(':')) {
      if (piece.includes('.')) {
        const v4 = ipv4Number(piece)
        if (v4 == null) return null
        values.push((v4 >>> 16) & 0xffff, v4 & 0xffff)
      } else {
        if (!/^[0-9a-f]{1,4}$/.test(piece)) return null
        values.push(Number.parseInt(piece, 16))
      }
    }
    return values
  }

  const left = parseHalf(halves[0])
  const right = parseHalf(halves[1] ?? '')
  if (!left || !right) return null
  const missing = 8 - left.length - right.length
  if ((halves.length === 1 && missing !== 0) || (halves.length === 2 && missing < 1)) return null
  const groups = [...left, ...Array(missing).fill(0), ...right]
  if (groups.length !== 8) return null
  return groups.reduce((value, group) => (value << 16n) | BigInt(group), 0n)
}

const inV6Cidr = (value, base, bits) =>
  bits === 0 || value >> BigInt(128 - bits) === base >> BigInt(128 - bits)

const V6_GLOBAL_BASE = 0x20000000000000000000000000000000n
const NON_PUBLIC_V6 = [
  [0x20010000000000000000000000000000n, 23],
  [0x20010db8000000000000000000000000n, 32],
  [0x20020000000000000000000000000000n, 16],
  [0x3fff0000000000000000000000000000n, 20],
]

export class RetrievalError extends Error {
  constructor(reason, cause = null) {
    super(reason, cause ? { cause } : undefined)
    this.name = 'RetrievalError'
    this.reason = reason
  }
}

export function isPublicAddress(input) {
  const v4 = ipv4Number(input)
  if (v4 != null) return !NON_PUBLIC_V4.some(([base, bits]) => inV4Cidr(v4, base, bits))

  const v6 = parseIpv6(input)
  if (v6 == null) return false
  const mappedPrefix = 0x00000000000000000000ffff00000000n
  if (inV6Cidr(v6, mappedPrefix, 96)) {
    const embedded = [24n, 16n, 8n, 0n].map((shift) => Number((v6 >> shift) & 0xffn)).join('.')
    return isPublicAddress(embedded)
  }
  if (!inV6Cidr(v6, V6_GLOBAL_BASE, 3)) return false
  return !NON_PUBLIC_V6.some(([base, bits]) => inV6Cidr(v6, base, bits))
}

export function parseRetrievalUrl(raw) {
  let url
  try {
    url = new URL(raw)
  } catch {
    throw new RetrievalError('unsafe_url')
  }
  if (url.protocol !== 'https:') throw new RetrievalError('unsafe_url')
  if (url.username || url.password) throw new RetrievalError('unsafe_url')
  if (url.port && url.port !== '443') throw new RetrievalError('unsafe_url')
  url.hash = ''
  const hostname = url.hostname.replace(/^\[/, '').replace(/\]$/, '').toLowerCase()
  if (
    !hostname ||
    isIP(hostname) ||
    hostname === 'localhost' ||
    NON_PUBLIC_HOST_SUFFIXES.some((suffix) => hostname.endsWith(suffix))
  ) {
    throw new RetrievalError('unsafe_url')
  }
  return url
}

const missingDnsRecord = (error) => ['ENODATA', 'ENOTFOUND', 'ENOENT'].includes(error?.code)

export async function defaultResolveDns(hostname, recordType) {
  try {
    return recordType === 'A' ? await resolve4(hostname) : await resolve6(hostname)
  } catch (error) {
    if (missingDnsRecord(error)) return []
    throw error
  }
}

export async function resolvePublicEndpoint(
  url,
  resolveDns = defaultResolveDns,
  timeoutMs = 3_000,
) {
  let answers
  let timeout
  try {
    answers = await Promise.race([
      Promise.all([resolveDns(url.hostname, 'A'), resolveDns(url.hostname, 'AAAA')]),
      new Promise((_, reject) => {
        timeout = setTimeout(() => reject(new RetrievalError('unsafe_dns')), timeoutMs)
      }),
    ])
  } catch (error) {
    if (error instanceof RetrievalError) throw error
    throw new RetrievalError('unsafe_dns', error)
  } finally {
    clearTimeout(timeout)
  }
  const addresses = [...new Set(answers.flat())]
  if (!addresses.length || addresses.some((address) => !isPublicAddress(address))) {
    throw new RetrievalError('unsafe_dns')
  }
  const address = addresses[0]
  return { address, family: isIP(address), addresses }
}

const headersObject = (headers) =>
  Object.fromEntries(
    Object.entries(headers).map(([name, value]) => [
      name.toLowerCase(),
      Array.isArray(value) ? value.join(', ') : (value ?? '').toString(),
    ]),
  )

export function requestPinned(
  url,
  endpoint,
  { headers = {}, headerTimeoutMs = 5_000, totalTimeoutMs = 10_000, maxBytes = 512 * 1024 } = {},
  requestFactory = httpsRequest,
) {
  return new Promise((resolve, reject) => {
    let settled = false
    let headerTimer
    let totalTimer
    const finish = (callback, value) => {
      if (settled) return
      settled = true
      clearTimeout(headerTimer)
      clearTimeout(totalTimer)
      callback(value)
    }
    const fail = (reason, cause = null) => finish(reject, new RetrievalError(reason, cause))

    const request = requestFactory(
      url,
      {
        method: 'GET',
        agent: false,
        headers,
        servername: url.hostname,
        family: endpoint.family,
        autoSelectFamily: false,
        lookup: (_hostname, options, callback) => {
          if (options?.all) {
            callback(null, [{ address: endpoint.address, family: endpoint.family }])
          } else {
            callback(null, endpoint.address, endpoint.family)
          }
        },
      },
      (response) => {
        clearTimeout(headerTimer)
        const responseHeaders = headersObject(response.headers)
        const declaredLength = Number(responseHeaders['content-length'])
        if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
          response.destroy()
          fail('too_large')
          return
        }
        const chunks = []
        let encodedBytes = 0
        response.on('data', (chunk) => {
          encodedBytes += chunk.length
          if (encodedBytes > maxBytes) {
            response.destroy()
            fail('too_large')
            return
          }
          chunks.push(chunk)
        })
        response.on('aborted', () => fail('network_error'))
        response.on('error', (error) => fail('network_error', error))
        response.on('end', () => {
          finish(resolve, {
            status: response.statusCode ?? 0,
            headers: responseHeaders,
            body: Buffer.concat(chunks),
            encodedBytes,
          })
        })
      },
    )

    request.on('error', (error) => {
      if (error instanceof RetrievalError) finish(reject, error)
      else fail('network_error', error)
    })
    headerTimer = setTimeout(() => request.destroy(new RetrievalError('timeout')), headerTimeoutMs)
    totalTimer = setTimeout(() => request.destroy(new RetrievalError('timeout')), totalTimeoutMs)
    request.end()
  })
}

const allowedOrigins = (profile) =>
  new Set([profile.canonicalOrigin, ...(profile.canonicalAliases ?? [])])

export async function safeRequest(
  raw,
  profile,
  options = {},
  {
    resolveDns = defaultResolveDns,
    requestImpl = requestPinned,
    beforeRequest = async () => {},
  } = {},
) {
  const origins = allowedOrigins(profile)
  const maxRedirects = options.maxRedirects ?? 2
  let current = parseRetrievalUrl(raw)
  const redirectChain = []
  const connections = []

  for (let redirectCount = 0; ; redirectCount += 1) {
    if (!origins.has(current.origin)) throw new RetrievalError('redirect_outside_profile')
    const endpoint = await resolvePublicEndpoint(current, resolveDns, options.dnsTimeoutMs ?? 3_000)
    const release = await beforeRequest(current)
    let response
    try {
      response = await requestImpl(current, endpoint, options)
    } finally {
      release?.()
    }
    if (
      response.encodedBytes > (options.maxBytes ?? 512 * 1024) ||
      response.body?.length > (options.maxBytes ?? 512 * 1024)
    ) {
      throw new RetrievalError('too_large')
    }
    redirectChain.push(current.href)
    connections.push({ url: current.href, address: endpoint.address, family: endpoint.family })

    if (!REDIRECT_STATUSES.has(response.status)) {
      return { ...response, finalUrl: current.href, redirectChain, connections }
    }
    if (redirectCount >= maxRedirects) throw new RetrievalError('redirect_limit')
    const location = response.headers.location
    if (!location) throw new RetrievalError('redirect_limit')
    current = parseRetrievalUrl(new URL(location, current).href)
  }
}

export const sha256 = (value) => createHash('sha256').update(value).digest('hex')
