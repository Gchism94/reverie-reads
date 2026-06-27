import { afterEach, describe, expect, it, vi } from 'vitest'
import { captureError, captureMessage, consoleReporter, setErrorReporter, type ErrorReporter } from './observability'

afterEach(() => {
  setErrorReporter(consoleReporter) // reset to the default between tests
  vi.restoreAllMocks()
})

describe('observability wrapper', () => {
  it('routes captures to the registered reporter', () => {
    const calls: { kind: string; arg: unknown; ctx?: unknown }[] = []
    const fake: ErrorReporter = {
      captureError: (e, ctx) => calls.push({ kind: 'error', arg: e, ctx }),
      captureMessage: (m, ctx) => calls.push({ kind: 'message', arg: m, ctx }),
    }
    setErrorReporter(fake)
    const boom = new Error('boom')
    captureError(boom, { fn: 'x' })
    captureMessage('hi', { a: 1 })
    expect(calls).toEqual([
      { kind: 'error', arg: boom, ctx: { fn: 'x' } },
      { kind: 'message', arg: 'hi', ctx: { a: 1 } },
    ])
  })

  it('defaults to the console reporter', () => {
    const cons = (globalThis as unknown as { console: { error: (...a: unknown[]) => void } }).console
    const spy = vi.spyOn(cons, 'error').mockImplementation(() => {})
    captureError(new Error('default'))
    expect(spy).toHaveBeenCalledOnce()
  })

  it('never throws even if the reporter throws', () => {
    setErrorReporter({
      captureError: () => {
        throw new Error('reporter exploded')
      },
      captureMessage: () => {
        throw new Error('reporter exploded')
      },
    })
    expect(() => captureError(new Error('x'))).not.toThrow()
    expect(() => captureMessage('y')).not.toThrow()
  })
})
