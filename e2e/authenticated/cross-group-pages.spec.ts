import { test, expect } from '@playwright/test'
import { alphaSlug } from '../helpers/group-slugs'

const knownDate = '2024-05-10'

test.describe('cross-group pages (beta user viewing alpha data)', { tag: '@beta' }, () => {
	test.describe('/group/[alphaSlug] (cross-group home)', () => {
		test('shows Recent Sessions heading', async ({ page }) => {
			await page.goto(`/group/${alphaSlug}`)
			await expect(page.getByRole('heading', { name: 'Sessions' })).toBeVisible()
		})

		test('shows at least one session link', async ({ page }) => {
			await page.goto(`/group/${alphaSlug}`)
			await expect(page.getByRole('link', { name: /10th May/ })).toBeVisible()
		})
	})

	test.describe('/group/[alphaSlug]/sessions', () => {
		test('shows Session history heading', async ({ page }) => {
			await page.goto(`/group/${alphaSlug}/sessions`)
			await expect(page.getByRole('heading', { name: 'Session history' })).toBeVisible()
		})

		test('shows sessions from alpha data', async ({ page }) => {
			await page.goto(`/group/${alphaSlug}/sessions`)
			await expect(page.getByText('2021')).toBeVisible()
			await expect(page.getByText('2024')).toBeVisible()
		})
	})

	test.describe('/group/[alphaSlug]/species', () => {
		test('shows species table with alpha species', async ({ page }) => {
			await page.goto(`/group/${alphaSlug}/species`)
			await expect(page.getByRole('link', { name: 'Robin' })).toBeVisible()
			await expect(page.getByRole('link', { name: 'Blue Tit' })).toBeVisible()
		})
	})

	test.describe('/group/[alphaSlug]/effort', () => {
		test('shows Effort and Pay-off heading', async ({ page }) => {
			await page.goto(`/group/${alphaSlug}/effort`)
			await expect(page.getByRole('heading', { name: 'Effort and Pay-off' })).toBeVisible()
		})

		test('shows data rows with non-zero values', async ({ page }) => {
			await page.goto(`/group/${alphaSlug}/effort`)
			await expect(page.getByRole('columnheader', { name: '2021' })).toBeVisible()
			await expect(page.getByRole('columnheader', { name: '2024' })).toBeVisible()
		})
	})

	test.describe('/group/[alphaSlug]/mistakes', () => {
		test('shows Mistakes heading', async ({ page }) => {
			await page.goto(`/group/${alphaSlug}/mistakes`)
			await expect(page.getByRole('heading', { name: 'Mistakes' })).toBeVisible()
		})

		test('shows discrepancy rows', async ({ page }) => {
			await page.goto(`/group/${alphaSlug}/mistakes`)
			await expect(page.getByRole('link', { name: 'ABTITMIS' }).first()).toBeVisible()
		})
	})

	test.describe('/group/[alphaSlug]/retraps', () => {
		test('shows Notable Birds heading', async ({ page }) => {
			await page.goto(`/group/${alphaSlug}/retraps`)
			await expect(page.getByRole('heading', { name: 'Notable Birds' })).toBeVisible()
		})

		test('shows ARRETRAP as a notable bird', async ({ page }) => {
			await page.goto(`/group/${alphaSlug}/retraps`)
			await expect(page.getByText('ARRETRAP')).toBeVisible()
		})
	})

	test.describe('/group/[alphaSlug]/species/Robin', () => {
		test('shows Robin as page heading', async ({ page }) => {
			await page.goto(`/group/${alphaSlug}/species/Robin`)
			await expect(page.getByRole('heading', { name: 'Robin' })).toBeVisible()
		})

		test('shows bird list tab', async ({ page }) => {
			await page.goto(`/group/${alphaSlug}/species/Robin`)
			await expect(page.getByRole('button', { name: 'Bird list' })).toBeVisible()
		})
	})
})

test.describe('cross-group session pages (beta user viewing alpha data)', { tag: '@beta' }, () => {
	test.describe(`/group/[alphaSlug]/session/${knownDate}`, () => {
		test('shows the session date as heading', async ({ page }) => {
			await page.goto(`/group/${alphaSlug}/session/${knownDate}`)
			await expect(page.getByRole('heading', { name: /10th May/ })).toBeVisible()
		})

		test('shows species summary table', async ({ page }) => {
			await page.goto(`/group/${alphaSlug}/session/${knownDate}`)
			await expect(page.getByRole('table')).toBeVisible()
		})
	})
})
