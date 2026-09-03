import { afterAll } from 'vitest'
import { setupWorkflowTests, teardownWorkflowTests } from '@workflow/vitest'
import { workflowTestOptions } from './workflow-test-options'

await setupWorkflowTests(workflowTestOptions)

afterAll(async () => {
  await teardownWorkflowTests()
})
