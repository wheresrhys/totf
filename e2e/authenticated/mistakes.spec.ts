import { test, expect } from '@playwright/test'

const project = () => test.info().project.name

test('shows Mistakes heading', async ({ page }) => {
	await page.goto('/mistakes')
	await expect(page.getByRole('heading', { name: 'Mistakes' })).toBeVisible()
})

test('alpha: shows discrepancy rows', async ({ page }) => {
	test.skip(project() !== 'alpha', 'alpha only')
	await page.goto('/mistakes')
	// Multiple rows for ABTITMIS (age + sex discrepancy) — use first()
	await expect(page.getByRole('link', { name: 'ABTITMIS' }).first()).toBeVisible()
	await expect(page.getByRole('link', { name: 'ARRETRAP' }).first()).toBeVisible()
})

test('beta: shows empty mistakes table', async ({ page }) => {
	test.skip(project() !== 'beta', 'beta only')
	await page.goto('/mistakes')
	await expect(page.getByRole('link', { name: 'ABTITMIS' })).not.toBeVisible()
})

test('gamma: shows empty mistakes table', async ({ page }) => {
	test.skip(project() !== 'gamma', 'gamma only')
	await page.goto('/mistakes')
	await expect(page.getByRole('link', { name: 'ABTITMIS' })).not.toBeVisible()
})
