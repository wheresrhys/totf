#!/usr/bin/env node

/**
 * CSV Import Script for Supabase
 *
 * Usage: npm run import -- <csv-file-path>
 * Example: npm run import -- data.csv
 *
 * Also importable as a library (`importCSV`) — the CLI block at the bottom only
 * runs when this file is the process entrypoint, so importing it is side-effect
 * free. `scripts/seed-e2e-data.ts` uses that to import at `concurrency: 1`,
 * which makes row processing (and therefore `nextval`-assigned row ids)
 * deterministic — see #903.
 */
import { pRateLimit } from 'p-ratelimit';
import { getAuthenticatedSupabaseClientForGroup } from '../app/lib/auth/group-auth';
import { supabase } from '../lib/supabase';
import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';
import csvParser from 'csv-parser';
import {
	createUpserter,
	createRingSequenceLookup,
	createRingSequenceLinker,
	processEncounterRow
} from '../lib/demon-import';

/**
 * Default max number of rows processed at once. Unchanged from the value this
 * script has always used — callers that don't pass `concurrency` keep the exact
 * previous behaviour.
 */
export const DEFAULT_IMPORT_CONCURRENCY = 30;

export interface ImportOptions {
	csvFilePath: string;
	ringingGroupName: string;
	/**
	 * Max rows processed concurrently. Defaults to
	 * {@link DEFAULT_IMPORT_CONCURRENCY}. Pass `1` to serialize row processing,
	 * which is what deterministic seeding needs: every table's `id` is
	 * `DEFAULT nextval(...)`, so under concurrency the numeric id a given row
	 * gets depends on I/O timing.
	 */
	concurrency?: number;
}

export interface ImportRowCounts {
	totalRecords: number;
	successfulRecords: number;
	failedRecords: number;
}

// Rate limiter: up to 30 API calls per second, with at most `concurrency`
// running at once.
function createRowLimiter(concurrency: number) {
	return pRateLimit({
		interval: 1000, // 1000 ms == 1 second
		rate: 30, // 30 API calls per interval
		concurrency
		// maxDelay: 2000              // an API call delayed > 2 sec is rejected
	}) as <T>(fn: () => Promise<T>) => Promise<T>;
}

/**
 * Run `processRow` over every row, never letting more than `concurrency` calls
 * be in flight at once (and never exceeding the rate limit). Rows are dispatched
 * as they arrive, so a streaming source doesn't have to be buffered in full.
 *
 * Extracted from `importCSV` so the concurrency behaviour is unit-testable
 * without a filesystem, a CSV parser or a database.
 */
export async function runRowsWithConcurrency<Row>(
	rows: Iterable<Row> | AsyncIterable<Row>,
	concurrency: number,
	processRow: (row: Row) => Promise<void>
): Promise<ImportRowCounts> {
	const limit = createRowLimiter(concurrency);

	let totalRecords = 0;
	let successfulRecords = 0;
	let failedRecords = 0;
	// Settled rows are nulled out rather than left in place, so a large import
	// doesn't retain every resolved promise until the end.
	const pendingRows: (Promise<void> | null)[] = [];

	for await (const row of rows) {
		const rowIndex = totalRecords;
		totalRecords++;
		pendingRows[rowIndex] = limit(() =>
			processRow(row)
				.then(
					() => {
						successfulRecords++;
					},
					(err) => {
						console.log(err);
						failedRecords++;
					}
				)
				.then(() => {
					pendingRows[rowIndex] = null;
				})
		);
	}

	await Promise.all(pendingRows.filter((p) => Boolean(p)));

	return { totalRecords, successfulRecords, failedRecords };
}

export async function importCSV(options: ImportOptions): Promise<void> {
	const {
		csvFilePath,
		ringingGroupName,
		concurrency = DEFAULT_IMPORT_CONCURRENCY
	} = options;

	if (!fs.existsSync(csvFilePath)) {
		console.error(`Error: File not found: ${csvFilePath}`);
		process.exit(1);
	}

	console.log(`Starting import from ${csvFilePath}...`);

	// 0. Look up the Ringing Group by name and get its ID. This script no longer
	// creates a missing group on the fly (#473) — groups are created via the seed
	// script or Supabase Studio, so an unrecognised name is almost always a typo.
	const { data: ringingGroupData, error: ringingGroupError } = await supabase
		.from('RingingGroups')
		.select('id')
		.eq('group_name', ringingGroupName)
		.maybeSingle();
	if (ringingGroupError) {
		throw ringingGroupError;
	}
	if (!ringingGroupData) {
		console.error(
			`Error: Ringing group "${ringingGroupName}" not found. Create it first (e.g. via Supabase Studio) before importing — this script no longer creates groups automatically.`
		);
		process.exit(1);
	}
	const ringingGroupId: number = ringingGroupData.id;

	const groupSupabaseClient =
		await getAuthenticatedSupabaseClientForGroup(ringingGroupId);

	const upsert = createUpserter(groupSupabaseClient);
	const lookupRingSequence = createRingSequenceLookup(groupSupabaseClient);
	const linkRingSequence = createRingSequenceLinker(groupSupabaseClient);

	const rowStream = fs.createReadStream(csvFilePath).pipe(csvParser());

	const { totalRecords, successfulRecords, failedRecords } =
		await runRowsWithConcurrency(rowStream, concurrency, (row) =>
			processEncounterRow(
				row,
				upsert,
				lookupRingSequence,
				ringingGroupId,
				linkRingSequence
			)
		);

	console.log('\n✓ Import completed');
	console.log(`Total records: ${totalRecords}`);
	console.log(`Successful: ${successfulRecords}`);
	console.log(`Failed: ${failedRecords}`);
}

// Main execution — only when run directly (npm run db:import:{local|prod}),
// never when imported for `importCSV`.
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
	const args = process.argv.slice(2);

	if (args.length < 2) {
		console.log(
			'Usage: npm run db:import:{local|prod} -- <csv-file-path> <ringing-group-name>'
		);
		console.log(
			'Example: npm run db:import:{local|prod} -- data/birds.csv "Walthamstow Wetlands"'
		);
		process.exit(1);
	}

	const csvFilePath = path.resolve(args[0]);
	const ringingGroupName =
		args[1] === 'w' || args[1] === 'W' ? 'Walthamstow Wetlands' : args[1];

	importCSV({ csvFilePath, ringingGroupName })
		.then(() => process.exit(0))
		.catch((error) => {
			console.error('Import failed:', error);
			process.exit(1);
		});
}
