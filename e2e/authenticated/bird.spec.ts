import { test, expect } from '@playwright/test'

test.describe('bird search', () => {
	test('alpha: exact ring match redirects to bird page', { tag: '@alpha' }, async ({ page }) => {
		await page.goto('/bird?q=ARRETRAP')
		await expect(page).toHaveURL(/\/bird\/ARRETRAP/i)
	})

	test('beta: partial match shows search results', { tag: '@beta' }, async ({ page }) => {
		await page.goto('/bird?q=BCHAF')
		await expect(
			page.getByRole('heading', { name: 'Search results' })
		).toBeVisible()
	})

	test('gamma: no own birds — search yields no results', { tag: '@gamma' }, async ({ page }) => {
		await page.goto('/bird?q=ARRETRAP')
		// Gamma cannot see Alpha's birds; fuzzy search returns empty
		await expect(
			page.getByRole('heading', { name: 'Search results' })
		).toBeVisible()
		await expect(page.getByRole('link', { name: /ARRETRAP/i })).not.toBeVisible()
	})
})

test.describe('ARRETRAP bird page', () => {
	test('alpha: shows Robin with multiple encounters', { tag: '@alpha' }, async ({ page }) => {
		await page.goto('/bird/ARRETRAP')
		await expect(page.getByRole('heading', { name: /Robin.*ARRETRAP/i })).toBeVisible()
		await expect(page.getByText('9 encounters')).toBeVisible()
	})

	test('beta: cannot see ARRETRAP (Alpha bird, no reverse share)', { tag: '@beta' }, async ({ page }) => {
		await page.goto('/bird/ARRETRAP')
		// Beta can see the bird record (ringing_group_ids includes alphaId which Beta can read)
		// but encounters from Alpha should NOT be filtered to zero (Beta sees Alpha encounters via sharing)
		await expect(page.getByRole('heading', { name: /Robin.*ARRETRAP/i })).toBeVisible()
	})
})

test.describe('SHARED01 bird page (shared across Alpha and Beta)', () => {
	test('alpha: sees own encounter only', { tag: '@alpha' }, async ({ page }) => {
		await page.goto('/bird/SHARED01')
		await expect(page.getByRole('heading', { name: /Robin.*SHARED01/i })).toBeVisible()
		await expect(page.getByText('1 encounter')).toBeVisible()
	})

	test('beta: sees Alpha and Beta encounters', { tag: '@beta' }, async ({ page }) => {
		await page.goto('/bird/SHARED01')
		await expect(page.getByRole('heading', { name: /Robin.*SHARED01/i })).toBeVisible()
		await expect(page.getByText('2 encounters')).toBeVisible()
		await expect(page.getByText('1 from another group')).toBeVisible()
	})

	test('gamma: sees only Beta encounter', { tag: '@gamma' }, async ({ page }) => {
		await page.goto('/bird/SHARED01')
		await expect(page.getByRole('heading', { name: /Robin.*SHARED01/i })).toBeVisible()
		await expect(page.getByText('1 encounter')).toBeVisible()
		await expect(page.getByText('1 from another group')).toBeVisible()
	})
})
