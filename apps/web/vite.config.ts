import { execSync } from 'node:child_process'
import { defineConfig, type Plugin } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// One id per deploy: Vercel's commit SHA in CI, the local git SHA otherwise. Baked into the bundle
// (VITE_BUILD_ID — the update watcher compares against it; VITE_RELEASE — Sentry release tagging)
// and emitted as /version.json so live clients can detect that a newer deploy replaced theirs.
function resolveBuildId(): string {
  const sha = process.env.VERCEL_GIT_COMMIT_SHA
  if (sha) return sha.slice(0, 12)
  try {
    return `local-${execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim()}`
  } catch {
    return `local-${Date.now().toString(36)}`
  }
}
const buildId = resolveBuildId()

const emitVersion: Plugin = {
  name: 'reverie:emit-version',
  apply: 'build',
  generateBundle() {
    this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ build: buildId }) })
  },
}

export default defineConfig({
  plugins: [react(), tailwindcss(), emitVersion],
  define: {
    'import.meta.env.VITE_BUILD_ID': JSON.stringify(buildId),
    'import.meta.env.VITE_RELEASE': JSON.stringify(buildId),
  },
  server: { port: 5173 },
  build: {
    rollupOptions: {
      output: {
        // Split big, stable vendors into their own cacheable chunks.
        manualChunks: {
          react: ['react', 'react-dom'],
          router: ['@tanstack/react-router'],
          query: ['@tanstack/react-query', '@tanstack/react-query-persist-client'],
          supabase: ['@supabase/supabase-js'],
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
  },
})
