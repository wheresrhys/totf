import { test, expect } from '@playwright/test'
import { alphaId, betaId, gammaId } from '../helpers/group-ids'

test.describe('/group/[id] home redirect for own group', () => {
	test('alpha: own group home redirects to /', { tag: '@alpha' }, async ({ page }) => {
		await page.goto(`/group/${alphaId}`)
		await expect(page).toHaveURL('/')
	})

	test('beta: own group home redirects to /', { tag: '@beta' }, async ({ page }) => {
		await page.goto(`/group/${betaId}`)
		await expect(page).toHaveURL('/')
	})

	test('gamma: own group home redirects to /', { tag: '@gamma' }, async ({ page }) => {
		await page.goto(`/group/${gammaId}`)
		await expect(page).toHaveURL('/')
	})
})

test.describe('/group/[alphaId]/sessions — Alpha shares with Beta', () => {
	test('beta: sees Alpha sessions (share exists)', { tag: '@beta' }, async ({ page }) => {
		await page.goto(`/group/${alphaId}/sessions`)
		await expect(
			page.getByRole('heading', { name: 'Session history' })
		).toBeVisible()
		await expect(page.getByText('2021')).toBeVisible()
		await expect(page.getByText('2024')).toBeVisible()
	})

	test('gamma: sees no Alpha sessions (no transitive share)', { tag: '@gamma' }, async ({ page }) => {
		await page.goto(`/group/${alphaId}/sessions`)
		await expect(
			page.getByRole('heading', { name: 'Session history' })
		).toBeVisible()
		await expect(page.getByText('No session data available.')).toBeVisible()
	})

	test('alpha: own sessions visible (no redirect on sub-pages)', { tag: '@alpha' }, async ({ page }) => {
		await page.goto(`/group/${alphaId}/sessions`)
		await expect(
			page.getByRole('heading', { name: 'Session history' })
		).toBeVisible()
		await expect(page.getByText('2021')).toBeVisible()
	})
})

test.describe('/group/[betaId]/sessions — Beta shares with Gamma', () => {
	test('gamma: sees Beta sessions (share exists)', { tag: '@gamma' }, async ({ page }) => {
		await page.goto(`/group/${betaId}/sessions`)
		await expect(
			page.getByRole('heading', { name: 'Session history' })
		).toBeVisible()
		await expect(page.getByText('2023')).toBeVisible()
	})

	test('alpha: sees no Beta sessions (no reverse share)', { tag: '@alpha' }, async ({ page }) => {
		await page.goto(`/group/${betaId}/sessions`)
		await expect(
			page.getByRole('heading', { name: 'Session history' })
		).toBeVisible()
		await expect(page.getByText('No session data available.')).toBeVisible()
	})
})

test.describe('/group/[alphaId] home — cross-group data visibility', () => {
	test('beta: sees Alpha home data (share exists)', { tag: '@beta' }, async ({ page }) => {
		await page.goto(`/group/${alphaId}`)
		await expect(page).not.toHaveURL('/')
		await expect(page.getByRole('heading', { name: 'Recent Sessions' })).toBeVisible()
		// Alpha's most recent session is 2024-05-10
		await expect(page.getByRole('link', { name: /10th May/ })).toBeVisible()
	})

	test('gamma: sees no Alpha data (no share)', { tag: '@gamma' }, async ({ page }) => {
		await page.goto(`/group/${alphaId}`)
		await expect(page.getByRole('heading', { name: 'Recent Sessions' })).toBeVisible()
		await expect(page.getByRole('link', { name: /10th May/ })).not.toBeVisible()
	})
})

test.describe('/group/[betaId] home — cross-group data visibility', () => {
	test('gamma: sees Beta home data (share exists)', { tag: '@gamma' }, async ({ page }) => {
		await page.goto(`/group/${betaId}`)
		await expect(page).not.toHaveURL('/')
		await expect(page.getByRole('heading', { name: 'Recent Sessions' })).toBeVisible()
		// Beta's session is 2023-06-01
		await expect(page.getByRole('link', { name: /1st June/ })).toBeVisible()
	})

	test('alpha: sees no Beta data (no reverse share)', { tag: '@alpha' }, async ({ page }) => {
		await page.goto(`/group/${betaId}`)
		await expect(page.getByRole('heading', { name: 'Recent Sessions' })).toBeVisible()
		await expect(page.getByRole('link', { name: /1st June/ })).not.toBeVisible()
	})
})

test.describe('/group/[gammaId] home — Gamma has no data', () => {
	test('alpha: sees empty Gamma home (no share)', { tag: '@alpha' }, async ({ page }) => {
		await page.goto(`/group/${gammaId}`)
		await expect(page.getByRole('heading', { name: 'Recent Sessions' })).toBeVisible()
		await expect(page.getByRole('link', { name: /10th May/ })).not.toBeVisible()
		await expect(page.getByRole('link', { name: /1st June/ })).not.toBeVisible()
	})

	test('beta: sees empty Gamma home (no share)', { tag: '@beta' }, async ({ page }) => {
		await page.goto(`/group/${gammaId}`)
		await expect(page.getByRole('heading', { name: 'Recent Sessions' })).toBeVisible()
		await expect(page.getByRole('link', { name: /1st June/ })).not.toBeVisible()
	})
})
