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

test('gamma: shows table with all-zero encounter counts (no own data)', { tag: '@gamma' }, async ({ page }) => {
	await page.goto('/effort')
	// aggregate_stats returns zero-count rows for all years; no Alpha/Beta data leaks
	// via ringing_group_filter — only encounters where ringing_group_id = gammaId are counted
	await expect(page.getByRole('rowheader', { name: 'Encounter count' })).toBeVisible()
	const encounterRow = page.getByRole('row', { name: /^Encounter count/ })
	// All year columns must show 0
	const cells = encounterRow.getByRole('cell')
	const count = await cells.count()
	for (let i = 0; i < count; i++) {
		await expect(cells.nth(i)).toHaveText('0')
	}
})
