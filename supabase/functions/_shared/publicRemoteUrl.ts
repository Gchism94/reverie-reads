// SSRF boundary for reader-supplied cover URLs. The caller supplies the runtime DNS resolver and
// fetch implementation so this module stays pure enough for the repository's Node/Vitest checks.
// The exact organization-owned origin allowlist is the authorization boundary: a reader cannot
// supply a DNS zone they control. Every allowed hop is also resolved and classified before a
// request is sent; redirects are manual so a trusted provider cannot silently forward the Edge
// runtime into an untrusted or private network.

export type DnsRecordType = 'A' | 'AAAA'
export type ResolveDns = (hostname: string, recordType: DnsRecordType) => Promise<string[]>
export type RemoteFetcher = (input: string, init: RequestInit) => Promise<Response>

export class UnsafeRemoteUrlError extends Error {
  readonly reason: string

  constructor(reason: string) {
    super(reason)
    this.name = 'UnsafeRemoteUrlError'
    this.reason = reason
  }
}

const MAX_REDIRECTS = 5
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308])
const NON_PUBLIC_HOST_SUFFIXES = ['.localhost', '.local', '.internal', '.home.arpa']

const ipv4Number = (input: string): number | null => {
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

const inV4Cidr = (value: number, base: number, bits: number): boolean => {
  if (bits === 0) return true
  const mask = (0xffffffff << (32 - bits)) >>> 0
  return (value & mask) === (base & mask)
}

const NON_PUBLIC_V4: ReadonlyArray<readonly [number, number]> = [
  [0x00000000, 8], // current network / unspecified
  [0x0a000000, 8], // private
  [0x64400000, 10], // carrier-grade NAT
  [0x7f000000, 8], // loopback
  [0xa9fe0000, 16], // link-local, including cloud metadata
  [0xac100000, 12], // private
  [0xc0000000, 24], // IETF protocol assignments
  [0xc0000200, 24], // documentation
  [0xc0586300, 24], // deprecated relay anycast
  [0xc0a80000, 16], // private
  [0xc6120000, 15], // benchmark
  [0xc6336400, 24], // documentation
  [0xcb007100, 24], // documentation
  [0xe0000000, 4], // multicast
  [0xf0000000, 4], // reserved / limited broadcast
]

const parseIpv6 = (input: string): bigint | null => {
  const raw = input.replace(/^\[/, '').replace(/\]$/, '').split('%', 1)[0]!.toLowerCase()
  if (!raw.includes(':')) return null

  const halves = raw.split('::')
  if (halves.length > 2) return null
  const parseHalf = (half: string): number[] | null => {
    if (!half) return []
    const pieces = half.split(':')
    const out: number[] = []
    for (const piece of pieces) {
      if (piece.includes('.')) {
        const v4 = ipv4Number(piece)
        if (v4 == null) return null
        out.push((v4 >>> 16) & 0xffff, v4 & 0xffff)
      } else {
        if (!/^[0-9a-f]{1,4}$/.test(piece)) return null
        out.push(Number.parseInt(piece, 16))
      }
    }
    return out
  }

  const left = parseHalf(halves[0]!)
  const right = parseHalf(halves[1] ?? '')
  if (!left || !right) return null
  const missing = 8 - left.length - right.length
  if ((halves.length === 1 && missing !== 0) || (halves.length === 2 && missing < 1)) return null
  const groups = [...left, ...Array(Math.max(0, missing)).fill(0), ...right]
  if (groups.length !== 8) return null
  return groups.reduce((value, group) => (value << 16n) | BigInt(group), 0n)
}

const inV6Cidr = (value: bigint, base: bigint, bits: number): boolean =>
  bits === 0 || value >> BigInt(128 - bits) === base >> BigInt(128 - bits)

const V6_GLOBAL_BASE = 0x20000000000000000000000000000000n
const NON_PUBLIC_V6: ReadonlyArray<readonly [bigint, number]> = [
  [0x20010000000000000000000000000000n, 23], // IETF special-use block
  [0x20010db8000000000000000000000000n, 32], // documentation
  [0x20020000000000000000000000000000n, 16], // 6to4 can tunnel private IPv4
  [0x3fff0000000000000000000000000000n, 20], // documentation
]

/** True only for globally routable unicast addresses currently usable by public cover hosts. */
export function isPublicIpAddress(input: string): boolean {
  const v4 = ipv4Number(input)
  if (v4 != null) return !NON_PUBLIC_V4.some(([base, bits]) => inV4Cidr(v4, base, bits))

  const v6 = parseIpv6(input)
  if (v6 == null) return false

  // IPv4-mapped IPv6 must inherit the embedded IPv4 classification.
  const mappedPrefix = 0x00000000000000000000ffff00000000n
  if (inV6Cidr(v6, mappedPrefix, 96)) {
    return isPublicIpAddress(
      [24n, 16n, 8n, 0n].map((shift) => Number((v6 >> shift) & 0xffn)).join('.'),
    )
  }

  // Today global unicast is 2000::/3. Fail closed on special-use ranges inside it and on every
  // non-global class (loopback, link-local, unique-local, multicast, unspecified, NAT64, etc.).
  if (!inV6Cidr(v6, V6_GLOBAL_BASE, 3)) return false
  return !NON_PUBLIC_V6.some(([base, bits]) => inV6Cidr(v6, base, bits))
}

export function parsePublicRemoteUrl(raw: string): URL {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    throw new UnsafeRemoteUrlError('invalid_url')
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new UnsafeRemoteUrlError('unsupported_protocol')
  }
  if (url.username || url.password) throw new UnsafeRemoteUrlError('credentials_not_allowed')
  const port = url.port ? Number(url.port) : url.protocol === 'https:' ? 443 : 80
  if ((url.protocol === 'https:' && port !== 443) || (url.protocol === 'http:' && port !== 80)) {
    throw new UnsafeRemoteUrlError('port_not_allowed')
  }
  const hostname = url.hostname.replace(/^\[/, '').replace(/\]$/, '').toLowerCase()
  if (
    hostname === 'localhost' ||
    NON_PUBLIC_HOST_SUFFIXES.some((suffix) => hostname.endsWith(suffix))
  ) {
    throw new UnsafeRemoteUrlError('private_hostname')
  }
  return url
}

