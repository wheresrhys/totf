import { test, expect } from '@playwright/test'

const project = () => test.info().project.name

test('shows species name as heading', async ({ page }) => {
	await page.goto('/species/Robin')
	await expect(page.getByRole('heading', { name: 'Robin' })).toBeVisible()
})

test('alpha: shows bird list tab with birds', async ({ page }) => {
	test.skip(project() !== 'alpha', 'alpha only')
	await page.goto('/species/Robin')
	await expect(page.getByRole('button', { name: 'Bird list' })).toBeVisible()
	await expect(page.getByTestId('infinite-scroll-loader')).toBeVisible()
})

test('alpha: loads more birds on scroll past loader', async ({ page }) => {
	test.skip(project() !== 'alpha', 'alpha only')
	await page.goto('/species/Robin')
	const loader = page.getByTestId('infinite-scroll-loader')
	await expect(loader).toBeVisible()
	await loader.scrollIntoViewIfNeeded()
	await expect(loader).not.toBeVisible({ timeout: 5000 })
})

test('beta: shows Robin with limited data', async ({ page }) => {
	test.skip(project() !== 'beta', 'beta only')
	await page.goto('/species/Robin')
	await expect(page.getByRole('button', { name: 'Bird list' })).toBeVisible()
	await expect(page.getByTestId('infinite-scroll-loader')).not.toBeVisible()
})

test('gamma: shows not authorised message', async ({ page }) => {
	test.skip(project() !== 'gamma', 'gamma only')
	await page.goto('/species/Robin')
	await expect(
		page.getByText('Not authorised to view any encounter data for this species')
	).toBeVisible()
})
