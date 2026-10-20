#!/usr/bin/env node

/**
 * CSV Import Script for Supabase
 *
 * Usage: npm run import -- <csv-file-path>
 * Example: npm run import -- data.csv
 *
 * Also importable as a library (`importCSV`) — the CLI block at the bottom only
 * runs when this file is the process entrypoint, so importing it is side-effect
 * free. `supabase/scripts/seed-e2e-data.ts` uses that to import at `concurrency: 1`,
 * which makes row processing (and therefore `nextval`-assigned row ids)
 * deterministic — see #903.
 */
import { pRateLimit } from 'p-ratelimit';
import { getAuthenticatedSupabaseClientForGroup } from '../../app/lib/auth/group-auth';
import { supabase } from '../../lib/supabase';
import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';
import csvParser from 'csv-parser';
import {
	createRingSequenceLookup,
	createRingSequenceLinker,
	DemonRecordsBatchWriter,
	EncounterRowBatchWriter,
	ImportJobTracker,
	processEncounterRow,
	getDistinctLocationNames,
	findUnrecognisedLocationNames,
	type DemonRow
} from '../../lib/demon-import';

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

/**
 * Rate limiter: up to 30 API calls per second, with at most `concurrency`
 * running at once.
 *
 * Built once per run and wrapped around **a whole chunk flush** of the
 * domain-table writer — never around a whole row's `processEncounterRow` call
 * (#959). Until #1139 it wrapped one row's five sequential domain-table upserts;
 * it now wraps one chunk's five bulk upserts, so `concurrency` caps concurrent
 * chunk flushes rather than concurrent rows. Each chunk flush issues one request
 * at a time, so that still caps in-flight requests at roughly `concurrency`.
 *
 * Throttling the whole row would throttle its `DemonRecords` staging write too,
 * and a batch bigger than `concurrency` could then never fill: the rows needed to
 * complete it would be queued behind the rows already waiting on it. Exported for
 * its own unit test.
 */
export function createRowLimiter(concurrency: number) {
	return pRateLimit({
		interval: 1000, // 1000 ms == 1 second
		rate: 30, // 30 API calls per interval
		concurrency
		// maxDelay: 2000              // an API call delayed > 2 sec is rejected
	}) as <T>(fn: () => Promise<T>) => Promise<T>;
}

/**
 * Run `processRow` over every row and count the outcomes. Rows are dispatched as
 * they arrive, so a streaming source doesn't have to be buffered in full.
 *
 * `onAllRowsDispatched` runs once every row has been handed to `processRow` but
 * before any row's promise is awaited. That is the only point at which the
 * `DemonRecords` buffer is known to hold exactly the run's trailing partial
 * batch, so it's where `flushRemaining` (and the `affected_dates` write that
 * depends on it) belongs.
 *
 * Concurrency is deliberately not this function's business: the rate limiter
 * lives inside the `processRow` the caller builds, around the domain-table write
 * alone (see `createRowLimiter`).
 *
 * Extracted from `importCSV` so the dispatch behaviour is unit-testable without
 * a filesystem, a CSV parser or a database.
 */
