import { performance } from 'node:perf_hooks'

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds))

export { sleep }

export async function fetchJson(url, options = {}, retries = 3) {
  let lastError
  for (let attempt = 0; attempt < retries; attempt += 1) {
    const started = performance.now()
    try {
      const response = await fetch(url, options)
      const latencyMs = Math.round(performance.now() - started)
      if (response.ok) return { body: await response.json(), latencyMs }
      const failureBody = await response.json().catch(() => null)
      const reason = failureBody?.error?.errors?.[0]?.reason ?? failureBody?.error?.status ?? null
      const responseError = new Error(
        `${response.status} ${response.statusText}${reason ? ` (${reason})` : ''}`,
      )
      if (response.status !== 429 && response.status < 500) {
        throw responseError
      }
      const retryAfter = Number(response.headers.get('retry-after'))
      await sleep(Number.isFinite(retryAfter) ? retryAfter * 1000 : 750 * 2 ** attempt)
      lastError = responseError
    } catch (error) {
      lastError = error
      if (attempt < retries - 1) await sleep(750 * 2 ** attempt)
    }
  }
  throw lastError
}
