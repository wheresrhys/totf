import { defineConfig } from 'vitest/config'
import tsconfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    name: 'integration',
    include: [
      'supabase/__tests__/**/*.test.ts',
      // Ring-sequence server actions (issue #725) — real DB calls, so they live
      // here rather than in the app suite (vitest.config.ts).
      'app/actions/__tests__/ring-sequences.test.ts',
    ],
    environment: 'node',
  },
})
