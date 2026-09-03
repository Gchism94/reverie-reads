import { createError, defineEventHandler } from 'nitro/h3'
import { authenticatedCorpusAdmin } from '../../server/corpusSweepAuth'
import { corpusSweepWorkflowEnabled } from '../../server/corpusSweepConfig'

export default defineEventHandler(async ({ req }) => {
  // Before the owner installs the migration, avoid querying a table that intentionally does not
  // exist yet. The start route remains explicitly unavailable during that rollout window.
  if (!corpusSweepWorkflowEnabled()) return { run: null }
  const client = await authenticatedCorpusAdmin(req)
  const { data, error } = await client
    .from('corpus_sweep_runs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw createError({ statusCode: 500, statusMessage: 'Could not read corpus sweep' })
  return { run: data ?? null }
})
