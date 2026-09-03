import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { buildWorkflowTests } from '@workflow/vitest'
import { workflowTestOptions } from './workflow-test-options'

export async function setup(): Promise<void> {
  await buildWorkflowTests(workflowTestOptions)

  // @workflow/vitest 4.0.21 bundles the serde checker but leaves builtin-modules.json external,
  // dropping its import attribute along the way. Repair only the generated test artifact before
  // Node imports it; production Vite/Workflow output is not involved in this compatibility shim.
  const stepsBundle = join(workflowTestOptions.rootDir, '.workflow-vitest', 'steps.mjs')
  const source = await readFile(stepsBundle, 'utf8')
  const patched = source.replace(
    /(import builtinModules from [^;]*builtin-modules\.json")\s*;/,
    '$1 with { type: "json" };',
  )
  if (patched === source) throw new Error('Workflow test bundle JSON import was not found')
  await writeFile(stepsBundle, patched)
}
