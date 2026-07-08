import { test, expect } from '@playwright/test'

test('shows Notable Birds heading', { tag: '@all' }, async ({ page }) => {
	await page.goto('/retraps')
	await expect(page.getByRole('heading', { name: 'Notable Birds' })).toBeVisible()
})

test('alpha: shows ARRETRAP as notable Robin retrap', { tag: '@alpha' }, async ({ page }) => {
	await page.goto('/retraps')
	await expect(page.getByText('ARRETRAP')).toBeVisible()
	await expect(page.getByText('Robin')).toBeVisible()
})

test('beta: shows no notable retraps', { tag: '@beta' }, async ({ page }) => {
	await page.goto('/retraps')
	await expect(page.getByText('ARRETRAP')).not.toBeVisible()
})

test('gamma: shows no notable retraps', { tag: '@gamma' }, async ({ page }) => {
	await page.goto('/retraps')
	await expect(page.getByText('ARRETRAP')).not.toBeVisible()
})
