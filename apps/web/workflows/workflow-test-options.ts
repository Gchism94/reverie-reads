import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const webRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')

export const workflowTestOptions = {
  cwd: resolve(webRoot, '../..'),
  rootDir: webRoot,
}
