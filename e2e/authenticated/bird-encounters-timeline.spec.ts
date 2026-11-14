import { test, expect } from '@playwright/test'

// Regression coverage for the EncountersTimeline scroll fix: on a narrow
// viewport the month-span text used to refuse to shrink below its own
// min-content width while the root div (the dots' % positioning basis) kept
// shrinking to fit the screen, so dots and month boundaries drifted apart.
// The fix wraps the calendar in its own overflow-x-auto scroll region instead
// of letting it be squeezed. ARRETRAP is Alpha's long-lived Robin, with
// encounters spanning 2021-06-20 to 2024-05-10 (4 years).
//
// The quarter-collapse PR stacked on top of this one (see the second
// describe block below) means a 360px viewport no longer forces ARRETRAP's
// calendar to scroll at all — it switches to unlabelled quarters instead,
// which is the whole point of that PR. So this test no longer asserts that
// scrolling specifically happens; it asserts the underlying invariant the
// scroll fix exists to guarantee — the row (whichever of months/quarters is
// showing) never shrinks narrower than its own natural content width, and
// the encounter dots stay positioned within that row's actual bounds — which
// still holds, and would still catch a regression that let the row get
// squeezed, whether or not that squeeze happens to also need a scrollbar.
test.describe('bird page encounters timeline on a narrow viewport', () => {
	test(
		'alpha: keeps the encounter dots positioned within the calendar row, scrolling the row instead of shrinking it when it does not fit',
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
			expect(scrollWidth).toBeGreaterThanOrEqual(clientWidth)

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

// Regression coverage for the quarter-collapse density fix (stacked on top of
// the scroll fix above): each year block's 12 labelled month spans are
// swapped for 4 unlabelled quarter spans once the timeline's own container
// query threshold is crossed, and that threshold scales with how many years
// the bird's encounters span (getQuarterCollapseThresholdPx), rather than
// using one fixed breakpoint for every bird. ARRETRAP (Alpha's Robin, 4 years
// of encounters: 2021-06-20 to 2024-05-10) and ABTITMIS (Alpha's Blue Tit, 1
// year of encounters, both in 2022) are deliberately very different spans so
// a shared container width puts them on opposite sides of their own
// thresholds. The PageWrapper (`m-3`) + timeline's own `m-2` wrapper add a
// fixed 40px either side of the EncountersTimeline container, so a 340px
// viewport yields a ~300px container — comfortably below ARRETRAP's ~516px
// threshold (collapsed) and above ABTITMIS's ~129px threshold (not
// collapsed).
test.describe('month label density vs. available width, scaled by years spanned', () => {
	test(
		"collapses a many-year bird's months to quarters at a wider container width than a 1-year bird's",
		{ tag: '@alpha' },
		async ({ page }) => {
			await page.setViewportSize({ width: 340, height: 800 })

			await page.goto('/bird/ARRETRAP')
			const manyYearMonths = page.locator('.m-2 .timeline-months').first()
			const manyYearQuarters = page.locator('.m-2 .timeline-quarters').first()
			await expect(manyYearQuarters).toBeVisible()
			await expect(manyYearMonths).toBeHidden()

			await page.goto('/bird/ABTITMIS')
			const oneYearMonths = page.locator('.m-2 .timeline-months').first()
			const oneYearQuarters = page.locator('.m-2 .timeline-quarters').first()
			await expect(oneYearMonths).toBeVisible()
			await expect(oneYearQuarters).toBeHidden()
		}
	)

	test(
		"shows quarter shading with no month text once a bird's own threshold is crossed",
		{ tag: '@alpha' },
		async ({ page }) => {
			await page.setViewportSize({ width: 340, height: 800 })
			await page.goto('/bird/ARRETRAP')

			const quartersRow = page.locator('.m-2 .timeline-quarters').first()
			await expect(quartersRow).toBeVisible()
			await expect(quartersRow).toHaveText('')

			const quarterSpans = quartersRow.locator('span')
			await expect(quarterSpans).toHaveCount(4)
			await expect(quarterSpans.nth(0)).toHaveClass(/bg-gray-100/)
			await expect(quarterSpans.nth(1)).toHaveClass(/bg-gray-300/)
			await expect(quarterSpans.nth(2)).toHaveClass(/bg-gray-100/)
			await expect(quarterSpans.nth(3)).toHaveClass(/bg-gray-300/)
		}
	)

	test(
		"shows full month labels when a bird's own threshold is not crossed",
		{ tag: '@alpha' },
		async ({ page }) => {
			await page.setViewportSize({ width: 340, height: 800 })
			await page.goto('/bird/ABTITMIS')

			const monthsRow = page.locator('.m-2 .timeline-months').first()
			await expect(monthsRow).toBeVisible()
			await expect(monthsRow).toHaveText('JFMAMJJASOND')
		}
	)
})