export async function runRows<Row>(
	rows: Iterable<Row> | AsyncIterable<Row>,
	processRow: (row: Row) => Promise<void>,
	onAllRowsDispatched: () => Promise<void> = async () => {}
): Promise<ImportRowCounts> {
	let totalRecords = 0;
	let successfulRecords = 0;
	let failedRecords = 0;
	// Settled rows are nulled out rather than left in place, so a large import
	// doesn't retain every resolved promise until the end.
	const pendingRows: (Promise<void> | null)[] = [];

	for await (const row of rows) {
		const rowIndex = totalRecords;
		totalRecords++;
		// The counting handlers are attached at dispatch time, so a row that
		// rejects can never surface as an unhandled rejection even if
		// `onAllRowsDispatched` throws before the `Promise.all` below is reached.
		pendingRows[rowIndex] = processRow(row)
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
			});
	}

	await onAllRowsDispatched();

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

	const importJobTracker = new ImportJobTracker(groupSupabaseClient);

	// The whole CSV is buffered rather than streamed straight into row
	// processing, because the location pre-flight below has to see every row's
	// `loc_id` before the first row is written. `runRows` still accepts a stream
	// for other callers; an array just dispatches every row up front, which caps
	// concurrency exactly as before via the limiter inside each row's
	// domain-table write (and so keeps `concurrency: 1` seeding deterministic).
	const rowStream = fs.createReadStream(csvFilePath).pipe(csvParser());
	const rows: DemonRow[] = [];
	for await (const row of rowStream) {
		rows.push(row as DemonRow);
	}

	// A `loc_id` the group has no Location for is far more often a renamed site
	// than a genuinely new one (#1048), and importing it would fork the Locations
	// row and duplicate every encounter under it. Abort before the first write,
	// so the whole import is a no-op and a plain re-run is safe once the name has
	// been resolved.
	const unrecognisedLocations = await findUnrecognisedLocationNames(
		groupSupabaseClient,
		getDistinctLocationNames(rows),
		ringingGroupId
	);
	if (unrecognisedLocations.length > 0) {
		console.error(
			`Error: these locations in ${csvFilePath} are not recognised for ringing group "${ringingGroupName}": ${unrecognisedLocations.join(', ')}. No rows were imported. If a site was renamed, rename its existing Location to match before importing; if it is genuinely new, create it first.`
		);
		process.exit(1);
	}

	// Opened only once the pre-flight above has passed, so an aborted import stays
	// the complete no-op #1079 made it — rather than leaving an orphan
	// `in_progress` row behind for a run that never wrote anything.
	const importJobId = await importJobTracker.createImportJob(ringingGroupId);

	// Every row is staged into DemonRecords before it is interpreted into the
	// domain tables (#959), batched so the per-row concurrency above survives.
	const demonRecordsBatchWriter = new DemonRecordsBatchWriter(
		groupSupabaseClient,
		{ importJobId, ringingGroupId }
	);
	// The domain-table write is chunked too (#1139): rows are buffered and each
	// entity type written by one bulk upsert per chunk, with the limiter above now
	// capping concurrent chunk flushes.
	const encounterRowBatchWriter = new EncounterRowBatchWriter(
		groupSupabaseClient,
		{
			ringingGroupId,
			importJobId,
			lookupRingSequence: createRingSequenceLookup(groupSupabaseClient),
			linkRingSequence: createRingSequenceLinker(groupSupabaseClient),
			limitChunkFlush: createRowLimiter(concurrency)
		}
	);

	let rowCounts: ImportRowCounts;
	try {
		rowCounts = await runRows(
			rows,
			(row) =>
				processEncounterRow(
					row,
					demonRecordsBatchWriter,
					encounterRowBatchWriter
				),
			async () => {
				await demonRecordsBatchWriter.flushRemaining();
				// Recorded once every staging batch has landed, and before the
				// still-pending domain-table writes are awaited: `affected_dates`
				// describes what is durably staged, independent of how the
				// domain-table import then goes.
				await importJobTracker.recordAffectedDates(
					importJobId,
					demonRecordsBatchWriter.getDistinctDates()
				);
				// Flushed here for the same reason: a row's promise is what settles
				// when its chunk lands, so `runRows`' own `Promise.all` over the rows
				// would deadlock on the trailing chunk if it ran first.
				await encounterRowBatchWriter.flushRemaining();
			}
		);
	} catch (error) {
		// `runRows` absorbs per-row failures into its `failedRecords`
		// count, so anything thrown here is systemic. Record it against the job and
		// re-raise the original error — never let the bookkeeping write mask it.
		try {
			await importJobTracker.failImportJob(
				importJobId,
				error instanceof Error ? error.message : String(error)
			);
		} catch (failureRecordingError) {
			console.error(
				`Failed to mark ImportJobs row ${importJobId} as failed`,
				{ csvFilePath, ringingGroupName, ringingGroupId },
				failureRecordingError
			);
		}
		throw error;
	}

	const { totalRecords, successfulRecords, failedRecords } = rowCounts;
	await importJobTracker.completeImportJob(importJobId, {
		processed: totalRecords,
		successful: successfulRecords,
		failed: failedRecords
	});

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
