import { test, expect } from '@playwright/test'

// Per-group visibility scoping for the per-species totals table. Retargeted
// off the deleted standalone `/species` list page onto the summary page's
// Species tab (#1434), which replaced it over the same `fetchSpeciesData`
// read — so the scoping claim each test makes is unchanged, only the URL is.
const SPECIES_TAB_URL = '/summary?tabId=species-totals'

test('alpha: shows full species table', { tag: '@alpha' }, async ({ page }) => {
	await page.goto(SPECIES_TAB_URL)
	await expect(page.getByRole('link', { name: 'Blue Tit' })).toBeVisible()
	await expect(page.getByRole('link', { name: 'Robin' })).toBeVisible()
	await expect(page.getByRole('link', { name: 'Kingfisher' })).toBeVisible()
})

test('alpha: does not show Beta species', { tag: '@alpha' }, async ({ page }) => {
	await page.goto(SPECIES_TAB_URL)
	await expect(page.getByRole('link', { name: 'Chaffinch' })).not.toBeVisible()
})

test('beta: shows own sparse species', { tag: '@beta' }, async ({ page }) => {
	await page.goto(SPECIES_TAB_URL)
	await expect(page.getByRole('link', { name: 'Chaffinch' })).toBeVisible()
	await expect(page.getByRole('link', { name: 'Robin' })).toBeVisible()
})

test('beta: does not show Alpha-only species', { tag: '@beta' }, async ({ page }) => {
	await page.goto(SPECIES_TAB_URL)
	await expect(page.getByRole('link', { name: 'Blue Tit' })).not.toBeVisible()
	await expect(page.getByRole('link', { name: 'Kingfisher' })).not.toBeVisible()
})

test('gamma: shows empty species table', { tag: '@gamma' }, async ({ page }) => {
	await page.goto(SPECIES_TAB_URL)
	await expect(page.getByRole('link', { name: 'Robin' })).not.toBeVisible()
	await expect(page.getByRole('link', { name: 'Chaffinch' })).not.toBeVisible()
})
