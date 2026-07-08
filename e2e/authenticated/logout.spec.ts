import { test, expect } from '@playwright/test'

test.describe('logout flow', { tag: '@alpha' }, () => {
	test('login modal becomes visible after logout', async ({ page }) => {
		await page.goto('/')
		await page.getByRole('button', { name: 'Toggle user menu' }).click()
		await page.getByRole('button', { name: 'Log out' }).click()
		await expect(page.getByRole('heading', { name: 'Login to your group' })).toBeVisible()
	})

	test('navigating to a protected page shows login modal', async ({ page }) => {
		await page.goto('/')
		await page.getByRole('button', { name: 'Toggle user menu' }).click()
		await page.getByRole('button', { name: 'Log out' }).click()
		await expect(page.getByRole('heading', { name: 'Login to your group' })).toBeVisible()
		await page.goto('/sessions')
		await expect(page.getByRole('heading', { name: 'Login to your group' })).toBeVisible()
	})
})
