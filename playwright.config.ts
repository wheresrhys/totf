import { defineConfig } from '@playwright/test'

const BASE_URL = process.env.TEST_BASE_URL ?? 'http://localhost:3000'

export default defineConfig({
	testDir: './e2e',
	fullyParallel: true,
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 2 : 0,
	reporter: 'html',
	globalSetup: './e2e/global-setup.ts',
	use: {
		baseURL: BASE_URL,
		trace: 'on-first-retry',
	},
	projects: [
		{
			name: 'setup',
			testMatch: '**/auth.setup.ts',
		},
		{
			name: 'alpha',
			use: { storageState: 'e2e/.auth/alpha.json' },
			dependencies: ['setup'],
		},
		{
			name: 'beta',
			use: { storageState: 'e2e/.auth/beta.json' },
			dependencies: ['setup'],
		},
		{
			name: 'gamma',
			use: { storageState: 'e2e/.auth/gamma.json' },
			dependencies: ['setup'],
		},
		{
			name: 'delta',
			use: { storageState: 'e2e/.auth/delta.json' },
			dependencies: ['setup'],
		},
	],
	webServer: {
		command: 'npm run next:dev',
		url: BASE_URL,
		reuseExistingServer: !process.env.CI,
		timeout: 120_000,
	},
})
