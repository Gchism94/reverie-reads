import { describe, expect, it } from 'vitest'
import { corpusSweepStatusText, type CorpusSweepRun } from './corpusSweepRuns'

const completedRun = (over: Partial<CorpusSweepRun> = {}): CorpusSweepRun => ({
  id: 'run-1',
  workflowRunId: 'workflow-1',
  status: 'completed',
  phase: 'complete',
  total: 400,
  scanned: 400,
  filled: 10,
  nothing: 390,
  failed: 0,
  recoveryScanned: 25,
  recoveryFailed: 0,
  recoveryFailedBatches: 0,
  recoveredCovers: 1,
  recoveredOptions: 0,
  errorMessage: null,
  cancelRequestedAt: null,
  createdAt: '2026-09-03T00:00:00Z',
  completedAt: '2026-09-03T01:00:00Z',
  ...over,
})

describe('durable corpus sweep status', () => {
  it('reports a clean bounded run as complete', () => {
    expect(corpusSweepStatusText(completedRun())).toContain('Corpus sweep complete')
  })

  it('reports unreached candidates as the per-run limit instead of completion', () => {
    const text = corpusSweepStatusText(completedRun({ total: 1_261 }))
    expect(text).toContain('paused at the per-run limit')
    expect(text).toContain('861 works not reached')
    expect(text).toContain('Run it again to continue')
  })
})
