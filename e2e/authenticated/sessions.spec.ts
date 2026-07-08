import { test, expect } from '@playwright/test'

const project = () => test.info().project.name

test('shows Session history heading', async ({ page }) => {
	await page.goto('/sessions')
	await expect(page.getByRole('heading', { name: 'Session history' })).toBeVisible()
})

test('alpha: shows sessions across multiple years', async ({ page }) => {
	test.skip(project() !== 'alpha', 'alpha only')
	await page.goto('/sessions')
	await expect(page.getByText('2021')).toBeVisible()
	await expect(page.getByText('2024')).toBeVisible()
})

test('beta: shows sessions in a single year', async ({ page }) => {
	test.skip(project() !== 'beta', 'beta only')
	await page.goto('/sessions')
	await expect(page.getByText('2023')).toBeVisible()
	await expect(page.getByText('2021')).not.toBeVisible()
})

test('gamma: shows no session data message', async ({ page }) => {
	test.skip(project() !== 'gamma', 'gamma only')
	await page.goto('/sessions')
	await expect(page.getByText('No session data available.')).toBeVisible()
})
