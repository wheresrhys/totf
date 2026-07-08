import { test, expect } from '@playwright/test'

const project = () => test.info().project.name

test('alpha: shows full species table', async ({ page }) => {
	test.skip(project() !== 'alpha', 'alpha only')
	await page.goto('/species')
	await expect(page.getByRole('link', { name: 'Blue Tit' })).toBeVisible()
	await expect(page.getByRole('link', { name: 'Robin' })).toBeVisible()
	await expect(page.getByRole('link', { name: 'Kingfisher' })).toBeVisible()
})

test('alpha: does not show Beta species', async ({ page }) => {
	test.skip(project() !== 'alpha', 'alpha only')
	await page.goto('/species')
	await expect(page.getByRole('link', { name: 'Chaffinch' })).not.toBeVisible()
})

test('beta: shows own sparse species', async ({ page }) => {
	test.skip(project() !== 'beta', 'beta only')
	await page.goto('/species')
	await expect(page.getByRole('link', { name: 'Chaffinch' })).toBeVisible()
	await expect(page.getByRole('link', { name: 'Robin' })).toBeVisible()
})

test('beta: does not show Alpha-only species', async ({ page }) => {
	test.skip(project() !== 'beta', 'beta only')
	await page.goto('/species')
	await expect(page.getByRole('link', { name: 'Blue Tit' })).not.toBeVisible()
	await expect(page.getByRole('link', { name: 'Kingfisher' })).not.toBeVisible()
})

test('gamma: shows empty species table', async ({ page }) => {
	test.skip(project() !== 'gamma', 'gamma only')
	await page.goto('/species')
	await expect(page.getByRole('link', { name: 'Robin' })).not.toBeVisible()
	await expect(page.getByRole('link', { name: 'Chaffinch' })).not.toBeVisible()
})