/**
 * Exact origins the product deliberately trusts to supply durable cover bytes. Arbitrary pasted
 * URLs remain usable as display-time hotlinks, but never become server-side network requests. The
 * Internet Archive entries are Open Library's observed redirect chain and remain inside an
 * organization-owned DNS suffix. The project's own public cover bucket is accepted only at its
 * configured origin and path.
 */
export function isTrustedCoverSourceUrl(url: URL, projectBaseUrl?: string | null): boolean {
  const hostname = url.hostname.toLowerCase()
  if (url.protocol === 'https:') {
    if (hostname === 'covers.openlibrary.org' && url.pathname.startsWith('/b/')) return true
    if (hostname === 'assets.hardcover.app') return true
    if (hostname === 'archive.org' && url.pathname.startsWith('/download/')) return true
    if (hostname.endsWith('.us.archive.org') && url.pathname === '/view_archive.php') return true
  }

  if (!projectBaseUrl || !url.pathname.startsWith('/storage/v1/object/public/covers/')) return false
  try {
    const project = new URL(projectBaseUrl)
    return url.origin === project.origin
  } catch {
    return false
  }
}

async function assertPublicResolution(url: URL, resolveDns: ResolveDns): Promise<void> {
  const hostname = url.hostname.replace(/^\[/, '').replace(/\]$/, '')
  const literalV4 = ipv4Number(hostname)
  const literalV6 = parseIpv6(hostname)
  if (literalV4 != null || literalV6 != null) {
    if (!isPublicIpAddress(hostname)) throw new UnsafeRemoteUrlError('non_public_address')
    return
  }

  const answers = await Promise.all([resolveDns(hostname, 'A'), resolveDns(hostname, 'AAAA')])
  const addresses = answers.flat()
  if (!addresses.length) throw new UnsafeRemoteUrlError('dns_resolution_failed')
  if (addresses.some((address) => !isPublicIpAddress(address))) {
    throw new UnsafeRemoteUrlError('non_public_address')
  }
}

export interface PublicRemoteFetchResult {
  response: Response
  finalUrl: string
}

/** Fetch a public cover while validating the initial destination and each redirect before connect. */
export async function fetchPublicRemote(
  raw: string,
  init: RequestInit,
  dependencies: {
    resolveDns: ResolveDns
    fetcher: RemoteFetcher
    isAllowedUrl: (url: URL) => boolean
    maxRedirects?: number
  },
): Promise<PublicRemoteFetchResult> {
  const maxRedirects = dependencies.maxRedirects ?? MAX_REDIRECTS
  let current = parsePublicRemoteUrl(raw)

  for (let redirectCount = 0; ; redirectCount++) {
    if (!dependencies.isAllowedUrl(current)) {
      throw new UnsafeRemoteUrlError('host_not_allowed')
    }
    await assertPublicResolution(current, dependencies.resolveDns)
    const response = await dependencies.fetcher(current.href, { ...init, redirect: 'manual' })
    if (!REDIRECT_STATUSES.has(response.status)) {
      return { response, finalUrl: current.href }
    }
    if (redirectCount >= maxRedirects) {
      await response.body?.cancel().catch(() => {})
      throw new UnsafeRemoteUrlError('too_many_redirects')
    }
    const location = response.headers.get('location')
    await response.body?.cancel().catch(() => {})
    if (!location) throw new UnsafeRemoteUrlError('redirect_without_location')
    current = parsePublicRemoteUrl(new URL(location, current).href)
  }
}
