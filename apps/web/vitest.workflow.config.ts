import { workflow } from '@workflow/vitest'
import { defineConfig } from 'vitest/config'

const [workflowTransform] = workflow()
if (!workflowTransform) throw new Error('Workflow Vitest transform was not created')

export default defineConfig({
  root: '../..',
  plugins: [workflowTransform],
  test: {
    environment: 'node',
    globalSetup: ['./apps/web/workflows/workflow-test-global-setup.ts'],
    include: ['apps/web/workflows/**/*.integration.test.ts'],
    setupFiles: ['./apps/web/workflows/workflow-test-setup.ts'],
    testTimeout: 30_000,
  },
})
