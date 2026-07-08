import { test as setup } from '@playwright/test'
import { loginAs } from './helpers/auth'

setup('authenticate as alpha', async ({ page }) => {
	await loginAs('alpha', page)
})

setup('authenticate as beta', async ({ page }) => {
	await loginAs('beta', page)
})

setup('authenticate as gamma', async ({ page }) => {
	await loginAs('gamma', page)
})
