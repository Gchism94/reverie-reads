import { sleep } from 'workflow'
import {
  claimCorpusSweepWork,
  deferCorpusSweepCoverRecovery,
  deferCorpusSweepWork,
  finishCorpusSweep,
  initializeCorpusSweep,
  processCorpusSweepWork,
  recoverCorpusSweepCovers,
} from '../server/corpusSweep'
import { CORPUS_SWEEP_COVER_BATCH_SIZE, CORPUS_SWEEP_MAX_WORKS } from '../src/lib/corpusSweepPolicy'

const COVER_INTERLEAVE_SIZE = CORPUS_SWEEP_COVER_BATCH_SIZE
const COVER_RECOVERY_BATCH_LIMIT = Math.ceil(CORPUS_SWEEP_MAX_WORKS / CORPUS_SWEEP_COVER_BATCH_SIZE)
const SYSTEMIC_FAILURE_PAUSE = '5m'

export interface CorpusSweepWorkflowSteps {
  initialize: (runId: string) => Promise<number>
  recoverCovers: (runId: string, batchNumber: number) => Promise<boolean>
  deferRecovery: (runId: string, batchNumber: number, message: string) => Promise<void>
  claimWork: (runId: string) => Promise<string | null>
  processWork: (runId: string, workId: string) => Promise<void>
  deferWork: (runId: string, workId: string, message: string) => Promise<void>
  finish: (runId: string, errorMessage?: string) => Promise<void>
  pause: (duration: typeof SYSTEMIC_FAILURE_PAUSE) => Promise<void>
}

/** Deterministic orchestration separated from its WDK entrypoint so stop/retry behavior can be
 * unit-tested without a Workflow backend. Every injected production operation is a durable step. */
export async function runCorpusSweepLoop(
  runId: string,
  steps: CorpusSweepWorkflowSteps,
): Promise<{ runId: string }> {
  try {
    await steps.initialize(runId)
    let coverRecoveryMore = true
    let coverRecoveryBatches = 0
    let sinceRecovery = COVER_INTERLEAVE_SIZE
    let consecutiveFailures = 0

    const recoverCovers = async (batchNumber: number): Promise<boolean> => {
      try {
        return await steps.recoverCovers(runId, batchNumber)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        await steps.deferRecovery(runId, batchNumber, message)
        // Cover recovery is independent. Stop that leg for this bounded run while metadata and
        // series classification continue from their own durable checkpoints.
        return false
      }
    }

    while (true) {
      if (
        coverRecoveryMore &&
        coverRecoveryBatches < COVER_RECOVERY_BATCH_LIMIT &&
        sinceRecovery >= COVER_INTERLEAVE_SIZE
      ) {
        coverRecoveryMore = await recoverCovers(coverRecoveryBatches + 1)
        coverRecoveryBatches++
        sinceRecovery = 0
      }

      const workId = await steps.claimWork(runId)
      if (!workId) {
        if (coverRecoveryMore && coverRecoveryBatches < COVER_RECOVERY_BATCH_LIMIT) {
          coverRecoveryMore = await recoverCovers(coverRecoveryBatches + 1)
          coverRecoveryBatches++
          continue
        }
        break
      }

      try {
        await steps.processWork(runId, workId)
        consecutiveFailures = 0
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        await steps.deferWork(runId, workId, message)
        consecutiveFailures++
        // The old browser loop stopped permanently here. A durable run instead suspends without
        // consuming compute, then continues from the next checkpoint.
        if (consecutiveFailures >= 5) {
          await steps.pause(SYSTEMIC_FAILURE_PAUSE)
          consecutiveFailures = 0
        }
      }
      sinceRecovery++
    }

    await steps.finish(runId)
    return { runId }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await steps.finish(runId, message)
    return { runId }
  }
}

/** Durable administrator sweep. The workflow receives only a run id; authorization and every
 * checkpoint live in Supabase so no user token or corpus payload enters Workflow history. */
export async function durableCorpusSweep(runId: string): Promise<{ runId: string }> {
  'use workflow'

  return runCorpusSweepLoop(runId, {
    initialize: initializeCorpusSweep,
    recoverCovers: recoverCorpusSweepCovers,
    deferRecovery: deferCorpusSweepCoverRecovery,
    claimWork: claimCorpusSweepWork,
    processWork: processCorpusSweepWork,
    deferWork: deferCorpusSweepWork,
    finish: finishCorpusSweep,
    pause: sleep,
  })
}
