import { test, expect } from '@playwright/test'

// Regression coverage for the EncountersTimeline scroll fix: on a narrow
// viewport the month-span text used to refuse to shrink below its own
// min-content width while the root div (the dots' % positioning basis) kept
// shrinking to fit the screen, so dots and month boundaries drifted apart.
// The fix wraps the calendar in its own overflow-x-auto scroll region instead
// of letting it be squeezed. ARRETRAP is Alpha's long-lived Robin, with
// encounters spanning 2021-06-20 to 2024-05-10 (4 years) — wide enough that
// its calendar needs to scroll at a narrow viewport.
test.describe('bird page encounters timeline on a narrow viewport', () => {
	test(
		'alpha: scrolls the calendar instead of letting the encounter dots drift off their month boundaries',
		{ tag: '@alpha' },
		async ({ page }) => {
			await page.setViewportSize({ width: 360, height: 800 })
			await page.goto('/bird/ARRETRAP')

			const scrollContainer = page.locator('.m-2 > .overflow-x-auto')
			await expect(scrollContainer).toBeVisible()

			const innerRow = scrollContainer.locator('> div').first()
			const dot = innerRow.locator('.absolute').first()
			await expect(dot).toBeVisible()

			const { scrollWidth, clientWidth } = await scrollContainer.evaluate(
				(el) => ({ scrollWidth: el.scrollWidth, clientWidth: el.clientWidth })
			)
			expect(scrollWidth).toBeGreaterThan(clientWidth)

			const rowBox = await innerRow.boundingBox()
			const dotBox = await dot.boundingBox()
			if (!rowBox || !dotBox) {
				throw new Error('expected both bounding boxes to be available')
			}

			expect(dotBox.x).toBeGreaterThanOrEqual(rowBox.x)
			expect(dotBox.x + dotBox.width).toBeLessThanOrEqual(rowBox.x + rowBox.width)
		}
	)
})
