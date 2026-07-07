import { describe, expect, it } from 'vitest'
import { parseAuthCallback } from './authCallback'

describe('parseAuthCallback', () => {
  it('detects a successful confirmation callback (tokens in hash)', () => {
    const cb = parseAuthCallback('#access_token=abc&refresh_token=def&type=signup&expires_in=3600')
    expect(cb.present).toBe(true)
    expect(cb.type).toBe('signup')
    expect(cb.error).toBeNull()
  })

  it('detects a recovery callback', () => {
    const cb = parseAuthCallback('#access_token=abc&type=recovery')
    expect(cb.present).toBe(true)
    expect(cb.type).toBe('recovery')
  })

  it('detects an expired-link error (GoTrue error redirect)', () => {
    const cb = parseAuthCallback(
      '#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired',
    )
    expect(cb.present).toBe(true)
    expect(cb.errorCode).toBe('otp_expired')
    expect(cb.error).toBe('Email link is invalid or has expired')
  })

  it('treats a plain page load as no callback', () => {
    for (const hash of ['', '#', '#section-anchor']) {
      expect(parseAuthCallback(hash).present).toBe(false)
    }
  })
})
