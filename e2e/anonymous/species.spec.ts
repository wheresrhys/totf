import { test, expect } from '@playwright/test'
import { alphaSlug, betaSlug } from '../helpers/group-slugs'

// Runs in the `anonymous` Playwright project, which deliberately carries no
// storageState — the absence of a session cookie is the whole point (#1231).
//
// Beta is the one seed group opted into `public_areas: ['summary']`
// (`supabase/scripts/seed-e2e-data.ts` owns the choice and the reasoning);
// Alpha stands in for every group that has not opted in.
const SPECIES_TAB_QUERY = '?tabId=species-totals'

// Retargeted off the standalone `/group/<slug>/species` list page onto the
// summary page's Species tab (#1434), which replaced and deleted it. The
// anonymous-access behaviour itself is unchanged — the tab reads the same
// `SimpleStatsCache*` rows through `fetchAuthorisedCoreStats`' `'public'`
// branch — so it's the same gate, one URL further in. Two of the old
// assertions did not survive the move and are not re-expressed here: the
// year `<select>` was a list-page control with no summary-tab equivalent, and
// the list page's group-scoped `/group/<slug>/species/<name>` species links
// are plain `/species/<name>` on the summary tab (`SpeciesTotalsTable`'s
// `buildSpeciesHref`), so there is no group-scoping claim left to make.
test.describe(
	'anonymous visitor to a group summary species tab',
	{ tag: '@anonymous' },
	() => {
		test.describe('a group opted into public summary', () => {
			test('shows the species table with real data', async ({ page }) => {
				await page.goto(`/group/${betaSlug}/summary${SPECIES_TAB_QUERY}`)
				await expect(
					page.getByRole('link', { name: 'Chaffinch' })
				).toBeVisible()
				await expect(page.getByRole('link', { name: 'Robin' })).toBeVisible()
			})
		})

		test.describe('a group not opted into public summary', () => {
			test('still shows the login modal instead of the table', async ({
				page,
			}) => {
				await page.goto(`/group/${alphaSlug}/summary${SPECIES_TAB_QUERY}`)
				await expect(
					page.getByRole('heading', { name: 'Login to your group' })
				).toBeVisible()
				await expect(page.getByRole('link', { name: 'Blue Tit' })).toBeHidden()
			})
		})

		// The gate matches the group-scoped summary subtree only — the ungrouped
		// `/summary` has no slug to resolve a public group from, so it stays
		// behind the login modal for everyone.
		test('ungrouped /summary still shows the login modal', async ({ page }) => {
			await page.goto(`/summary${SPECIES_TAB_QUERY}`)
			await expect(
				page.getByRole('heading', { name: 'Login to your group' })
			).toBeVisible()
		})
	}
)
