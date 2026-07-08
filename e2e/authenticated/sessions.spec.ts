import { test, expect } from '@playwright/test'

test('shows Session history heading', { tag: '@all' }, async ({ page }) => {
	await page.goto('/sessions')
	await expect(page.getByRole('heading', { name: 'Session history' })).toBeVisible()
})

test('alpha: shows sessions across multiple years', { tag: '@alpha' }, async ({ page }) => {
	await page.goto('/sessions')
	await expect(page.getByText('2021')).toBeVisible()
	await expect(page.getByText('2024')).toBeVisible()
})

test('beta: shows sessions in a single year', { tag: '@beta' }, async ({ page }) => {
	await page.goto('/sessions')
	await expect(page.getByText('2023')).toBeVisible()
	await expect(page.getByText('2021')).not.toBeVisible()
})

test('gamma: shows no session data message', { tag: '@gamma' }, async ({ page }) => {
	await page.goto('/sessions')
	await expect(page.getByText('No session data available.')).toBeVisible()
})
