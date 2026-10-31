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
		// So the DemonRecords/ImportJobs assertions below read this run's rows, not a
		// previous run's. DemonRecords first — it has an import_job_id FK onto
		// ImportJobs.
		psql(`DELETE FROM "DemonRecords" WHERE ringing_group_id = ${deltaId}`)
		psql(`DELETE FROM "ImportJobs" WHERE ringing_group_id = ${deltaId}`)
		// Same reason for the stats cache (#1155): refreshSimpleStatsCache is
		// upsert-only, so leftover rows from a previous run would make the
		// "did this upload write any cache rows at all" assertions below pass
		// without the consumer having done anything. The `*BySpecies` half is
		// the one with a writer — every metric RPC call in
		// modules/stats/stats-cache-refresh.ts hardcodes group_by_species=true, so the
		// all-species-combined sibling stays empty (#1169).
		psql(`DELETE FROM "SimpleStatsCacheBySpecies" WHERE group_id = ${deltaId}`)
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

	test('stages every delta.csv row in DemonRecords, keyed to the run’s job', async () => {
		const [rowCount, distinctRings, distinctDates, jobsReferenced] = psqlRow(
			`SELECT COUNT(*), COUNT(DISTINCT ring_no), COUNT(DISTINCT encounter_date), COUNT(DISTINCT import_job_id) FROM "DemonRecords" WHERE ringing_group_id = ${deltaId}`
		)

		// delta.csv's 10 rows, one staging row each, all under the single ImportJobs
		// row this upload opened.
		expect(rowCount).toBe('10')
		expect(distinctRings).toBe('10')
		expect(distinctDates).toBe('1')
		expect(jobsReferenced).toBe('1')
	})

	test('stages each row near-verbatim, with the dedup key pulled out as real columns', async () => {
		const [rawSpeciesName, rawVisitDate, encounterDate, encounterTime] = psqlRow(
			`SELECT raw_row->>'species_name', raw_row->>'visit_date', encounter_date, encounter_time FROM "DemonRecords" WHERE ringing_group_id = ${deltaId} AND ring_no = 'DLWREN001'`
		)

		// raw_row keeps the CSV's own values, DD/MM/YYYY dates included…
		expect(rawSpeciesName).toBe('Wren')
		expect(rawVisitDate).toBe('15/03/2024')
		// …while the dedup-key columns hold the converted, Postgres-typed ones.
		expect(encounterDate).toBe('2024-03-15')
		expect(encounterTime).toBe('06:00:00')
	})

	test('records the staged dates on the run’s ImportJobs row', async () => {
		const [affectedDates] = psqlRow(
			`SELECT affected_dates FROM "ImportJobs" WHERE ringing_group_id = ${deltaId}`
		)

		// Every delta.csv row is the same day, so the staged range is that one date.
		expect(affectedDates).toBe('{2024-03-15}')
	})

	// The three tests below cover the stats-cache-refresh queue consumer end to end
	// (#1155). No polling or retry: /api/import awaits dispatchStatsCacheRefreshEvents
	// before streaming the `complete` message the first test waits on, and with no
	// VERCEL env var the dispatch port runs in `inline` mode — so every temporal
	// unit's consumer call has already finished by the time the browser sees
	// "Import complete", exactly as the ImportJobs assertions above already assume.
	test('writes SimpleStatsCacheBySpecies rows for the Delta group’s imported species and temporal units', async () => {
		const [rowCount, temporalUnits] = psqlRow(
			`SELECT COUNT(*), array_agg(DISTINCT temporal_unit) FROM "SimpleStatsCacheBySpecies" WHERE group_id = ${deltaId}`
		)

		expect(Number(rowCount)).toBeGreaterThan(0)
		// All five dispatched temporal units. This started out as three — `month`
		// and `year` were missing because `buildMetricRpcParams` derived
		// to_date as max(periods) verbatim, and a month/year period string is the
		// period's *first* day, so the window collapsed to a single day and the
		// metric RPCs returned nothing. This E2E run was the first thing to expose
		// that; #1173 fixed it, and this assertion is what pins the fix.
		expect(temporalUnits).toBe('{all-time,day,month,month-squashed,year}')
	})

	test('marks all five temporal-unit refresh-status columns succeeded on the run’s ImportJobs row', async () => {
		const [day, month, year, monthSquashed, allTime] = psqlRow(
			`SELECT day_stats_refresh_status, month_stats_refresh_status, year_stats_refresh_status, month_squashed_stats_refresh_status, all_time_stats_refresh_status FROM "ImportJobs" WHERE ringing_group_id = ${deltaId}`
		)

		expect([day, month, year, monthSquashed, allTime]).toEqual([
			'succeeded',
			'succeeded',
			'succeeded',
			'succeeded',
			'succeeded'
		])
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
