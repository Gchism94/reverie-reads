import { createError, defineEventHandler } from 'nitro/h3'
import { start } from 'workflow/api'
import { authenticatedCorpusAdmin } from '../server/corpusSweepAuth'
import { serviceClient } from '../server/corpusSweep'
import { requireCorpusSweepWorkflow } from '../server/corpusSweepConfig'
import { durableCorpusSweep } from '../workflows/corpus-sweep'

export default defineEventHandler(async ({ req }) => {
  requireCorpusSweepWorkflow()
  // Validate server configuration before creating the one-active-run row. A missing service secret
  // must not strand a queued run that no workflow can claim.
  const service = serviceClient()
  const userClient = await authenticatedCorpusAdmin(req)
  const { data: runId, error: startError } = await userClient.rpc('start_corpus_sweep')
  if (startError || typeof runId !== 'string') {
    throw createError({ statusCode: 500, statusMessage: 'Could not create corpus sweep' })
  }

  const { data: launchClaimed, error: claimError } = await service.rpc(
    'service_claim_corpus_sweep_launch',
    { p_run: runId },
  )
  if (claimError) {
    await service.rpc('service_finish_corpus_sweep', {
      p_run: runId,
      p_error: claimError.message,
    })
    throw createError({ statusCode: 500, statusMessage: 'Could not claim corpus sweep launch' })
  }

  // A concurrent tab may have created the same active run. Only the launch claimant starts WDK;
  // everyone else receives the durable Postgres run and reconnects to its status.
  if (launchClaimed !== true) return { runId, reused: true }

  let workflowRun: Awaited<ReturnType<typeof start>>
  try {
    workflowRun = await start(durableCorpusSweep, [runId])
  } catch (error) {
    await service.rpc('service_finish_corpus_sweep', {
      p_run: runId,
      p_error: error instanceof Error ? error.message : String(error),
    })
    throw createError({ statusCode: 503, statusMessage: 'Could not launch corpus sweep' })
  }

  const { error: bindError } = await service.rpc('service_bind_corpus_sweep_workflow', {
    p_run: runId,
    p_workflow_run_id: workflowRun.runId,
  })
  if (bindError) {
    // The durable workflow has already launched and must remain authoritative. Marking the run
    // failed here would race its first step and recreate an early stop. Binding is operational
    // metadata only; the run id still reconnects progress from Postgres.
    console.error('Could not bind corpus sweep workflow id', bindError)
  }
  return {
    runId,
    workflowRunId: workflowRun.runId,
    reused: false,
    workflowIdBound: !bindError,
  }
})
