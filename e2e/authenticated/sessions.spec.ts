import { test, expect } from '@playwright/test'
import { alphaSlug } from '../helpers/group-slugs'

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

// Regression coverage for issue #742: a nested `table-xs` table (the expanded
// species row) must stay compact even when its ancestor table carries
// `sm:table-md`, at every viewport width — see app/globals.css for the fix.
// Vitest+happy-dom doesn't apply FlyonUI's real stylesheet, so this needs a
// real-browser computed-style assertion, not a class-name check.
test.describe('nested table-xs sizing (issue #742)', () => {
	const knownDate = '2024-05-10'

	async function expandFirstSpeciesRow(page: import('@playwright/test').Page) {
		await page.goto(`/group/${alphaSlug}/session/${knownDate}`)
		await page.getByTestId('session-table').locator('tbody button').first().click()
		const detailsCell = page.getByTestId('species-details-table').locator('td').first()
		await expect(detailsCell).toBeVisible()
		return detailsCell
	}

	test(
		'alpha: expanded species row table stays compact (table-xs) at a >=640px viewport',
		{ tag: '@alpha' },
		async ({ page }) => {
			await page.setViewportSize({ width: 1024, height: 800 })
			const detailsCell = await expandFirstSpeciesRow(page)
			const { paddingTop, fontSize } = await detailsCell.evaluate((el) => {
				const style = getComputedStyle(el)
				return { paddingTop: style.paddingTop, fontSize: style.fontSize }
			})
			expect(paddingTop).toBe('4px')
			expect(fontSize).toBe('12px')
		}
	)

	test(
		'alpha: expanded species row table stays compact (table-xs) at a narrow (<640px) viewport',
		{ tag: '@alpha' },
		async ({ page }) => {
			await page.setViewportSize({ width: 375, height: 800 })
			const detailsCell = await expandFirstSpeciesRow(page)
			const { paddingTop, fontSize } = await detailsCell.evaluate((el) => {
				const style = getComputedStyle(el)
				return { paddingTop: style.paddingTop, fontSize: style.fontSize }
			})
			expect(paddingTop).toBe('4px')
			expect(fontSize).toBe('12px')
		}
	)

	// The net rounds table is a top-level (non-nested) table that, since #743,
	// uses the responsive size pattern (`table table-xs sm:table-md`) rather than
	// a fixed `table-xs` — so at a >=640px viewport it renders at the larger
	// `table-md` size, and only drops to compact `table-xs` on narrow screens.
	test(
		'alpha: the net rounds table renders at the responsive (table-md) size at a >=640px viewport',
		{ tag: '@alpha' },
		async ({ page }) => {
			await page.setViewportSize({ width: 1024, height: 800 })
			await page.goto(`/group/${alphaSlug}/session/${knownDate}`)
			await page.getByRole('button', { name: 'Net rounds' }).click()
			const netRoundCell = page.getByTestId('net-round-table').locator('td').first()
			await expect(netRoundCell).toBeVisible()
			const { paddingTop, fontSize } = await netRoundCell.evaluate((el) => {
				const style = getComputedStyle(el)
				return { paddingTop: style.paddingTop, fontSize: style.fontSize }
			})
			expect(paddingTop).toBe('12px')
			expect(fontSize).toBe('14px')
		}
	)

	test(
		'alpha: the net rounds table renders compact (table-xs) at a narrow (<640px) viewport',
		{ tag: '@alpha' },
		async ({ page }) => {
			await page.setViewportSize({ width: 375, height: 800 })
			await page.goto(`/group/${alphaSlug}/session/${knownDate}`)
			await page.getByRole('button', { name: 'Net rounds' }).click()
			const netRoundCell = page.getByTestId('net-round-table').locator('td').first()
			await expect(netRoundCell).toBeVisible()
			const { paddingTop, fontSize } = await netRoundCell.evaluate((el) => {
				const style = getComputedStyle(el)
				return { paddingTop: style.paddingTop, fontSize: style.fontSize }
			})
			expect(paddingTop).toBe('4px')
			expect(fontSize).toBe('12px')
		}
	)
})
