import { defineConfig } from '@playwright/test'
import { deriveWorktreePort } from './scripts/worktree-test-port'

// Each git worktree gets its own deterministic port (derived from its absolute
// path) so concurrent swarm worktrees never share a dev server. An explicit
// TEST_BASE_URL still fully overrides this — the escape hatch for pointing at a
// shared/remote server on purpose.
const PORT = deriveWorktreePort()
const BASE_URL = process.env.TEST_BASE_URL ?? `http://localhost:${PORT}`

export default defineConfig({
	testDir: './e2e',
	fullyParallel: true,
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 2 : 0,
	reporter: 'html',
	globalSetup: './e2e/global-setup.ts',
	timeout: 60_000,
	use: {
		baseURL: BASE_URL,
		trace: 'on-first-retry',
		actionTimeout: 60_000,
	},
	projects: [
		{
			name: 'setup',
			testMatch: '**/auth.setup.ts',
		},
		{
			name: 'alpha',
			grep: /@alpha|@all/,
			use: { storageState: 'e2e/.auth/alpha.json' },
			dependencies: ['setup'],
		},
		{
			name: 'beta',
			grep: /@beta|@all/,
			use: { storageState: 'e2e/.auth/beta.json' },
			dependencies: ['setup'],
		},
		{
			name: 'gamma',
			grep: /@gamma|@all/,
			use: { storageState: 'e2e/.auth/gamma.json' },
			dependencies: ['setup'],
		},
		{
			name: 'delta',
			grep: /@delta|@all/,
			use: { storageState: 'e2e/.auth/delta.json' },
			dependencies: ['setup'],
		},
	],
	webServer: {
		command: 'npm run next:dev',
		url: BASE_URL,
		// Playwright polls `url`, but `next dev` binds to its own PORT env var, so
		// both must name the same port or the webServer waits forever for the wrong
		// one. Skip when TEST_BASE_URL is set — the server is then external, not
		// spawned here.
		env: process.env.TEST_BASE_URL ? {} : { PORT: String(PORT) },
		// Safe now that the default port is worktree-specific: "reuse" can only ever
		// attach to a server *this same worktree* started (or find nothing), never a
		// sibling worktree's server bound to a shared port — so the cross-worktree
		// contamination hazard from #581 is structurally closed, not just unlikely.
		reuseExistingServer: !process.env.CI,
		timeout: 120_000,
	},
})
