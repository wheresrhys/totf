import { test, expect } from '@playwright/test'

test('shows Mistakes heading', { tag: '@all' }, async ({ page }) => {
	await page.goto('/mistakes')
	await expect(page.getByRole('heading', { name: 'Mistakes' })).toBeVisible()
})

test('alpha: shows discrepancy rows', { tag: '@alpha' }, async ({ page }) => {
	await page.goto('/mistakes')
	// Multiple rows for ABTITMIS (age + sex discrepancy) — use first()
	await expect(page.getByRole('link', { name: 'ABTITMIS' }).first()).toBeVisible()
	await expect(page.getByRole('link', { name: 'ARRETRAP' }).first()).toBeVisible()
})

test('beta: shows empty mistakes table', { tag: '@beta' }, async ({ page }) => {
	await page.goto('/mistakes')
	await expect(page.getByRole('link', { name: 'ABTITMIS' })).not.toBeVisible()
})

test('gamma: shows empty mistakes table', { tag: '@gamma' }, async ({ page }) => {
	await page.goto('/mistakes')
	await expect(page.getByRole('link', { name: 'ABTITMIS' })).not.toBeVisible()
})
