import { test, expect } from '@playwright/test'

const project = () => test.info().project.name

test('shows Notable Birds heading', async ({ page }) => {
	await page.goto('/retraps')
	await expect(page.getByRole('heading', { name: 'Notable Birds' })).toBeVisible()
})

test('alpha: shows ARRETRAP as notable Robin retrap', async ({ page }) => {
	test.skip(project() !== 'alpha', 'alpha only')
	await page.goto('/retraps')
	await expect(page.getByText('ARRETRAP')).toBeVisible()
	await expect(page.getByText('Robin')).toBeVisible()
})

test('beta: shows no notable retraps', async ({ page }) => {
	test.skip(project() !== 'beta', 'beta only')
	await page.goto('/retraps')
	await expect(page.getByText('ARRETRAP')).not.toBeVisible()
})

test('gamma: shows no notable retraps', async ({ page }) => {
	test.skip(project() !== 'gamma', 'gamma only')
	await page.goto('/retraps')
	await expect(page.getByText('ARRETRAP')).not.toBeVisible()
})
