import { createError } from 'nitro/h3'

export function corpusSweepWorkflowEnabled(): boolean {
  return process.env.CORPUS_SWEEP_WORKFLOW_ENABLED?.trim().toLowerCase() === 'true'
}

/** Keep an automatically deployed web build inert until its database and Edge Function contract
 * has been installed by the owner. The flag is server-only and cannot expose a service secret. */
export function requireCorpusSweepWorkflow(): void {
  if (!corpusSweepWorkflowEnabled()) {
    throw createError({
      statusCode: 503,
      statusMessage: 'Corpus sweep rollout is not enabled yet',
    })
  }
}
