import js from '@eslint/js'
import globals from 'globals'
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/playwright-report/**',
      '**/test-results/**',
      '**/coverage/**',
      'prototype/**',
      'data/**',
      'backend/**',
      '.ds-sync/**',
      'ds-bundle/**',
      '.design-sync/**',
      'design/**',
      'docs/**',
      'supabase/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      globals: { ...globals.browser, ...globals.node },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  {
    // Node scripts (seed, tooling) run outside the browser.
    files: ['**/*.{js,mjs,cjs}'],
    languageOptions: {
      ecmaVersion: 2022,
      globals: { ...globals.node },
    },
  },
  {
    // The service worker runs in a worker scope (self/caches, no window).
    files: ['**/public/sw.js'],
    languageOptions: {
      globals: { ...globals.serviceworker },
    },
  },
  {
    // TanStack Router (code-based) route modules legitimately export route objects
    // alongside their screen component; Fast Refresh isn't a concern for them.
    files: ['**/routes/**/*.tsx', '**/*Route.tsx', '**/router.tsx', '**/AuthProvider.tsx'],
    rules: {
      'react-refresh/only-export-components': 'off',
    },
  },
)
