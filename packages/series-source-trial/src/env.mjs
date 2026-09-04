import { readFile } from 'node:fs/promises'

export async function loadLocalEnvironment(path) {
  let contents
  try {
    contents = await readFile(path, 'utf8')
  } catch (error) {
    if (error?.code === 'ENOENT') return
    throw error
  }
  for (const line of contents.split(/\r?\n/)) {
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/)
    if (!match || process.env[match[1]] !== undefined) continue
    const value = match[2].trim()
    process.env[match[1]] =
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
        ? value.slice(1, -1)
        : value
  }
}
