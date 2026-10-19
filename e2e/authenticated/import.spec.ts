import { test, expect } from '@playwright/test'
import { spawnSync } from 'child_process'
import path from 'path'
import { deltaId } from '../helpers/group-ids'

const LOCAL_DB_URL = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'

function psql(sql: string) {
	const result = spawnSync('psql', [LOCAL_DB_URL, '-c', sql], { stdio: 'pipe', encoding: 'utf8' })
	if (result.status !== 0) throw new Error(`psql failed: ${result.stderr}`)
}

/** Tuple-only, unaligned psql read — one row of `|`-separated column values. */
function psqlRow(sql: string): string[] {
	const result = spawnSync('psql', [LOCAL_DB_URL, '-t', '-A', '-c', sql], {
		stdio: 'pipe',
		encoding: 'utf8'
	})
	if (result.status !== 0) throw new Error(`psql failed: ${result.stderr}`)
	return result.stdout.trim().split('|')
}

test.describe.serial('import flow', { tag: ['@delta', '@mutates'] }, () => {
	test.beforeAll(async () => {
		// Disable trigger to avoid NOT NULL proven_age violation when all encounters for a bird are deleted
		psql(`ALTER TABLE "Encounters" DISABLE TRIGGER trigger_encounters_refresh_bird_proven_age`)
		psql(`DELETE FROM "Encounters" WHERE ringing_group_id = ${deltaId}`)
		psql(`DELETE FROM "Sessions" WHERE ringing_group_id = ${deltaId}`)
		psql(`DELETE FROM "Locations" WHERE ringing_group_id = ${deltaId}`)
		// So the ImportJobs assertion below reads this run's job row, not a previous
		// run's.
		psql(`DELETE FROM "ImportJobs" WHERE ringing_group_id = ${deltaId}`)
		psql(`UPDATE "Birds" SET ringing_group_ids = array_remove(ringing_group_ids, ${deltaId}) WHERE ${deltaId} = ANY(ringing_group_ids)`)
		psql(`DELETE FROM "Birds" WHERE ringing_group_ids = '{}'`)
		psql(`ALTER TABLE "Encounters" ENABLE TRIGGER trigger_encounters_refresh_bird_proven_age`)
		// The import now aborts on a loc_id the group has no Location for (#1079),
		// so delta.csv's site has to exist before the upload — the wiped Locations
		// rows can no longer be re-created by the import itself.
		psql(`INSERT INTO "Locations" (location_name, ringing_group_id) VALUES ('Delta Site', ${deltaId}) ON CONFLICT (location_name, ringing_group_id) DO NOTHING`)
	})

	test('uploads delta.csv and shows completion message', async ({ page }) => {
		const csvPath = path.resolve(process.cwd(), 'test-fixtures', 'csv', 'delta.csv')

		await page.goto('/import')
		await expect(page.getByRole('heading', { name: 'Import data' })).toBeVisible()

		const fileInput = page.locator('input[type="file"][name="csv"]')
		await fileInput.setInputFiles(csvPath)

		await page.getByRole('button', { name: 'Import' }).click()

		await expect(
			page.getByText('Import complete: 10 rows imported successfully')
		).toBeVisible({ timeout: 30_000 })
	})

	// The timeout branch is deliberately not covered here: the route's abort fires at
	// 280s, and no amount of fixture data makes that practical to provoke in a
	// browser test. lib/__tests__/demon-import.test.ts covers the transition instead.
	test('records a succeeded ImportJobs row with the reported row counts', async () => {
		const [status, rowsProcessed, rowsSuccessful, rowsFailed, finishedAt] = psqlRow(
			`SELECT status, rows_processed, rows_successful, rows_failed, finished_at IS NOT NULL FROM "ImportJobs" WHERE ringing_group_id = ${deltaId}`
		)

		expect(status).toBe('succeeded')
		// delta.csv's 10 rows, matching the "10 rows imported successfully"
		// completion message the previous test asserted on.
		expect(rowsProcessed).toBe('10')
		expect(rowsSuccessful).toBe('10')
		expect(rowsFailed).toBe('0')
		expect(finishedAt).toBe('t')
	})

	test('imported species appear on /species page', async ({ page }) => {
		await page.goto('/species')
		await expect(page.getByRole('link', { name: 'Wren' })).toBeVisible()
		await expect(page.getByRole('link', { name: 'Dunnock' })).toBeVisible()
	})

	test('imported session appears on /sessions page', async ({ page }) => {
		await page.goto('/sessions')
		await expect(page.getByText('2024')).toBeVisible()
		await page.getByRole('button', { name: /March/ }).click()
		await expect(page.getByRole('link', { name: /15th/ })).toBeVisible()
	})
})
