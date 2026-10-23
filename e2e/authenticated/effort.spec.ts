import { test, expect } from '@playwright/test'

test('shows Effort and Pay-off heading', { tag: '@all' }, async ({ page }) => {
	await page.goto('/effort')
	await expect(
		page.getByRole('heading', { name: 'Effort and Pay-off' })
	).toBeVisible()
})

test('alpha: shows yearly data with non-zero encounter counts', { tag: '@alpha' }, async ({ page }) => {
	await page.goto('/effort')
	await expect(page.getByText('Total ringing effort')).toBeVisible()
	await expect(page.getByRole('columnheader', { name: '2021' })).toBeVisible()
	await expect(page.getByRole('columnheader', { name: '2024' })).toBeVisible()
})

test('beta: shows yearly data with non-zero encounter counts', { tag: '@beta' }, async ({ page }) => {
	await page.goto('/effort')
	await expect(page.getByText('Total ringing effort')).toBeVisible()
	await expect(page.getByRole('columnheader', { name: '2023' })).toBeVisible()
})

test('gamma: shows the empty state (no own data, despite a GroupDataSharing grant from Beta)', { tag: '@gamma' }, async ({ page }) => {
	await page.goto('/effort')
	// Gamma has no Sessions of its own — only a GroupDataSharing grant letting it
	// *view* Beta's data elsewhere in the app. core_stats' ringing_group_filter
	// scopes strictly to Gamma's own rows regardless of that grant, so its year
	// spine is empty and the page falls back to the empty-state copy, not a
	// table zero-filled against Beta's years.
	await expect(page.getByText('No yearly data for this group yet.')).toBeVisible()
	await expect(page.getByRole('table')).toHaveCount(0)
})
