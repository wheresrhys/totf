import { defineConfig } from 'vitest/config'
import tsconfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    include: ['http-tests/**/*.test.ts'],
    environment: 'node',
    globalSetup: ['./http-tests/global-setup.ts'],
  },
})
