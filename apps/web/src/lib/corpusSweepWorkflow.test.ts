import { beforeEach, describe, expect, it, vi } from 'vitest'
import { runCorpusSweepLoop } from '../../workflows/corpus-sweep'

const steps = {
  initialize: vi.fn(),
  recoverCovers: vi.fn(),
  deferRecovery: vi.fn(),
  claimWork: vi.fn(),
  processWork: vi.fn(),
  deferWork: vi.fn(),
  finish: vi.fn(),
  pause: vi.fn(),
}

describe('durable corpus sweep orchestration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    steps.initialize.mockResolvedValue(0)
    steps.recoverCovers.mockResolvedValue(false)
    steps.deferWork.mockResolvedValue(undefined)
    steps.deferRecovery.mockResolvedValue(undefined)
    steps.finish.mockResolvedValue(undefined)
    steps.pause.mockResolvedValue(undefined)
  })

  it('checkpoints failures and pauses instead of stopping after the fifth failure', async () => {
    steps.claimWork
      .mockResolvedValueOnce('work-1')
      .mockResolvedValueOnce('work-2')
      .mockResolvedValueOnce('work-3')
      .mockResolvedValueOnce('work-4')
      .mockResolvedValueOnce('work-5')
      .mockResolvedValueOnce('work-6')
      .mockResolvedValueOnce(null)
    for (let index = 1; index <= 5; index++) {
      steps.processWork.mockRejectedValueOnce(new Error(`provider ${index}`))
    }
    steps.processWork.mockResolvedValueOnce(undefined)

    await expect(runCorpusSweepLoop('run-1', steps)).resolves.toEqual({ runId: 'run-1' })

    expect(steps.deferWork).toHaveBeenCalledTimes(5)
    expect(steps.deferWork).toHaveBeenNthCalledWith(5, 'run-1', 'work-5', 'provider 5')
    expect(steps.pause).toHaveBeenCalledOnce()
    expect(steps.pause).toHaveBeenCalledWith('5m')
    expect(steps.processWork).toHaveBeenLastCalledWith('run-1', 'work-6')
    expect(steps.finish).toHaveBeenLastCalledWith('run-1')
  })

  it('continues cover recovery after classification has no remaining work', async () => {
    steps.recoverCovers.mockResolvedValueOnce(true).mockResolvedValueOnce(false)
    steps.claimWork.mockResolvedValueOnce(null).mockResolvedValueOnce(null)

    await runCorpusSweepLoop('run-2', steps)

    expect(steps.recoverCovers).toHaveBeenCalledTimes(2)
    expect(steps.finish).toHaveBeenCalledWith('run-2')
  })

  it('reports a cover recovery failure and still advances classification', async () => {
    steps.recoverCovers.mockRejectedValueOnce(new Error('cover recovery unavailable'))
    steps.claimWork.mockResolvedValueOnce('work-after-cover-failure').mockResolvedValueOnce(null)
    steps.processWork.mockResolvedValueOnce(undefined)

    await runCorpusSweepLoop('run-independent-cover', steps)

    expect(steps.deferRecovery).toHaveBeenCalledWith(
      'run-independent-cover',
      1,
      'cover recovery unavailable',
    )
    expect(steps.processWork).toHaveBeenCalledWith(
      'run-independent-cover',
      'work-after-cover-failure',
    )
    expect(steps.finish).toHaveBeenCalledWith('run-independent-cover')
  })

  it('stops cover recovery at the bounded eighty five-item batches', async () => {
    steps.recoverCovers.mockResolvedValue(true)
    steps.claimWork.mockResolvedValue(null)

    await runCorpusSweepLoop('run-bounded-recovery', steps)

    expect(steps.recoverCovers).toHaveBeenCalledTimes(80)
    expect(steps.finish).toHaveBeenCalledWith('run-bounded-recovery')
  })

  it('records an orchestration failure as a terminal run failure', async () => {
    steps.initialize.mockRejectedValueOnce(new Error('database unavailable'))

    await expect(runCorpusSweepLoop('run-3', steps)).resolves.toEqual({ runId: 'run-3' })

    expect(steps.finish).toHaveBeenCalledWith('run-3', 'database unavailable')
  })
})
