import { configDefaults, defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

// Maps the "@/*" path alias (tsconfig.json) so tests can import app modules.
export default defineConfig({
  test: {
    // Claude Code worktrees under .claude/ are stale copies of this repo;
    // running their tests made `npm test` fail on code that isn't ours.
    exclude: [...configDefaults.exclude, '.claude/**'],
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('.', import.meta.url)),
    },
  },
})
