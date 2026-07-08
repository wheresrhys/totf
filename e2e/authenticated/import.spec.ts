import { test, expect } from '@playwright/test'
import { execSync } from 'child_process'
import path from 'path'
import { deltaId } from '../helpers/group-ids'

const LOCAL_DB_URL = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'

function psql(sql: string) {
	execSync(`psql "${LOCAL_DB_URL}" -c "${sql}"`, { stdio: 'pipe' })
}

test.describe.serial('import flow', () => {
	test.beforeAll(async () => {
		psql(`DELETE FROM "Encounters" WHERE ringing_group_id = ${deltaId}`)
		psql(`DELETE FROM "Sessions" WHERE ringing_group_id = ${deltaId}`)
		psql(`DELETE FROM "Locations" WHERE ringing_group_id = ${deltaId}`)
		psql(`UPDATE "Birds" SET ringing_group_ids = array_remove(ringing_group_ids, ${deltaId}) WHERE ${deltaId} = ANY(ringing_group_ids)`)
		psql(`DELETE FROM "Birds" WHERE ringing_group_ids = '{}'`)
	})

	test.beforeEach(({}, testInfo) => {
		test.skip(testInfo.project.name !== 'delta', 'delta only')
	})

	test('uploads delta.csv and shows completion message', async ({ page }) => {
		const csvPath = path.resolve(process.cwd(), 'test-fixtures', 'csv', 'delta.csv')

		await page.goto('/import')
		await expect(page.getByRole('heading', { name: 'Import data' })).toBeVisible()

		const fileInput = page.locator('input[type="file"][name="csv"]')
		await fileInput.setInputFiles(csvPath)

		await page.click('button[type="submit"]')

		await expect(
			page.getByText('Import complete: 10 rows imported successfully')
		).toBeVisible({ timeout: 30_000 })
	})

	test('imported species appear on /species page', async ({ page }) => {
		await page.goto('/species')
		await expect(page.getByRole('link', { name: 'Wren' })).toBeVisible()
		await expect(page.getByRole('link', { name: 'Dunnock' })).toBeVisible()
	})

	test('imported session appears on /sessions page', async ({ page }) => {
		await page.goto('/sessions')
		await expect(page.getByText('2024')).toBeVisible()
		await expect(page.getByRole('link', { name: /15th March/ })).toBeVisible()
	})
})
