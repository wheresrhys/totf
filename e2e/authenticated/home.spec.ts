import { test, expect } from '@playwright/test'

test('shows Recent Sessions heading', { tag: '@all' }, async ({ page }) => {
	await page.goto('/')
	await expect(page.getByRole('heading', { name: 'Recent Sessions' })).toBeVisible()
})

test('shows stats accordion', { tag: '@all' }, async ({ page }) => {
	await page.goto('/')
	await expect(page.getByText('Busiest sessions:')).toBeVisible()
})

test('alpha: shows own recent sessions by date', { tag: '@alpha' }, async ({ page }) => {
	await page.goto('/')
	// Alpha's most recent session is 2024-05-10
	await expect(page.getByRole('link', { name: /10th May/ })).toBeVisible()
})

test('beta: shows own recent sessions by date', { tag: '@beta' }, async ({ page }) => {
	await page.goto('/')
	// Beta's only session is 2023-06-01
	await expect(page.getByRole('link', { name: /1st June/ })).toBeVisible()
})

test('gamma: shows no sessions (empty own data)', { tag: '@gamma' }, async ({ page }) => {
	await page.goto('/')
	// Gamma has no sessions; Alpha/Beta dates must not leak
	await expect(page.getByRole('link', { name: /10th May/ })).not.toBeVisible()
	await expect(page.getByRole('link', { name: /1st June/ })).not.toBeVisible()
})
