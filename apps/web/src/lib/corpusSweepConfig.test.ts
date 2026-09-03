import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  corpusSweepWorkflowEnabled,
  requireCorpusSweepWorkflow,
} from '../../server/corpusSweepConfig'

describe('corpus sweep rollout gate', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('is closed unless the server-only flag explicitly says true', () => {
    vi.stubEnv('CORPUS_SWEEP_WORKFLOW_ENABLED', '')
    expect(corpusSweepWorkflowEnabled()).toBe(false)
    expect(() => requireCorpusSweepWorkflow()).toThrow('Corpus sweep rollout is not enabled yet')
  })

  it('accepts a trimmed, case-insensitive true value', () => {
    vi.stubEnv('CORPUS_SWEEP_WORKFLOW_ENABLED', ' TRUE ')
    expect(corpusSweepWorkflowEnabled()).toBe(true)
    expect(() => requireCorpusSweepWorkflow()).not.toThrow()
  })
})
