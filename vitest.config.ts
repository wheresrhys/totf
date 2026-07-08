import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tsconfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
  plugins: [tsconfigPaths(), react()],

  test: {
    name: 'app',
    setupFiles: ['./vitest.setup.tsx'],
    environment: 'happy-dom',
    exclude: ['**/node_modules/**', 'supabase/__tests__/**', 'http-tests/**', 'e2e/**'],
  },
})
