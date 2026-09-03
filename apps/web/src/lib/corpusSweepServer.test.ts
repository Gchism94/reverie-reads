import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ingestCorpusCoverForSweep } from '../../server/corpusSweep'

describe('durable corpus sweep cover isolation', () => {
  beforeEach(() => {
    vi.stubEnv('SUPABASE_URL', 'https://example.supabase.co')
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-service-role')
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it('defers an Edge worker resource limit instead of failing the classification item', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response('{"code":"WORKER_RESOURCE_LIMIT"}', {
          status: 546,
          headers: { 'content-type': 'application/json' },
        }),
      ),
    )

    await expect(
      ingestCorpusCoverForSweep({
        runId: 'run-1',
        workId: 'work-1',
        source: 'url',
        url: 'https://covers.example/oversized.jpg',
      }),
    ).resolves.toBeNull()
  })

  it('still returns a successfully ingested corpus cover', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          '{"cover":"https://example.supabase.co/storage/v1/object/public/covers/w/work-1.webp"}',
          {
            status: 200,
            headers: { 'content-type': 'application/json' },
          },
        ),
      ),
    )

    await expect(
      ingestCorpusCoverForSweep({
        runId: 'run-1',
        workId: 'work-1',
        source: 'url',
        url: 'https://covers.example/ordinary.jpg',
      }),
    ).resolves.toMatchObject({ cover: expect.stringContaining('/covers/w/work-1.webp') })
  })
})
