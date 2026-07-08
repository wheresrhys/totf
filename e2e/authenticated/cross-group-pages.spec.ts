import { test, expect } from '@playwright/test'
import { alphaId } from '../helpers/group-ids'

const project = () => test.info().project.name
const knownDate = '2024-05-10'

test.beforeEach(() => {
	test.skip(project() !== 'beta', 'beta only')
})

test.describe('cross-group pages (beta user viewing alpha data)', () => {
	test.describe('/group/[alphaId] (cross-group home)', () => {
		test('shows Recent Sessions heading', async ({ page }) => {
			await page.goto(`/group/${alphaId}`)
			await expect(page.getByRole('heading', { name: 'Recent Sessions' })).toBeVisible()
		})

		test('shows at least one session link', async ({ page }) => {
			await page.goto(`/group/${alphaId}`)
			await expect(page.getByRole('link', { name: /10th May/ })).toBeVisible()
		})
	})

	test.describe('/group/[alphaId]/sessions', () => {
		test('shows Session history heading', async ({ page }) => {
			await page.goto(`/group/${alphaId}/sessions`)
			await expect(page.getByRole('heading', { name: 'Session history' })).toBeVisible()
		})

		test('shows sessions from alpha data', async ({ page }) => {
			await page.goto(`/group/${alphaId}/sessions`)
			await expect(page.getByText('2021')).toBeVisible()
			await expect(page.getByText('2024')).toBeVisible()
		})
	})

	test.describe('/group/[alphaId]/species', () => {
		test('shows species table with alpha species', async ({ page }) => {
			await page.goto(`/group/${alphaId}/species`)
			await expect(page.getByRole('link', { name: 'Robin' })).toBeVisible()
			await expect(page.getByRole('link', { name: 'Blue Tit' })).toBeVisible()
		})
	})

	test.describe('/group/[alphaId]/effort', () => {
		test('shows Effort and Pay-off heading', async ({ page }) => {
			await page.goto(`/group/${alphaId}/effort`)
			await expect(page.getByRole('heading', { name: 'Effort and Pay-off' })).toBeVisible()
		})

		test('shows data rows with non-zero values', async ({ page }) => {
			await page.goto(`/group/${alphaId}/effort`)
			await expect(page.getByRole('columnheader', { name: '2021' })).toBeVisible()
			await expect(page.getByRole('columnheader', { name: '2024' })).toBeVisible()
		})
	})

	test.describe('/group/[alphaId]/mistakes', () => {
		test('shows Mistakes heading', async ({ page }) => {
			await page.goto(`/group/${alphaId}/mistakes`)
			await expect(page.getByRole('heading', { name: 'Mistakes' })).toBeVisible()
		})

		test('shows discrepancy rows', async ({ page }) => {
			await page.goto(`/group/${alphaId}/mistakes`)
			await expect(page.getByRole('link', { name: 'ABTITMIS' }).first()).toBeVisible()
		})
	})

	test.describe('/group/[alphaId]/retraps', () => {
		test('shows Notable Birds heading', async ({ page }) => {
			await page.goto(`/group/${alphaId}/retraps`)
			await expect(page.getByRole('heading', { name: 'Notable Birds' })).toBeVisible()
		})

		test('shows ARRETRAP as a notable bird', async ({ page }) => {
			await page.goto(`/group/${alphaId}/retraps`)
			await expect(page.getByText('ARRETRAP')).toBeVisible()
		})
	})

	test.describe('/group/[alphaId]/species/Robin', () => {
		test('shows Robin as page heading', async ({ page }) => {
			await page.goto(`/group/${alphaId}/species/Robin`)
			await expect(page.getByRole('heading', { name: 'Robin' })).toBeVisible()
		})

		test('shows bird list tab', async ({ page }) => {
			await page.goto(`/group/${alphaId}/species/Robin`)
			await expect(page.getByRole('button', { name: 'Bird list' })).toBeVisible()
		})
	})
})

test.describe('cross-group session pages (beta user viewing alpha data)', () => {
	test.describe(`/group/[alphaId]/session/${knownDate}`, () => {
		test('shows the session date as heading', async ({ page }) => {
			await page.goto(`/group/${alphaId}/session/${knownDate}`)
			await expect(page.getByRole('heading', { name: /10th May/ })).toBeVisible()
		})

		test('shows species summary table', async ({ page }) => {
			await page.goto(`/group/${alphaId}/session/${knownDate}`)
			await expect(page.getByRole('table')).toBeVisible()
		})
	})
})
