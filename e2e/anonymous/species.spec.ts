import { test, expect } from '@playwright/test'
import { alphaSlug, betaSlug } from '../helpers/group-slugs'

// Runs in the `anonymous` Playwright project, which deliberately carries no
// storageState — the absence of a session cookie is the whole point (#1231).
//
// Beta is the one seed group opted into `public_areas: ['summary']`
// (`supabase/scripts/seed-e2e-data.ts` owns the choice and the reasoning);
// Alpha stands in for every group that has not opted in.
test.describe('anonymous visitor to a group species list', { tag: '@anonymous' }, () => {
	test.describe('a group opted into public summary', () => {
		test('shows the species table with real data', async ({ page }) => {
			await page.goto(`/group/${betaSlug}/species`)
			await expect(page.getByRole('link', { name: 'Chaffinch' })).toBeVisible()
			await expect(page.getByRole('link', { name: 'Robin' })).toBeVisible()
		})

		// The year list comes from the SimpleStatsCache year grain rather than
		// a direct Sessions read, which is what makes it resolvable with no
		// session cookie at all. Beta's seed data is a single 2080 session.
		test('offers the years the group actually rang in', async ({ page }) => {
			await page.goto(`/group/${betaSlug}/species`)
			await expect(page.locator('#year-select option')).toHaveText([
				'All',
				'2080',
			])
		})

		// Asserted as an href rather than by clicking: the `/species/<name>`
		// detail pages stay behind the login gate, so following the link
		// anonymously would land on the login modal. What matters here is that
		// the link stays inside the viewed group instead of pointing at the
		// bare, viewer-scoped `/species/<name>`.
		test('keeps species-name links scoped to the group being viewed', async ({
			page,
		}) => {
			await page.goto(`/group/${betaSlug}/species`)
			await expect(
				page.getByRole('link', { name: 'Chaffinch' })
			).toHaveAttribute('href', `/group/${betaSlug}/species/Chaffinch`)
		})
	})

	test.describe('a group not opted into public summary', () => {
		test('still shows the login modal instead of the table', async ({
			page,
		}) => {
			await page.goto(`/group/${alphaSlug}/species`)
			await expect(
				page.getByRole('heading', { name: 'Login to your group' })
			).toBeVisible()
			await expect(page.getByRole('link', { name: 'Blue Tit' })).toBeHidden()
		})
	})

	// The widened gate matches the group-scoped list path only — the ungrouped
	// `/species` has no slug to resolve a public group from, so it stays behind
	// the login modal for everyone.
	test('ungrouped /species still shows the login modal', async ({ page }) => {
		await page.goto('/species')
		await expect(
			page.getByRole('heading', { name: 'Login to your group' })
		).toBeVisible()
	})
})
